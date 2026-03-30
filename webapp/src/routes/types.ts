import type { QuestDefinition, QuestRole } from '../lib/quests'

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
    completedCount: number
    earnedPoints: number
    totalCount: number
  }
>

export type ResolvedQuest = QuestDefinition & {
  isCompleted: boolean
}

export type TwitterProofState = {
  code: string
  expiresAt: string
  tweetUrl: string
}
