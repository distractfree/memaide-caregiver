import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiSessionDetailModal } from './AiSessionDetailModal'
import { api } from '@/services/apiClient'
import type { AiSession, AiSessionMessage } from '@/types/domain'

vi.mock('@/services/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return {
    ...actual,
    api: {
      getAiSessionById: vi.fn(),
      caregiverJoinAiSession: vi.fn(),
      resolveAiSession: vi.fn(),
    },
  }
})

const getAiSessionById = vi.mocked(api.getAiSessionById)

function makeSession(messages: AiSessionMessage[], overrides: Partial<AiSession> = {}): AiSession {
  return {
    id: 'session-1',
    patientId: 'patient-1',
    helpEventId: null,
    status: 'resolved',
    startedAt: '2026-07-13T04:00:00.000Z',
    endedAt: '2026-07-13T04:05:00.000Z',
    caregiverJoinedAt: null,
    emergencySuggestedAt: null,
    summary: 'AI session concluded with outcome patient_ended.',
    createdAt: '2026-07-13T04:00:00.000Z',
    updatedAt: '2026-07-13T04:05:00.000Z',
    isJoinable: false,
    displayStatus: 'Resolved',
    messages,
    ...overrides,
  }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AiSessionDetailModal', () => {
  it('renders a realistic Anthony conclude transcript (assistant + patient + event)', async () => {
    // Canonical DTO the backend produces from an Anthony conclude payload.
    const messages: AiSessionMessage[] = [
      { id: 'm1', aiSessionId: 'session-1', role: 'assistant', content: "Hi Rose, I'm here to help. What's going on?", createdAt: '2026-07-13T04:00:01.000Z' },
      { id: 'm2', aiSessionId: 'session-1', role: 'user', content: "I can't find my pills", createdAt: '2026-07-13T04:00:20.000Z' },
      { id: 'm3', aiSessionId: 'session-1', role: 'caregiver', content: 'On my way, Rose.', createdAt: '2026-07-13T04:01:00.000Z' },
      { id: 'm4', aiSessionId: 'session-1', role: 'system', content: 'Caregiver joined the support session.', createdAt: '2026-07-13T04:01:05.000Z' },
    ]
    getAiSessionById.mockResolvedValue(makeSession(messages))

    render(<AiSessionDetailModal sessionId="session-1" onClose={() => {}} onSessionUpdated={() => {}} />)

    expect(await screen.findByText("Hi Rose, I'm here to help. What's going on?")).toBeInTheDocument()
    expect(screen.getByText("I can't find my pills")).toBeInTheDocument()
    expect(screen.getByText('On my way, Rose.')).toBeInTheDocument()
    // The stored event message renders as visible text, not a blank bubble.
    expect(screen.getByText('Caregiver joined the support session.')).toBeInTheDocument()
    // Concluded session shows a terminal display status and no Join button.
    expect(screen.getByText('Resolved')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /join session/i })).not.toBeInTheDocument()
  })

  it('shows the empty-state text when there are no messages', async () => {
    getAiSessionById.mockResolvedValue(makeSession([]))

    render(<AiSessionDetailModal sessionId="session-1" onClose={() => {}} onSessionUpdated={() => {}} />)

    expect(await screen.findByText('No messages recorded for this session.')).toBeInTheDocument()
  })

  it('shows the full caregiver summary from the conclude callback, untruncated', async () => {
    // The list card clamps the summary to two lines; the detail modal is the
    // surface that must expose the whole text the AI backend sent.
    const aiSummary =
      'Rose could not find her pills and became briefly anxious in the kitchen. She calmed down after the reminder, ' +
      'confirmed she had already taken the morning dose, and her caregiver was notified to check in later today.'
    getAiSessionById.mockResolvedValue(makeSession([], { summary: aiSummary }))

    render(<AiSessionDetailModal sessionId="session-1" onClose={() => {}} onSessionUpdated={() => {}} />)

    expect(await screen.findByText(aiSummary)).toBeInTheDocument()
    expect(screen.getByText('Summary')).toBeInTheDocument()
  })

  it('shows Join only when the backend reports isJoinable', async () => {
    getAiSessionById.mockResolvedValue(
      makeSession(
        [{ id: 'm1', aiSessionId: 'session-1', role: 'assistant', content: 'Hello', createdAt: '2026-07-13T04:00:01.000Z' }],
        { status: 'active', endedAt: null, isJoinable: true, displayStatus: 'Active' },
      ),
    )

    render(<AiSessionDetailModal sessionId="session-1" onClose={() => {}} onSessionUpdated={() => {}} />)

    expect(await screen.findByRole('button', { name: /join session/i })).toBeInTheDocument()
  })
})
