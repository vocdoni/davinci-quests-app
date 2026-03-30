import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { getAddress, isAddress, verifyMessage } from 'viem'
import { loadDotEnvFiles } from './dotenv.mjs'
import { parseServerConfig } from './config.mjs'
import {
  buildDiscordAuthorizationUrl,
  DiscordApiError,
  exchangeDiscordAuthorizationCode,
  fetchDiscordUserStats,
  refreshDiscordAccessToken,
} from './discord.mjs'
import {
  buildGitHubAuthorizationUrl,
  exchangeGitHubAuthorizationCode,
  fetchGitHubUserStats,
  GitHubApiError,
} from './github.mjs'
import {
  buildFrontendRedirect,
  clearCookie,
  json,
  noContent,
  parseCookies,
  readJsonBody,
  redirect,
  setCookie,
  setCorsHeaders,
} from './http.mjs'
import { createMongoIdentityStore } from './mongo.mjs'
import { createEnsDependencies } from './ens.mjs'
import { createOnchainStatsDependencies } from './processRegistry.mjs'
import { loadQuestCatalog } from './quests.mjs'
import {
  areScoreSnapshotsEqual,
  buildDefaultScoreSnapshot,
  buildScoreSnapshot,
} from './scoring.mjs'
import {
  buildWalletSignInMessage,
  createAppSessionToken,
  createDiscordStateToken,
  createGitHubStateToken,
  createRandomToken,
  createWalletChallengeToken,
  decryptSecret,
  encryptSecret,
  verifyAppSessionToken,
  verifyDiscordStateToken,
  verifyGitHubStateToken,
  verifyWalletChallengeToken,
} from './security.mjs'
import {
  buildTelegramAuthorizationUrl,
  createPkceChallenge,
  createTelegramStateToken,
  exchangeTelegramAuthorizationCode,
  fetchTelegramChannelMembership,
  fetchTelegramOidcConfiguration,
  verifyTelegramIdToken,
  verifyTelegramStateToken,
} from './telegram.mjs'
import {
  fetchTwitterProofTweet,
  TwitterApiError,
} from './twitter.mjs'

const APP_SESSION_COOKIE_NAME = 'quests_dashboard_app_session'
const LEADERBOARD_MAX_LIMIT = 100
const LEADERBOARD_DEFAULT_LIMIT = 100
const PROFILE_SNAPSHOT_TTL_MS = 15 * 60 * 1000
const WALLET_CHALLENGE_COOKIE_NAME = 'quests_dashboard_wallet_challenge'
const TWITTER_CODE_TTL_MS = 5 * 60 * 1000

class RequestError extends Error {
  status

  constructor(message, status) {
    super(message)
    this.name = 'RequestError'
    this.status = status
  }
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown server error.'
}

function normalizeWalletAddress(address) {
  if (typeof address !== 'string' || !isAddress(address)) {
    throw new Error('Wallet address is invalid.')
  }

  return getAddress(address)
}

function getCookieSettings(config) {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure: config.secureCookies,
  }
}

function getAuthenticatedSession(request, config, dependencies) {
  const cookies = parseCookies(request)
  const token = cookies[APP_SESSION_COOKIE_NAME]

  if (!token) {
    return null
  }

  try {
    return verifyAppSessionToken(token, config.appSessionSecret, dependencies.now())
  } catch {
    return null
  }
}

function buildUnauthorizedResponse(response) {
  json(response, 401, { message: 'Unauthorized' })
}

function createLinkSuccessRedirect(config, provider) {
  return buildFrontendRedirect(config.frontendAppUrl, {
    link_provider: provider,
    link_status: 'success',
  })
}

function createLinkErrorRedirect(config, provider, description) {
  return buildFrontendRedirect(config.frontendAppUrl, {
    link_error: description,
    link_provider: provider,
    link_status: 'error',
  })
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsTwitterProofCode(text, code) {
  const expression = new RegExp(
    `(^|[^A-Za-z0-9_-])${escapeRegExp(code)}([^A-Za-z0-9_-]|$)`,
    'u',
  )

  return expression.test(text)
}

function buildDefaultGitHubStats(githubConfig) {
  const targetRepositories = Array.isArray(githubConfig?.targetRepositories)
    ? githubConfig.targetRepositories
    : []

  return {
    isFollowingTargetOrganization: null,
    isOlderThanOneYear: null,
    publicNonForkRepositoryCount: null,
    targetOrganization: githubConfig?.targetOrganization ?? null,
    targetRepositories: targetRepositories.map((repository) => ({
      fullName: repository.fullName,
      isStarred: null,
    })),
  }
}

function normalizeGitHubTargetRepositories(value, githubConfig) {
  const configuredRepositories = Array.isArray(githubConfig?.targetRepositories)
    ? githubConfig.targetRepositories
    : []

  if (!Array.isArray(value)) {
    return buildDefaultGitHubStats(githubConfig).targetRepositories
  }

  const storedRepositories = new Map()

  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || typeof entry.fullName !== 'string') {
      continue
    }

    storedRepositories.set(
      entry.fullName,
      typeof entry.isStarred === 'boolean' ? entry.isStarred : null,
    )
  }

  return configuredRepositories.map((repository) => ({
    fullName: repository.fullName,
    isStarred: storedRepositories.has(repository.fullName)
      ? storedRepositories.get(repository.fullName)
      : null,
  }))
}

function buildDefaultIdentity(provider, githubConfig = null) {
  return {
    connected: false,
    displayName: null,
    error: null,
    stats:
      provider === 'discord'
        ? { isInTargetServer: null }
        : provider === 'github'
          ? buildDefaultGitHubStats(githubConfig)
        : provider === 'twitter'
          ? {}
        : { isInTargetChannel: null },
    status: 'disconnected',
    userId: null,
    username: null,
  }
}

function buildDefaultOnchain() {
  return {
    error: null,
    numberOfProcesses: 0,
    totalVotes: '0',
  }
}

function buildDefaultScore() {
  return buildDefaultScoreSnapshot()
}

function getDiscordLastKnownMembership(link) {
  return typeof link?.discordLastKnownIsInTargetServer === 'boolean'
    ? link.discordLastKnownIsInTargetServer
    : null
}

function normalizeTimestamp(value) {
  if (!value) {
    return null
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function buildConnectedIdentity(provider, link, options = {}, githubConfig = null) {
  const defaultIdentity = buildDefaultIdentity(provider, githubConfig)

  return {
    connected: true,
    displayName: options.displayName ?? link.displayName ?? null,
    error: options.error ?? null,
    stats: options.stats ?? defaultIdentity.stats,
    status: options.status ?? 'active',
    userId: options.userId ?? link.providerUserId ?? null,
    username: options.username ?? link.username ?? null,
  }
}

function normalizeStoredOnchainSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return buildDefaultOnchain()
  }

  return {
    error: typeof snapshot.error === 'string' ? snapshot.error : null,
    numberOfProcesses:
      Number.isInteger(snapshot.numberOfProcesses) && snapshot.numberOfProcesses >= 0
        ? snapshot.numberOfProcesses
        : 0,
    totalVotes: typeof snapshot.totalVotes === 'string' ? snapshot.totalVotes : '0',
  }
}

function normalizeStoredScoreSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return buildDefaultScore()
  }

  return {
    builderCompletedCount:
      Number.isInteger(snapshot.builderCompletedCount) && snapshot.builderCompletedCount >= 0
        ? snapshot.builderCompletedCount
        : 0,
    builderCompletedQuestIds: Array.isArray(snapshot.builderCompletedQuestIds)
      ? snapshot.builderCompletedQuestIds.filter((value) => Number.isInteger(value))
      : [],
    buildersPoints:
      Number.isInteger(snapshot.buildersPoints) && snapshot.buildersPoints >= 0
        ? snapshot.buildersPoints
        : 0,
    lastComputedAt: snapshot.lastComputedAt ?? null,
    supporterCompletedCount:
      Number.isInteger(snapshot.supporterCompletedCount) && snapshot.supporterCompletedCount >= 0
        ? snapshot.supporterCompletedCount
        : 0,
    supporterCompletedQuestIds: Array.isArray(snapshot.supporterCompletedQuestIds)
      ? snapshot.supporterCompletedQuestIds.filter((value) => Number.isInteger(value))
      : [],
    supportersPoints:
      Number.isInteger(snapshot.supportersPoints) && snapshot.supportersPoints >= 0
        ? snapshot.supportersPoints
        : 0,
    totalPoints:
      Number.isInteger(snapshot.totalPoints) && snapshot.totalPoints >= 0
        ? snapshot.totalPoints
        : 0,
  }
}

function isSnapshotStale(value, now) {
  const timestamp = normalizeTimestamp(value)

  if (timestamp === null) {
    return true
  }

  return now - timestamp >= PROFILE_SNAPSHOT_TTL_MS
}

function trimWalletAddress(walletAddress) {
  return `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
}

function buildWalletResponse(walletAddress, walletProfile = null) {
  return {
    address: walletAddress,
    ensName: typeof walletProfile?.ensName === 'string' ? walletProfile.ensName : null,
  }
}

function buildProfileResponse(walletAddress, walletProfile, identities, onchain, score) {
  return {
    identities,
    onchain,
    score,
    wallet: {
      ...buildWalletResponse(walletAddress, walletProfile),
    },
  }
}

function buildLeaderboardRow(walletProfile, rank) {
  const scoreSnapshot = normalizeStoredScoreSnapshot(walletProfile.scoreSnapshot)
  const ensName = typeof walletProfile.ensName === 'string' ? walletProfile.ensName : null

  return {
    buildersPoints: scoreSnapshot.buildersPoints,
    displayName: ensName ?? trimWalletAddress(walletProfile.walletAddress),
    ensName,
    lastComputedAt: scoreSnapshot.lastComputedAt,
    rank,
    supportersPoints: scoreSnapshot.supportersPoints,
    totalPoints: scoreSnapshot.totalPoints,
    walletAddress: walletProfile.walletAddress,
  }
}

function parseLeaderboardLimit(requestUrl) {
  const rawLimit = requestUrl.searchParams.get('limit')

  if (!rawLimit) {
    return LEADERBOARD_DEFAULT_LIMIT
  }

  const limit = Number(rawLimit)

  if (!Number.isInteger(limit) || limit < 1 || limit > LEADERBOARD_MAX_LIMIT) {
    throw new RequestError(
      `Leaderboard limit must be an integer between 1 and ${LEADERBOARD_MAX_LIMIT}.`,
      400,
    )
  }

  return limit
}

async function readRequestJson(response, request) {
  try {
    return await readJsonBody(request)
  } catch {
    json(response, 400, { message: 'Request body must be valid JSON.' })
    return null
  }
}

async function persistDiscordLink(config, dependencies, walletAddress, tokenResponse, stats) {
  const existingLink = stats.userId
    ? await dependencies.store.findIdentityLinkByProviderUserId('discord', stats.userId)
    : null

  if (existingLink && existingLink.walletAddress !== walletAddress) {
    throw new Error('Discord account is already linked to another wallet.')
  }

  return dependencies.store.upsertIdentityLink(walletAddress, 'discord', {
    discordLastKnownIsInTargetServer: stats.isInTargetServer,
    displayName: stats.displayName ?? null,
    encryptedAccessToken: encryptSecret(
      tokenResponse.accessToken,
      config.providerTokenEncryptionSecret,
    ),
    encryptedRefreshToken: encryptSecret(
      tokenResponse.refreshToken,
      config.providerTokenEncryptionSecret,
    ),
    providerUserId: stats.userId,
    scope: tokenResponse.scope,
    tokenType: tokenResponse.tokenType,
    username: stats.username ?? null,
  })
}

async function persistTelegramLink(dependencies, walletAddress, telegramUser) {
  const existingLink = await dependencies.store.findIdentityLinkByProviderUserId(
    'telegram',
    telegramUser.telegramId,
  )

  if (existingLink && existingLink.walletAddress !== walletAddress) {
    throw new Error('Telegram account is already linked to another wallet.')
  }

  return dependencies.store.upsertIdentityLink(walletAddress, 'telegram', {
    displayName: telegramUser.displayName ?? null,
    providerUserId: telegramUser.telegramId,
    telegramSubject: telegramUser.subject,
    username: telegramUser.username ?? null,
  })
}

async function persistGitHubLink(
  config,
  dependencies,
  walletAddress,
  tokenResponse,
  stats,
) {
  const existingLink = stats.userId
    ? await dependencies.store.findIdentityLinkByProviderUserId('github', stats.userId)
    : null

  if (existingLink && existingLink.walletAddress !== walletAddress) {
    throw new Error('GitHub account is already linked to another wallet.')
  }

  return dependencies.store.upsertIdentityLink(walletAddress, 'github', {
    displayName: stats.displayName ?? null,
    encryptedAccessToken: encryptSecret(
      tokenResponse.accessToken,
      config.providerTokenEncryptionSecret,
    ),
    providerUserId: stats.userId,
    scope: tokenResponse.scope,
    tokenType: tokenResponse.tokenType,
    username: stats.username ?? null,
  })
}

async function persistTwitterLink(dependencies, walletAddress, proofTweet) {
  const existingLink = await dependencies.store.findIdentityLinkByProviderUserId(
    'twitter',
    proofTweet.username,
  )

  if (existingLink && existingLink.walletAddress !== walletAddress) {
    throw new RequestError('Twitter account is already linked to another wallet.', 409)
  }

  const now = dependencies.now()

  return dependencies.store.upsertIdentityLink(walletAddress, 'twitter', {
    displayName: proofTweet.displayName ?? null,
    providerUserId: proofTweet.username,
    twitterProofTweetId: proofTweet.tweetId,
    twitterProofTweetUrl: proofTweet.normalizedTweetUrl,
    twitterVerifiedAt: new Date(now),
    username: proofTweet.username,
  })
}

async function clearPendingTwitterCode(dependencies, walletAddress) {
  return dependencies.store.upsertWalletProfile(walletAddress, {
    twitterPendingCode: null,
    twitterPendingCodeExpiresAt: null,
    twitterPendingCodeIssuedAt: null,
  })
}

async function resolveDiscordIdentity(config, dependencies, link) {
  if (!link) {
    return buildDefaultIdentity('discord')
  }

  const lastKnownMembership = getDiscordLastKnownMembership(link)
  let accessToken

  try {
    accessToken = decryptSecret(
      link.encryptedAccessToken,
      config.providerTokenEncryptionSecret,
    )
  } catch (error) {
    return buildConnectedIdentity('discord', link, {
      error: getErrorMessage(error),
      stats: { isInTargetServer: lastKnownMembership },
      status: 'reauth_required',
    })
  }

  try {
    const stats = await dependencies.discord.fetchUserStats({
      accessToken,
      guildId: config.discord.guildId,
    })
    const nextLink = await dependencies.store.upsertIdentityLink(link.walletAddress, 'discord', {
      discordLastKnownIsInTargetServer: stats.isInTargetServer,
      displayName: stats.displayName ?? null,
      providerUserId: stats.userId,
      username: stats.username ?? null,
    })

    return buildConnectedIdentity('discord', nextLink, {
      displayName: stats.displayName ?? null,
      stats: {
        isInTargetServer: stats.isInTargetServer,
      },
      userId: stats.userId,
      username: stats.username ?? null,
    })
  } catch (error) {
    if (!(error instanceof DiscordApiError) || (error.status !== 400 && error.status !== 401)) {
      return buildConnectedIdentity('discord', link, {
        error: getErrorMessage(error),
        stats: { isInTargetServer: lastKnownMembership },
        status: 'error',
      })
    }
  }

  let refreshToken

  try {
    refreshToken = decryptSecret(
      link.encryptedRefreshToken,
      config.providerTokenEncryptionSecret,
    )
  } catch (error) {
    return buildConnectedIdentity('discord', link, {
      error: getErrorMessage(error),
      stats: { isInTargetServer: lastKnownMembership },
      status: 'reauth_required',
    })
  }

  try {
    const tokenResponse = await dependencies.discord.refreshAccessToken({
      clientId: config.discord.clientId,
      clientSecret: config.discord.clientSecret,
      refreshToken,
    })
    const stats = await dependencies.discord.fetchUserStats({
      accessToken: tokenResponse.accessToken,
      guildId: config.discord.guildId,
    })
    const nextLink = await persistDiscordLink(
      config,
      dependencies,
      link.walletAddress,
      tokenResponse,
      stats,
    )

    return buildConnectedIdentity('discord', nextLink, {
      displayName: stats.displayName ?? null,
      stats: {
        isInTargetServer: stats.isInTargetServer,
      },
      userId: stats.userId,
      username: stats.username ?? null,
    })
  } catch (error) {
    return buildConnectedIdentity('discord', link, {
      error: getErrorMessage(error),
      stats: { isInTargetServer: lastKnownMembership },
      status:
        error instanceof DiscordApiError && (error.status === 400 || error.status === 401)
          ? 'reauth_required'
          : 'error',
    })
  }
}

async function resolveGitHubIdentity(config, dependencies, link) {
  if (!link) {
    return buildDefaultIdentity('github', config.github)
  }

  let accessToken

  try {
    accessToken = decryptSecret(
      link.encryptedAccessToken,
      config.providerTokenEncryptionSecret,
    )
  } catch (error) {
    return buildConnectedIdentity(
      'github',
      link,
      {
        error: getErrorMessage(error),
        stats: buildDefaultGitHubStats(config.github),
        status: 'reauth_required',
      },
      config.github,
    )
  }

  try {
    const stats = await dependencies.github.fetchUserStats({
      accessToken,
      targetOrganization: config.github.targetOrganization,
      targetRepositories: config.github.targetRepositories,
    })
    const nextLink = await dependencies.store.upsertIdentityLink(link.walletAddress, 'github', {
      displayName: stats.displayName ?? null,
      providerUserId: stats.userId,
      username: stats.username ?? null,
    })

    return buildConnectedIdentity(
      'github',
      nextLink,
      {
        displayName: stats.displayName ?? null,
        stats: {
          isFollowingTargetOrganization: stats.isFollowingTargetOrganization,
          isOlderThanOneYear: stats.isOlderThanOneYear,
          publicNonForkRepositoryCount: stats.publicNonForkRepositoryCount,
          targetOrganization: stats.targetOrganization,
          targetRepositories: normalizeGitHubTargetRepositories(
            stats.targetRepositories,
            config.github,
          ),
        },
        userId: stats.userId,
        username: stats.username ?? null,
      },
      config.github,
    )
  } catch (error) {
    return buildConnectedIdentity(
      'github',
      link,
      {
        error: getErrorMessage(error),
        stats: buildDefaultGitHubStats(config.github),
        status: error instanceof GitHubApiError && error.status === 401 ? 'reauth_required' : 'error',
      },
      config.github,
    )
  }
}

async function resolveTelegramIdentity(config, dependencies, link) {
  if (!link) {
    return buildDefaultIdentity('telegram')
  }

  try {
    const membership = await dependencies.telegram.fetchChannelMembership({
      botToken: config.telegram.botToken,
      channelUsername: config.telegram.channelUsername,
      telegramUserId: link.providerUserId,
    })

    return buildConnectedIdentity('telegram', link, {
      stats: {
        isInTargetChannel: membership.isInTargetChannel,
      },
    })
  } catch (error) {
    return buildConnectedIdentity('telegram', link, {
      error: getErrorMessage(error),
      stats: {
        isInTargetChannel: null,
      },
      status: 'error',
    })
  }
}

function resolveTwitterIdentity(link) {
  if (!link) {
    return buildDefaultIdentity('twitter')
  }

  return buildConnectedIdentity('twitter', link, {
    stats: {},
  })
}

async function resolveOnchainProfile(dependencies, walletAddress) {
  try {
    const stats = await dependencies.onchain.fetchUserStats(walletAddress)

    return {
      error: null,
      numberOfProcesses: stats.createdProcessesCount,
      totalVotes: stats.totalVotes,
    }
  } catch (error) {
    return {
      ...buildDefaultOnchain(),
      error: getErrorMessage(error),
    }
  }
}

async function resolveProfileIdentities(config, dependencies, walletAddress, links) {
  const linkMap = new Map(links.map((link) => [link.provider, link]))
  const [discord, github, telegram, twitter] = await Promise.all([
    resolveDiscordIdentity(config, dependencies, linkMap.get('discord') ?? null),
    resolveGitHubIdentity(config, dependencies, linkMap.get('github') ?? null),
    resolveTelegramIdentity(config, dependencies, linkMap.get('telegram') ?? null),
    Promise.resolve(resolveTwitterIdentity(linkMap.get('twitter') ?? null)),
  ])

  return {
    discord,
    github,
    telegram,
    twitter,
  }
}

async function resolveEnsProfile(dependencies, walletAddress) {
  if (!dependencies.ens || typeof dependencies.ens.resolveEnsName !== 'function') {
    return null
  }

  return dependencies.ens.resolveEnsName(walletAddress)
}

async function synchronizeWalletProfileSnapshot(
  config,
  dependencies,
  questCatalog,
  walletAddress,
  options = {},
) {
  const now = dependencies.now()
  const walletProfile =
    options.walletProfile ?? (await dependencies.store.getWalletProfile(walletAddress))
  const links = options.links ?? (await dependencies.store.listIdentityLinks(walletAddress))
  const identities = await resolveProfileIdentities(
    config,
    dependencies,
    walletAddress,
    links,
  )
  const shouldRefreshOnchain = options.force || isSnapshotStale(walletProfile?.onchainSnapshot?.lastSyncedAt, now)
  const shouldRefreshEns = options.force || isSnapshotStale(walletProfile?.ensResolvedAt, now)
  const onchain = shouldRefreshOnchain
    ? await resolveOnchainProfile(dependencies, walletAddress)
    : normalizeStoredOnchainSnapshot(walletProfile?.onchainSnapshot)
  const ensName = shouldRefreshEns
    ? await resolveEnsProfile(dependencies, walletAddress)
    : typeof walletProfile?.ensName === 'string'
      ? walletProfile.ensName
      : null
  const score = buildScoreSnapshot(
    questCatalog,
    {
      identities,
      onchain,
    },
    now,
  )
  const normalizedStoredScore = normalizeStoredScoreSnapshot(walletProfile?.scoreSnapshot)
  const shouldRefreshScore =
    options.force ||
    isSnapshotStale(walletProfile?.scoreSnapshot?.lastComputedAt, now) ||
    !areScoreSnapshotsEqual(
      {
        ...normalizedStoredScore,
        lastComputedAt: null,
      },
      {
        ...score,
        lastComputedAt: null,
      },
    )

  let nextProfile = walletProfile

  if (!walletProfile || shouldRefreshOnchain || shouldRefreshEns || shouldRefreshScore) {
    nextProfile = await dependencies.store.upsertWalletProfile(walletAddress, {
      ensName,
      ensResolvedAt: shouldRefreshEns ? new Date(now) : walletProfile?.ensResolvedAt ?? null,
      onchainSnapshot: shouldRefreshOnchain
        ? {
            ...onchain,
            lastSyncedAt: new Date(now),
          }
        : walletProfile?.onchainSnapshot ?? {
            ...onchain,
            lastSyncedAt: new Date(now),
          },
      scoreSnapshot: shouldRefreshScore
        ? score
        : walletProfile?.scoreSnapshot ?? score,
    })
  }

  return {
    identities,
    onchain,
    score,
    walletProfile: nextProfile ?? {
      ensName,
      scoreSnapshot: score,
      walletAddress,
    },
  }
}

async function refreshWalletProfileSnapshot(
  config,
  dependencies,
  questCatalog,
  walletAddress,
  options = {},
) {
  try {
    await synchronizeWalletProfileSnapshot(
      config,
      dependencies,
      questCatalog,
      walletAddress,
      {
        ...options,
        force: true,
      },
    )
  } catch (error) {
    console.warn(`Profile snapshot refresh failed for ${walletAddress}`, error)
  }
}

export function createApiDependencies({
  ens = null,
  fetchImpl = fetch,
  now = () => Date.now(),
  onchain = null,
  store,
  verifyMessageImpl = verifyMessage,
} = {}) {
  if (!store || !onchain) {
    throw new Error('API store and onchain dependencies are required.')
  }

  return {
    discord: {
      exchangeAuthorizationCode: (parameters) =>
        exchangeDiscordAuthorizationCode(parameters, fetchImpl),
      fetchUserStats: (parameters) => fetchDiscordUserStats(parameters, fetchImpl),
      refreshAccessToken: (parameters) =>
        refreshDiscordAccessToken(parameters, fetchImpl),
    },
    github: {
      exchangeAuthorizationCode: (parameters) =>
        exchangeGitHubAuthorizationCode(parameters, fetchImpl),
      fetchUserStats: (parameters) =>
        fetchGitHubUserStats(parameters, fetchImpl, now()),
    },
    ens: ens ?? {
      resolveEnsName: async () => null,
    },
    now,
    onchain,
    store,
    telegram: {
      exchangeAuthorizationCode: (parameters) =>
        exchangeTelegramAuthorizationCode(parameters, fetchImpl),
      fetchChannelMembership: (parameters) =>
        fetchTelegramChannelMembership(parameters, fetchImpl),
      getOidcConfiguration: () => fetchTelegramOidcConfiguration(fetchImpl),
      verifyIdToken: (parameters) => verifyTelegramIdToken(parameters, fetchImpl),
    },
    twitter: {
      fetchProofTweet: (parameters) => fetchTwitterProofTweet(parameters, fetchImpl),
    },
    verifyMessage: verifyMessageImpl,
  }
}

async function handleWalletChallenge(config, dependencies, request, response) {
  const body = await readRequestJson(response, request)

  if (body === null) {
    return
  }

  let address

  try {
    address = normalizeWalletAddress(body?.address)
  } catch (error) {
    json(response, 400, { message: getErrorMessage(error) })
    return
  }

  const now = dependencies.now()
  const nonce = createRandomToken()
  const message = buildWalletSignInMessage(address, config.frontendOrigin, nonce, now)
  const challengeToken = createWalletChallengeToken(
    {
      address,
      expiresAt: now + 5 * 60 * 1000,
      issuedAt: now,
      nonce,
      origin: config.frontendOrigin,
    },
    config.appSessionSecret,
  )

  setCookie(
    response,
    WALLET_CHALLENGE_COOKIE_NAME,
    challengeToken,
    {
      ...getCookieSettings(config),
      maxAge: 5 * 60,
    },
  )

  json(response, 200, { message })
}

async function handleWalletVerify(config, dependencies, questCatalog, request, response) {
  const body = await readRequestJson(response, request)

  if (body === null) {
    return
  }

  let address

  try {
    address = normalizeWalletAddress(body?.address)
  } catch (error) {
    json(response, 400, { message: getErrorMessage(error) })
    return
  }

  if (typeof body?.signature !== 'string' || body.signature.trim().length === 0) {
    json(response, 400, { message: 'Wallet signature is required.' })
    return
  }

  const cookies = parseCookies(request)
  const challengeToken = cookies[WALLET_CHALLENGE_COOKIE_NAME]

  if (!challengeToken) {
    buildUnauthorizedResponse(response)
    return
  }

  let challenge

  try {
    challenge = verifyWalletChallengeToken(
      challengeToken,
      config.appSessionSecret,
      dependencies.now(),
    )
  } catch {
    clearCookie(response, WALLET_CHALLENGE_COOKIE_NAME, getCookieSettings(config))
    buildUnauthorizedResponse(response)
    return
  }

  if (challenge.address !== address) {
    clearCookie(response, WALLET_CHALLENGE_COOKIE_NAME, getCookieSettings(config))
    buildUnauthorizedResponse(response)
    return
  }

  const issuedAtMs = challenge.iat * 1000
  const message = buildWalletSignInMessage(
    challenge.address,
    challenge.origin,
    challenge.nonce,
    issuedAtMs,
  )

  let isValidSignature = false

  try {
    isValidSignature = await dependencies.verifyMessage({
      address,
      message,
      signature: body.signature,
    })
  } catch {
    isValidSignature = false
  }

  if (!isValidSignature) {
    clearCookie(response, WALLET_CHALLENGE_COOKIE_NAME, getCookieSettings(config))
    buildUnauthorizedResponse(response)
    return
  }

  const now = dependencies.now()
  const sessionToken = createAppSessionToken(
    { walletAddress: address },
    config.appSessionSecret,
    config.sessionTtlSeconds,
    now,
  )

  clearCookie(response, WALLET_CHALLENGE_COOKIE_NAME, getCookieSettings(config))
  setCookie(
    response,
    APP_SESSION_COOKIE_NAME,
    sessionToken,
    {
      ...getCookieSettings(config),
      maxAge: config.sessionTtlSeconds,
    },
  )

  await dependencies.store.upsertWalletProfile(address, {
    lastAuthenticatedAt: new Date(now),
  })
  await refreshWalletProfileSnapshot(
    config,
    dependencies,
    questCatalog,
    address,
  )

  json(response, 200, {
    wallet: {
      address,
    },
  })
}

async function handleLogout(config, response) {
  clearCookie(response, WALLET_CHALLENGE_COOKIE_NAME, getCookieSettings(config))
  clearCookie(response, APP_SESSION_COOKIE_NAME, getCookieSettings(config))
  noContent(response)
}

async function handleGetMe(config, dependencies, questCatalog, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const now = dependencies.now()

  await dependencies.store.upsertWalletProfile(session.walletAddress, {
    lastSeenAt: new Date(now),
  })

  const snapshot = await synchronizeWalletProfileSnapshot(
    config,
    dependencies,
    questCatalog,
    session.walletAddress,
  )

  json(
    response,
    200,
    buildProfileResponse(
      session.walletAddress,
      snapshot.walletProfile,
      snapshot.identities,
      snapshot.onchain,
      snapshot.score,
    ),
  )
}

function handleGetQuests(questCatalog, response) {
  json(response, 200, questCatalog)
}

async function handleGetLeaderboard(config, dependencies, questCatalog, requestUrl, response) {
  const limit = parseLeaderboardLimit(requestUrl)
  const now = dependencies.now()
  const profiles = await dependencies.store.listLeaderboardWalletProfiles(limit)

  await Promise.all(
    profiles.map((profile) => {
      const isStale =
        isSnapshotStale(profile.ensResolvedAt, now) ||
        isSnapshotStale(profile?.onchainSnapshot?.lastSyncedAt, now) ||
        isSnapshotStale(profile?.scoreSnapshot?.lastComputedAt, now)

      if (!isStale) {
        return Promise.resolve()
      }

      return synchronizeWalletProfileSnapshot(
        config,
        dependencies,
        questCatalog,
        profile.walletAddress,
        {
          links: null,
          walletProfile: profile,
        },
      )
    }),
  )

  const nextProfiles = await dependencies.store.listLeaderboardWalletProfiles(limit)

  json(response, 200, {
    rows: nextProfiles.map((profile, index) => buildLeaderboardRow(profile, index + 1)),
  })
}

async function handleTwitterCode(config, dependencies, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const now = dependencies.now()
  const expiresAt = now + TWITTER_CODE_TTL_MS
  const code = createRandomToken(9)

  await dependencies.store.upsertWalletProfile(session.walletAddress, {
    twitterPendingCode: code,
    twitterPendingCodeExpiresAt: new Date(expiresAt),
    twitterPendingCodeIssuedAt: new Date(now),
  })

  json(response, 200, {
    code,
    expiresAt: new Date(expiresAt).toISOString(),
  })
}

async function handleTwitterVerify(config, dependencies, questCatalog, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const body = await readRequestJson(response, request)

  if (body === null) {
    return
  }

  if (typeof body?.tweetUrl !== 'string' || body.tweetUrl.trim().length === 0) {
    json(response, 400, { message: 'Tweet URL is required.' })
    return
  }

  const walletProfile = await dependencies.store.getWalletProfile(session.walletAddress)
  const pendingCode =
    walletProfile && typeof walletProfile.twitterPendingCode === 'string'
      ? walletProfile.twitterPendingCode
      : null
  const pendingCodeExpiresAt = normalizeTimestamp(walletProfile?.twitterPendingCodeExpiresAt)

  if (!pendingCode || pendingCodeExpiresAt === null) {
    json(response, 400, { message: 'No active Twitter proof code was found.' })
    return
  }

  if (pendingCodeExpiresAt <= dependencies.now()) {
    await clearPendingTwitterCode(dependencies, session.walletAddress)
    json(response, 400, { message: 'Twitter proof code has expired.' })
    return
  }

  let proofTweet

  try {
    proofTweet = await dependencies.twitter.fetchProofTweet({
      tweetUrl: body.tweetUrl,
    })
  } catch (error) {
    if (error instanceof TwitterApiError) {
      json(response, error.status, { message: getErrorMessage(error) })
      return
    }

    json(response, 400, { message: getErrorMessage(error) })
    return
  }

  if (!containsTwitterProofCode(proofTweet.text, pendingCode)) {
    json(response, 400, { message: 'Tweet does not contain the current Twitter proof code.' })
    return
  }

  try {
    await persistTwitterLink(dependencies, session.walletAddress, proofTweet)
  } catch (error) {
    if (error instanceof RequestError) {
      json(response, error.status, { message: getErrorMessage(error) })
      return
    }

    throw error
  }

  await clearPendingTwitterCode(dependencies, session.walletAddress)
  await refreshWalletProfileSnapshot(
    config,
    dependencies,
    questCatalog,
    session.walletAddress,
  )
  noContent(response)
}

async function handleDeleteConnection(config, dependencies, questCatalog, requestUrl, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const provider = requestUrl.pathname.split('/').at(-1)

  if (
    provider !== 'discord' &&
    provider !== 'github' &&
    provider !== 'telegram' &&
    provider !== 'twitter'
  ) {
    json(response, 404, { message: 'Not found' })
    return
  }

  await dependencies.store.deleteIdentityLink(session.walletAddress, provider)
  await refreshWalletProfileSnapshot(
    config,
    dependencies,
    questCatalog,
    session.walletAddress,
  )
  noContent(response)
}

async function handleDiscordStart(config, dependencies, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const state = createDiscordStateToken(
    {
      walletAddress: session.walletAddress,
    },
    config.appSessionSecret,
    dependencies.now(),
  )

  redirect(response, buildDiscordAuthorizationUrl(config.discord, state))
}

async function handleDiscordCallback(config, dependencies, questCatalog, requestUrl, request, response) {
  const stateToken = requestUrl.searchParams.get('state')
  const code = requestUrl.searchParams.get('code')
  const authError = requestUrl.searchParams.get('error_description')

  if (authError) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', authError),
    )
    return
  }

  if (!code || !stateToken) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', 'Discord login could not be completed.'),
    )
    return
  }

  let state

  try {
    state = verifyDiscordStateToken(
      stateToken,
      config.appSessionSecret,
      dependencies.now(),
    )
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', getErrorMessage(error)),
    )
    return
  }

  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session || session.walletAddress !== state.walletAddress) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', 'Wallet session expired before Discord linking completed.'),
    )
    return
  }

  try {
    const tokenResponse = await dependencies.discord.exchangeAuthorizationCode({
      clientId: config.discord.clientId,
      clientSecret: config.discord.clientSecret,
      code,
      redirectUri: config.discord.redirectUri,
    })
    const stats = await dependencies.discord.fetchUserStats({
      accessToken: tokenResponse.accessToken,
      guildId: config.discord.guildId,
    })

    if (!stats.userId || !stats.username) {
      throw new Error('Discord returned an incomplete user profile.')
    }

    await persistDiscordLink(
      config,
      dependencies,
      session.walletAddress,
      tokenResponse,
      stats,
    )
    await refreshWalletProfileSnapshot(
      config,
      dependencies,
      questCatalog,
      session.walletAddress,
    )

    redirect(response, createLinkSuccessRedirect(config, 'discord'))
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', getErrorMessage(error)),
    )
  }
}

async function handleGitHubStart(config, dependencies, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const state = createGitHubStateToken(
    {
      walletAddress: session.walletAddress,
    },
    config.appSessionSecret,
    dependencies.now(),
  )

  redirect(response, buildGitHubAuthorizationUrl(config.github, state))
}

async function handleGitHubCallback(config, dependencies, questCatalog, requestUrl, request, response) {
  const stateToken = requestUrl.searchParams.get('state')
  const code = requestUrl.searchParams.get('code')
  const authError =
    requestUrl.searchParams.get('error_description') ??
    requestUrl.searchParams.get('error')

  if (authError) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'github', authError),
    )
    return
  }

  if (!code || !stateToken) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'github', 'GitHub login could not be completed.'),
    )
    return
  }

  let state

  try {
    state = verifyGitHubStateToken(
      stateToken,
      config.appSessionSecret,
      dependencies.now(),
    )
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'github', getErrorMessage(error)),
    )
    return
  }

  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session || session.walletAddress !== state.walletAddress) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'github', 'Wallet session expired before GitHub linking completed.'),
    )
    return
  }

  try {
    const tokenResponse = await dependencies.github.exchangeAuthorizationCode({
      clientId: config.github.clientId,
      clientSecret: config.github.clientSecret,
      code,
      redirectUri: config.github.redirectUri,
    })
    const stats = await dependencies.github.fetchUserStats({
      accessToken: tokenResponse.accessToken,
      targetOrganization: config.github.targetOrganization,
      targetRepositories: config.github.targetRepositories,
    })

    await persistGitHubLink(
      config,
      dependencies,
      session.walletAddress,
      tokenResponse,
      stats,
    )
    await refreshWalletProfileSnapshot(
      config,
      dependencies,
      questCatalog,
      session.walletAddress,
    )

    redirect(response, createLinkSuccessRedirect(config, 'github'))
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'github', getErrorMessage(error)),
    )
  }
}

async function handleTelegramStart(config, dependencies, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const oidcConfiguration = await dependencies.telegram.getOidcConfiguration()
  const nonce = createRandomToken()
  const codeVerifier = createRandomToken()
  const state = createTelegramStateToken(
    {
      codeVerifier,
      nonce,
      walletAddress: session.walletAddress,
    },
    config.telegram.jwtSecret,
    dependencies.now(),
  )

  redirect(
    response,
    buildTelegramAuthorizationUrl(
      {
        authorizationEndpoint: oidcConfiguration.authorizationEndpoint,
        clientId: config.telegram.clientId,
        redirectUri: config.telegram.redirectUri,
      },
      {
        codeChallenge: createPkceChallenge(codeVerifier),
        nonce,
        state,
      },
    ),
  )
}

async function handleTelegramCallback(config, dependencies, questCatalog, requestUrl, request, response) {
  const code = requestUrl.searchParams.get('code')
  const stateToken = requestUrl.searchParams.get('state')

  if (!code || !stateToken) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'telegram', 'Telegram login could not be completed.'),
    )
    return
  }

  let state

  try {
    state = verifyTelegramStateToken(
      stateToken,
      config.telegram.jwtSecret,
      dependencies.now(),
    )
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'telegram', getErrorMessage(error)),
    )
    return
  }

  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session || session.walletAddress !== state.walletAddress) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'telegram', 'Wallet session expired before Telegram linking completed.'),
    )
    return
  }

  try {
    const oidcConfiguration = await dependencies.telegram.getOidcConfiguration()
    const tokenResponse = await dependencies.telegram.exchangeAuthorizationCode({
      clientId: config.telegram.clientId,
      clientSecret: config.telegram.clientSecret,
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: config.telegram.redirectUri,
      tokenEndpoint: oidcConfiguration.tokenEndpoint,
    })
    const telegramUser = await dependencies.telegram.verifyIdToken({
      clientId: config.telegram.clientId,
      expectedIssuer: oidcConfiguration.issuer,
      expectedNonce: state.nonce,
      idToken: tokenResponse.idToken,
      jwksUri: oidcConfiguration.jwksUri,
    })

    await persistTelegramLink(
      dependencies,
      session.walletAddress,
      telegramUser,
    )
    await refreshWalletProfileSnapshot(
      config,
      dependencies,
      questCatalog,
      session.walletAddress,
    )

    redirect(response, createLinkSuccessRedirect(config, 'telegram'))
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'telegram', getErrorMessage(error)),
    )
  }
}

function matchesApiPath(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function createApiServer(config, dependencies, { questCatalog = loadQuestCatalog() } = {}) {
  return createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    )

    if (requestUrl.pathname === '/health') {
      json(response, 200, { status: 'ok' })
      return
    }

    if (matchesApiPath(requestUrl.pathname, '/api')) {
      setCorsHeaders(response, config)
    }

    if (request.method === 'OPTIONS' && matchesApiPath(requestUrl.pathname, '/api')) {
      noContent(response)
      return
    }

    const handleRequest = async () => {
      if (request.method === 'POST' && requestUrl.pathname === '/api/auth/wallet/challenge') {
        await handleWalletChallenge(config, dependencies, request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/auth/wallet/verify') {
        await handleWalletVerify(config, dependencies, questCatalog, request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
        await handleLogout(config, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/me') {
        await handleGetMe(config, dependencies, questCatalog, request, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/leaderboard') {
        await handleGetLeaderboard(config, dependencies, questCatalog, requestUrl, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/quests') {
        handleGetQuests(questCatalog, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/connections/discord/start') {
        await handleDiscordStart(config, dependencies, request, response)
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/connections/discord/callback'
      ) {
        await handleDiscordCallback(
          config,
          dependencies,
          questCatalog,
          requestUrl,
          request,
          response,
        )
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/connections/github/start') {
        await handleGitHubStart(config, dependencies, request, response)
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/connections/github/callback'
      ) {
        await handleGitHubCallback(
          config,
          dependencies,
          questCatalog,
          requestUrl,
          request,
          response,
        )
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/connections/telegram/start') {
        await handleTelegramStart(config, dependencies, request, response)
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/connections/telegram/callback'
      ) {
        await handleTelegramCallback(
          config,
          dependencies,
          questCatalog,
          requestUrl,
          request,
          response,
        )
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/connections/twitter/code') {
        await handleTwitterCode(config, dependencies, request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/connections/twitter/verify') {
        await handleTwitterVerify(config, dependencies, questCatalog, request, response)
        return
      }

      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/api/connections/')) {
        await handleDeleteConnection(
          config,
          dependencies,
          questCatalog,
          requestUrl,
          request,
          response,
        )
        return
      }

      json(response, 404, { message: 'Not found' })
    }

    void handleRequest().catch((error) => {
      if (error instanceof RequestError) {
        json(response, error.status, { message: getErrorMessage(error) })
        return
      }

      json(response, 500, { message: getErrorMessage(error) })
    })
  })
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url

if (isDirectRun) {
  const serverRoot = fileURLToPath(new URL('..', import.meta.url))

  loadDotEnvFiles(serverRoot, [
    '.env',
    '.env.local',
  ])

  const config = parseServerConfig(process.env)
  const questCatalog = loadQuestCatalog(config.questCatalogPath)
  const store = await createMongoIdentityStore(config)
  const server = createApiServer(
    config,
    createApiDependencies({
      ens: createEnsDependencies(config),
      onchain: createOnchainStatsDependencies(config),
      store,
    }),
    {
      questCatalog,
    },
  )

  server.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`)
  })
}
