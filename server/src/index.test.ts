// @vitest-environment node

import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DiscordApiError } from './discord.mjs'
import { GitHubApiError } from './github.mjs'
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
  github: {
    clientId: 'github-client-id',
    clientSecret: 'github-client-secret',
    redirectUri: 'https://api.example.org/api/connections/github/callback',
    targetOrganization: 'vocdoni',
    targetRepositories: [
      {
        fullName: 'vocdoni/davinciNode',
        name: 'davinciNode',
        owner: 'vocdoni',
      },
      {
        fullName: 'vocdoni/davinciSDK',
        name: 'davinciSDK',
        owner: 'vocdoni',
      },
    ],
  },
  mongo: {
    dbName: 'quests-dashboard',
    uri: 'mongodb://mongo:27017/quests-dashboard',
  },
  onchain: {
    contractAddress: '0x0000000000000000000000000000000000000001',
    rpcUrl: 'https://rpc.example.org',
    startBlock: 12345n,
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
  it('serves the quest catalog loaded from JSON', async () => {
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

    const response = await performRequest(server, {
      method: 'GET',
      url: '/api/quests',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      builders: [
        {
          achievement: 'github.targetRepositories[0].isStarred == true',
          description:
            'Enjoying Davinci Node? Star the repository on GitHub to support the project and help more developers discover it.',
          id: 1,
          points: 320,
          title: 'Star the Davinci Node repo on GitHub',
        },
        {
          achievement: 'github.targetRepositories[1].isStarred == true',
          description:
            'Want to build with Davinci? Explore our SDK, star the repository on GitHub, and start creating something great on the protocol.',
          id: 2,
          points: 420,
          title: 'Star the Davinci SDK repo on GitHub',
        },
      ],
      supporters: [
        {
          achievement: 'discord.isInTargetServer == true',
          description:
            'Join the Vocdoni Discord server to connect with the community, stay up to date, and get support when you need it.',
          id: 1,
          points: 100,
          title: 'Join the Vocdoni Discord server',
        },
      ],
    })
  })

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
          connected: false,
          displayName: null,
          error: null,
          stats: {
            isInTargetServer: null,
          },
          status: 'disconnected',
          userId: null,
          username: null,
        },
        github: {
          connected: false,
          displayName: null,
          error: null,
          stats: {
            isFollowingTargetOrganization: null,
            isOlderThanOneYear: null,
            publicNonForkRepositoryCount: null,
            targetOrganization: 'vocdoni',
            targetRepositories: [
              {
                fullName: 'vocdoni/davinciNode',
                isStarred: null,
              },
              {
                fullName: 'vocdoni/davinciSDK',
                isStarred: null,
              },
            ],
          },
          status: 'disconnected',
          userId: null,
          username: null,
        },
        telegram: {
          connected: false,
          displayName: null,
          error: null,
          stats: {
            isInTargetChannel: null,
          },
          status: 'disconnected',
          userId: null,
          username: null,
        },
        twitter: {
          connected: false,
          displayName: null,
          error: null,
          stats: {},
          status: 'disconnected',
          userId: null,
          username: null,
        },
      },
      onchain: {
        error: null,
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

  it('generates, verifies, and deletes a Twitter proof link', async () => {
    const store = createMemoryStore()
    const twitterDependencies = {
      fetchProofTweet: vi.fn(),
    }
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      github: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
      },
      now: () => new Date('2026-03-25T12:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      twitter: twitterDependencies,
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )

    const { sessionCookie } = await authenticateWallet(server, account)
    const firstCodeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/code',
    })
    const secondCodeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/code',
    })
    const firstCode = JSON.parse(firstCodeResponse.body).code
    const secondCode = JSON.parse(secondCodeResponse.body).code

    twitterDependencies.fetchProofTweet
      .mockResolvedValueOnce({
        displayName: 'Quest Tweeter',
        normalizedTweetUrl: 'https://twitter.com/questtweeter/status/1111111111',
        text: `proof ${firstCode}`,
        tweetId: '1111111111',
        username: 'questtweeter',
      })
      .mockResolvedValueOnce({
        displayName: 'Quest Tweeter',
        normalizedTweetUrl: 'https://twitter.com/questtweeter/status/2222222222',
        text: `proof ${secondCode}`,
        tweetId: '2222222222',
        username: 'questtweeter',
      })

    const failedVerifyResponse = await performRequest(server, {
      body: JSON.stringify({
        tweetUrl: 'https://x.com/questtweeter/status/1111111111',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/verify',
    })
    const successfulVerifyResponse = await performRequest(server, {
      body: JSON.stringify({
        tweetUrl: 'https://x.com/questtweeter/status/2222222222',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/verify',
    })
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const deleteResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'DELETE',
      url: '/api/connections/twitter',
    })
    const afterDeleteResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const walletProfile = await store.getWalletProfile(account.address)

    expect(firstCodeResponse.statusCode).toBe(200)
    expect(secondCodeResponse.statusCode).toBe(200)
    expect(firstCode).not.toBe(secondCode)
    expect(failedVerifyResponse.statusCode).toBe(400)
    expect(JSON.parse(failedVerifyResponse.body)).toEqual({
      message: 'Tweet does not contain the current Twitter proof code.',
    })
    expect(successfulVerifyResponse.statusCode).toBe(204)
    expect(JSON.parse(meResponse.body).identities.twitter).toEqual({
      connected: true,
      displayName: 'Quest Tweeter',
      error: null,
      stats: {},
      status: 'active',
      userId: 'questtweeter',
      username: 'questtweeter',
    })
    expect(walletProfile?.twitterPendingCode).toBeNull()
    expect(walletProfile?.twitterPendingCodeExpiresAt).toBeNull()
    expect(deleteResponse.statusCode).toBe(204)
    expect(JSON.parse(afterDeleteResponse.body).identities.twitter).toEqual({
      connected: false,
      displayName: null,
      error: null,
      stats: {},
      status: 'disconnected',
      userId: null,
      username: null,
    })
  })

  it('rejects expired and duplicate Twitter proof verification attempts', async () => {
    const store = createMemoryStore([
      {
        createdAt: new Date(),
        displayName: 'Existing Tweeter',
        provider: 'twitter',
        providerUserId: 'questtweeter',
        updatedAt: new Date(),
        username: 'questtweeter',
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    ])
    const now = new Date('2026-03-25T12:00:00.000Z').getTime()
    const twitterDependencies = {
      fetchProofTweet: vi.fn(async () => ({
        displayName: 'Quest Tweeter',
        normalizedTweetUrl: 'https://twitter.com/questtweeter/status/3333333333',
        text: 'proof duplicate-code',
        tweetId: '3333333333',
        username: 'questtweeter',
      })),
    }
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      github: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
      },
      now: () => now,
      onchain: createOnchainDependencies(),
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      twitter: twitterDependencies,
      verifyMessage,
    })
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )

    const { sessionCookie } = await authenticateWallet(server, account)

    await store.upsertWalletProfile(account.address, {
      twitterPendingCode: 'expired-code',
      twitterPendingCodeExpiresAt: new Date(now - 1000),
      twitterPendingCodeIssuedAt: new Date(now - 10_000),
    })

    const expiredResponse = await performRequest(server, {
      body: JSON.stringify({
        tweetUrl: 'https://x.com/questtweeter/status/3333333333',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/verify',
    })

    await store.upsertWalletProfile(account.address, {
      twitterPendingCode: 'duplicate-code',
      twitterPendingCodeExpiresAt: new Date(now + 5 * 60 * 1000),
      twitterPendingCodeIssuedAt: new Date(now),
    })

    const duplicateResponse = await performRequest(server, {
      body: JSON.stringify({
        tweetUrl: 'https://x.com/questtweeter/status/3333333333',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/connections/twitter/verify',
    })
    const walletProfile = await store.getWalletProfile(account.address)

    expect(expiredResponse.statusCode).toBe(400)
    expect(JSON.parse(expiredResponse.body)).toEqual({
      message: 'Twitter proof code has expired.',
    })
    expect(duplicateResponse.statusCode).toBe(409)
    expect(JSON.parse(duplicateResponse.body)).toEqual({
      message: 'Twitter account is already linked to another wallet.',
    })
    expect(walletProfile?.twitterPendingCode).toBe('duplicate-code')
  })

  it('links Discord through the callback flow and rejects duplicates across wallets', async () => {
    const store = createMemoryStore([
      {
        createdAt: new Date(),
        displayName: 'Other Quest Master',
        provider: 'discord',
        providerUserId: '999999999999999999',
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

  it('links GitHub through the callback flow and rejects duplicates across wallets', async () => {
    const store = createMemoryStore([
      {
        createdAt: new Date(),
        displayName: 'Duplicate Quest',
        encryptedAccessToken: encryptSecret('github-access-token', baseConfig.providerTokenEncryptionSecret),
        provider: 'github',
        providerUserId: '999999',
        scope: 'read:user',
        tokenType: 'bearer',
        updatedAt: new Date(),
        username: 'duplicatequest',
        walletAddress: '0x1111111111111111111111111111111111111111',
      },
    ])
    const githubDependencies = {
      exchangeAuthorizationCode: vi.fn(async () => ({
        accessToken: 'github-access-token',
        scope: 'read:user',
        tokenType: 'bearer',
      })),
      fetchUserStats: vi
        .fn()
        .mockResolvedValueOnce({
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
          displayName: 'Quest Master',
          isFollowingTargetOrganization: true,
          isOlderThanOneYear: true,
          publicNonForkRepositoryCount: 9,
          targetOrganization: 'vocdoni',
          targetRepositories: [
            {
              fullName: 'vocdoni/davinciNode',
              isStarred: true,
            },
            {
              fullName: 'vocdoni/davinciSDK',
              isStarred: false,
            },
          ],
          userId: '123456',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
          displayName: 'Quest Master',
          isFollowingTargetOrganization: true,
          isOlderThanOneYear: true,
          publicNonForkRepositoryCount: 9,
          targetOrganization: 'vocdoni',
          targetRepositories: [
            {
              fullName: 'vocdoni/davinciNode',
              isStarred: true,
            },
            {
              fullName: 'vocdoni/davinciSDK',
              isStarred: false,
            },
          ],
          userId: '123456',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          accountCreatedAt: '2020-01-01T00:00:00.000Z',
          displayName: 'Duplicate Quest',
          isFollowingTargetOrganization: false,
          isOlderThanOneYear: true,
          publicNonForkRepositoryCount: 11,
          targetOrganization: 'vocdoni',
          targetRepositories: [
            {
              fullName: 'vocdoni/davinciNode',
              isStarred: false,
            },
            {
              fullName: 'vocdoni/davinciSDK',
              isStarred: true,
            },
          ],
          userId: '999999',
          username: 'duplicatequest',
        }),
    }
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      github: githubDependencies,
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
      url: '/api/connections/github/start',
    })
    const state = new URL(startResponse.getHeader('location')).searchParams.get('state')

    const callbackResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: `/api/connections/github/callback?code=oauth-code&state=${encodeURIComponent(state ?? '')}`,
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
      url: '/api/connections/github/start',
    })
    const duplicateState = new URL(duplicateStartResponse.getHeader('location')).searchParams.get(
      'state',
    )
    const duplicateResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: `/api/connections/github/callback?code=oauth-code&state=${encodeURIComponent(duplicateState ?? '')}`,
    })

    expect(callbackResponse.statusCode).toBe(302)
    expect(callbackResponse.getHeader('location')).toContain('link_provider=github')
    expect(callbackResponse.getHeader('location')).toContain('link_status=success')
    expect(githubDependencies.fetchUserStats).toHaveBeenNthCalledWith(1, {
      accessToken: 'github-access-token',
      targetOrganization: 'vocdoni',
      targetRepositories: baseConfig.github.targetRepositories,
    })
    expect(githubDependencies.fetchUserStats).toHaveBeenNthCalledWith(2, {
      accessToken: 'github-access-token',
      targetOrganization: 'vocdoni',
      targetRepositories: baseConfig.github.targetRepositories,
    })
    expect(JSON.parse(meResponse.body).identities.github).toMatchObject({
      connected: true,
      displayName: 'Quest Master',
      stats: {
        isFollowingTargetOrganization: true,
        isOlderThanOneYear: true,
        publicNonForkRepositoryCount: 9,
        targetOrganization: 'vocdoni',
        targetRepositories: [
          {
            fullName: 'vocdoni/davinciNode',
            isStarred: true,
          },
          {
            fullName: 'vocdoni/davinciSDK',
            isStarred: false,
          },
        ],
      },
      userId: '123456',
      username: 'questmaster',
    })
    expect(duplicateResponse.statusCode).toBe(302)
    expect(duplicateResponse.getHeader('location')).toContain(
      'GitHub+account+is+already+linked+to+another+wallet.',
    )
  })

  it('recomputes Discord stats on every /api/me request and retries with a refreshed token when unauthorized', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        displayName: 'Old Quest Master',
        encryptedAccessToken: encryptSecret('old-access', baseConfig.providerTokenEncryptionSecret),
        encryptedRefreshToken: encryptSecret(
          'old-refresh',
          baseConfig.providerTokenEncryptionSecret,
        ),
        provider: 'discord',
        providerUserId: '111111111111111111',
        scope: 'identify guilds.members.read',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        username: 'oldquestmaster',
        walletAddress: account.address,
      },
    ])
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi
          .fn()
          .mockRejectedValueOnce(new DiscordApiError('Unauthorized', 401))
          .mockResolvedValueOnce({
            displayName: 'Quest Master',
            isInTargetServer: true,
            userId: '111111111111111111',
            username: 'questmaster',
          })
          .mockResolvedValueOnce({
            displayName: 'Quest Master Redux',
            isInTargetServer: false,
            userId: '111111111111111111',
            username: 'questmasterredux',
          }),
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
    const firstMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionTokenResponse.sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const secondMeResponse = await performRequest(server, {
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
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(1, {
      accessToken: 'old-access',
      guildId: baseConfig.discord.guildId,
    })
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(2, {
      accessToken: 'new-access-token',
      guildId: baseConfig.discord.guildId,
    })
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(3, {
      accessToken: 'new-access-token',
      guildId: baseConfig.discord.guildId,
    })
    expect(JSON.parse(firstMeResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master',
      error: null,
      stats: {
        isInTargetServer: true,
      },
      status: 'active',
      username: 'questmaster',
    })
    expect(JSON.parse(secondMeResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master Redux',
      error: null,
      stats: {
        isInTargetServer: false,
      },
      status: 'active',
      username: 'questmasterredux',
    })
  })

  it('preserves the last known Discord membership when a live refresh fails', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        discordLastKnownIsInTargetServer: true,
        displayName: 'Quest Master',
        encryptedAccessToken: encryptSecret('live-access', baseConfig.providerTokenEncryptionSecret),
        encryptedRefreshToken: encryptSecret(
          'live-refresh',
          baseConfig.providerTokenEncryptionSecret,
        ),
        provider: 'discord',
        providerUserId: '111111111111111111',
        scope: 'identify guilds.members.read',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        username: 'questmaster',
        walletAddress: account.address,
      },
    ])
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(async () => {
          throw new DiscordApiError('Rate limited', 429)
        }),
        refreshAccessToken: vi.fn(),
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

    expect(meResponse.statusCode).toBe(200)
    expect(JSON.parse(meResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master',
      error: 'Rate limited',
      stats: {
        isInTargetServer: true,
      },
      status: 'error',
      username: 'questmaster',
    })
  })

  it('recomputes GitHub stats on every /api/me request and returns reauth_required for invalid credentials', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        displayName: 'Old Quest Master',
        encryptedAccessToken: encryptSecret(
          'old-github-access',
          baseConfig.providerTokenEncryptionSecret,
        ),
        provider: 'github',
        providerUserId: '123456',
        scope: 'read:user',
        tokenType: 'bearer',
        updatedAt: new Date('2026-03-23T00:00:00.000Z'),
        username: 'oldquestmaster',
        walletAddress: account.address,
      },
    ])
    const dependencies = {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      github: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi
          .fn()
          .mockResolvedValueOnce({
            accountCreatedAt: '2020-01-01T00:00:00.000Z',
            displayName: 'Quest Master',
            isFollowingTargetOrganization: true,
            isOlderThanOneYear: true,
            publicNonForkRepositoryCount: 9,
            targetOrganization: 'vocdoni',
            targetRepositories: [
              {
                fullName: 'vocdoni/davinciNode',
                isStarred: true,
              },
              {
                fullName: 'vocdoni/davinciSDK',
                isStarred: true,
              },
            ],
            userId: '123456',
            username: 'questmaster',
          })
          .mockRejectedValueOnce(new GitHubApiError('Bad credentials', 401)),
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
    const { sessionCookie } = await authenticateWallet(server, account)

    const firstMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const secondMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(dependencies.github.fetchUserStats).toHaveBeenNthCalledWith(1, {
      accessToken: 'old-github-access',
      targetOrganization: 'vocdoni',
      targetRepositories: baseConfig.github.targetRepositories,
    })
    expect(dependencies.github.fetchUserStats).toHaveBeenNthCalledWith(2, {
      accessToken: 'old-github-access',
      targetOrganization: 'vocdoni',
      targetRepositories: baseConfig.github.targetRepositories,
    })
    expect(JSON.parse(firstMeResponse.body).identities.github).toMatchObject({
      displayName: 'Quest Master',
      error: null,
      stats: {
        isFollowingTargetOrganization: true,
        isOlderThanOneYear: true,
        publicNonForkRepositoryCount: 9,
        targetOrganization: 'vocdoni',
        targetRepositories: [
          {
            fullName: 'vocdoni/davinciNode',
            isStarred: true,
          },
          {
            fullName: 'vocdoni/davinciSDK',
            isStarred: true,
          },
        ],
      },
      status: 'active',
      username: 'questmaster',
    })
    expect(JSON.parse(secondMeResponse.body).identities.github).toMatchObject({
      displayName: 'Quest Master',
      error: 'Bad credentials',
      stats: {
        isFollowingTargetOrganization: null,
        isOlderThanOneYear: null,
        publicNonForkRepositoryCount: null,
        targetOrganization: 'vocdoni',
        targetRepositories: [
          {
            fullName: 'vocdoni/davinciNode',
            isStarred: null,
          },
          {
            fullName: 'vocdoni/davinciSDK',
            isStarred: null,
          },
        ],
      },
      status: 'reauth_required',
      username: 'questmaster',
    })
  })

  it('recomputes Telegram stats on every /api/me request and reports live errors without cached fallback', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore([
      {
        createdAt: new Date('2026-03-23T00:00:00.000Z'),
        displayName: 'Quest Captain',
        provider: 'telegram',
        providerUserId: '222222222',
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
        fetchChannelMembership: vi
          .fn()
          .mockResolvedValueOnce({
            isInTargetChannel: true,
          })
          .mockRejectedValueOnce(
            new Error('Forbidden: bot is not an administrator of the target chat.'),
          ),
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
    const secondMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(JSON.parse(firstMeResponse.body).identities.telegram).toMatchObject({
      error: null,
      stats: {
        isInTargetChannel: true,
      },
      userId: '222222222',
      username: 'questcaptain',
    })
    expect(JSON.parse(secondMeResponse.body).identities.telegram).toMatchObject({
      error: 'Forbidden: bot is not an administrator of the target chat.',
      stats: {
        isInTargetChannel: null,
      },
      userId: '222222222',
      username: 'questcaptain',
    })
  })

  it('recomputes onchain stats on every /api/me request and returns defaults on live errors', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore()
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
      numberOfProcesses: 0,
      totalVotes: '0',
    })
  })
})
