import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WellnessTrendsPage } from './WellnessTrendsPage'
import { api } from '@/services/apiClient'
import type { VitalEvent, VitalReport } from '@/types/domain'

// Charts render through recharts, which needs layout jsdom doesn't provide.
// Stub them so this test focuses on freshness, values, ordering and time.
vi.mock('./components/HeartRateChart', () => ({ HeartRateChart: () => <div data-testid="hr-chart" /> }))
vi.mock('./components/StepCountChart', () => ({ StepCountChart: () => <div data-testid="step-chart" /> }))
vi.mock('./components/MotionStateChart', () => ({ MotionStateChart: () => <div data-testid="motion-chart" /> }))

vi.mock('@/features/patients/PatientContext', () => ({
  usePatients: () => ({ selectedPatientId: 'patient-1' }),
}))

vi.mock('@/services/apiClient', async () => {
  const actual =
    await vi.importActual<typeof import('@/services/apiClient')>('@/services/apiClient')
  return { ...actual, api: { getVitalsReport: vi.fn() } }
})

const getVitalsReport = vi.mocked(api.getVitalsReport)

function makeEvent(overrides: Partial<VitalEvent>): VitalEvent {
  return {
    id: 'e',
    patientId: 'patient-1',
    timestamp: '2026-07-13T04:03:07.603Z',
    heartRate: 72,
    motionState: 'idle',
    stepCount: 100,
    sourceDevice: 'watch',
    createdAt: '2026-07-13T04:03:07.603Z',
    updatedAt: '2026-07-13T04:03:07.603Z',
    ...overrides,
  }
}

function makeReport(events: VitalEvent[]): VitalReport {
  const latest = events[0] ?? null
  return {
    summary: {
      totalSamples: events.length,
      samplesWithHeartRate: events.filter((e) => e.heartRate !== null).length,
      samplesWithMotionState: events.filter((e) => e.motionState !== null).length,
      samplesWithStepCount: events.filter((e) => e.stepCount !== null).length,
      firstSampleAt: events[events.length - 1]?.timestamp ?? null,
      latestSampleAt: latest?.timestamp ?? null,
      latestHeartRate: latest?.heartRate ?? null,
      latestMotionState: latest?.motionState ?? null,
      latestStepCount: latest?.stepCount ?? null,
      totalStepsLatestValue: latest?.stepCount ?? null,
      averageHeartRate: null,
      minHeartRate: null,
      maxHeartRate: null,
      stepCountDelta: null,
      mostCommonMotionState: latest?.motionState ?? null,
      countsBySourceDevice: { watch: events.length, phone: 0, system: 0 },
      countsByMotionState: { idle: 0, walking: 0, active: 0, unknown: 0 },
    },
    heartRateTrend: [],
    stepTrend: [],
    motionTimeline: [],
    dailySummaries: [],
    events,
    notes: { positioning: '', availability: '' },
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <WellnessTrendsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  getVitalsReport.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('WellnessTrendsPage', () => {
  it('fetches on open and renders exact heart-rate values in the table', async () => {
    getVitalsReport.mockResolvedValue(
      makeReport([
        makeEvent({ id: 'a', heartRate: 82, timestamp: '2026-07-13T04:07:34.020Z' }),
        makeEvent({ id: 'b', heartRate: 79 }),
      ]),
    )

    renderPage()

    expect(await screen.findAllByText('82 bpm')).not.toHaveLength(0)
    expect(screen.getAllByText('79 bpm').length).toBeGreaterThan(0)
    expect(getVitalsReport).toHaveBeenCalledWith('patient-1', expect.anything(), expect.anything())
  })

  it('renders the newest event first in the desktop table', async () => {
    getVitalsReport.mockResolvedValue(
      makeReport([
        makeEvent({ id: 'newest', heartRate: 80, timestamp: '2026-07-13T04:07:34.020Z' }),
        makeEvent({ id: 'oldest', heartRate: 72, timestamp: '2026-07-13T04:03:07.603Z' }),
      ]),
    )

    renderPage()

    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1) // drop header
    expect(within(rows[0]!).getByText('80 bpm')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('72 bpm')).toBeInTheDocument()
  })

  it('renders UTC timestamps in local time (LA -> Jul 12 evening)', async () => {
    getVitalsReport.mockResolvedValue(
      makeReport([makeEvent({ id: 'a', timestamp: '2026-07-13T04:03:07.603Z' })]),
    )

    renderPage()

    const table = await screen.findByRole('table')
    expect(within(table).getAllByText(/Jul 12/).length).toBeGreaterThan(0)
    expect(within(table).queryByText(/Jul 13/)).toBeNull()
  })

  it('shows a Last updated label and a working manual Refresh button', async () => {
    getVitalsReport.mockResolvedValue(makeReport([makeEvent({ id: 'a' })]))

    renderPage()
    await screen.findByRole('table')
    expect(screen.getByText(/Last updated/i)).toBeInTheDocument()
    expect(getVitalsReport).toHaveBeenCalledTimes(1)

    const refresh = screen.getByRole('button', { name: /refresh/i })
    await userEvent.click(refresh)

    await waitFor(() => expect(getVitalsReport).toHaveBeenCalledTimes(2))
  })
})
