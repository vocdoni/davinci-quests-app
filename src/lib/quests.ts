import type { AppProfile } from '../hooks/useAppSession'

export type QuestRole = 'builders' | 'supporters'

export type QuestDefinition = {
  achievement: string
  description: string
  id: number
  points: number
  title: string
}

export type QuestCatalog = {
  builders: QuestDefinition[]
  supporters: QuestDefinition[]
}

export type QuestAchievementContext = {
  discord: {
    isInTargetServer: boolean | null
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
  telegram: {
    isInTargetChannel: boolean | null
  }
  twitter: Record<string, never>
}

const DEFAULT_ACHIEVEMENT_CONTEXT: QuestAchievementContext = {
  discord: {
    isInTargetServer: null,
  },
  github: {
    isFollowingTargetOrganization: null,
    isOlderThanOneYear: null,
    publicNonForkRepositoryCount: null,
    targetOrganization: null,
    targetRepositories: [],
  },
  telegram: {
    isInTargetChannel: null,
  },
  twitter: {},
}

function parseAchievementExpression(expression: string) {
  const match = expression.match(/^\s*([A-Za-z0-9_.[\]]+)\s*(?:==|===)\s*(.+?)\s*$/u)

  if (!match) {
    return null
  }

  return {
    expected: parseLiteral(match[2]),
    path: match[1],
  }
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
  profile: AppProfile | null | undefined,
): QuestAchievementContext {
  if (!profile) {
    return DEFAULT_ACHIEVEMENT_CONTEXT
  }

  return {
    discord: {
      isInTargetServer: profile.identities.discord.stats.isInTargetServer,
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
    telegram: {
      isInTargetChannel: profile.identities.telegram.stats.isInTargetChannel,
    },
    twitter: {},
  }
}

export function evaluateQuestAchievement(
  achievement: string,
  context: QuestAchievementContext,
) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return false
  }

  return readPathValue(context, parsed.path) === parsed.expected
}
