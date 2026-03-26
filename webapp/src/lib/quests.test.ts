import { describe, expect, it } from 'vitest'
import {
  buildQuestAchievementContext,
  evaluateQuestAchievement,
} from './quests'

describe('quest achievement helpers', () => {
  it('evaluates nested quest achievements against the profile stats context', () => {
    const context = buildQuestAchievementContext({
      identities: {
        discord: {
          connected: true,
          displayName: null,
          error: null,
          stats: {
            isInTargetServer: true,
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
        numberOfProcesses: 0,
        totalVotes: '0',
      },
      wallet: {
        address: '0x123400000000000000000000000000000000abcd',
      },
    })

    expect(evaluateQuestAchievement('discord.isInTargetServer == true', context)).toBe(true)
    expect(
      evaluateQuestAchievement('github.targetRepositories[0].isStarred == true', context),
    ).toBe(true)
    expect(
      evaluateQuestAchievement('github.targetRepositories[1].isStarred == true', context),
    ).toBe(false)
  })
})
