import type { QuestDefinition, QuestProgressHint, QuestRole } from '../lib/quests'

export type ConnectionVariant = 'discord' | 'github' | 'telegram' | 'twitter'

export type ConnectionRow = {
  isConnected: boolean
  name: string
  onClick: () => void
  statusLabel: string
  username: string | null
  variant: ConnectionVariant
}

export type QuestProgressSummary = Record<
  QuestRole,
  {
    completed: number
    points: number
    total: number
  }
>

export type ResolvedQuest = QuestDefinition & {
  isCompleted: boolean
  isExpired: boolean
  progressHint: QuestProgressHint | null
  validUntilLabel: string | null
}

export type TwitterProofState = {
  code: string
  expiresAt: string
  tweetUrl: string
}
