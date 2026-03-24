// @vitest-environment node

import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createApiServer } from './index.mjs'
import { encryptSecret } from './security.mjs'

const baseConfig = {
  appSessionSecret: 'super-secret',
  discord: {
    clientId: '123456789012345678',
    clientSecret: 'discord-client-secret',
    guildId: '987654321098765432',
    redirectUri: 'https://api.example.org/api/connections/discord/callback',
  },
  frontendAppUrl: 'https://app.example.org',
  frontendOrigin: 'https://app.example.org',
  mongo: {
    dbName: 'quests-dashboard',
    uri: 'mongodb://mongo:27017/quests-dashboard',
  },
  onchain: {
    contractAddress: '0x0000000000000000000000000000000000000001',
    rpcUrl: 'https://rpc.example.org',
    startBlock: 12345n,
    statsTtlSeconds: 300,
  },
  port: 3001,
  providerTokenEncryptionSecret: 'provider-secret',
  secureCookies: true,
  sessionTtlSeconds: 60 * 60 * 24 * 7,
  telegram: {
    botToken: '123456:telegram-bot-token',
    channelUsername: '@quest_channel',
    clientId: '123456',
    clientSecret: 'telegram-client-secret',
    jwtSecret: 'telegram-secret',
    redirectUri: 'https://api.example.org/api/connections/telegram/callback',
  },
}

function createMemoryStore(initialLinks = []) {
  const walletProfiles = new Map()
  const identityLinks = new Map(
    initialLinks.map((link) => [`${link.walletAddress}:${link.provider}`, { ...link }]),
  )

  return {
    async deleteIdentityLink(walletAddress, provider) {
      identityLinks.delete(`${walletAddress}:${provider}`)
    },

    async findIdentityLinkByProviderUserId(provider, providerUserId) {
      for (const link of identityLinks.values()) {
        if (link.provider === provider && link.providerUserId === providerUserId) {
          return { ...link }
        }
      }

      return null
    },

    async getIdentityLink(walletAddress, provider) {
      const link = identityLinks.get(`${walletAddress}:${provider}`)
      return link ? { ...link } : null
    },

    async getWalletProfile(walletAddress) {
      const profile = walletProfiles.get(walletAddress)
      return profile ? { ...profile } : null
    },

    async listIdentityLinks(walletAddress) {
      return [...identityLinks.values()]
        .filter((link) => link.walletAddress === walletAddress)
        .map((link) => ({ ...link }))
    },

    async upsertIdentityLink(walletAddress, provider, nextFields) {
      const key = `${walletAddress}:${provider}`
      const existingLink = identityLinks.get(key) ?? {
        createdAt: new Date(),
        provider,
        walletAddress,
      }
      const nextLink = {
        ...existingLink,
        ...nextFields,
        provider,
        updatedAt: new Date(),
        walletAddress,
      }

      identityLinks.set(key, nextLink)

      return { ...nextLink }
    },

    async upsertWalletProfile(walletAddress, nextFields = {}) {
      const existingProfile = walletProfiles.get(walletAddress) ?? {
        createdAt: new Date(),
        walletAddress,
      }
      const nextProfile = {
        ...existingProfile,
        ...nextFields,
        updatedAt: new Date(),
        walletAddress,
      }

      walletProfiles.set(walletAddress, nextProfile)

      return { ...nextProfile }
    },
  }
}

function createOnchainDependencies(overrides = {}) {
  return {
    fetchUserStats: vi.fn(async () => ({
      createdProcessesCount: 0,
      totalVotes: '0',
    })),
    ...overrides,
  }
}

function createMockResponse() {
  const headers = new Map()

  let body = ''
  let resolveFinished = null

  const finished = new Promise((resolve) => {
    resolveFinished = resolve
  })

  return {
    body,
    end(chunk = '') {
      body = typeof chunk === 'string' ? chunk : ''
      this.body = body
      resolveFinished?.()
    },
    finished,
    getHeader(name) {
      return headers.get(name.toLowerCase())
    },
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value)
    },
    statusCode: 200,
  }
}

function createRequest({
  body,
  headers = {},
  method,
  url,
}) {
  const stream = Readable.from(body ? [body] : [])

  return Object.assign(stream, {
    headers: {
      host: 'api.example.org',
      ...headers,
    },
    method,
    url,
  })
}

async function performRequest(server, parameters) {
  const response = createMockResponse()
  const request = createRequest(parameters)

  server.emit('request', request, response)
  await response.finished

  return response
}

function extractCookie(response, cookieName) {
  const headerValue = response.getHeader('set-cookie')
  const cookies = Array.isArray(headerValue)
    ? headerValue
    : headerValue
      ? [headerValue]
      : []

  const match = cookies.find((entry) => entry.startsWith(`${cookieName}=`))

  return match ? match.split(';', 1)[0] : null
}

async function authenticateWallet(server, account) {
  const challengeResponse = await performRequest(server, {
    body: JSON.stringify({
      address: account.address,
    }),
    headers: {
      'content-type': 'application/json',
    },
    method: 'POST',
    url: '/api/auth/wallet/challenge',
  })
  const challengeCookie = extractCookie(
    challengeResponse,
    'quests_dashboard_wallet_challenge',
  )
  const challengeBody = JSON.parse(challengeResponse.body)
  const signature = await account.signMessage({
    message: challengeBody.message,
  })
  const verifyResponse = await performRequest(server, {
    body: JSON.stringify({
      address: account.address,
      signature,
    }),
    headers: {
      'content-type': 'application/json',
      cookie: challengeCookie ?? '',
    },
    method: 'POST',
    url: '/api/auth/wallet/verify',
  })

  return {
    challengeBody,
    challengeCookie,
    sessionCookie: extractCookie(verifyResponse, 'quests_dashboard_app_session'),
    verifyResponse,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('API server', () => {
  it('verifies a wallet challenge and returns the default disconnected profile', async () => {
    const store = createMemoryStore()
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => 1_000_000,
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )

    const { sessionCookie, verifyResponse } = await authenticateWallet(server, account)
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(sessionCookie).toBeTruthy()
    expect(meResponse.statusCode).toBe(200)
    expect(JSON.parse(meResponse.body)).toEqual({
      identities: {
        discord: {
          checkedAt: null,
          connected: false,
          displayName: null,
          error: null,
          expiresAt: null,
          stats: {
            isInTargetServer: null,
          },
          status: 'disconnected',
          userId: null,
          username: null,
        },
        telegram: {
          checkedAt: null,
          connected: false,
          displayName: null,
          error: null,
          expiresAt: null,
          stats: {
            isInTargetChannel: null,
          },
          status: 'disconnected',
          userId: null,
          username: null,
        },
      },
      onchain: {
        checkedAt: '1970-01-01T00:16:40.000Z',
        error: null,
        expiresAt: '1970-01-01T00:21:40.000Z',
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      wallet: {
        address: account.address,
      },
    })
  })

  it('verifies a wallet challenge when the server clock includes milliseconds', async () => {
    const store = createMemoryStore()
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => 1_000_123,
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )

    const { sessionCookie, verifyResponse } = await authenticateWallet(server, account)
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(verifyResponse.statusCode).toBe(200)
    expect(sessionCookie).toBeTruthy()
    expect(meResponse.statusCode).toBe(200)
  })

  it('rejects an invalid wallet signature', async () => {
    const store = createMemoryStore()
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => 1_000_000,
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const challengeResponse = await performRequest(server, {
      body: JSON.stringify({
        address: account.address,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      url: '/api/auth/wallet/challenge',
    })
    const challengeCookie = extractCookie(
      challengeResponse,
      'quests_dashboard_wallet_challenge',
    )
    const verifyResponse = await performRequest(server, {
      body: JSON.stringify({
        address: account.address,
        signature: '0xdeadbeef',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: challengeCookie ?? '',
      },
      method: 'POST',
      url: '/api/auth/wallet/verify',
    })

    expect(verifyResponse.statusCode).toBe(401)
    expect(JSON.parse(verifyResponse.body)).toEqual({
      message: 'Unauthorized',
    })
  })

  it('links Discord through the callback flow and rejects duplicates across wallets', async () => {
    const store = createMemoryStore([
      {
        checkedAt: new Date(),
        createdAt: new Date(),
        displayName: 'Other Quest Master',
        expiresAt: new Date(),
        lastError: null,
        provider: 'discord',
        providerUserId: '999999999999999999',
        stats: {
          isInTargetServer: true,
        },
        status: 'active',
        updatedAt: new Date(),
        username: 'otherquestmaster',
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    ])
    const discordDependencies = {
      exchangeAuthorizationCode: vi.fn(async () => ({
        accessToken: 'discord-access-token',
        expiresInSeconds: 3600,
        refreshToken: 'discord-refresh-token',
        scope: 'identify guilds.members.read',
        tokenType: 'Bearer',
      })),
      fetchUserStats: vi
        .fn()
        .mockResolvedValueOnce({
          displayName: 'Quest Master',
          isInTargetServer: true,
          userId: '111111111111111111',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          displayName: 'Duplicate Quest',
          isInTargetServer: true,
          userId: '999999999999999999',
          username: 'duplicatequest',
        }),
      refreshAccessToken: vi.fn(),
    }
    const server = createApiServer(baseConfig, {
      discord: discordDependencies,
      now: () => 1_500_000,
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x8b3a350cf5c34c9194ca85829d61cb0c34b6edafebc11c71cb1a7d3f0f7ebf14',
    )

    const { sessionCookie } = await authenticateWallet(server, account)
    const startResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/connections/discord/start',
    })
    const state = new URL(startResponse.getHeader('location')).searchParams.get('state')

    const callbackResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: `/api/connections/discord/callback?code=oauth-code&state=${encodeURIComponent(state ?? '')}`,
    })
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const duplicateStartResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/connections/discord/start',
    })
    const duplicateState = new URL(duplicateStartResponse.getHeader('location')).searchParams.get(
      'state',
    )
    const duplicateResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: `/api/connections/discord/callback?code=oauth-code&state=${encodeURIComponent(duplicateState ?? '')}`,
    })

    expect(callbackResponse.statusCode).toBe(302)
    expect(callbackResponse.getHeader('location')).toContain('link_provider=discord')
    expect(callbackResponse.getHeader('location')).toContain('link_status=success')
    expect(JSON.parse(meResponse.body).identities.discord).toMatchObject({
      connected: true,
      displayName: 'Quest Master',
      stats: {
        isInTargetServer: true,
      },
      userId: '111111111111111111',
      username: 'questmaster',
    })
    expect(duplicateResponse.statusCode).toBe(302)
    expect(duplicateResponse.getHeader('location')).toContain(
      'Discord+account+is+already+linked+to+another+wallet.',
    )
  })

  it('refreshes stale Discord stats during /api/me', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        checkedAt: new Date('2026-03-23T00:00:00.000Z'),
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        displayName: 'Old Quest Master',
        encryptedAccessToken: encryptSecret('old-access', baseConfig.providerTokenEncryptionSecret),
        encryptedRefreshToken: encryptSecret(
          'old-refresh',
          baseConfig.providerTokenEncryptionSecret,
        ),
        expiresAt: new Date('2026-03-23T12:00:00.000Z'),
        lastError: null,
        provider: 'discord',
        providerUserId: '111111111111111111',
        scope: 'identify guilds.members.read',
        stats: {
          isInTargetServer: false,
        },
        status: 'active',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        username: 'oldquestmaster',
        walletAddress: account.address,
      },
    ])
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(async () => ({
          displayName: 'Quest Master',
          isInTargetServer: true,
          userId: '111111111111111111',
          username: 'questmaster',
        })),
        refreshAccessToken: vi.fn(async () => ({
          accessToken: 'new-access-token',
          expiresInSeconds: 3600,
          refreshToken: 'new-refresh-token',
          scope: 'identify guilds.members.read',
          tokenType: 'Bearer',
        })),
      },
      now: () => new Date('2026-03-24T18:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    }
    const server = createApiServer(baseConfig, dependencies)
    const sessionTokenResponse = await authenticateWallet(server, account)
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionTokenResponse.sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(dependencies.discord.refreshAccessToken).toHaveBeenCalledWith({
      clientId: baseConfig.discord.clientId,
      clientSecret: baseConfig.discord.clientSecret,
      refreshToken: 'old-refresh',
    })
    expect(JSON.parse(meResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master',
      stats: {
        isInTargetServer: true,
      },
      username: 'questmaster',
    })
  })

  it('preserves cached Telegram stats when a refresh fails', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        checkedAt: new Date('2026-03-23T00:00:00.000Z'),
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        displayName: 'Quest Captain',
        expiresAt: new Date('2026-03-23T12:00:00.000Z'),
        lastError: null,
        provider: 'telegram',
        providerUserId: '222222222',
        stats: {
          isInTargetChannel: true,
        },
        status: 'active',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        username: 'questcaptain',
        walletAddress: account.address,
      },
    ])
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-24T18:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(async () => {
          throw new Error('Forbidden: bot is not an administrator of the target chat.')
        }),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    }
    const server = createApiServer(baseConfig, dependencies)
    const { sessionCookie } = await authenticateWallet(server, account)
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(JSON.parse(meResponse.body).identities.telegram).toMatchObject({
      error: 'Forbidden: bot is not an administrator of the target chat.',
      stats: {
        isInTargetChannel: true,
      },
      userId: '222222222',
      username: 'questcaptain',
    })
  })

  it('refreshes stale onchain stats during /api/me and keeps cached values on error', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore()

    await store.upsertWalletProfile(account.address, {
      onchainCheckedAt: new Date('2026-03-23T00:00:00.000Z'),
      onchainCreatedProcessesCount: 1,
      onchainExpiresAt: new Date('2026-03-23T12:00:00.000Z'),
      onchainLastError: null,
      onchainTotalVotes: '7',
    })

    const onchain = createOnchainDependencies({
      fetchUserStats: vi
        .fn()
        .mockResolvedValueOnce({
          createdProcessesCount: 3,
          totalVotes: '44',
        })
        .mockRejectedValueOnce(new Error('RPC rate limited.')),
    })
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-24T18:00:00.000Z').getTime(),
      onchain,
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    }
    const server = createApiServer(baseConfig, dependencies)
    const { sessionCookie } = await authenticateWallet(server, account)

    const firstMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    await store.upsertWalletProfile(account.address, {
      onchainExpiresAt: new Date('2026-03-24T17:00:00.000Z'),
    })

    const secondMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(onchain.fetchUserStats).toHaveBeenNthCalledWith(1, account.address)
    expect(onchain.fetchUserStats).toHaveBeenNthCalledWith(2, account.address)
    expect(JSON.parse(firstMeResponse.body).onchain).toMatchObject({
      error: null,
      numberOfProcesses: 3,
      totalVotes: '44',
    })
    expect(JSON.parse(secondMeResponse.body).onchain).toMatchObject({
      error: 'RPC rate limited.',
      numberOfProcesses: 3,
      totalVotes: '44',
    })
  })
})
