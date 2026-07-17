import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EgocentricViewer } from './EgocentricViewer'

describe('EgocentricViewer', () => {
  it('renders a JPEG data URL with generic accessible alt text only', () => {
    render(
      <EgocentricViewer
        state="live"
        imageSrc="data:image/jpeg;base64,sensitive-frame"
        startedAt="2026-07-15T10:30:00.000Z"
        receivedAt="2026-07-15T10:32:00.000Z"
      />,
    )

    const image = screen.getByAltText('Live patient-perspective frame from smart glasses')
    expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,sensitive-frame')
    expect(screen.getByText('Live patient-perspective frame')).toBeInTheDocument()
  })

  it('keeps a stale frame visible with a waiting overlay', () => {
    render(
      <EgocentricViewer
        state="stale"
        imageSrc="data:image/jpeg;base64,last-frame"
        startedAt={null}
        receivedAt="not-a-valid-date"
      />,
    )

    expect(screen.getByAltText('Live patient-perspective frame from smart glasses')).toBeInTheDocument()
    expect(screen.getAllByText('Waiting for a new frame…').length).toBeGreaterThan(0)
  })

  it('shows a waiting state without an image', () => {
    render(<EgocentricViewer state="waiting" imageSrc={null} startedAt={null} receivedAt={null} />)
    expect(screen.getAllByText('Waiting for the first glasses frame…').length).toBeGreaterThan(0)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('never renders transport-only vision metadata', () => {
    render(
      <EgocentricViewer
        state="live"
        imageSrc="data:image/jpeg;base64,sensitive-frame"
        startedAt={null}
        receivedAt={null}
      />,
    )
    expect(screen.queryByText('kitchen')).not.toBeInTheDocument()
    expect(screen.queryByText('person_seated')).not.toBeInTheDocument()
    expect(screen.queryByText('no_motion')).not.toBeInTheDocument()
  })

  it('removes imagery for ended and failed states', () => {
    const { rerender } = render(
      <EgocentricViewer
        state="ended"
        imageSrc={null}
        startedAt={null}
        receivedAt={null}
      />,
    )
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getAllByText('Glasses stream ended').length).toBeGreaterThan(0)

    rerender(<EgocentricViewer state="failed" imageSrc={null} startedAt={null} receivedAt={null} />)
    expect(screen.getAllByText('Glasses stream unavailable').length).toBeGreaterThan(0)
  })
})
