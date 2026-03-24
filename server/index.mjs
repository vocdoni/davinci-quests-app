import { createServer } from 'node:http'
import { pathToFileURL } from 'node:url'
import { loadDotEnvFiles } from './dotenv.mjs'
import {
  buildTelegramAuthorizationUrl,
  buildTelegramFrontendRedirect,
  createPkceChallenge,
  createRandomToken,
  createTelegramAppToken,
  createTelegramStateToken,
  exchangeTelegramAuthorizationCode,
  fetchTelegramChannelMembership,
  fetchTelegramOidcConfiguration,
  normalizeChannelUsername,
  verifyTelegramAppToken,
  verifyTelegramIdToken,
  verifyTelegramStateToken,
} from './telegram.mjs'

function requireString(env, key) {
  const value = env[key]

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value.trim()
}

function readOptionalString(env, key) {
  const value = env[key]

  if (!value || value.trim().length === 0) {
    return null
  }

  return value.trim()
}

function parseUrl(name, rawValue) {
  try {
    return new URL(rawValue).toString()
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }
}

function parseInteger(name, rawValue, minimum) {
  const value = Number(rawValue)

  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`)
  }

  return value
}

function parseTelegramClientId(rawValue) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error('TELEGRAM_CLIENT_ID must be a numeric Telegram application identifier.')
  }

  return rawValue
}

function resolveFrontendAppUrl(env) {
  const explicitFrontendAppUrl = readOptionalString(env, 'FRONTEND_APP_URL')

  if (explicitFrontendAppUrl) {
    return parseUrl('FRONTEND_APP_URL', explicitFrontendAppUrl)
  }

  const discordRedirectUri = readOptionalString(env, 'VITE_DISCORD_REDIRECT_URI')

  if (discordRedirectUri) {
    const redirectUrl = new URL(parseUrl('VITE_DISCORD_REDIRECT_URI', discordRedirectUri))

    return new URL('/', redirectUrl).toString()
  }

  return 'http://localhost:5173/'
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown Telegram API error.'
}

function json(response, statusCode, body) {
  response.statusCode = statusCode
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function redirect(response, location) {
  response.statusCode = 302
  response.setHeader('location', location)
  response.end()
}

function setCorsHeaders(response, config) {
  response.setHeader('access-control-allow-headers', 'Authorization, Content-Type')
  response.setHeader('access-control-allow-methods', 'GET, OPTIONS')
  response.setHeader('access-control-allow-origin', config.frontendOrigin)
  response.setHeader('vary', 'Origin')
}

function readBearerToken(request) {
  const authorizationHeader = request.headers.authorization

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authorizationHeader.slice('Bearer '.length).trim()
  return token.length > 0 ? token : null
}

export function parseTelegramApiConfig(env = process.env) {
  const missingKeys = [
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHANNEL_USERNAME',
    'TELEGRAM_CLIENT_ID',
    'TELEGRAM_CLIENT_SECRET',
    'TELEGRAM_APP_JWT_SECRET',
    'TELEGRAM_REDIRECT_URI',
  ].filter((key) => !readOptionalString(env, key))

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}`,
    )
  }

  const frontendAppUrl = resolveFrontendAppUrl(env)

  return {
    botToken: requireString(env, 'TELEGRAM_BOT_TOKEN'),
    channelUsername: normalizeChannelUsername(
      requireString(env, 'TELEGRAM_CHANNEL_USERNAME'),
    ),
    clientId: parseTelegramClientId(requireString(env, 'TELEGRAM_CLIENT_ID')),
    clientSecret: requireString(env, 'TELEGRAM_CLIENT_SECRET'),
    frontendAppUrl,
    frontendOrigin: new URL(frontendAppUrl).origin,
    jwtSecret: requireString(env, 'TELEGRAM_APP_JWT_SECRET'),
    port: env.PORT ? parseInteger('PORT', env.PORT, 1) : 3001,
    redirectUri: parseUrl(
      'TELEGRAM_REDIRECT_URI',
      requireString(env, 'TELEGRAM_REDIRECT_URI'),
    ),
  }
}

export function createTelegramDependencies(fetchImpl = fetch) {
  return {
    createPkceChallenge,
    createRandomToken,
    createTelegramAppToken,
    createTelegramStateToken,
    exchangeAuthorizationCode: (parameters) =>
      exchangeTelegramAuthorizationCode(parameters, fetchImpl),
    fetchChannelMembership: (parameters) =>
      fetchTelegramChannelMembership(parameters, fetchImpl),
    getOidcConfiguration: () => fetchTelegramOidcConfiguration(fetchImpl),
    verifyAppToken: (token, secret, options) =>
      verifyTelegramAppToken(token, secret, options),
    verifyIdToken: (parameters) => verifyTelegramIdToken(parameters, fetchImpl),
    verifyStateToken: (token, secret) => verifyTelegramStateToken(token, secret),
  }
}

function verifyAppToken(token, config, dependencies) {
  return dependencies.verifyAppToken(token, config.jwtSecret, {
    expectedAudience: config.frontendAppUrl,
  })
}

function verifyStateToken(token, config, dependencies) {
  return dependencies.verifyStateToken(token, config.jwtSecret)
}

function buildTelegramErrorRedirect(config, description) {
  return buildTelegramFrontendRedirect(config.frontendAppUrl, {
    telegram_error: 'telegram_auth_failed',
    telegram_error_description: description,
  })
}

async function handleAuthStart(config, dependencies, response) {
  const oidcConfiguration = await dependencies.getOidcConfiguration()
  const nonce = dependencies.createRandomToken()
  const codeVerifier = dependencies.createRandomToken()
  const state = dependencies.createTelegramStateToken(
    {
      codeVerifier,
      nonce,
    },
    config.jwtSecret,
  )

  redirect(
    response,
    buildTelegramAuthorizationUrl(
      {
        authorizationEndpoint: oidcConfiguration.authorizationEndpoint,
        clientId: config.clientId,
        redirectUri: config.redirectUri,
      },
      {
        codeChallenge: dependencies.createPkceChallenge(codeVerifier),
        nonce,
        state,
      },
    ),
  )
}

async function handleAuthCallback(config, dependencies, requestUrl, response) {
  const code = requestUrl.searchParams.get('code')
  const stateToken = requestUrl.searchParams.get('state')

  if (!code || !stateToken) {
    redirect(
      response,
      buildTelegramErrorRedirect(
        config,
        'Telegram login could not be completed.',
      ),
    )
    return
  }

  let state

  try {
    state = verifyStateToken(stateToken, config, dependencies)
  } catch (error) {
    redirect(response, buildTelegramErrorRedirect(config, getErrorMessage(error)))
    return
  }

  try {
    const oidcConfiguration = await dependencies.getOidcConfiguration()
    const tokenResponse = await dependencies.exchangeAuthorizationCode({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      code,
      codeVerifier: state.codeVerifier,
      redirectUri: config.redirectUri,
      tokenEndpoint: oidcConfiguration.tokenEndpoint,
    })
    const telegramUser = await dependencies.verifyIdToken({
      clientId: config.clientId,
      expectedIssuer: oidcConfiguration.issuer,
      expectedNonce: state.nonce,
      idToken: tokenResponse.idToken,
      jwksUri: oidcConfiguration.jwksUri,
    })
    const appToken = dependencies.createTelegramAppToken(
      {
        displayName: telegramUser.displayName,
        frontendAppUrl: config.frontendAppUrl,
        subject: telegramUser.subject,
        telegramId: telegramUser.telegramId,
        username: telegramUser.username,
      },
      config.jwtSecret,
    )

    redirect(
      response,
      buildTelegramFrontendRedirect(config.frontendAppUrl, {
        telegram_token: appToken,
      }),
    )
  } catch (error) {
    redirect(response, buildTelegramErrorRedirect(config, getErrorMessage(error)))
  }
}

async function handleMe(config, dependencies, request, response) {
  const token = readBearerToken(request)

  if (!token) {
    json(response, 401, { message: 'Unauthorized' })
    return
  }

  let session

  try {
    session = verifyAppToken(token, config, dependencies)
  } catch (error) {
    console.warn('[telegram] rejected /api/telegram/me app token:', getErrorMessage(error))
    json(response, 401, { message: 'Unauthorized' })
    return
  }

  try {
    const membership = await dependencies.fetchChannelMembership({
      botToken: config.botToken,
      channelUsername: config.channelUsername,
      telegramUserId: session.telegramId,
    })

    json(response, 200, {
      displayName: session.displayName,
      isInTargetChannel: membership.isInTargetChannel,
      membershipError: null,
      userId: session.telegramId,
      username: session.username,
    })
  } catch (error) {
    console.warn(
      `[telegram] membership lookup failed for ${session.telegramId} in ${config.channelUsername}: ${getErrorMessage(error)}`,
    )
    json(response, 200, {
      displayName: session.displayName,
      isInTargetChannel: null,
      membershipError: getErrorMessage(error),
      userId: session.telegramId,
      username: session.username,
    })
  }
}

export function createTelegramApiServer(
  config,
  dependencies = createTelegramDependencies(),
) {
  return createServer((request, response) => {
    const requestUrl = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? 'localhost'}`,
    )

    if (requestUrl.pathname.startsWith('/api/telegram/')) {
      setCorsHeaders(response, config)
    }

    if (
      request.method === 'OPTIONS' &&
      requestUrl.pathname.startsWith('/api/telegram/')
    ) {
      response.statusCode = 204
      response.end()
      return
    }

    const handleRequest = async () => {
      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/telegram/auth/start'
      ) {
        await handleAuthStart(config, dependencies, response)
        return
      }

      if (
        request.method === 'GET' &&
        requestUrl.pathname === '/api/telegram/auth/callback'
      ) {
        await handleAuthCallback(config, dependencies, requestUrl, response)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/api/telegram/me') {
        await handleMe(config, dependencies, request, response)
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
  loadDotEnvFiles()

  const config = parseTelegramApiConfig(process.env)
  const server = createTelegramApiServer(config)

  server.listen(config.port, () => {
    console.log(
      `Telegram API listening on http://localhost:${config.port}`,
    )
  })
}
