const DEFAULT_CONTEXT = {
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
  quests: {
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
  },
  telegram: {
    isInTargetChannel: null,
  },
  twitter: {},
}

function getEnabledQuests(quests) {
  return Array.isArray(quests) ? quests.filter((quest) => quest?.disabled !== true) : []
}

function createQuestLookup(quests) {
  return new Map(getEnabledQuests(quests).map((quest) => [quest.id, quest]))
}

function getCompletedQuestIds(sourceScore, role, questLookup, excludedQuest = null) {
  const scoreKey =
    role === 'builders' ? 'builderCompletedQuestIds' : 'supporterCompletedQuestIds'
  const completedQuestIds = Array.isArray(sourceScore?.[scoreKey])
    ? sourceScore[scoreKey].filter((value) => questLookup.has(value))
    : []

  if (!excludedQuest || excludedQuest.role !== role) {
    return completedQuestIds
  }

  return completedQuestIds.filter((questId) => questId !== excludedQuest.id)
}

function sumQuestPoints(questLookup, completedQuestIds) {
  return completedQuestIds.reduce(
    (total, questId) => total + (questLookup.get(questId)?.points ?? 0),
    0,
  )
}

export function buildQuestStatsSummary(
  profile,
  questCatalog,
  scoreSnapshot = null,
  excludedQuest = null,
) {
  const sourceScore = profile?.score ?? scoreSnapshot ?? null
  const builderQuestLookup = createQuestLookup(questCatalog?.builders)
  const supporterQuestLookup = createQuestLookup(questCatalog?.supporters)
  const builderCompletedQuestIds = getCompletedQuestIds(
    sourceScore,
    'builders',
    builderQuestLookup,
    excludedQuest,
  )
  const supporterCompletedQuestIds = getCompletedQuestIds(
    sourceScore,
    'supporters',
    supporterQuestLookup,
    excludedQuest,
  )

  return {
    builders: {
      completed: builderCompletedQuestIds.length,
      points: sumQuestPoints(builderQuestLookup, builderCompletedQuestIds),
      total: builderQuestLookup.size,
    },
    supporters: {
      completed: supporterCompletedQuestIds.length,
      points: sumQuestPoints(supporterQuestLookup, supporterCompletedQuestIds),
      total: supporterQuestLookup.size,
    },
  }
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

function parseAchievementOperand(rawValue) {
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

function getAchievementPathRoot(path) {
  const match = path.match(/^[A-Za-z0-9_]+/u)

  return match?.[0] ?? null
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

function toNumericValue(value) {
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

function buildEmptyQuestStatsSummary() {
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

export function buildQuestAchievementContext(
  profile,
  questCatalog,
  scoreSnapshot = null,
  excludedQuest = null,
) {
  if (!profile || !questCatalog) {
    return DEFAULT_CONTEXT
  }

  const sequencerProcesses = Array.isArray(profile.sequencer?.processes)
    ? profile.sequencer.processes
    : []
  const sequencerVotesCasted =
    typeof profile.sequencer?.votesCasted === 'number' && profile.sequencer.votesCasted >= 0
      ? profile.sequencer.votesCasted
      : sequencerProcesses.reduce(
          (count, process) => count + (process?.hasVoted === true ? 1 : 0),
          0,
        )
  const sequencerParticipantCount =
    typeof profile.sequencer?.numOfProcessAsParticipant === 'number' &&
    profile.sequencer.numOfProcessAsParticipant >= 0
      ? profile.sequencer.numOfProcessAsParticipant
      : sequencerProcesses.reduce(
          (count, process) => count + (process?.isInCensus === true ? 1 : 0),
          0,
        )

  return {
    discord: {
      isInTargetServer: profile.identities?.discord?.stats?.isInTargetServer ?? null,
      messagesInTargetChannel:
        profile.identities?.discord?.stats?.messagesInTargetChannel ?? null,
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
    sequencer: {
      addressWeight: profile.sequencer?.addressWeight ?? null,
      error: profile.sequencer?.error ?? null,
      hasVoted:
        sequencerProcesses.length > 0
          ? sequencerVotesCasted > 0
          : profile.sequencer?.hasVoted ?? null,
      isConnected:
        Boolean(sequencerProcesses.length) || Boolean(profile.sequencer?.processId),
      isInCensus:
        sequencerProcesses.length > 0
          ? sequencerParticipantCount > 0
          : profile.sequencer?.isInCensus ?? null,
      lastVerifiedAt: profile.sequencer?.lastVerifiedAt ?? null,
      processId: profile.sequencer?.processId ?? null,
      processes: sequencerProcesses,
      numOfProcessAsParticipant: sequencerParticipantCount,
      status: profile.sequencer?.status ?? 'unverified',
      votesCasted: sequencerVotesCasted,
    },
    onchain: {
      error: profile.onchain?.error ?? null,
      isConnected: Boolean(profile.lastAuthenticatedAt),
      numberOfProcesses: profile.onchain?.numberOfProcesses ?? 0,
      totalVotes: profile.onchain?.totalVotes ?? '0',
    },
    quests: buildQuestStatsSummary(profile, questCatalog, scoreSnapshot, excludedQuest),
    telegram: {
      isInTargetChannel: profile.identities?.telegram?.stats?.isInTargetChannel ?? null,
    },
    twitter: {},
  }
}

function hasLocalStatsForQuestSource(profile, source) {
  if (!profile || !source) {
    return false
  }

  if (source === 'onchain') {
    return Boolean(profile.lastAuthenticatedAt)
  }

  if (source === 'discord') {
    const stats = profile.identities?.discord?.stats

    return Boolean(
      stats &&
        (stats.isInTargetServer !== null || stats.messagesInTargetChannel !== null),
    )
  }

  if (source === 'sequencer') {
    return Boolean(profile.sequencer?.processes?.length || profile.sequencer?.processId)
  }

  if (source === 'github') {
    const stats = profile.identities?.github?.stats

    if (!stats) {
      return false
    }

    if (
      stats.isFollowingTargetOrganization !== null ||
      stats.isOlderThanOneYear !== null ||
      stats.publicNonForkRepositoryCount !== null
    ) {
      return true
    }

    return Array.isArray(stats.targetRepositories)
      ? stats.targetRepositories.some((repository) => repository?.isStarred !== null)
      : false
  }

  if (source === 'telegram') {
    return profile.identities?.telegram?.stats?.isInTargetChannel !== null
  }

  return false
}

function getQuestAchievementRoot(achievement) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return null
  }

  return getAchievementPathRoot(parsed.path)
}

function getQuestValidUntilTimestamp(quest) {
  if (typeof quest?.validUntil !== 'string' || quest.validUntil.trim().length === 0) {
    return null
  }

  const timestamp = Date.parse(quest.validUntil)

  return Number.isNaN(timestamp) ? null : timestamp
}

function isQuestExpired(quest, now) {
  const validUntilTimestamp = getQuestValidUntilTimestamp(quest)

  return validUntilTimestamp !== null && now >= validUntilTimestamp
}

function getPreviousCompletedQuestIds(snapshot, role) {
  const ids =
    role === 'supporters'
      ? snapshot?.supporterCompletedQuestIds
      : snapshot?.builderCompletedQuestIds

  return new Set(
    Array.isArray(ids) ? ids.filter((value) => Number.isInteger(value)) : [],
  )
}

function getQuestRequirementSource(achievement) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return null
  }

  return getAchievementPathRoot(parsed.path)
}

export function buildScoreSnapshotFromLocalState(
  questCatalog,
  profile,
  previousScoreSnapshot = buildDefaultScoreSnapshot(),
  now = Date.now(),
) {
  const supporterQuests = getEnabledQuests(questCatalog?.supporters)
  const builderQuests = getEnabledQuests(questCatalog?.builders)
  const previousSupporterCompletedQuestIds = getPreviousCompletedQuestIds(
    previousScoreSnapshot,
    'supporters',
  )
  const previousBuilderCompletedQuestIds = getPreviousCompletedQuestIds(
    previousScoreSnapshot,
    'builders',
  )

  const evaluateQuest = (quest, role) => {
    const previousCompletedQuestIds =
      role === 'supporters'
        ? previousSupporterCompletedQuestIds
        : previousBuilderCompletedQuestIds

    if (isQuestExpired(quest, now)) {
      return previousCompletedQuestIds.has(quest.id)
    }

    const context = buildQuestAchievementContext(
      profile,
      questCatalog,
      previousScoreSnapshot,
      getQuestAchievementRoot(quest.achievement) === 'quests'
        ? {
            id: quest.id,
            points: quest.points,
            role,
          }
        : null,
    )
    const root = getQuestAchievementRoot(quest.achievement)
    const source = getQuestRequirementSource(quest.achievement)

    if (root === 'quests') {
      return evaluateQuestAchievement(quest.achievement, context)
    }

    if (hasLocalStatsForQuestSource(profile, source)) {
      return evaluateQuestAchievement(quest.achievement, context)
    }

    return previousCompletedQuestIds.has(quest.id)
  }

  const supporterCompletedQuestIds = supporterQuests
    .filter((quest) => evaluateQuest(quest, 'supporters'))
    .map((quest) => quest.id)
  const builderCompletedQuestIds = builderQuests
    .filter((quest) => evaluateQuest(quest, 'builders'))
    .map((quest) => quest.id)

  const supportersPoints = supporterQuests.reduce(
    (total, quest) => total + (supporterCompletedQuestIds.includes(quest.id) ? quest.points : 0),
    0,
  )
  const buildersPoints = builderQuests.reduce(
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

export function evaluateQuestAchievement(achievement, context) {
  const parsed = parseAchievementExpression(achievement)

  if (!parsed) {
    return false
  }

  const actual = readPathValue(context, parsed.path)
  const expected =
    parsed.expected.kind === 'literal'
      ? parsed.expected.value
      : parsed.expected.kind === 'path'
        ? readPathValue(context, parsed.expected.path)
        : (() => {
            const baseValue = readPathValue(context, parsed.expected.path)
            const baseNumericValue = toNumericValue(baseValue)

            if (baseNumericValue === null) {
              return undefined
            }

            return baseNumericValue + parsed.expected.offset
          })()

  switch (parsed.operator) {
    case '==':
    case '===':
      return actual === expected
    case '>':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual) > toNumericValue(expected)
        : false
    case '>=':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual) >= toNumericValue(expected)
        : false
    case '<':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual) < toNumericValue(expected)
        : false
    case '<=':
      return toNumericValue(actual) !== null && toNumericValue(expected) !== null
        ? toNumericValue(actual) <= toNumericValue(expected)
        : false
    default:
      return false
  }
}

export function buildScoreSnapshot(questCatalog, profile, now = Date.now()) {
  const supporterQuests = getEnabledQuests(questCatalog?.supporters)
  const builderQuests = getEnabledQuests(questCatalog?.builders)
  const previousSupporterCompletedQuestIds = getPreviousCompletedQuestIds(
    profile?.score ?? null,
    'supporters',
  )
  const previousBuilderCompletedQuestIds = getPreviousCompletedQuestIds(
    profile?.score ?? null,
    'builders',
  )

  const evaluateQuest = (quest, role, previousCompletedQuestIds) => {
    if (isQuestExpired(quest, now)) {
      return previousCompletedQuestIds.has(quest.id)
    }

    return evaluateQuestAchievement(
      quest.achievement,
      buildQuestAchievementContext(
        profile,
        questCatalog,
        profile?.score ?? null,
        getQuestAchievementRoot(quest.achievement) === 'quests'
          ? {
              id: quest.id,
              points: quest.points,
              role,
            }
          : null,
      ),
    )
  }

  const supporterCompletedQuestIds = supporterQuests
    .filter((quest) => evaluateQuest(quest, 'supporters', previousSupporterCompletedQuestIds))
    .map((quest) => quest.id)
  const builderCompletedQuestIds = builderQuests
    .filter((quest) => evaluateQuest(quest, 'builders', previousBuilderCompletedQuestIds))
    .map((quest) => quest.id)
  const supportersPoints = supporterQuests.reduce(
    (total, quest) => total + (supporterCompletedQuestIds.includes(quest.id) ? quest.points : 0),
    0,
  )
  const buildersPoints = builderQuests.reduce(
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
