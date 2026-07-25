import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiSessionsSection } from './AiSessionsSection'
import { api } from '@/services/apiClient'
import type { AiSession } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return {
    ...actual,
    api: {
      listAiSessions: vi.fn(),
      caregiverJoinAiSession: vi.fn(),
    },
  }
})

const listAiSessions = vi.mocked(api.listAiSessions)
const caregiverJoinAiSession = vi.mocked(api.caregiverJoinAiSession)

function makeSession(overrides: Partial<AiSession>): AiSession {
  return {
    id: 'session-1',
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
    messageCount: 0,
    isJoinable: false,
    displayStatus: 'Active',
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AiSessionsSection', () => {
  it('shows Active and a Join button for a joinable session', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({ id: 's-live', isJoinable: true, displayStatus: 'Active' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    expect(await screen.findByText('Active')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Join session' })).toBeInTheDocument()
  })

  it('does not show Join for resolved, failed, stale, superseded, or ended sessions', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({ id: 's-resolved', status: 'resolved', isJoinable: false, displayStatus: 'Resolved' }),
      makeSession({ id: 's-failed', status: 'start_failed', isJoinable: false, displayStatus: 'Failed' }),
      makeSession({ id: 's-stale', status: 'active', isJoinable: false, displayStatus: 'Stale' }),
      makeSession({ id: 's-superseded', status: 'cancelled', isJoinable: false, displayStatus: 'Ended' }),
      makeSession({ id: 's-ended', status: 'active', endedAt: '2026-07-13T05:00:00.000Z', isJoinable: false, displayStatus: 'Ended' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    await screen.findByText('Resolved')
    expect(screen.queryByRole('button', { name: 'Join session' })).not.toBeInTheDocument()
    // Historical sessions remain visible.
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()
    expect(screen.getAllByText('Ended')).toHaveLength(2)
  })

  it('shows at most one Join button when only one session is joinable', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({ id: 's-live', isJoinable: true, displayStatus: 'Active' }),
      makeSession({ id: 's-old', status: 'resolved', isJoinable: false, displayStatus: 'Resolved' }),
      makeSession({ id: 's-stale', status: 'active', isJoinable: false, displayStatus: 'Stale' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    await screen.findByText(/Active/)
    expect(screen.getAllByRole('button', { name: 'Join session' })).toHaveLength(1)
  })

  it('joins using the correct session id when Join is clicked', async () => {
    caregiverJoinAiSession.mockResolvedValue(makeSession({ id: 's-live', status: 'caregiver_joined' }))
    listAiSessions.mockResolvedValue([
      makeSession({ id: 's-live', isJoinable: true, displayStatus: 'Active' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    const joinButton = await screen.findByRole('button', { name: 'Join session' })
    await userEvent.click(joinButton)

    await waitFor(() => {
      expect(caregiverJoinAiSession).toHaveBeenCalledWith('s-live')
    })
  })

  it('a stale caregiver_joined session shows Stale, not Active, and has no Join', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({
        id: 's-stale-cj',
        status: 'caregiver_joined',
        caregiverJoinedAt: '2026-07-11T04:00:00.000Z',
        isJoinable: false,
        displayStatus: 'Stale',
      }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    expect(await screen.findByText('Stale')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join session' })).not.toBeInTheDocument()
  })

  it('a recent caregiver_joined session shows the "Caregiver joined" badge and no Join', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({
        id: 's-cj',
        status: 'caregiver_joined',
        caregiverJoinedAt: '2026-07-13T03:59:00.000Z',
        isJoinable: false,
        displayStatus: 'Caregiver joined',
      }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    expect(await screen.findByText('Caregiver joined')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Join session' })).not.toBeInTheDocument()
  })

  it('renders the caregiver summary the AI conclude callback stored', async () => {
    // Exactly what the backend persists when Anthony's conclude callback ships
    // its optional `summary` field, rather than the generated fallback line.
    const aiSummary =
      'Rose could not find her pills and stayed calm; her caregiver was notified and confirmed she is safe.'
    listAiSessions.mockResolvedValue([
      makeSession({
        id: 's-concluded',
        status: 'resolved',
        endedAt: '2026-07-13T04:05:00.000Z',
        summary: aiSummary,
        isJoinable: false,
        displayStatus: 'Resolved',
      }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    expect(await screen.findByText(aiSummary)).toBeInTheDocument()
    // The placeholder belongs only to sessions with no summary at all.
    expect(screen.queryByText('No summary recorded yet.')).not.toBeInTheDocument()
  })

  it('shows the no-summary placeholder only for sessions without a summary', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({
        id: 's-with-summary',
        status: 'resolved',
        endedAt: '2026-07-13T04:05:00.000Z',
        summary: 'AI session concluded with outcome patient_ended. Final scene: kitchen.',
        isJoinable: false,
        displayStatus: 'Resolved',
      }),
      makeSession({ id: 's-no-summary', summary: null, displayStatus: 'Active' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    await screen.findByText(
      'AI session concluded with outcome patient_ended. Final scene: kitchen.',
    )
    expect(screen.getAllByText('No summary recorded yet.')).toHaveLength(1)
  })

  it('switching the history range refetches with a wider query', async () => {
    listAiSessions.mockResolvedValue([
      makeSession({ id: 's-resolved', status: 'resolved', isJoinable: false, displayStatus: 'Resolved' }),
    ])

    render(<AiSessionsSection patientId="patient-1" />)

    await screen.findByText('Resolved')
    // Default load uses the bounded "recent" window.
    expect(listAiSessions).toHaveBeenCalledWith('patient-1', { limit: 20 })

    await userEvent.click(screen.getByRole('button', { name: 'All sessions' }))

    await waitFor(() => {
      expect(listAiSessions).toHaveBeenCalledWith('patient-1', {})
    })
  })
})
