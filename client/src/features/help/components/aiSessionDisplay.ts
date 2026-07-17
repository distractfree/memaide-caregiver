// Backwards-compatible re-export. The canonical implementation now lives in the
// shared AI-session module so the Help page and Stream Status page share exactly
// one presentation/action source of truth.
export {
  resolveDisplayStatus,
  canJoinSession,
  isCurrentSession,
  isTerminalAiSession,
} from '@/features/ai-sessions/aiSessionUi'
