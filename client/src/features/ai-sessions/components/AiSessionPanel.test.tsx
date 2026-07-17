import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiSessionPanel } from './AiSessionPanel'
import type { UseAiSessionDetailResult } from '@/features/ai-sessions/hooks/useAiSessionDetail'
import type { AiSession, AiSessionMessage } from '@/types/domain'

function makeSession(overrides: Partial<AiSession> = {}): AiSession {
  return {
    id: 'ai-1',
    patientId: 'patient-1',
    helpEventId: null,
    status: 'active',
    startedAt: '2026-07-13T04:00:00.000Z',
    endedAt: null,
    caregiverJoinedAt: null,
    emergencySuggestedAt: null,
    summary: null,
    createdAt: '2026-07-13T04:00:00.000Z',
    updatedAt: '2026-07-13T04:00:00.000Z',
    isJoinable: false,
    displayStatus: 'Active',
    messages: [],
    ...overrides,
  }
}

function makeDetail(overrides: Partial<UseAiSessionDetailResult> = {}): UseAiSessionDetailResult {
  return {
    session: makeSession(),
    status: 'ready',
    error: null,
    isRefreshing: false,
    lastUpdatedAt: Date.parse('2026-07-13T04:05:00.000Z'),
    joining: false,
    resolving: false,
    actionError: null,
    refresh: vi.fn(),
    join: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(true),
    clearActionError: vi.fn(),
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AiSessionPanel', () => {
  it('renders nothing when closed', () => {
    render(<AiSessionPanel open={false} onClose={() => {}} detail={makeDetail()} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the truthful capability notice and no message composer', () => {
    render(<AiSessionPanel open onClose={() => {}} detail={makeDetail()} />)

    expect(
      screen.getByText(/Joining records that you are monitoring this session\./i),
    ).toBeInTheDocument()
    expect(screen.getByText(/Direct messaging is not available in this version\./i)).toBeInTheDocument()
    // No composer: the only textarea appears when the Resolve form is open.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders Join only for a joinable session and calls join + onSessionUpdated', async () => {
    const detail = makeDetail({ session: makeSession({ isJoinable: true }) })
    const onSessionUpdated = vi.fn()
    render(<AiSessionPanel open onClose={() => {}} detail={detail} onSessionUpdated={onSessionUpdated} />)

    const joinButton = screen.getByRole('button', { name: 'Join session' })
    await userEvent.click(joinButton)

    expect(detail.join).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onSessionUpdated).toHaveBeenCalled())
  })

  it('does not render Join or Resolve for a terminal session and shows the summary', () => {
    const detail = makeDetail({
      session: makeSession({
        status: 'resolved',
        endedAt: '2026-07-13T04:10:00.000Z',
        displayStatus: 'Resolved',
        summary: 'Patient confirmed fine after reminder.',
        isJoinable: false,
      }),
    })
    render(<AiSessionPanel open onClose={() => {}} detail={detail} />)

    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.getByText('Patient confirmed fine after reminder.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /resolve session/i })).not.toBeInTheDocument()
  })

  it('validates the resolution summary and persists the exact submitted text', async () => {
    const detail = makeDetail({ session: makeSession({ status: 'caregiver_joined', displayStatus: 'Caregiver joined' }) })
    const onClose = vi.fn()
    const onSessionUpdated = vi.fn()
    render(
      <AiSessionPanel open onClose={onClose} detail={detail} onSessionUpdated={onSessionUpdated} />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Resolve session' }))

    // Empty submit is rejected without calling the backend.
    await userEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }))
    expect(screen.getByText(/Enter a short resolution summary/i)).toBeInTheDocument()
    expect(detail.resolve).not.toHaveBeenCalled()

    // Trimmed, non-empty summary is persisted verbatim.
    await userEvent.type(screen.getByRole('textbox'), '  Escorted patient back to bed.  ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm resolve' }))

    await waitFor(() =>
      expect(detail.resolve).toHaveBeenCalledWith('Escorted patient back to bed.'),
    )
    await waitFor(() => expect(onSessionUpdated).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('shows a loading state and an error state', () => {
    // Note: the shared animated LoadingState/ErrorState (a framer-motion child of
    // the AnimatePresence panel) can render its text twice in jsdom, so assert
    // presence tolerantly rather than uniqueness.
    const { rerender } = render(
      <AiSessionPanel open onClose={() => {}} detail={makeDetail({ status: 'loading', session: null })} />,
    )
    expect(screen.getAllByText('Loading session…').length).toBeGreaterThan(0)

    const refresh = vi.fn()
    rerender(
      <AiSessionPanel
        open
        onClose={() => {}}
        detail={makeDetail({ status: 'error', session: null, error: 'boom', refresh })}
      />,
    )
    expect(screen.getAllByText('boom').length).toBeGreaterThan(0)
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<AiSessionPanel open onClose={onClose} detail={makeDetail()} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders a mixed transcript including a caregiver bubble that already exists', () => {
    const messages: AiSessionMessage[] = [
      { id: 'm1', aiSessionId: 'ai-1', role: 'assistant', content: 'Hello Rose.', createdAt: '2026-07-13T04:00:01.000Z' },
      { id: 'm2', aiSessionId: 'ai-1', role: 'user', content: 'I feel dizzy.', createdAt: '2026-07-13T04:00:20.000Z' },
      { id: 'm3', aiSessionId: 'ai-1', role: 'system', content: 'Caregiver joined the support session.', createdAt: '2026-07-13T04:01:00.000Z' },
    ]
    render(
      <AiSessionPanel
        open
        onClose={() => {}}
        detail={makeDetail({ session: makeSession({ messages }) })}
      />,
    )

    expect(screen.getByText('Hello Rose.')).toBeInTheDocument()
    expect(screen.getByText('I feel dizzy.')).toBeInTheDocument()
    expect(screen.getByText('Caregiver joined the support session.')).toBeInTheDocument()
  })
})
