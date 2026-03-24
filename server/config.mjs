import { getAddress, isAddress } from 'viem'
import { normalizeChannelUsername } from './telegram.mjs'

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

function parseInteger(name, rawValue, minimum) {
  const value = Number(rawValue)

  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`)
  }

  return value
}

function parseUrl(name, rawValue) {
  try {
    return new URL(rawValue).toString()
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }
}

function parseSnowflake(name, rawValue) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a valid Discord snowflake.`)
  }

  return rawValue
}

function parseTelegramClientId(rawValue) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error('TELEGRAM_CLIENT_ID must be a numeric Telegram application identifier.')
  }

  return rawValue
}

function parseAddress(name, rawValue) {
  if (!isAddress(rawValue)) {
    throw new Error(`${name} must be a valid EVM address.`)
  }

  return getAddress(rawValue)
}

export function parseServerConfig(env = process.env) {
  const missingKeys = [
    'APP_SESSION_SECRET',
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_GUILD_ID',
    'DISCORD_REDIRECT_URI',
    'FRONTEND_APP_URL',
    'MONGODB_DB_NAME',
    'MONGODB_URI',
    'ONCHAIN_PROCESS_REGISTRY_ADDRESS',
    'ONCHAIN_PROCESS_REGISTRY_START_BLOCK',
    'ONCHAIN_RPC_URL',
    'PROVIDER_TOKEN_ENCRYPTION_SECRET',
    'TELEGRAM_APP_JWT_SECRET',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHANNEL_USERNAME',
    'TELEGRAM_CLIENT_ID',
    'TELEGRAM_CLIENT_SECRET',
    'TELEGRAM_REDIRECT_URI',
  ].filter((key) => !readOptionalString(env, key))

  if (missingKeys.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingKeys.join(', ')}`,
    )
  }

  const frontendAppUrl = parseUrl(
    'FRONTEND_APP_URL',
    requireString(env, 'FRONTEND_APP_URL'),
  )

  return {
    appSessionSecret: requireString(env, 'APP_SESSION_SECRET'),
    discord: {
      clientId: parseSnowflake(
        'DISCORD_CLIENT_ID',
        requireString(env, 'DISCORD_CLIENT_ID'),
      ),
      clientSecret: requireString(env, 'DISCORD_CLIENT_SECRET'),
      guildId: parseSnowflake(
        'DISCORD_GUILD_ID',
        requireString(env, 'DISCORD_GUILD_ID'),
      ),
      redirectUri: parseUrl(
        'DISCORD_REDIRECT_URI',
        requireString(env, 'DISCORD_REDIRECT_URI'),
      ),
    },
    frontendAppUrl,
    frontendOrigin: new URL(frontendAppUrl).origin,
    mongo: {
      dbName: requireString(env, 'MONGODB_DB_NAME'),
      uri: requireString(env, 'MONGODB_URI'),
    },
    onchain: {
      contractAddress: parseAddress(
        'ONCHAIN_PROCESS_REGISTRY_ADDRESS',
        requireString(env, 'ONCHAIN_PROCESS_REGISTRY_ADDRESS'),
      ),
      rpcUrl: parseUrl(
        'ONCHAIN_RPC_URL',
        requireString(env, 'ONCHAIN_RPC_URL'),
      ),
      startBlock: BigInt(
        parseInteger(
          'ONCHAIN_PROCESS_REGISTRY_START_BLOCK',
          requireString(env, 'ONCHAIN_PROCESS_REGISTRY_START_BLOCK'),
          0,
        ),
      ),
      statsTtlSeconds: env.ONCHAIN_STATS_TTL_SECONDS
        ? parseInteger('ONCHAIN_STATS_TTL_SECONDS', env.ONCHAIN_STATS_TTL_SECONDS, 60)
        : 300,
    },
    port: env.PORT ? parseInteger('PORT', env.PORT, 1) : 3001,
    providerTokenEncryptionSecret: requireString(
      env,
      'PROVIDER_TOKEN_ENCRYPTION_SECRET',
    ),
    secureCookies:
      readOptionalString(env, 'COOKIE_SECURE') === 'true' ||
      new URL(frontendAppUrl).protocol === 'https:',
    sessionTtlSeconds: env.SESSION_TTL_SECONDS
      ? parseInteger('SESSION_TTL_SECONDS', env.SESSION_TTL_SECONDS, 60)
      : 60 * 60 * 24 * 7,
    telegram: {
      botToken: requireString(env, 'TELEGRAM_BOT_TOKEN'),
      channelUsername: normalizeChannelUsername(
        requireString(env, 'TELEGRAM_CHANNEL_USERNAME'),
      ),
      clientId: parseTelegramClientId(requireString(env, 'TELEGRAM_CLIENT_ID')),
      clientSecret: requireString(env, 'TELEGRAM_CLIENT_SECRET'),
      jwtSecret: requireString(env, 'TELEGRAM_APP_JWT_SECRET'),
      redirectUri: parseUrl(
        'TELEGRAM_REDIRECT_URI',
        requireString(env, 'TELEGRAM_REDIRECT_URI'),
      ),
    },
  }
}
