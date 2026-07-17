import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StreamStatusPage } from './StreamStatusPage'
import { useStreamStatus } from './useStreamStatus'
import { useLatestStreamFrame } from './useLatestStreamFrame'
import { useAiSessionDetail } from '@/features/ai-sessions/hooks/useAiSessionDetail'
import type { UseAiSessionDetailResult } from '@/features/ai-sessions/hooks/useAiSessionDetail'
import type {
  AiSession,
  StreamActiveSessionSummary,
  StreamSession,
  StreamStatusSummary,
} from '@/types/domain'

vi.mock('@/features/patients/PatientContext', () => ({
  usePatients: () => ({ selectedPatientId: 'patient-1' }),
}))

vi.mock('./useStreamStatus', () => ({
  useStreamStatus: vi.fn(),
}))

vi.mock('./useLatestStreamFrame', () => ({
  useLatestStreamFrame: vi.fn(),
}))

vi.mock('@/features/ai-sessions/hooks/useAiSessionDetail', () => ({
  useAiSessionDetail: vi.fn(),
}))

// The shared panel is covered by its own dedicated test suite. Stubbing it
// here keeps this page test focused on the page's own wiring (which action
// renders, whether the panel is asked to open) without pulling in the
// portal/focus-trap/polling internals it owns.
vi.mock('@/features/ai-sessions/components/AiSessionPanel', () => ({
  AiSessionPanel: ({ open }: { open: boolean }) => (
    <div data-testid="ai-session-panel" data-open={open ? 'true' : 'false'} />
  ),
}))

const mockedUseStreamStatus = vi.mocked(useStreamStatus)
const mockedUseLatestStreamFrame = vi.mocked(useLatestStreamFrame)
const mockedUseAiSessionDetail = vi.mocked(useAiSessionDetail)

function makeSummary(overrides: Partial<StreamStatusSummary> = {}): StreamStatusSummary {
  return {
    hasActiveStream: false,
    displayStatus: 'unavailable',
    viewerAvailable: false,
    caregiverMessage: 'No patient perspective stream is available for this session.',
    activeSession: null,
    latestSession: null,
    ...overrides,
  }
}

function makeActiveSession(
  overrides: Partial<StreamActiveSessionSummary> = {},
): StreamActiveSessionSummary {
  return {
    id: 'stream-1',
    status: 'active',
    source: 'glasses',
    viewerUrl: null,
    startedAt: '2026-07-15T10:30:00.000Z',
    aiSessionId: 'ai-1',
    ...overrides,
  }
}

function makeAiSession(overrides: Partial<AiSession> = {}): AiSession {
  return {
    id: 'ai-1',
    patientId: 'patient-1',
    helpEventId: null,
    status: 'active',
    startedAt: '2026-07-15T10:30:00.000Z',
    endedAt: null,
    caregiverJoinedAt: null,
    emergencySuggestedAt: null,
    summary: null,
    createdAt: '2026-07-15T10:30:00.000Z',
    updatedAt: '2026-07-15T10:30:00.000Z',
    isJoinable: false,
    displayStatus: 'Active',
    ...overrides,
  }
}

function makeAiDetail(overrides: Partial<UseAiSessionDetailResult> = {}): UseAiSessionDetailResult {
  return {
    session: null,
    status: 'idle',
    error: null,
    isRefreshing: false,
    lastUpdatedAt: null,
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

function mockStatus(summary: StreamStatusSummary | null, sessions: StreamSession[] | null = []) {
  mockedUseStreamStatus.mockReturnValue({
    summary,
    sessions,
    status: 'ready',
    error: null,
    isRefreshing: false,
    refresh: vi.fn(),
  })
}

function mockFrame(overrides: Partial<ReturnType<typeof useLatestStreamFrame>> = {}) {
  mockedUseLatestStreamFrame.mockReturnValue({
    frame: null,
    state: 'idle',
    error: null,
    isRefreshing: false,
    refresh: vi.fn(),
    ...overrides,
  })
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('StreamStatusPage — top summary card removal', () => {
  it('no longer renders "Current stream status" or "Most recent session"', () => {
    mockStatus(
      makeSummary({
        displayStatus: 'ended',
        caregiverMessage: 'Patient perspective stream has ended.',
        activeSession: null,
        latestSession: {
          id: 'stream-0',
          status: 'ended',
          source: 'glasses',
          startedAt: '2026-07-15T10:00:00.000Z',
          endedAt: '2026-07-15T10:10:00.000Z',
        },
      }),
    )
    mockFrame()
    mockedUseAiSessionDetail.mockReturnValue(makeAiDetail())

    render(<StreamStatusPage />)

    expect(screen.queryByText(/current stream status/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/most recent session/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/patient perspective stream has ended\./i)).not.toBeInTheDocument()
    // Exact-match: the removed card's field labels/badge, not EgocentricViewer's
    // differently-worded "Stream started" / "Last frame received" stats.
    expect(screen.queryByText('Started')).not.toBeInTheDocument()
    expect(screen.queryByText('Ended')).not.toBeInTheDocument()
    expect(screen.queryByText('Duration')).not.toBeInTheDocument()
    expect(screen.queryByText('Smart glasses', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('renders the Embedded Viewer as the first main content card', () => {
    mockStatus(makeSummary({ displayStatus: 'unavailable' }))
    mockFrame()
    mockedUseAiSessionDetail.mockReturnValue(makeAiDetail())

    const { container } = render(<StreamStatusPage />)

    expect(screen.getByText('Embedded viewer')).toBeInTheDocument()
    expect(screen.getByText('Smart glasses frame')).toBeInTheDocument()

    const root = container.firstElementChild as HTMLElement
    // children[0] is the page header ("Stream Status" + Refresh); the very
    // next rendered element must be the Embedded Viewer card, with no summary
    // card (or empty wrapper) in between.
    expect(root.children[0]?.textContent).toContain('Stream Status')
    expect(root.children[1]?.textContent).toContain('Embedded viewer')
    expect(root.children[1]?.textContent).toContain('Smart glasses frame')
  })
})

describe('StreamStatusPage — viewer states preserved', () => {
  it('shows the ended viewer state', () => {
    mockStatus(makeSummary({ displayStatus: 'ended', activeSession: null }))
    mockFrame()
    mockedUseAiSessionDetail.mockReturnValue(makeAiDetail())

    render(<StreamStatusPage />)

    // Ended state forces imageSrc to null, so both the header title and the
    // no-image placeholder show the same copy — assert presence, not uniqueness.
    expect(screen.getAllByText('Glasses stream ended').length).toBeGreaterThan(0)
  })

  it('shows the live viewer state with an active session and frame', () => {
    mockStatus(makeSummary({ hasActiveStream: true, activeSession: makeActiveSession() }))
    mockFrame({
      state: 'live',
      frame: {
        streamSessionId: 'stream-1',
        patientId: 'patient-1',
        seq: 1,
        receivedAt: '2026-07-15T10:32:00.000Z',
        imageSrc: 'data:image/jpeg;base64,frame-1',
        imageSeq: 1,
      },
    })
    mockedUseAiSessionDetail.mockReturnValue(makeAiDetail({ session: makeAiSession() }))

    render(<StreamStatusPage />)

    expect(screen.getByText('Live patient-perspective frame')).toBeInTheDocument()
    expect(screen.getByAltText('Live patient-perspective frame from smart glasses')).toBeInTheDocument()
  })
})

describe('StreamStatusPage — linked AI session action', () => {
  it('shows no session action when aiSessionId is missing', () => {
    mockStatus(
      makeSummary({
        hasActiveStream: true,
        activeSession: makeActiveSession({ aiSessionId: null }),
      }),
    )
    mockFrame({ state: 'live' })
    mockedUseAiSessionDetail.mockReturnValue(makeAiDetail())

    render(<StreamStatusPage />)

    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open session/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /view summary/i })).not.toBeInTheDocument()
  })

  it('shows Join session for a joinable linked session and calls join on click', async () => {
    mockStatus(
      makeSummary({ hasActiveStream: true, activeSession: makeActiveSession({ aiSessionId: 'ai-1' }) }),
    )
    mockFrame({ state: 'live' })
    const detail = makeAiDetail({ session: makeAiSession({ isJoinable: true }) })
    mockedUseAiSessionDetail.mockReturnValue(detail)

    render(<StreamStatusPage />)

    const joinButton = screen.getByRole('button', { name: 'Join session' })
    await userEvent.click(joinButton)

    expect(detail.join).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('ai-session-panel')).toHaveAttribute('data-open', 'true')
  })

  it('shows Open session for an already-joined linked session and opens the panel on click', async () => {
    mockStatus(
      makeSummary({ hasActiveStream: true, activeSession: makeActiveSession({ aiSessionId: 'ai-1' }) }),
    )
    mockFrame({ state: 'live' })
    const detail = makeAiDetail({
      session: makeAiSession({ status: 'caregiver_joined', isJoinable: false }),
    })
    mockedUseAiSessionDetail.mockReturnValue(detail)

    render(<StreamStatusPage />)

    const openButton = screen.getByRole('button', { name: 'Open session' })
    await userEvent.click(openButton)

    expect(detail.join).not.toHaveBeenCalled()
    expect(screen.getByTestId('ai-session-panel')).toHaveAttribute('data-open', 'true')
  })

  it('shows View summary for a terminal linked session', () => {
    mockStatus(
      makeSummary({ hasActiveStream: true, activeSession: makeActiveSession({ aiSessionId: 'ai-1' }) }),
    )
    mockFrame({ state: 'live' })
    mockedUseAiSessionDetail.mockReturnValue(
      makeAiDetail({
        session: makeAiSession({ status: 'resolved', endedAt: '2026-07-15T11:00:00.000Z' }),
      }),
    )

    render(<StreamStatusPage />)

    expect(screen.getByRole('button', { name: 'View summary' })).toBeInTheDocument()
  })
})
