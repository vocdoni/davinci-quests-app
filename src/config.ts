import { getAddress, isAddress, type Address } from 'viem'

export type EnvSource = Record<string, string | undefined>

export type TargetChainConfig = {
  blockExplorerUrl: string
  id: number
  name: string
  nativeCurrency: {
    decimals: number
    name: string
    symbol: string
  }
  rpcUrl: string
}

export type DiscordConfig = {
  clientId: string
  guildId: string
  redirectUri: string
}

export type TelegramConfig = {
  apiBaseUrl: string
}

export type AppConfig = {
  contractAddress: Address
  discord: DiscordConfig
  startBlock: bigint
  telegram: TelegramConfig
  targetChain: TargetChainConfig
  walletConnectProjectId: string
}

function requireString(env: EnvSource, key: keyof EnvSource) {
  const value = env[key]

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`)
  }

  return value.trim()
}

function parseInteger(name: string, rawValue: string, min: number) {
  const value = Number(rawValue)

  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}.`)
  }

  return value
}

function parseUrl(name: string, rawValue: string) {
  try {
    return new URL(rawValue).toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${name} must be a valid URL.`)
  }
}

function parseAddress(name: string, rawValue: string) {
  if (!isAddress(rawValue)) {
    throw new Error(`${name} must be a valid EVM address.`)
  }

  return getAddress(rawValue)
}

function parseSnowflake(name: string, rawValue: string) {
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be a valid Discord snowflake.`)
  }

  return rawValue
}

export function parseAppConfig(env: EnvSource): AppConfig {
  const contractAddress = parseAddress(
    'VITE_PROCESS_REGISTRY_ADDRESS',
    requireString(env, 'VITE_PROCESS_REGISTRY_ADDRESS'),
  )
  const startBlock = BigInt(
    parseInteger(
      'VITE_PROCESS_REGISTRY_START_BLOCK',
      requireString(env, 'VITE_PROCESS_REGISTRY_START_BLOCK'),
      0,
    ),
  )
  const chainId = parseInteger(
    'VITE_TARGET_CHAIN_ID',
    requireString(env, 'VITE_TARGET_CHAIN_ID'),
    1,
  )
  const chainName = requireString(env, 'VITE_TARGET_CHAIN_NAME')
  const rpcUrl = parseUrl(
    'VITE_TARGET_CHAIN_RPC_URL',
    requireString(env, 'VITE_TARGET_CHAIN_RPC_URL'),
  )
  const blockExplorerUrl = parseUrl(
    'VITE_TARGET_CHAIN_BLOCK_EXPLORER_URL',
    requireString(env, 'VITE_TARGET_CHAIN_BLOCK_EXPLORER_URL'),
  )
  const currencyName = requireString(env, 'VITE_TARGET_CHAIN_NATIVE_CURRENCY_NAME')
  const currencySymbol = requireString(
    env,
    'VITE_TARGET_CHAIN_NATIVE_CURRENCY_SYMBOL',
  )
  const currencyDecimals = parseInteger(
    'VITE_TARGET_CHAIN_NATIVE_CURRENCY_DECIMALS',
    requireString(env, 'VITE_TARGET_CHAIN_NATIVE_CURRENCY_DECIMALS'),
    0,
  )
  const walletConnectProjectId = requireString(
    env,
    'VITE_WALLETCONNECT_PROJECT_ID',
  )
  const discordClientId = parseSnowflake(
    'VITE_DISCORD_CLIENT_ID',
    requireString(env, 'VITE_DISCORD_CLIENT_ID'),
  )
  const discordGuildId = parseSnowflake(
    'VITE_DISCORD_GUILD_ID',
    requireString(env, 'VITE_DISCORD_GUILD_ID'),
  )
  const discordRedirectUri = parseUrl(
    'VITE_DISCORD_REDIRECT_URI',
    requireString(env, 'VITE_DISCORD_REDIRECT_URI'),
  )
  const telegramApiBaseUrl = parseUrl(
    'VITE_TELEGRAM_API_BASE_URL',
    requireString(env, 'VITE_TELEGRAM_API_BASE_URL'),
  )

  return {
    contractAddress,
    discord: {
      clientId: discordClientId,
      guildId: discordGuildId,
      redirectUri: discordRedirectUri,
    },
    startBlock,
    telegram: {
      apiBaseUrl: telegramApiBaseUrl,
    },
    targetChain: {
      blockExplorerUrl,
      id: chainId,
      name: chainName,
      nativeCurrency: {
        decimals: currencyDecimals,
        name: currencyName,
        symbol: currencySymbol,
      },
      rpcUrl,
    },
    walletConnectProjectId,
  }
}
