// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { loadQuestCatalog } from './quests.mjs'
import { buildScoreSnapshot, buildScoreSnapshotFromLocalState } from './scoring.mjs'

const questCatalog = loadQuestCatalog()

describe('buildScoreSnapshot', () => {
  it('computes supporter, builder, and total points from the current quest catalog', () => {
    const score = buildScoreSnapshot(
      questCatalog,
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: true,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: true,
              isOlderThanOneYear: true,
              publicNonForkRepositoryCount: 12,
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
          },
          telegram: {
            stats: {
              isInTargetChannel: true,
            },
          },
          twitter: {
            stats: {},
          },
        },
        onchain: {
          error: null,
          numberOfProcesses: 3,
          totalVotes: '45',
        },
      },
      1_000_000,
    )

    expect(score).toEqual({
      builderCompletedCount: 1,
      builderCompletedQuestIds: [1],
      buildersPoints: 25,
      lastComputedAt: new Date(1_000_000),
      supporterCompletedCount: 5,
      supporterCompletedQuestIds: [1, 2, 9, 12, 13],
      supportersPoints: 340,
      totalPoints: 365,
    })
  })

  it('does not crash when onchain data contains an error state', () => {
    const score = buildScoreSnapshot(
      questCatalog,
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: false,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: 'vocdoni',
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: null,
            },
          },
          twitter: {
            stats: {},
          },
        },
        onchain: {
          error: 'RPC unavailable',
          numberOfProcesses: 0,
          totalVotes: '0',
        },
      },
      1_000_000,
    )

    expect(score.totalPoints).toBe(0)
    expect(score.builderCompletedQuestIds).toEqual([])
    expect(score.supporterCompletedQuestIds).toEqual([])
  })

  it('supports numeric achievement comparisons for Discord message counts', () => {
    const score = buildScoreSnapshot(
      {
        builders: [],
        supporters: [
          {
            achievement: 'discord.messagesInTargetChannel >= 2',
            description: 'Send at least two messages in the target channel.',
            id: 1,
            points: 25,
            title: 'Chat in Discord',
          },
        ],
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: true,
              messagesInTargetChannel: 3,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: null,
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: null,
            },
          },
          twitter: {
            stats: {},
          },
        },
        onchain: {
          error: null,
          numberOfProcesses: 3,
          totalVotes: '0',
        },
      },
      1_000_000,
    )

    expect(score.supporterCompletedQuestIds).toEqual([1])
    expect(score.supportersPoints).toBe(25)
  })

  it('supports sequencer achievement comparisons', () => {
    const score = buildScoreSnapshot(
      {
        builders: [],
        supporters: [
          {
            achievement: 'sequencer.hasVoted == true',
            description: 'Vote in the verified process.',
            id: 1,
            points: 15,
            title: 'Vote in sequencer',
          },
          {
            achievement: 'sequencer.isInCensus == true',
            description: 'Be registered in the process census.',
            id: 2,
            points: 20,
            title: 'Join the census',
          },
        ],
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: false,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: 'vocdoni',
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: null,
            },
          },
          twitter: {
            stats: {},
          },
        },
        onchain: {
          error: null,
          numberOfProcesses: 0,
          totalVotes: '0',
        },
        sequencer: {
          addressWeight: '3',
          error: null,
          hasVoted: true,
          isConnected: true,
          isInCensus: true,
          lastVerifiedAt: '2026-03-24T18:00:00.000Z',
          processId: `0x${'1'.repeat(62)}`,
          status: 'verified',
        },
      },
      1_000_000,
    )

    expect(score.supporterCompletedQuestIds).toEqual([1, 2])
    expect(score.supportersPoints).toBe(35)
  })

  it('supports quest summary arithmetic during local score rebuilds', () => {
    const score = buildScoreSnapshotFromLocalState(
      {
        builders: [],
        supporters: [
          {
            achievement: 'telegram.isInTargetChannel == true',
            description: 'Join the Telegram channel.',
            id: 1,
            points: 20,
            title: 'Join Telegram',
          },
          {
            achievement: 'discord.isInTargetServer == true',
            description: 'Join the Discord server.',
            id: 2,
            points: 20,
            title: 'Join Discord',
          },
          {
            achievement: 'onchain.isConnected == true',
            description: 'Sign in with the wallet.',
            id: 3,
            points: 25,
            title: 'Sign in',
          },
          {
            achievement: 'onchain.numberOfProcesses >= 3',
            description: 'Create three processes.',
            id: 9,
            points: 100,
            title: 'Create processes',
          },
          {
            achievement: 'quests.supporters.completed == quests.supporters.total - 1',
            description: 'Complete all but one supporter quest.',
            id: 14,
            points: 10,
            title: 'Quest summary',
          },
        ],
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: true,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: null,
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: true,
            },
          },
          twitter: {
            stats: {},
          },
        },
        lastAuthenticatedAt: new Date('2026-03-24T18:00:00.000Z'),
        onchain: {
          error: null,
          numberOfProcesses: 3,
          totalVotes: '0',
        },
        score: {
          builderCompletedCount: 0,
          builderCompletedQuestIds: [],
          buildersPoints: 0,
          lastComputedAt: null,
          supporterCompletedCount: 4,
          supporterCompletedQuestIds: [1, 2, 3, 9],
          supportersPoints: 165,
          totalPoints: 165,
        },
      },
      undefined,
      1_000_000,
    )

    expect(score.supporterCompletedQuestIds).toEqual([1, 2, 3, 9, 14])
    expect(score.supportersPoints).toBe(175)
  })

  it('keeps the quest-summary quest completed on subsequent score rebuilds', () => {
    const score = buildScoreSnapshotFromLocalState(
      {
        builders: [],
        supporters: [
          {
            achievement: 'telegram.isInTargetChannel == true',
            description: 'Join the Telegram channel.',
            id: 1,
            points: 20,
            title: 'Join Telegram',
          },
          {
            achievement: 'discord.isInTargetServer == true',
            description: 'Join the Discord server.',
            id: 2,
            points: 20,
            title: 'Join Discord',
          },
          {
            achievement: 'onchain.isConnected == true',
            description: 'Sign in with the wallet.',
            id: 3,
            points: 25,
            title: 'Sign in',
          },
          {
            achievement: 'onchain.numberOfProcesses >= 3',
            description: 'Create three processes.',
            id: 9,
            points: 100,
            title: 'Create processes',
          },
          {
            achievement: 'quests.supporters.completed == quests.supporters.total - 1',
            description: 'Complete all but one supporter quest.',
            id: 14,
            points: 100,
            title: 'Quest summary',
          },
        ],
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: true,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: null,
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: true,
            },
          },
          twitter: {
            stats: {},
          },
        },
        lastAuthenticatedAt: new Date('2026-03-24T18:00:00.000Z'),
        onchain: {
          error: null,
          numberOfProcesses: 3,
          totalVotes: '0',
        },
        score: {
          builderCompletedCount: 0,
          builderCompletedQuestIds: [],
          buildersPoints: 0,
          lastComputedAt: null,
          supporterCompletedCount: 5,
          supporterCompletedQuestIds: [1, 2, 3, 9, 14],
          supportersPoints: 265,
          totalPoints: 265,
        },
      },
      {
        builderCompletedCount: 0,
        builderCompletedQuestIds: [],
        buildersPoints: 0,
        lastComputedAt: null,
        supporterCompletedCount: 5,
        supporterCompletedQuestIds: [1, 2, 3, 9, 14],
        supportersPoints: 265,
        totalPoints: 265,
      },
      1_000_000,
    )

    expect(score.supporterCompletedQuestIds).toEqual([1, 2, 3, 9, 14])
    expect(score.supportersPoints).toBe(265)
  })

  it('completes the onchain quest when the profile has a validated wallet session', () => {
    const score = buildScoreSnapshot(
      {
        builders: [],
        supporters: [
          {
            achievement: 'onchain.isConnected == true',
            description: 'Sign in with the wallet.',
            id: 1,
            points: 20,
            title: 'Complete DAVINCI Quest Profile',
          },
        ],
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: null,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: null,
              isOlderThanOneYear: null,
              publicNonForkRepositoryCount: null,
              targetOrganization: null,
              targetRepositories: [],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: null,
            },
          },
          twitter: {
            stats: {},
          },
        },
        lastAuthenticatedAt: new Date('2026-03-24T18:00:00.000Z'),
        onchain: {
          error: null,
          numberOfProcesses: 0,
          totalVotes: '0',
        },
      },
      1_000_000,
    )

    expect(score.supporterCompletedQuestIds).toEqual([1])
    expect(score.supportersPoints).toBe(20)
  })

  it('recomputes total points from cached local stats when quest points change', () => {
    const score = buildScoreSnapshotFromLocalState(
      {
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
      },
      {
        identities: {
          discord: {
            stats: {
              isInTargetServer: null,
              messagesInTargetChannel: null,
            },
          },
          github: {
            stats: {
              isFollowingTargetOrganization: true,
              isOlderThanOneYear: true,
              publicNonForkRepositoryCount: 8,
              targetOrganization: 'vocdoni',
              targetRepositories: [
                {
                  fullName: 'vocdoni/davinciNode',
                  isStarred: true,
                },
              ],
            },
          },
          telegram: {
            stats: {
              isInTargetChannel: true,
            },
          },
          twitter: {
            stats: {},
          },
        },
        lastAuthenticatedAt: new Date('2026-03-24T18:00:00.000Z'),
        onchain: {
          error: null,
          numberOfProcesses: 0,
          totalVotes: '0',
        },
      },
      {
        builderCompletedCount: 1,
        builderCompletedQuestIds: [1],
        buildersPoints: 25,
        lastComputedAt: new Date('2026-03-24T17:00:00.000Z'),
        supporterCompletedCount: 2,
        supporterCompletedQuestIds: [2, 3],
        supportersPoints: 35,
        totalPoints: 60,
      },
      1_000_000,
    )

    expect(score).toEqual({
      builderCompletedCount: 1,
      builderCompletedQuestIds: [1],
      buildersPoints: 50,
      lastComputedAt: new Date(1_000_000),
      supporterCompletedCount: 2,
      supporterCompletedQuestIds: [2, 3],
      supportersPoints: 40,
      totalPoints: 90,
    })
  })
})
