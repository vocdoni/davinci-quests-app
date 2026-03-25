// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { loadQuestCatalog, normalizeQuestCatalog } from './quests.mjs'

describe('quest catalog helpers', () => {
  it('loads the bundled quest catalog from JSON', () => {
    expect(loadQuestCatalog()).toEqual({
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

  it('rejects invalid quest catalogs', () => {
    expect(() =>
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: '',
            description: 'desc',
            id: 1,
            points: 10,
            title: 'title',
          },
        ],
      }),
    ).toThrow('must define an achievement expression')
  })
})
