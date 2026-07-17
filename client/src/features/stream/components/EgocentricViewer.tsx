import { type ReactNode } from 'react'
import { Clock3, Glasses, Radio, TriangleAlert, Video, WifiOff } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import type { FrameViewerState } from '@/features/stream/useLatestStreamFrame'
import { formatDateTime } from '@/utils/formatting'

interface Props {
  state: FrameViewerState | 'unavailable' | 'ended' | 'failed'
  imageSrc: string | null
  startedAt: string | null | undefined
  receivedAt: string | null | undefined
  // Optional AI-session action (Join/Open/View) rendered beside the state title.
  headerAction?: ReactNode
}

type ViewerCopy = {
  title: string
  message: string
  Icon: typeof Video
  tone: string
}

const VIEWER_COPY: Record<Props['state'], ViewerCopy> = {
  unavailable: {
    title: 'No active glasses stream',
    message: 'A patient-perspective frame will appear here when a smart-glasses stream is active.',
    Icon: Video,
    tone: 'text-text-muted',
  },
  idle: {
    title: 'No active glasses stream',
    message: 'A patient-perspective frame will appear here when a smart-glasses stream is active.',
    Icon: Video,
    tone: 'text-text-muted',
  },
  waiting: {
    title: 'Waiting for the first glasses frame…',
    message: 'The stream is active. The first patient-perspective frame will appear shortly.',
    Icon: Radio,
    tone: 'text-accent',
  },
  live: {
    title: 'Live patient-perspective frame',
    message: 'The latest frame was received from the smart glasses.',
    Icon: Radio,
    tone: 'text-accent',
  },
  stale: {
    title: 'Waiting for a new frame…',
    message: 'The last patient-perspective frame remains visible while the stream reconnects.',
    Icon: Clock3,
    tone: 'text-on-primary',
  },
  reconnecting: {
    title: 'Connection interrupted. Retrying…',
    message: 'The latest successful frame remains visible while the viewer reconnects.',
    Icon: WifiOff,
    tone: 'text-on-primary',
  },
  ended: {
    title: 'Glasses stream ended',
    message: 'No patient-perspective frame is currently being shown.',
    Icon: Video,
    tone: 'text-text-muted',
  },
  failed: {
    title: 'Glasses stream unavailable',
    message: 'The stream ended unexpectedly. Refresh Stream Status to check for a new session.',
    Icon: TriangleAlert,
    tone: 'text-error',
  },
}

export function EgocentricViewer({ state, imageSrc, startedAt, receivedAt, headerAction }: Props) {
  const copy = VIEWER_COPY[state]
  const showImage = Boolean(imageSrc) && (state === 'live' || state === 'stale' || state === 'reconnecting')
  const showOverlay = showImage && state !== 'live'
  const Icon = copy.Icon

  return (
    <Card className="flex flex-col gap-4 overflow-hidden" aria-labelledby="egocentric-viewer-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-surface-container-high text-on-surface">
            <Glasses className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
              Embedded viewer
            </p>
            <h2 id="egocentric-viewer-title" className="text-base font-semibold text-on-surface">
              Smart glasses frame
            </h2>
          </div>
        </div>
        {/* Status stays the answer to "what is happening?"; the optional action
            is the answer to "what can the caregiver do?" — kept side by side and
            allowed to wrap below the title on narrow widths. */}
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <p className={`inline-flex items-center gap-1.5 text-xs font-semibold ${copy.tone}`} aria-live="polite">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{copy.title}</span>
          </p>
          {headerAction}
        </div>
      </div>

      <div className="relative aspect-video min-h-[13.5rem] overflow-hidden rounded-2xl border border-outline-variant/30 bg-primary sm:min-h-[18rem]">
        {showImage ? (
          <img
            src={imageSrc!}
            alt="Live patient-perspective frame from smart glasses"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-on-primary">
            <Icon className="h-7 w-7" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-semibold">{copy.title}</p>
              <p className="max-w-md text-xs leading-relaxed text-primary-fixed-dim">{copy.message}</p>
            </div>
          </div>
        )}

        {showOverlay && (
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-primary/80 px-4 py-3 text-xs font-medium text-on-primary backdrop-blur-sm">
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{copy.title}</span>
          </div>
        )}
      </div>

      <dl className="grid gap-3 text-xs sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">Source</dt>
          <dd className="font-medium text-on-surface">Smart glasses</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">Stream started</dt>
          <dd className="font-medium text-on-surface">{formatDateTime(startedAt)}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-text-muted">Last frame received</dt>
          <dd className="font-medium text-on-surface">{formatDateTime(receivedAt)}</dd>
        </div>
      </dl>
    </Card>
  )
}
