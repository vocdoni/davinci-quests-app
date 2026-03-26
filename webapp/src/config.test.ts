import { describe, expect, it } from 'vitest'
import { parseAppConfig, type EnvSource } from './config'

function createEnv(overrides: EnvSource = {}): EnvSource {
  return {
    VITE_API_BASE_URL: 'https://api.example.org',
    VITE_TARGET_CHAIN_BLOCK_EXPLORER_URL: 'https://explorer.example.org',
    VITE_TARGET_CHAIN_ID: '137',
    VITE_TARGET_CHAIN_NAME: 'Polygon',
    VITE_TARGET_CHAIN_NATIVE_CURRENCY_DECIMALS: '18',
    VITE_TARGET_CHAIN_NATIVE_CURRENCY_NAME: 'MATIC',
    VITE_TARGET_CHAIN_NATIVE_CURRENCY_SYMBOL: 'POL',
    VITE_TARGET_CHAIN_RPC_URL: 'https://rpc.example.org',
    VITE_WALLETCONNECT_PROJECT_ID: 'project-id-123',
    ...overrides,
  }
}

describe('parseAppConfig', () => {
  it('parses the expected environment variables', () => {
    const config = parseAppConfig(createEnv())

    expect(config).toEqual({
      apiBaseUrl: 'https://api.example.org',
      targetChain: {
        blockExplorerUrl: 'https://explorer.example.org',
        id: 137,
        name: 'Polygon',
        nativeCurrency: {
          decimals: 18,
          name: 'MATIC',
          symbol: 'POL',
        },
        rpcUrl: 'https://rpc.example.org',
      },
      walletConnectProjectId: 'project-id-123',
    })
  })

  it('throws when the API base URL is invalid', () => {
    expect(() =>
      parseAppConfig(createEnv({ VITE_API_BASE_URL: 'not-a-url' })),
    ).toThrow('VITE_API_BASE_URL must be a valid URL.')
  })

  it('throws when the chain id is invalid', () => {
    expect(() =>
      parseAppConfig(createEnv({ VITE_TARGET_CHAIN_ID: '0' })),
    ).toThrow('VITE_TARGET_CHAIN_ID must be an integer greater than or equal to 1.')
  })

  it('throws when walletconnect project id is missing', () => {
    expect(() =>
      parseAppConfig(createEnv({ VITE_WALLETCONNECT_PROJECT_ID: '' })),
    ).toThrow('Missing required environment variable: VITE_WALLETCONNECT_PROJECT_ID')
  })
})
