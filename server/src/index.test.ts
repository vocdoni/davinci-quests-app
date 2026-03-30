// @vitest-environment node

import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyMessage } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { DiscordApiError } from './discord.mjs'
import { GitHubApiError } from './github.mjs'
import {
  createApiServer as createHttpApiServer,
  rebuildStoredScoresFromLocalState,
} from './index.mjs'
import { loadQuestCatalog } from './quests.mjs'
import { encryptSecret } from './security.mjs'

const baseConfig = {
  appSessionSecret: 'super-secret',
  discord: {
    clientId: '123456789012345678',
    clientSecret: 'discord-client-secret',
    botToken: 'discord-bot-token',
    guildId: '987654321098765432',
    targetChannelId: '555555555555555555',
    redirectUri: 'https://api.example.org/api/connections/discord/callback',
  },
  ens: {
    rpcUrl: 'https://ens.example.org',
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
  sequencer: {
    apiUrl: 'https://sequencer.example.org/',
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

const openServers = new Set()

function createApiServer(...parameters) {
  const server = createHttpApiServer(...parameters)
  openServers.add(server)
  return server
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

    async listLeaderboardWalletProfiles(limit) {
      return [...walletProfiles.values()]
        .filter((profile) => profile.lastAuthenticatedAt instanceof Date)
        .sort((left, right) => {
          const leftScore = left.scoreSnapshot?.totalPoints ?? 0
          const rightScore = right.scoreSnapshot?.totalPoints ?? 0

          if (leftScore !== rightScore) {
            return rightScore - leftScore
          }

          const leftBuilderPoints = left.scoreSnapshot?.buildersPoints ?? 0
          const rightBuilderPoints = right.scoreSnapshot?.buildersPoints ?? 0

          if (leftBuilderPoints !== rightBuilderPoints) {
            return rightBuilderPoints - leftBuilderPoints
          }

          const leftSupporterPoints = left.scoreSnapshot?.supportersPoints ?? 0
          const rightSupporterPoints = right.scoreSnapshot?.supportersPoints ?? 0

          if (leftSupporterPoints !== rightSupporterPoints) {
            return rightSupporterPoints - leftSupporterPoints
          }

          return left.walletAddress.localeCompare(right.walletAddress)
        })
        .slice(0, limit)
        .map((profile) => ({ ...profile }))
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

function createSequencerDependencies(overrides = {}) {
  return {
    verifyProcessStats: vi.fn(async () => ({
      addressWeight: '1',
      hasVoted: false,
      isInCensus: true,
      processId: '0x0000000000000000000000000000000000000001',
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
  for (const server of openServers) {
    server.close()
  }

  openServers.clear()
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
    expect(JSON.parse(response.body)).toEqual(loadQuestCatalog())
  })

  it('serves the leaderboard for authenticated wallets only, sorted by total points', async () => {
    const now = new Date('2026-03-30T10:00:00.000Z').getTime()
    const store = createMemoryStore()

    await store.upsertWalletProfile('0x00000000000000000000000000000000000000aa', {
      ensName: 'alice.eth',
      ensResolvedAt: new Date(now),
      lastAuthenticatedAt: new Date(now),
      onchainSnapshot: {
        error: null,
        lastSyncedAt: new Date(now),
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      scoreSnapshot: {
        builderCompletedCount: 1,
        builderCompletedQuestIds: [1],
        buildersPoints: 320,
        lastComputedAt: new Date(now),
        supporterCompletedCount: 1,
        supporterCompletedQuestIds: [1],
        supportersPoints: 100,
        totalPoints: 420,
      },
    })
    await store.upsertWalletProfile('0x00000000000000000000000000000000000000bb', {
      ensName: null,
      ensResolvedAt: new Date(now),
      lastAuthenticatedAt: new Date(now),
      onchainSnapshot: {
        error: null,
        lastSyncedAt: new Date(now),
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      scoreSnapshot: {
        builderCompletedCount: 2,
        builderCompletedQuestIds: [1, 2],
        buildersPoints: 740,
        lastComputedAt: new Date(now),
        supporterCompletedCount: 1,
        supporterCompletedQuestIds: [1],
        supportersPoints: 100,
        totalPoints: 840,
      },
    })
    await store.upsertWalletProfile('0x00000000000000000000000000000000000000cc', {
      scoreSnapshot: {
        totalPoints: 999,
      },
    })

    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
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
      verifyMessage,
    })

    const response = await performRequest(server, {
      method: 'GET',
      url: '/api/leaderboard?limit=2',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      rows: [
        {
          buildersPoints: 740,
          displayName: '0x0000...00bb',
          ensName: null,
          lastComputedAt: '2026-03-30T10:00:00.000Z',
          rank: 1,
          supportersPoints: 100,
          totalPoints: 840,
          walletAddress: '0x00000000000000000000000000000000000000bb',
        },
        {
          buildersPoints: 320,
          displayName: 'alice.eth',
          ensName: 'alice.eth',
          lastComputedAt: '2026-03-30T10:00:00.000Z',
          rank: 2,
          supportersPoints: 100,
          totalPoints: 420,
          walletAddress: '0x00000000000000000000000000000000000000aa',
        },
      ],
    })
  })

  it('refreshes stale leaderboard rows before returning them', async () => {
    const now = new Date('2026-03-30T10:00:00.000Z').getTime()
    const staleTime = now - 16 * 60 * 1000
    const store = createMemoryStore([
      {
        discordLastKnownIsInTargetServer: false,
        encryptedAccessToken: encryptSecret('discord-access-token', baseConfig.providerTokenEncryptionSecret),
        encryptedRefreshToken: encryptSecret('discord-refresh-token', baseConfig.providerTokenEncryptionSecret),
        provider: 'discord',
        providerUserId: 'discord-user',
        username: 'discord-user',
        walletAddress: '0x00000000000000000000000000000000000000aa',
      },
    ])

    await store.upsertWalletProfile('0x00000000000000000000000000000000000000aa', {
      ensResolvedAt: new Date(staleTime),
      lastAuthenticatedAt: new Date(now),
      onchainSnapshot: {
        error: null,
        lastSyncedAt: new Date(staleTime),
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      scoreSnapshot: {
        builderCompletedCount: 0,
        builderCompletedQuestIds: [],
        buildersPoints: 0,
        lastComputedAt: new Date(staleTime),
        supporterCompletedCount: 0,
        supporterCompletedQuestIds: [],
        supportersPoints: 0,
        totalPoints: 0,
      },
    })

    const discordDependencies = {
      exchangeAuthorizationCode: vi.fn(),
      fetchUserStats: vi.fn(async () => ({
        displayName: 'Quest Supporter',
        isInTargetServer: true,
        messagesInTargetChannel: 1,
        userId: 'discord-user',
        username: 'questsupporter',
      })),
      refreshAccessToken: vi.fn(),
    }
    const server = createApiServer(baseConfig, {
      discord: discordDependencies,
      now: () => now,
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
      url: '/api/leaderboard',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({
      rows: [
        expect.objectContaining({
          rank: 1,
          supportersPoints: 45,
          totalPoints: 45,
          walletAddress: '0x00000000000000000000000000000000000000aa',
        }),
      ],
    })
    expect(discordDependencies.fetchUserStats).toHaveBeenCalledTimes(1)
  })

  it('rebuilds stored score snapshots from cached local stats when quest points change', async () => {
    const now = new Date('2026-03-30T10:00:00.000Z').getTime()
    const store = createMemoryStore([
      {
        createdAt: new Date(now - 1_000),
        githubLastKnownIsFollowingTargetOrganization: true,
        githubLastKnownIsOlderThanOneYear: true,
        githubLastKnownPublicNonForkRepositoryCount: 8,
        githubLastKnownTargetOrganization: 'vocdoni',
        githubLastKnownTargetRepositories: [
          {
            fullName: 'vocdoni/davinciNode',
            isStarred: true,
          },
        ],
        provider: 'github',
        providerUserId: 'github-user',
        updatedAt: new Date(now - 1_000),
        username: 'questmaster',
        walletAddress: '0x00000000000000000000000000000000000000aa',
      },
      {
        createdAt: new Date(now - 1_000),
        provider: 'telegram',
        providerUserId: 'telegram-user',
        telegramLastKnownIsInTargetChannel: true,
        updatedAt: new Date(now - 1_000),
        username: 'questcaptain',
        walletAddress: '0x00000000000000000000000000000000000000aa',
      },
    ])

    await store.upsertWalletProfile('0x00000000000000000000000000000000000000aa', {
      lastAuthenticatedAt: new Date(now),
      onchainSnapshot: {
        error: null,
        lastSyncedAt: new Date(now),
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      scoreSnapshot: {
        builderCompletedCount: 0,
        builderCompletedQuestIds: [],
        buildersPoints: 0,
        lastComputedAt: new Date(now - 60 * 60 * 1000),
        supporterCompletedCount: 0,
        supporterCompletedQuestIds: [],
        supportersPoints: 0,
        totalPoints: 0,
      },
    })

    const questCatalog = {
      builders: [
        {
          achievement: 'github.targetRepositories[0].isStarred == true',
          description: 'Star the repo.',
          id: 1,
          points: 50,
          title: 'Star repo',
        },
      ],
      supporters: [
        {
          achievement: 'telegram.isInTargetChannel == true',
          description: 'Join the channel.',
          id: 2,
          points: 30,
          title: 'Join channel',
        },
        {
          achievement: 'onchain.isConnected == true',
          description: 'Sign in.',
          id: 3,
          points: 10,
          title: 'Sign in',
        },
      ],
    }

    await rebuildStoredScoresFromLocalState(
      baseConfig,
      {
        now: () => now,
        store,
      },
      questCatalog,
    )

    const updatedProfile = await store.getWalletProfile(
      '0x00000000000000000000000000000000000000aa',
    )

    expect(updatedProfile?.scoreSnapshot).toMatchObject({
      builderCompletedCount: 1,
      builderCompletedQuestIds: [1],
      buildersPoints: 50,
      supporterCompletedCount: 2,
      supporterCompletedQuestIds: [2, 3],
      supportersPoints: 40,
      totalPoints: 90,
    })
    expect(updatedProfile?.scoreSnapshot?.lastComputedAt).toEqual(new Date(now))
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
    expect(JSON.parse(meResponse.body)).toMatchObject({
      stats: {
        discord: {
          isInTargetServer: null,
          messagesInTargetChannel: null,
        },
        github: {
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
        onchain: {
          address: account.address,
          error: null,
          isConnected: true,
          numberOfProcesses: 0,
          totalVotes: '0',
        },
        quests: {
          builders: {
            completed: 0,
            points: 0,
            total: 2,
          },
          supporters: {
            completed: 1,
            points: 25,
            total: 11,
          },
        },
        sequencer: {
          lastVerifiedAt: null,
          numOfProcessAsParticipant: 0,
          processes: [],
          votesCasted: 0,
        },
        telegram: {
          isInTargetChannel: null,
        },
        twitter: {},
      },
      wallet: {
        address: account.address,
        ensName: null,
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

  it('verifies a sequencer process and stores the snapshot on the wallet profile', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const processId = `0x${'1'.repeat(62)}`
    const store = createMemoryStore()
    const sequencerDependencies = createSequencerDependencies({
      verifyProcessStats: vi.fn(async ({ processId: nextProcessId, walletAddress }) => {
        expect(walletAddress).toBe(account.address)

        return {
          addressWeight: '7',
          hasVoted: true,
          isInCensus: true,
          processId: nextProcessId,
        }
      }),
    })
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-25T12:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      sequencer: sequencerDependencies,
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const { sessionCookie } = await authenticateWallet(server, account)
    const verifyResponse = await performRequest(server, {
      body: JSON.stringify({
        processId,
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/sequencer/verify',
    })
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const walletProfile = await store.getWalletProfile(account.address)

    expect(verifyResponse.statusCode).toBe(200)
    expect(JSON.parse(verifyResponse.body)).toEqual({
      sequencer: {
        addressWeight: '7',
        error: null,
        hasVoted: true,
        isConnected: true,
        isInCensus: true,
        lastVerifiedAt: '2026-03-25T12:00:00.000Z',
        processId,
        processes: [
          {
            addressWeight: '7',
            error: null,
            hasVoted: true,
            isInCensus: true,
            lastVerifiedAt: '2026-03-25T12:00:00.000Z',
            processId,
            status: 'verified',
          },
        ],
        numOfProcessAsParticipant: 1,
        status: 'verified',
        votesCasted: 1,
      },
    })
    expect(JSON.parse(meResponse.body).stats.sequencer).toEqual({
      lastVerifiedAt: '2026-03-25T12:00:00.000Z',
      numOfProcessAsParticipant: 1,
      processes: [processId],
      votesCasted: 1,
    })
    expect(walletProfile?.sequencerSnapshot).toMatchObject({
      addressWeight: '7',
      error: null,
      hasVoted: true,
      isConnected: true,
      isInCensus: true,
      processId,
      numOfProcessAsParticipant: 1,
      processes: [
        {
          addressWeight: '7',
          error: null,
          hasVoted: true,
          isInCensus: true,
          lastVerifiedAt: '2026-03-25T12:00:00.000Z',
          processId,
          status: 'verified',
        },
      ],
      status: 'verified',
      votesCasted: 1,
    })
    expect(sequencerDependencies.verifyProcessStats).toHaveBeenCalled()
  })

  it('rejects invalid sequencer process ids before calling the sequencer', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore()
    const sequencerDependencies = {
      verifyProcessStats: vi.fn(async ({ processId }) => {
        expect(processId).toBe('invalid-process-id')
        throw new Error('Process id is invalid.')
      }),
    }
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-25T12:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      sequencer: sequencerDependencies,
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const { sessionCookie } = await authenticateWallet(server, account)
    const response = await performRequest(server, {
      body: JSON.stringify({
        processId: 'invalid-process-id',
      }),
      headers: {
        'content-type': 'application/json',
        cookie: sessionCookie ?? '',
      },
      method: 'POST',
      url: '/api/sequencer/verify',
    })

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Process id is invalid.',
    })
    expect(sequencerDependencies.verifyProcessStats).toHaveBeenCalledTimes(1)
  })

  it('rejects unauthenticated sequencer verification requests', async () => {
    const store = createMemoryStore()
    const sequencerDependencies = createSequencerDependencies()
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-25T12:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      sequencer: sequencerDependencies,
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
      body: JSON.stringify({
        processId: `0x${'1'.repeat(62)}`,
      }),
      headers: {
        'content-type': 'application/json',
      },
      method: 'POST',
      url: '/api/sequencer/verify',
    })

    expect(response.statusCode).toBe(401)
    expect(JSON.parse(response.body)).toEqual({
      message: 'Unauthorized',
    })
    expect(sequencerDependencies.verifyProcessStats).not.toHaveBeenCalled()
  })

  it('preserves the last known sequencer snapshot when a live refresh fails', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore()
    await store.upsertWalletProfile(account.address, {
      lastAuthenticatedAt: new Date('2026-03-25T12:00:00.000Z'),
      onchainSnapshot: {
        error: null,
        lastSyncedAt: new Date('2026-03-25T12:00:00.000Z'),
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      scoreSnapshot: {
        builderCompletedCount: 0,
        builderCompletedQuestIds: [],
        buildersPoints: 0,
        lastComputedAt: new Date('2026-03-25T12:00:00.000Z'),
        supporterCompletedCount: 0,
        supporterCompletedQuestIds: [],
        supportersPoints: 0,
        totalPoints: 0,
      },
      sequencerSnapshot: {
        addressWeight: '4',
        error: null,
        hasVoted: false,
        isConnected: true,
        isInCensus: true,
        lastVerifiedAt: '2026-03-24T18:30:00.000Z',
        processId: `0x${'2'.repeat(62)}`,
        status: 'verified',
      },
    })
    const sequencerDependencies = createSequencerDependencies({
      verifyProcessStats: vi.fn(async () => {
        throw new Error('Sequencer unavailable')
      }),
    })
    const server = createApiServer(baseConfig, {
      discord: {
        exchangeAuthorizationCode: vi.fn(),
        fetchUserStats: vi.fn(),
        refreshAccessToken: vi.fn(),
      },
      now: () => new Date('2026-03-25T12:00:00.000Z').getTime(),
      onchain: createOnchainDependencies(),
      sequencer: sequencerDependencies,
      store,
      telegram: {
        exchangeAuthorizationCode: vi.fn(),
        fetchChannelMembership: vi.fn(),
        getOidcConfiguration: vi.fn(),
        verifyIdToken: vi.fn(),
      },
      verifyMessage,
    })
    const { sessionCookie } = await authenticateWallet(server, account)
    const meResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })
    const walletProfile = await store.getWalletProfile(account.address)

    expect(meResponse.statusCode).toBe(200)
    expect(JSON.parse(meResponse.body).stats.sequencer).toEqual({
      lastVerifiedAt: '2026-03-24T18:30:00.000Z',
      numOfProcessAsParticipant: 1,
      processes: [`0x${'2'.repeat(62)}`],
      votesCasted: 0,
    })
    expect(walletProfile?.sequencerSnapshot).toMatchObject({
      addressWeight: '4',
      error: 'Sequencer unavailable',
      hasVoted: false,
      isConnected: true,
      isInCensus: true,
      processId: `0x${'2'.repeat(62)}`,
      numOfProcessAsParticipant: 1,
      processes: [
        {
          addressWeight: '4',
          error: 'Sequencer unavailable',
          hasVoted: false,
          isInCensus: true,
          lastVerifiedAt: '2026-03-24T18:30:00.000Z',
          processId: `0x${'2'.repeat(62)}`,
          status: 'error',
        },
      ],
      status: 'error',
      votesCasted: 0,
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
          messagesInTargetChannel: 1,
          userId: '111111111111111111',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          displayName: 'Quest Master',
          isInTargetServer: true,
          messagesInTargetChannel: 1,
          userId: '111111111111111111',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          displayName: 'Quest Master',
          isInTargetServer: true,
          messagesInTargetChannel: 1,
          userId: '111111111111111111',
          username: 'questmaster',
        })
        .mockResolvedValueOnce({
          displayName: 'Duplicate Quest',
          isInTargetServer: true,
          messagesInTargetChannel: 1,
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
    expect(discordDependencies.fetchUserStats).toHaveBeenCalledWith({
      accessToken: 'discord-access-token',
      botToken: baseConfig.discord.botToken,
      channelId: baseConfig.discord.targetChannelId,
      guildId: baseConfig.discord.guildId,
    })
    expect(JSON.parse(meResponse.body).stats.discord).toEqual({
      isInTargetServer: true,
      messagesInTargetChannel: 1,
    })
    expect(JSON.parse(meResponse.body).identities.discord).toMatchObject({
      connected: true,
      displayName: 'Quest Master',
      stats: {
        isInTargetServer: true,
        messagesInTargetChannel: 1,
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
            messagesInTargetChannel: 1,
            userId: '111111111111111111',
            username: 'questmaster',
          })
          .mockResolvedValueOnce({
            displayName: 'Quest Master',
            isInTargetServer: true,
            messagesInTargetChannel: 1,
            userId: '111111111111111111',
            username: 'questmaster',
          })
          .mockResolvedValueOnce({
            displayName: 'Quest Master Redux',
            isInTargetServer: false,
            messagesInTargetChannel: 1,
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
      botToken: baseConfig.discord.botToken,
      guildId: baseConfig.discord.guildId,
      channelId: baseConfig.discord.targetChannelId,
    })
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(2, {
      accessToken: 'new-access-token',
      botToken: baseConfig.discord.botToken,
      guildId: baseConfig.discord.guildId,
      channelId: baseConfig.discord.targetChannelId,
    })
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(3, {
      accessToken: 'new-access-token',
      botToken: baseConfig.discord.botToken,
      guildId: baseConfig.discord.guildId,
      channelId: baseConfig.discord.targetChannelId,
    })
    expect(dependencies.discord.fetchUserStats).toHaveBeenNthCalledWith(4, {
      accessToken: 'new-access-token',
      botToken: baseConfig.discord.botToken,
      guildId: baseConfig.discord.guildId,
      channelId: baseConfig.discord.targetChannelId,
    })
    expect(JSON.parse(firstMeResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master',
      error: null,
      stats: {
        isInTargetServer: true,
        messagesInTargetChannel: 1,
      },
      status: 'active',
      username: 'questmaster',
    })
    expect(JSON.parse(secondMeResponse.body).identities.discord).toMatchObject({
      displayName: 'Quest Master Redux',
      error: null,
      stats: {
        isInTargetServer: false,
        messagesInTargetChannel: 1,
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
        discordLastKnownMessagesInTargetChannel: 9,
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
        messagesInTargetChannel: 9,
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
    expect(dependencies.github.fetchUserStats).toHaveBeenNthCalledWith(3, {
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
      status: 'reauth_required',
      username: 'questmaster',
    })
  })

  it('recomputes Telegram stats on every /api/me request and preserves the last known membership on errors', async () => {
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
        isInTargetChannel: true,
      },
      userId: '222222222',
      username: 'questcaptain',
    })
  })

  it('uses cached onchain stats until the snapshot becomes stale, then falls back to defaults on refresh errors', async () => {
    const account = privateKeyToAccount(
      '0x59c6995e998f97a5a0044966f0945382d7e95aace3c46f9b8d401327582f5ea5',
    )
    const store = createMemoryStore()
    let currentTime = new Date('2026-03-24T18:00:00.000Z').getTime()
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
      now: () => currentTime,
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
    currentTime += 16 * 60 * 1000
    const secondMeResponse = await performRequest(server, {
      headers: {
        cookie: sessionCookie ?? '',
      },
      method: 'GET',
      url: '/api/me',
    })

    expect(onchain.fetchUserStats).toHaveBeenNthCalledWith(1, account.address)
    expect(onchain.fetchUserStats).toHaveBeenNthCalledWith(2, account.address)
    expect(JSON.parse(firstMeResponse.body).stats.onchain).toMatchObject({
      error: null,
      numberOfProcesses: 3,
      totalVotes: '44',
    })
    expect(JSON.parse(secondMeResponse.body).stats.onchain).toMatchObject({
      error: 'RPC rate limited.',
      numberOfProcesses: 0,
      totalVotes: '0',
    })
  })
})
