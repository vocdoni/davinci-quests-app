import type { AppProfile } from '../hooks/useAppSession'

export type QuestRole = 'builders' | 'supporters'

export type QuestRequirementSource =
  | 'discord'
  | 'github'
  | 'onchain'
  | 'sequencer'
  | 'telegram'
  | 'twitter'

export type QuestDefinition = {
  achievement: string
  callToAction?: {
    help: string | null
    icon?: string
    title: string
    url: string
  }
  connectButton?: {
    icon?: string
    title: string
    url: string
  }
  description: string
  id: number
  points: number
  title: string
}

export type QuestCatalog = {
  builders: QuestDefinition[]
  supporters: QuestDefinition[]
}

export type QuestStatsSummary = {
  builders: {
    completed: number
    points: number
    total: number
  }
  supporters: {
    completed: number
    points: number
    total: number
  }
}

export type QuestProgressHint = {
  current: number
  remaining: number
  required: number
}

export type QuestAchievementContext = {
  discord: {
    isInTargetServer: boolean | null
    messagesInTargetChannel: number | null
  }
  github: {
    isFollowingTargetOrganization: boolean | null
    isOlderThanOneYear: boolean | null
    publicNonForkRepositoryCount: number | null
    targetOrganization: string | null
    targetRepositories: Array<{
      fullName: string
      isStarred: boolean | null
    }>
  }
  sequencer: {
    addressWeight: string | null
    error: string | null
    hasVoted: boolean | null
    isConnected: boolean
    isInCensus: boolean | null
    lastVerifiedAt: string | null
    processId: string | null
    processes: Array<{
      addressWeight: string | null
      error: string | null
      hasVoted: boolean | null
      isInCensus: boolean | null
      lastVerifiedAt: string | null
      processId: string
      status: string
    }>
    numOfProcessAsParticipant: number
    status: string
    votesCasted: number
  }
  onchain: {
    error: string | null
    isConnected: boolean
    numberOfProcesses: number
    totalVotes: string
  }
  quests: QuestStatsSummary
  telegram: {
    isInTargetChannel: boolean | null
  }
  twitter: Record<string, never>
}

type QuestProfileLike = {
  identities: AppProfile['identities']
  onchain?: AppProfile['onchain']
  score?: AppProfile['score']
  sequencer?: AppProfile['sequencer']
  stats?: Partial<AppProfile['stats']>
  wallet: AppProfile['wallet']
}

function buildEmptyQuestStatsSummary(): QuestStatsSummary {
  return {
    builders: {
      completed: 0,
      points: 0,
      total: 0,
    },
    supporters: {
      completed: 0,
      points: 0,
      total: 0,
    },
  }
}

const DEFAULT_ACHIEVEMENT_CONTEXT: QuestAchievementContext = {
  discord: {
    isInTargetServer: null,
    messagesInTargetChannel: null,
  },
  github: {
    isFollowingTargetOrganization: null,
    isOlderThanOneYear: null,
    publicNonForkRepositoryCount: null,
    targetOrganization: null,
    targetRepositories: [],
  },
  sequencer: {
    addressWeight: null,
    error: null,
    hasVoted: null,
    isConnected: false,
    isInCensus: null,
    lastVerifiedAt: null,
    processId: null,
    processes: [],
    numOfProcessAsParticipant: 0,
    status: 'unverified',
    votesCasted: 0,
  },
  onchain: {
    error: null,
    isConnected: false,
    numberOfProcesses: 0,
    totalVotes: '0',
  },
  quests: buildEmptyQuestStatsSummary(),
  telegram: {
    isInTargetChannel: null,
  },
  twitter: {},
}

const QUEST_REQUIREMENT_SOURCES = new Set<QuestRequirementSource>([
  'discord',
  'github',
  'onchain',
  'sequencer',
  'telegram',
  'twitter',
])

function parseAchievementExpression(expression: string) {
  const match = expression.match(
    /^\s*([A-Za-z0-9_.[\]]+)\s*(==|===|>=|<=|>|<)\s*(.+?)\s*$/u,
  )

  if (!match) {
    return null
  }

  return {
    expected: parseAchievementOperand(match[3]),
    operator: match[2],
    path: match[1],
  }
}

type AchievementOperand =
  | {
      kind: 'literal'
      value: unknown
    }
  | {
      kind: 'path'
      path: string
    }
  | {
      kind: 'path-offset'
      offset: number
      path: string
    }

function getAchievementPathRoot(path: string) {
  const match = path.match(/^[A-Za-z0-9_]+/u)

  return match?.[0] ?? null
}

function parseLiteral(rawValue: string) {
  if (rawValue === 'true') {
    return true
  }

  if (rawValue === 'false') {
    return false
  }

  if (rawValue === 'null') {
    return null
  }

  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return rawValue.slice(1, -1)
  }

  const numericValue = Number(rawValue)

  if (!Number.isNaN(numericValue) && rawValue.trim() !== '') {
    return numericValue
  }

  return rawValue
}

function parseAchievementOperand(rawValue: string): AchievementOperand {
  const trimmedValue = rawValue.trim()
  const arithmeticMatch = trimmedValue.match(
    /^([A-Za-z0-9_.[\]]+)\s*([+-])\s*(\d+(?:\.\d+)?)$/u,
  )

  if (arithmeticMatch) {
    return {
      kind: 'path-offset',
      offset:
        arithmeticMatch[2] === '+'
          ? Number(arithmeticMatch[3])
          : -Number(arithmeticMatch[3]),
      path: arithmeticMatch[1],
    }
  }

  const isQuotedLiteral =
    (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) ||
    (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))
  const isPrimitiveLiteral =
    trimmedValue === 'true' ||
    trimmedValue === 'false' ||
    trimmedValue === 'null' ||
    /^-?\d+(?:\.\d+)?$/u.test(trimmedValue) ||
    isQuotedLiteral

  if (isPrimitiveLiteral) {
    return {
      kind: 'literal',
      value: parseLiteral(trimmedValue),
    }
  }

  if (/^[A-Za-z0-9_.[\]]+$/u.test(trimmedValue)) {
    return {
      kind: 'path',
      path: trimmedValue,
    }
  }

  return {
    kind: 'literal',
    value: parseLiteral(trimmedValue),
  }
}

function toNumericValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value)

    if (Number.isFinite(numericValue)) {
      return numericValue
    }
  }

  return null
}

function resolveAchievementOperandValue(
  operand: AchievementOperand,
  context: QuestAchievementContext,
) {
  if (operand.kind === 'literal') {
    return operand.value
  }

  if (operand.kind === 'path') {
    return readPathValue(context, operand.path)
  }

  const baseValue = readPathValue(context, operand.path)
  const baseNumericValue = toNumericValue(baseValue)

  if (baseNumericValue === null) {
    return undefined
  }

  return baseNumericValue + operand.offset
}

function readPathValue(source: unknown, path: string) {
  const tokens: Array<number | string> = []

  path.replace(/([^[.\]]+)|\[(\d+)\]/gu, (_match, property, index) => {
    tokens.push(property ?? Number(index))
    return ''
  })

  if (tokens.length === 0) {
    return undefined
  }

  let current = source

  for (const token of tokens) {
    if (current === null || current === undefined) {
      return undefined
    }

    if (typeof token === 'number') {
      if (!Array.isArray(current)) {
        return undefined
      }

      current = current[token]
      continue
    }

    if (typeof current !== 'object') {
      return undefined
    }

    current = (current as Record<string, unknown>)[token]
  }

  return current
}

export function buildQuestAchievementContext(
  profile: QuestProfileLike | null | undefined,
  questCatalog: QuestCatalog | null | undefined,
): QuestAchievementContext {
  if (!profile || !questCatalog) {
    return DEFAULT_ACHIEVEMENT_CONTEXT
  }

  const scoreSummary = buildQuestStatsSummary(profile, questCatalog)
  const fallbackStats = {
    discord: {
      isInTargetServer: profile.identities.discord.stats.isInTargetServer,
      messagesInTargetChannel: profile.identities.discord.stats.messagesInTargetChannel ?? null,
    },
    github: {
      isFollowingTargetOrganization:
        profile.identities.github.stats.isFollowingTargetOrganization,
      isOlderThanOneYear: profile.identities.github.stats.isOlderThanOneYear,
      publicNonForkRepositoryCount:
        profile.identities.github.stats.publicNonForkRepositoryCount,
      targetOrganization: profile.identities.github.stats.targetOrganization,
      targetRepositories: profile.identities.github.stats.targetRepositories,
    },
    onchain: {
      address: profile.wallet.address,
      error: profile.onchain?.error ?? null,
      isConnected: profile.onchain?.isConnected ?? false,
      numberOfProcesses: profile.onchain?.numberOfProcesses ?? 0,
      totalVotes: profile.onchain?.totalVotes ?? '0',
    },
    quests: scoreSummary,
    sequencer: {
      lastVerifiedAt: profile.sequencer?.lastVerifiedAt ?? null,
      numOfProcessAsParticipant: profile.sequencer?.numOfProcessAsParticipant ?? 0,
      processes: Array.isArray(profile.sequencer?.processes)
        ? profile.sequencer.processes.map((process) => process.processId)
        : [],
      votesCasted: profile.sequencer?.votesCasted ?? 0,
    },
    telegram: {
      isInTargetChannel: profile.identities.telegram.stats.isInTargetChannel,
    },
    twitter: {},
  } satisfies AppProfile['stats']

  const stats = (profile.stats ?? fallbackStats) as AppProfile['stats']
  const sequencerProcesses = Array.isArray(stats.sequencer.processes)
    ? stats.sequencer.processes
    : []
  const sequencerVotesCasted =
    typeof stats.sequencer.votesCasted === 'number' && stats.sequencer.votesCasted >= 0
      ? stats.sequencer.votesCasted
      : 0
  const sequencerParticipantCount =
    typeof stats.sequencer.numOfProcessAsParticipant === 'number' &&
    stats.sequencer.numOfProcessAsParticipant >= 0
      ? stats.sequencer.numOfProcessAsParticipant
      : 0

  return {
    discord: {
      isInTargetServer: stats.discord.isInTargetServer,
      messagesInTargetChannel: stats.discord.messagesInTargetChannel,
    },
    github: {
      isFollowingTargetOrganization: stats.github.isFollowingTargetOrganization,
      isOlderThanOneYear: stats.github.isOlderThanOneYear,
      publicNonForkRepositoryCount: stats.github.publicNonForkRepositoryCount,
      targetOrganization: stats.github.targetOrganization,
      targetRepositories: stats.github.targetRepositories,
    },
    sequencer: {
      addressWeight: null,
      error: null,
      hasVoted: sequencerVotesCasted > 0,
      isConnected: Boolean(sequencerProcesses.length),
      isInCensus: sequencerParticipantCount > 0,
      lastVerifiedAt: stats.sequencer.lastVerifiedAt,
      processId: null,
      processes: sequencerProcesses.map((processId) => ({
        addressWeight: null,
        error: null,
        hasVoted: null,
        isInCensus: null,
        lastVerifiedAt: stats.sequencer.lastVerifiedAt,
        processId,
        status: 'verified',
      })),
      numOfProcessAsParticipant: sequencerParticipantCount,
      status: sequencerProcesses.length > 0 ? 'verified' : 'unverified',
      votesCasted: sequencerVotesCasted,
    },
    onchain: {
      error: stats.onchain.error,
      isConnected: stats.onchain.isConnected,
      numberOfProcesses: stats.onchain.numberOfProcesses,
      totalVotes: stats.onchain.totalVotes,
    },
    quests: stats.quests,
    telegram: {
      isInTargetChannel: stats.telegram.isInTargetChannel,
    },
    twitter: {},
  }
}

export function buildQuestStatsSummary(
  profile: QuestProfileLike | null | undefined,
  questCatalog: QuestCatalog | null | undefined,
): QuestStatsSummary {
  if (!profile || !questCatalog) {
    return {
      builders: {
        completed: 0,
        points: 0,
        total: 0,
      },
      supporters: {
        completed: 0,
        points: 0,
        total: 0,
      },
    }
  }

  const score = profile.score ?? {
    builderCompletedCount: 0,
    builderCompletedQuestIds: [],
    buildersPoints: 0,
    lastComputedAt: null,
    supporterCompletedCount: 0,
    supporterCompletedQuestIds: [],
    supportersPoints: 0,
    totalPoints: 0,
  }

  return {
    builders: {
      completed: score.builderCompletedCount,
      points: score.buildersPoints,
      total: questCatalog.builders.length,
    },
    supporters: {
      completed: score.supporterCompletedCount,
      points: score.supportersPoints,
      total: questCatalog.supporters.length,
    },
  }
}

export function getQuestRequirementSource(
  achievement: string,
): QuestRequirementSource | null {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return null
  }

  const root = getAchievementPathRoot(parsed.path)

  if (!root || !QUEST_REQUIREMENT_SOURCES.has(root as QuestRequirementSource)) {
    return null
  }

  return root as QuestRequirementSource
}

export function evaluateQuestAchievement(
  achievement: string,
  context: QuestAchievementContext,
) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return false
  }

  const actual = readPathValue(context, parsed.path)
  const expected = resolveAchievementOperandValue(parsed.expected, context)

  switch (parsed.operator) {
    case '==':
    case '===':
      return actual === expected
    case '>':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual)! > toNumericValue(expected)!
        : false
    case '>=':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual)! >= toNumericValue(expected)!
        : false
    case '<':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual)! < toNumericValue(expected)!
        : false
    case '<=':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual)! <= toNumericValue(expected)!
        : false
    default:
      return false
  }
}

export function getQuestProgressHint(
  achievement: string,
  context: QuestAchievementContext,
): QuestProgressHint | null {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return null
  }

  const actual = readPathValue(context, parsed.path)
  const expected = resolveAchievementOperandValue(parsed.expected, context)

  if (toNumericValue(actual) === null || toNumericValue(expected) === null) {
    return null
  }

  const current = toNumericValue(actual)!
  const expectedValue = toNumericValue(expected)!

  const required =
    parsed.operator === '>'
      ? expectedValue + 1
      : parsed.operator === '>=' || parsed.operator === '==' || parsed.operator === '==='
        ? expectedValue
        : null

  if (required === null) {
    return null
  }

  const remaining = Math.max(0, Math.ceil(required - current))

  if (remaining <= 0) {
    return null
  }

  return {
    current,
    remaining,
    required,
  }
}
