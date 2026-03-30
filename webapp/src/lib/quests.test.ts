import { describe, expect, it } from 'vitest'
import {
  buildQuestAchievementContext,
  buildQuestStatsSummary,
  evaluateQuestAchievement,
  getQuestProgressHint,
  getQuestRequirementSource,
} from './quests'

describe('quest achievement helpers', () => {
  it('evaluates nested quest achievements against the profile stats context', () => {
    const context = buildQuestAchievementContext(
      {
        identities: {
          discord: {
            connected: true,
            displayName: null,
            error: null,
            stats: {
              isInTargetServer: true,
              messagesInTargetChannel: 3,
            },
            status: 'active',
            userId: 'discord-user',
            username: 'discord-user',
          },
          github: {
            connected: true,
            displayName: null,
            error: null,
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
                {
                  fullName: 'vocdoni/davinciSDK',
                  isStarred: false,
                },
              ],
            },
            status: 'active',
            userId: 'github-user',
            username: 'github-user',
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
          isConnected: true,
          numberOfProcesses: 0,
          totalVotes: '0',
        },
        sequencer: {
          addressWeight: null,
          error: null,
          hasVoted: null,
          isConnected: false,
          isInCensus: null,
          lastVerifiedAt: null,
          processId: null,
          processes: [],
          numOfProcessAsParticipant: 0,
          status: 'unverified',
          votesCasted: 0,
        },
        score: {
          builderCompletedCount: 1,
          builderCompletedQuestIds: [1],
          buildersPoints: 25,
          lastComputedAt: null,
          supporterCompletedCount: 3,
          supporterCompletedQuestIds: [2, 3, 9],
          supportersPoints: 145,
          totalPoints: 170,
        },
        wallet: {
          address: '0x123400000000000000000000000000000000abcd',
          ensName: null,
        },
      },
      {
        builders: [
          {
            achievement: 'github.targetRepositories[0].isStarred == true',
            description: 'Star the first repo.',
            id: 1,
            points: 25,
            title: 'Star repo 1',
          },
          {
            achievement: 'github.targetRepositories[1].isStarred == true',
            description: 'Star the second repo.',
            id: 2,
            points: 25,
            title: 'Star repo 2',
          },
        ],
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
        ],
      },
    )

    expect(evaluateQuestAchievement('discord.isInTargetServer == true', context)).toBe(true)
    expect(
      evaluateQuestAchievement('discord.messagesInTargetChannel >= 2', context),
    ).toBe(true)
    expect(
      evaluateQuestAchievement('github.targetRepositories[0].isStarred == true', context),
    ).toBe(true)
    expect(
      evaluateQuestAchievement('github.targetRepositories[1].isStarred == true', context),
    ).toBe(false)
    expect(evaluateQuestAchievement('onchain.isConnected == true', context)).toBe(true)
    expect(
      evaluateQuestAchievement('quests.supporters.completed == quests.supporters.total - 1', context),
    ).toBe(true)
    expect(evaluateQuestAchievement('quests.builders.points == 25', context)).toBe(true)
  })

  it('derives remaining progress for numeric quest achievements', () => {
    const context = buildQuestAchievementContext(
      {
        identities: {
          discord: {
            connected: true,
            displayName: null,
            error: null,
            stats: {
              isInTargetServer: true,
              messagesInTargetChannel: 3,
            },
            status: 'active',
            userId: 'discord-user',
            username: 'discord-user',
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
              targetRepositories: [],
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
          isConnected: false,
          numberOfProcesses: 0,
          totalVotes: '14',
        },
        sequencer: {
          addressWeight: null,
          error: null,
          hasVoted: null,
          isConnected: false,
          isInCensus: null,
          lastVerifiedAt: null,
          processId: null,
          processes: [],
          numOfProcessAsParticipant: 0,
          status: 'unverified',
          votesCasted: 0,
        },
        score: {
          builderCompletedCount: 0,
          builderCompletedQuestIds: [],
          buildersPoints: 0,
          lastComputedAt: null,
          supporterCompletedCount: 0,
          supporterCompletedQuestIds: [],
          supportersPoints: 0,
          totalPoints: 0,
        },
        wallet: {
          address: '0x123400000000000000000000000000000000abcd',
          ensName: null,
        },
      },
      {
        builders: [],
        supporters: [],
      },
    )

    expect(getQuestProgressHint('discord.messagesInTargetChannel >= 5', context)).toEqual({
      current: 3,
      remaining: 2,
      required: 5,
    })
    expect(getQuestProgressHint('onchain.totalVotes >= 15', context)).toEqual({
      current: 14,
      remaining: 1,
      required: 15,
    })
    expect(getQuestProgressHint('discord.isInTargetServer == true', context)).toBeNull()
  })

  it('infers the quest source from the achievement expression', () => {
    expect(getQuestRequirementSource('discord.isInTargetServer == true')).toBe('discord')
    expect(
      getQuestRequirementSource('github.targetRepositories[0].isStarred == true'),
    ).toBe('github')
    expect(getQuestRequirementSource('sequencer.hasVoted == true')).toBe('sequencer')
    expect(getQuestRequirementSource('stats.condition >= 10')).toBeNull()
  })

  it('counts completed quests, total quests and points for each role', () => {
    const stats = buildQuestStatsSummary(
      {
        identities: {
          discord: {
            connected: true,
            displayName: null,
            error: null,
            stats: {
              isInTargetServer: true,
              messagesInTargetChannel: null,
            },
            status: 'active',
            userId: 'discord-user',
            username: 'discord-user',
          },
          github: {
            connected: true,
            displayName: null,
            error: null,
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
                {
                  fullName: 'vocdoni/davinciSDK',
                  isStarred: false,
                },
              ],
            },
            status: 'active',
            userId: 'github-user',
            username: 'github-user',
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
          isConnected: true,
          numberOfProcesses: 3,
          totalVotes: '0',
        },
        sequencer: {
          addressWeight: null,
          error: null,
          hasVoted: null,
          isConnected: false,
          isInCensus: null,
          lastVerifiedAt: null,
          processId: null,
          processes: [],
          numOfProcessAsParticipant: 0,
          status: 'unverified',
          votesCasted: 0,
        },
        score: {
          builderCompletedCount: 1,
          builderCompletedQuestIds: [1],
          buildersPoints: 25,
          lastComputedAt: null,
          supporterCompletedCount: 3,
          supporterCompletedQuestIds: [2, 3, 9],
          supportersPoints: 145,
          totalPoints: 170,
        },
        wallet: {
          address: '0x123400000000000000000000000000000000abcd',
          ensName: null,
        },
      },
      {
        builders: [
          {
            achievement: 'github.targetRepositories[0].isStarred == true',
            description: 'Star the first repo.',
            id: 1,
            points: 25,
            title: 'Star repo 1',
          },
          {
            achievement: 'github.targetRepositories[1].isStarred == true',
            description: 'Star the second repo.',
            id: 2,
            points: 25,
            title: 'Star repo 2',
          },
        ],
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
        ],
      },
    )

    expect(stats).toEqual({
      builders: {
        completed: 1,
        points: 25,
        total: 2,
      },
      supporters: {
        completed: 3,
        points: 145,
        total: 4,
      },
    })
  })
})
