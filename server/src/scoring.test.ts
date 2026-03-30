// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { loadQuestCatalog } from './quests.mjs'
import { buildScoreSnapshot } from './scoring.mjs'

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
      buildersPoints: 320,
      lastComputedAt: new Date(1_000_000),
      supporterCompletedCount: 1,
      supporterCompletedQuestIds: [1],
      supportersPoints: 100,
      totalPoints: 420,
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
})
