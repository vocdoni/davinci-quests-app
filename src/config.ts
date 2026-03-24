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

export type AppConfig = {
  apiBaseUrl: string
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

export function parseAppConfig(env: EnvSource): AppConfig {
  const apiBaseUrl = parseUrl(
    'VITE_API_BASE_URL',
    requireString(env, 'VITE_API_BASE_URL'),
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

  return {
    apiBaseUrl,
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
