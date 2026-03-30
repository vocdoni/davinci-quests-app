const DEFAULT_CONTEXT = {
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
  onchain: {
    error: null,
    numberOfProcesses: 0,
    totalVotes: '0',
  },
  telegram: {
    isInTargetChannel: null,
  },
  twitter: {},
}

function parseLiteral(rawValue) {
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

function parseAchievementExpression(expression) {
  const match = expression.match(/^\s*([A-Za-z0-9_.[\]]+)\s*(?:==|===)\s*(.+?)\s*$/u)

  if (!match) {
    return null
  }

  return {
    expected: parseLiteral(match[2]),
    path: match[1],
  }
}

function readPathValue(source, path) {
  const tokens = []

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

    current = current[token]
  }

  return current
}

export function buildDefaultScoreSnapshot() {
  return {
    builderCompletedCount: 0,
    builderCompletedQuestIds: [],
    buildersPoints: 0,
    lastComputedAt: null,
    supporterCompletedCount: 0,
    supporterCompletedQuestIds: [],
    supportersPoints: 0,
    totalPoints: 0,
  }
}

export function buildQuestAchievementContext(profile) {
  if (!profile) {
    return DEFAULT_CONTEXT
  }

  return {
    discord: {
      isInTargetServer: profile.identities?.discord?.stats?.isInTargetServer ?? null,
    },
    github: {
      isFollowingTargetOrganization:
        profile.identities?.github?.stats?.isFollowingTargetOrganization ?? null,
      isOlderThanOneYear: profile.identities?.github?.stats?.isOlderThanOneYear ?? null,
      publicNonForkRepositoryCount:
        profile.identities?.github?.stats?.publicNonForkRepositoryCount ?? null,
      targetOrganization: profile.identities?.github?.stats?.targetOrganization ?? null,
      targetRepositories: Array.isArray(profile.identities?.github?.stats?.targetRepositories)
        ? profile.identities.github.stats.targetRepositories
        : [],
    },
    onchain: {
      error: profile.onchain?.error ?? null,
      numberOfProcesses: profile.onchain?.numberOfProcesses ?? 0,
      totalVotes: profile.onchain?.totalVotes ?? '0',
    },
    telegram: {
      isInTargetChannel: profile.identities?.telegram?.stats?.isInTargetChannel ?? null,
    },
    twitter: {},
  }
}

export function evaluateQuestAchievement(achievement, context) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return false
  }

  return readPathValue(context, parsed.path) === parsed.expected
}

export function buildScoreSnapshot(questCatalog, profile, now = Date.now()) {
  const context = buildQuestAchievementContext(profile)
  const supporterCompletedQuestIds = questCatalog.supporters
    .filter((quest) => evaluateQuestAchievement(quest.achievement, context))
    .map((quest) => quest.id)
  const builderCompletedQuestIds = questCatalog.builders
    .filter((quest) => evaluateQuestAchievement(quest.achievement, context))
    .map((quest) => quest.id)
  const supportersPoints = questCatalog.supporters.reduce(
    (total, quest) => total + (supporterCompletedQuestIds.includes(quest.id) ? quest.points : 0),
    0,
  )
  const buildersPoints = questCatalog.builders.reduce(
    (total, quest) => total + (builderCompletedQuestIds.includes(quest.id) ? quest.points : 0),
    0,
  )

  return {
    builderCompletedCount: builderCompletedQuestIds.length,
    builderCompletedQuestIds,
    buildersPoints,
    lastComputedAt: new Date(now),
    supporterCompletedCount: supporterCompletedQuestIds.length,
    supporterCompletedQuestIds,
    supportersPoints,
    totalPoints: supportersPoints + buildersPoints,
  }
}

export function areScoreSnapshotsEqual(left, right) {
  if (!left || !right) {
    return false
  }

  return (
    left.totalPoints === right.totalPoints &&
    left.supportersPoints === right.supportersPoints &&
    left.buildersPoints === right.buildersPoints &&
    left.supporterCompletedCount === right.supporterCompletedCount &&
    left.builderCompletedCount === right.builderCompletedCount &&
    JSON.stringify(left.supporterCompletedQuestIds ?? []) ===
      JSON.stringify(right.supporterCompletedQuestIds ?? []) &&
    JSON.stringify(left.builderCompletedQuestIds ?? []) ===
      JSON.stringify(right.builderCompletedQuestIds ?? [])
  )
}
