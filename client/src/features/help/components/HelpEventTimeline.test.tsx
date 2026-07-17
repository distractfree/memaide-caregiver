import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  HelpEventTimeline,
  INITIAL_VISIBLE_HELP_EVENTS,
} from './HelpEventTimeline'
import type { HelpEvent } from '@/types/domain'

const now = new Date()

function isoDaysAgoAtMinute(daysAgo: number, minute: number): string {
  const d = new Date(now)
  d.setDate(d.getDate() - daysAgo)
  d.setHours(12, minute, 0, 0)
  return d.toISOString()
}

// Unique whatsappNumber per event so we can assert which rows are rendered.
function makeEvent(index: number, triggeredAt: string, overrides: Partial<HelpEvent> = {}): HelpEvent {
  return {
    id: `event-${index}`,
    patientId: 'patient-1',
    triggeredAt,
    sourceDevice: 'phone',
    whatsappNumber: `+1555${String(1000 + index)}`,
    status: 'triggered',
    createdAt: triggeredAt,
    updatedAt: triggeredAt,
    ...overrides,
  }
}

// Newest-first list of `count` same-day events (event 0 is the newest).
function makeSameDayEvents(count: number): HelpEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent(i, isoDaysAgoAtMinute(0, 40 - i)),
  )
}

function number(index: number): string {
  return `+1555${String(1000 + index)}`
}

describe('HelpEventTimeline', () => {
  it('renders nothing and no controls for 0 events', () => {
    const { container } = render(<HelpEventTimeline events={[]} />)
    expect(container.querySelector('section')).toBeNull()
    expect(screen.queryByRole('button', { name: /older events/i })).not.toBeInTheDocument()
  })

  it('shows every row and no expand control for 1–8 events', () => {
    render(<HelpEventTimeline events={makeSameDayEvents(8)} />)
    for (let i = 0; i < 8; i += 1) {
      expect(screen.getByText(number(i))).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: /show .* older/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /hide older events/i })).not.toBeInTheDocument()
  })

  it('renders only the first 8 newest events when more exist', () => {
    render(<HelpEventTimeline events={makeSameDayEvents(12)} />)

    // First 8 newest visible.
    for (let i = 0; i < INITIAL_VISIBLE_HELP_EVENTS; i += 1) {
      expect(screen.getByText(number(i))).toBeInTheDocument()
    }
    // Older ones hidden.
    for (let i = 8; i < 12; i += 1) {
      expect(screen.queryByText(number(i))).not.toBeInTheDocument()
    }

    const showButton = screen.getByRole('button', { name: /show 4 older events/i })
    expect(showButton).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('8 shown · 12 total')).toBeInTheDocument()
  })

  it('reveals the next batch when "Show older events" is clicked', async () => {
    render(<HelpEventTimeline events={makeSameDayEvents(20)} />)

    // 20 total → first reveal shows 8 more (16), a second reveal shows the rest.
    await userEvent.click(screen.getByRole('button', { name: /show 8 older events/i }))
    expect(screen.getByText(number(15))).toBeInTheDocument()
    expect(screen.queryByText(number(16))).not.toBeInTheDocument()
    expect(screen.getByText('16 shown · 20 total')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /show 4 older events/i }))
    expect(screen.getByText(number(19))).toBeInTheDocument()
    // Fully expanded: no more "show", a "hide" control appears.
    expect(screen.queryByRole('button', { name: /show .* older/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide older events/i })).toBeInTheDocument()
  })

  it('collapses back to the initial 8 with "Hide older events"', async () => {
    render(<HelpEventTimeline events={makeSameDayEvents(12)} />)

    await userEvent.click(screen.getByRole('button', { name: /show 4 older events/i }))
    expect(screen.getByText(number(11))).toBeInTheDocument()

    const hideButton = screen.getByRole('button', { name: /hide older events/i })
    expect(hideButton).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(hideButton)

    expect(screen.queryByText(number(8))).not.toBeInTheDocument()
    expect(screen.getByText(number(0))).toBeInTheDocument()
  })

  it('does not render a date heading for a day whose events are beyond the visible window', () => {
    // 8 events today + 2 events two days ago. Initial window shows only today.
    const events = [
      ...makeSameDayEvents(8),
      makeEvent(100, isoDaysAgoAtMinute(2, 30)),
      makeEvent(101, isoDaysAgoAtMinute(2, 20)),
    ]
    render(<HelpEventTimeline events={events} />)

    expect(screen.getByText('Today')).toBeInTheDocument()
    // The two-days-ago rows and their heading are not rendered yet.
    expect(screen.queryByText(number(100))).not.toBeInTheDocument()
  })

  it('preserves Today and Yesterday grouping', () => {
    const events = [
      makeEvent(0, isoDaysAgoAtMinute(0, 30)),
      makeEvent(1, isoDaysAgoAtMinute(0, 20)),
      makeEvent(2, isoDaysAgoAtMinute(1, 30)),
      makeEvent(3, isoDaysAgoAtMinute(1, 20)),
    ]
    render(<HelpEventTimeline events={events} />)

    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByText('Yesterday')).toBeInTheDocument()
  })

  it('resets the reveal window when resetKey changes', async () => {
    const { rerender } = render(
      <HelpEventTimeline events={makeSameDayEvents(12)} resetKey="patient-a" />,
    )

    await userEvent.click(screen.getByRole('button', { name: /show 4 older events/i }))
    expect(screen.getByText(number(11))).toBeInTheDocument()

    rerender(<HelpEventTimeline events={makeSameDayEvents(12)} resetKey="patient-b" />)
    expect(screen.queryByText(number(8))).not.toBeInTheDocument()
    expect(screen.getByText(number(0))).toBeInTheDocument()
  })

  it('supports keyboard activation of the expand control', async () => {
    render(<HelpEventTimeline events={makeSameDayEvents(12)} />)

    const showButton = screen.getByRole('button', { name: /show 4 older events/i })
    showButton.focus()
    expect(showButton).toHaveFocus()
    await userEvent.keyboard('{Enter}')

    expect(screen.getByText(number(11))).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /hide older events/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})
