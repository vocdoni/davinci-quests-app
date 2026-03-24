import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
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
import { createOnchainStatsDependencies, emptyOnchainStats } from './processRegistry.mjs'
import {
  buildWalletSignInMessage,
  createAppSessionToken,
  createDiscordStateToken,
  createRandomToken,
  createWalletChallengeToken,
  decryptSecret,
  encryptSecret,
  verifyAppSessionToken,
  verifyDiscordStateToken,
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

const APP_SESSION_COOKIE_NAME = 'quests_dashboard_app_session'
const WALLET_CHALLENGE_COOKIE_NAME = 'quests_dashboard_wallet_challenge'
const PROVIDER_CACHE_TTL_MS = 12 * 60 * 60 * 1000

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

function buildDefaultIdentity(provider) {
  return {
    checkedAt: null,
    connected: false,
    displayName: null,
    error: null,
    expiresAt: null,
    stats:
      provider === 'discord'
        ? { isInTargetServer: null }
        : { isInTargetChannel: null },
    status: 'disconnected',
    userId: null,
    username: null,
  }
}

function buildDefaultOnchain() {
  return {
    checkedAt: null,
    error: null,
    expiresAt: null,
    numberOfProcesses: 0,
    totalVotes: '0',
  }
}

function normalizeLinkTimestamp(value) {
  if (!value) {
    return null
  }

  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()

  return Number.isFinite(timestamp) ? timestamp : null
}

function shouldRefreshOnchain(profile, now) {
  const expiresAt = normalizeLinkTimestamp(profile?.onchainExpiresAt)
  return expiresAt === null || expiresAt <= now
}

function shouldRefreshLink(link, now) {
  if (link.provider === 'discord' && link.status === 'reauth_required') {
    return false
  }

  const expiresAt = normalizeLinkTimestamp(link.expiresAt)
  return expiresAt === null || expiresAt <= now
}

function serializeIdentityLink(provider, link) {
  if (!link) {
    return buildDefaultIdentity(provider)
  }

  const stats =
    provider === 'discord'
      ? {
          isInTargetServer:
            link.stats &&
            typeof link.stats === 'object' &&
            'isInTargetServer' in link.stats &&
            typeof link.stats.isInTargetServer === 'boolean'
              ? link.stats.isInTargetServer
              : null,
        }
      : {
          isInTargetChannel:
            link.stats &&
            typeof link.stats === 'object' &&
            'isInTargetChannel' in link.stats &&
            typeof link.stats.isInTargetChannel === 'boolean'
              ? link.stats.isInTargetChannel
              : null,
        }

  return {
    checkedAt: link.checkedAt ?? null,
    connected: true,
    displayName: link.displayName ?? null,
    error: link.lastError ?? null,
    expiresAt: link.expiresAt ?? null,
    stats,
    status: link.status ?? 'active',
    userId: link.providerUserId ?? null,
    username: link.username ?? null,
  }
}

function serializeOnchainProfile(walletProfile) {
  if (!walletProfile) {
    return buildDefaultOnchain()
  }

  return {
    checkedAt: walletProfile.onchainCheckedAt ?? null,
    error: walletProfile.onchainLastError ?? null,
    expiresAt: walletProfile.onchainExpiresAt ?? null,
    numberOfProcesses:
      typeof walletProfile.onchainCreatedProcessesCount === 'number'
        ? walletProfile.onchainCreatedProcessesCount
        : emptyOnchainStats.createdProcessesCount,
    totalVotes:
      typeof walletProfile.onchainTotalVotes === 'string'
        ? walletProfile.onchainTotalVotes
        : emptyOnchainStats.totalVotes,
  }
}

function buildProfileResponse(walletAddress, walletProfile, links) {
  const linkMap = new Map(links.map((link) => [link.provider, link]))

  return {
    identities: {
      discord: serializeIdentityLink('discord', linkMap.get('discord') ?? null),
      telegram: serializeIdentityLink('telegram', linkMap.get('telegram') ?? null),
    },
    onchain: serializeOnchainProfile(walletProfile),
    wallet: {
      address: walletAddress,
    },
  }
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

  const now = dependencies.now()

  return dependencies.store.upsertIdentityLink(walletAddress, 'discord', {
    accessTokenExpiresAt: new Date(now + tokenResponse.expiresInSeconds * 1000),
    checkedAt: new Date(now),
    displayName: stats.displayName ?? null,
    encryptedAccessToken: encryptSecret(
      tokenResponse.accessToken,
      config.providerTokenEncryptionSecret,
    ),
    encryptedRefreshToken: encryptSecret(
      tokenResponse.refreshToken,
      config.providerTokenEncryptionSecret,
    ),
    expiresAt: new Date(now + PROVIDER_CACHE_TTL_MS),
    lastError: null,
    providerUserId: stats.userId,
    scope: tokenResponse.scope,
    stats: {
      isInTargetServer: stats.isInTargetServer,
    },
    status: 'active',
    tokenType: tokenResponse.tokenType,
    username: stats.username ?? null,
  })
}

async function persistTelegramLink(
  config,
  dependencies,
  walletAddress,
  telegramUser,
  membershipResult,
) {
  const existingLink = await dependencies.store.findIdentityLinkByProviderUserId(
    'telegram',
    telegramUser.telegramId,
  )

  if (existingLink && existingLink.walletAddress !== walletAddress) {
    throw new Error('Telegram account is already linked to another wallet.')
  }

  const now = dependencies.now()

  return dependencies.store.upsertIdentityLink(walletAddress, 'telegram', {
    checkedAt: new Date(now),
    displayName: telegramUser.displayName ?? null,
    expiresAt: new Date(now + PROVIDER_CACHE_TTL_MS),
    lastError: membershipResult.error,
    providerUserId: telegramUser.telegramId,
    stats: {
      isInTargetChannel: membershipResult.isInTargetChannel,
    },
    status: 'active',
    telegramSubject: telegramUser.subject,
    username: telegramUser.username ?? null,
  })
}

async function refreshDiscordLink(config, dependencies, link) {
  const now = dependencies.now()
  let refreshToken

  try {
    refreshToken = decryptSecret(
      link.encryptedRefreshToken,
      config.providerTokenEncryptionSecret,
    )
  } catch (error) {
    return dependencies.store.upsertIdentityLink(link.walletAddress, 'discord', {
      checkedAt: new Date(now),
      expiresAt: null,
      lastError: getErrorMessage(error),
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

    return persistDiscordLink(config, dependencies, link.walletAddress, tokenResponse, stats)
  } catch (error) {
    if (error instanceof DiscordApiError && (error.status === 400 || error.status === 401)) {
      return dependencies.store.upsertIdentityLink(link.walletAddress, 'discord', {
        checkedAt: new Date(now),
        expiresAt: null,
        lastError: getErrorMessage(error),
        status: 'reauth_required',
      })
    }

    return dependencies.store.upsertIdentityLink(link.walletAddress, 'discord', {
      checkedAt: new Date(now),
      expiresAt: new Date(now + PROVIDER_CACHE_TTL_MS),
      lastError: getErrorMessage(error),
    })
  }
}

async function refreshTelegramLink(config, dependencies, link) {
  const now = dependencies.now()

  try {
    const membership = await dependencies.telegram.fetchChannelMembership({
      botToken: config.telegram.botToken,
      channelUsername: config.telegram.channelUsername,
      telegramUserId: link.providerUserId,
    })

    return dependencies.store.upsertIdentityLink(link.walletAddress, 'telegram', {
      checkedAt: new Date(now),
      expiresAt: new Date(now + PROVIDER_CACHE_TTL_MS),
      lastError: null,
      stats: {
        isInTargetChannel: membership.isInTargetChannel,
      },
      status: 'active',
    })
  } catch (error) {
    return dependencies.store.upsertIdentityLink(link.walletAddress, 'telegram', {
      checkedAt: new Date(now),
      expiresAt: new Date(now + PROVIDER_CACHE_TTL_MS),
      lastError: getErrorMessage(error),
      stats:
        link.stats && typeof link.stats === 'object'
          ? link.stats
          : { isInTargetChannel: null },
      status: 'active',
    })
  }
}

async function refreshIdentityLink(config, dependencies, link) {
  if (link.provider === 'discord') {
    return refreshDiscordLink(config, dependencies, link)
  }

  if (link.provider === 'telegram') {
    return refreshTelegramLink(config, dependencies, link)
  }

  return link
}

async function refreshOnchainStats(config, dependencies, walletAddress, existingProfile) {
  const now = dependencies.now()

  try {
    const stats = await dependencies.onchain.fetchUserStats(walletAddress)

    return dependencies.store.upsertWalletProfile(walletAddress, {
      onchainCheckedAt: new Date(now),
      onchainCreatedProcessesCount: stats.createdProcessesCount,
      onchainExpiresAt: new Date(now + config.onchain.statsTtlSeconds * 1000),
      onchainLastError: null,
      onchainTotalVotes: stats.totalVotes,
    })
  } catch (error) {
    return dependencies.store.upsertWalletProfile(walletAddress, {
      onchainCheckedAt: new Date(now),
      onchainCreatedProcessesCount:
        typeof existingProfile?.onchainCreatedProcessesCount === 'number'
          ? existingProfile.onchainCreatedProcessesCount
          : emptyOnchainStats.createdProcessesCount,
      onchainExpiresAt: new Date(now + config.onchain.statsTtlSeconds * 1000),
      onchainLastError: getErrorMessage(error),
      onchainTotalVotes:
        typeof existingProfile?.onchainTotalVotes === 'string'
          ? existingProfile.onchainTotalVotes
          : emptyOnchainStats.totalVotes,
    })
  }
}

export function createApiDependencies({
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

async function handleWalletVerify(config, dependencies, request, response) {
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

async function handleGetMe(config, dependencies, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const now = dependencies.now()

  const currentWalletProfile = await dependencies.store.upsertWalletProfile(session.walletAddress, {
    lastSeenAt: new Date(now),
  })

  const links = await dependencies.store.listIdentityLinks(session.walletAddress)
  const staleLinks = links.filter((link) => shouldRefreshLink(link, now))

  if (staleLinks.length > 0) {
    await Promise.all(
      staleLinks.map((link) => refreshIdentityLink(config, dependencies, link)),
    )
  }

  if (shouldRefreshOnchain(currentWalletProfile, now)) {
    await refreshOnchainStats(
      config,
      dependencies,
      session.walletAddress,
      currentWalletProfile,
    )
  }

  const nextWalletProfile = await dependencies.store.getWalletProfile(session.walletAddress)
  const nextLinks = await dependencies.store.listIdentityLinks(session.walletAddress)

  json(
    response,
    200,
    buildProfileResponse(session.walletAddress, nextWalletProfile, nextLinks),
  )
}

async function handleDeleteConnection(config, dependencies, requestUrl, request, response) {
  const session = getAuthenticatedSession(request, config, dependencies)

  if (!session) {
    buildUnauthorizedResponse(response)
    return
  }

  const provider = requestUrl.pathname.split('/').at(-1)

  if (provider !== 'discord' && provider !== 'telegram') {
    json(response, 404, { message: 'Not found' })
    return
  }

  await dependencies.store.deleteIdentityLink(session.walletAddress, provider)
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

async function handleDiscordCallback(config, dependencies, requestUrl, request, response) {
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

    redirect(response, createLinkSuccessRedirect(config, 'discord'))
  } catch (error) {
    redirect(
      response,
      createLinkErrorRedirect(config, 'discord', getErrorMessage(error)),
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

async function handleTelegramCallback(config, dependencies, requestUrl, request, response) {
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

    let membershipResult

    try {
      const membership = await dependencies.telegram.fetchChannelMembership({
        botToken: config.telegram.botToken,
        channelUsername: config.telegram.channelUsername,
        telegramUserId: telegramUser.telegramId,
      })

      membershipResult = {
        error: null,
        isInTargetChannel: membership.isInTargetChannel,
      }
    } catch (error) {
      membershipResult = {
        error: getErrorMessage(error),
        isInTargetChannel: null,
      }
    }

    await persistTelegramLink(
      config,
      dependencies,
      session.walletAddress,
      telegramUser,
      membershipResult,
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

export function createApiServer(config, dependencies) {
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
        await handleWalletVerify(config, dependencies, request, response)
        return
      }

      if (request.method === 'POST' && requestUrl.pathname === '/api/auth/logout') {
        await handleLogout(config, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/me') {
        await handleGetMe(config, dependencies, request, response)
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
        await handleDiscordCallback(config, dependencies, requestUrl, request, response)
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
        await handleTelegramCallback(config, dependencies, requestUrl, request, response)
        return
      }

      if (request.method === 'DELETE' && requestUrl.pathname.startsWith('/api/connections/')) {
        await handleDeleteConnection(config, dependencies, requestUrl, request, response)
        return
      }

      json(response, 404, { message: 'Not found' })
    }

    void handleRequest().catch((error) => {
      json(response, 500, { message: getErrorMessage(error) })
    })
  })
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url

if (isDirectRun) {
  loadDotEnvFiles(process.cwd(), [
    '.env.server',
    '.env.server.local',
    '.env',
    '.env.local',
  ])

  const config = parseServerConfig(process.env)
  const store = await createMongoIdentityStore(config)
  const server = createApiServer(
    config,
    createApiDependencies({
      onchain: createOnchainStatsDependencies(config),
      store,
    }),
  )

  server.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}`)
  })
}
