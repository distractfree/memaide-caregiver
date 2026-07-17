import { AiSessionPanel } from '@/features/ai-sessions/components/AiSessionPanel'
import { useAiSessionDetail } from '@/features/ai-sessions/hooks/useAiSessionDetail'

interface AiSessionDetailModalProps {
  sessionId: string | null
  onClose: () => void
  onSessionUpdated: () => void
}

// Thin adapter kept for the Help page's existing call site. It now delegates to
// the shared AI-session hook + panel so Help and Stream Status share one
// implementation. Opening is driven by `sessionId`; polling runs only while open.
export function AiSessionDetailModal({
  sessionId,
  onClose,
  onSessionUpdated,
}: AiSessionDetailModalProps) {
  const open = Boolean(sessionId)
  const detail = useAiSessionDetail({ sessionId, enabled: open, poll: open })

  return (
    <AiSessionPanel
      open={open}
      onClose={onClose}
      detail={detail}
      onSessionUpdated={onSessionUpdated}
    />
  )
}
