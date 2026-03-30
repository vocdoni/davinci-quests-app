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

function parseGitHubTargetOrganization(rawValue) {
  const normalizedValue = rawValue.trim()

  if (!/^[A-Za-z0-9-]+$/.test(normalizedValue)) {
    throw new Error(
      'GITHUB_TARGET_ORGANIZATION must be a valid GitHub organization handle.',
    )
  }

  return normalizedValue
}

function parseGitHubTargetRepositories(rawValue) {
  const repositories = rawValue
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

  if (repositories.length === 0) {
    throw new Error(
      'GITHUB_TARGET_REPOSITORIES must include at least one owner/repository value.',
    )
  }

  return repositories.map((repository, index) => {
    const parts = repository.split('/').map((entry) => entry.trim())

    if (
      parts.length !== 2 ||
      parts[0].length === 0 ||
      parts[1].length === 0 ||
      parts.some((entry) => entry.includes('/'))
    ) {
      throw new Error(
        `GITHUB_TARGET_REPOSITORIES entry #${index + 1} must use the owner/repository format.`,
      )
    }

    const [owner, name] = parts

    return {
      fullName: `${owner}/${name}`,
      name,
      owner,
    }
  })
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
    'ENS_RPC_URL',
    'FRONTEND_APP_URL',
    'GITHUB_CLIENT_ID',
    'GITHUB_CLIENT_SECRET',
    'GITHUB_REDIRECT_URI',
    'GITHUB_TARGET_ORGANIZATION',
    'GITHUB_TARGET_REPOSITORIES',
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
    ens: {
      rpcUrl: parseUrl(
        'ENS_RPC_URL',
        requireString(env, 'ENS_RPC_URL'),
      ),
    },
    frontendAppUrl,
    frontendOrigin: new URL(frontendAppUrl).origin,
    github: {
      clientId: requireString(env, 'GITHUB_CLIENT_ID'),
      clientSecret: requireString(env, 'GITHUB_CLIENT_SECRET'),
      redirectUri: parseUrl(
        'GITHUB_REDIRECT_URI',
        requireString(env, 'GITHUB_REDIRECT_URI'),
      ),
      targetOrganization: parseGitHubTargetOrganization(
        requireString(env, 'GITHUB_TARGET_ORGANIZATION'),
      ),
      targetRepositories: parseGitHubTargetRepositories(
        requireString(env, 'GITHUB_TARGET_REPOSITORIES'),
      ),
    },
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
    },
    port: env.PORT ? parseInteger('PORT', env.PORT, 1) : 3001,
    providerTokenEncryptionSecret: requireString(
      env,
      'PROVIDER_TOKEN_ENCRYPTION_SECRET',
    ),
    questCatalogPath: readOptionalString(env, 'QUESTS_FILE_PATH'),
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
