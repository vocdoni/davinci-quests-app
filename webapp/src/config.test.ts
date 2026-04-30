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
      questsClosed: false,
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

  it('parses VITE_QUESTS_CLOSED when enabled', () => {
    const config = parseAppConfig(createEnv({ VITE_QUESTS_CLOSED: 'true' }))

    expect(config.questsClosed).toBe(true)
  })

  it('treats VITE_QUESTS_CLOSED as false when omitted or false', () => {
    expect(parseAppConfig(createEnv()).questsClosed).toBe(false)
    expect(parseAppConfig(createEnv({ VITE_QUESTS_CLOSED: 'false' })).questsClosed).toBe(false)
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
