// @vitest-environment node

import { mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { loadQuestCatalog, normalizeQuestCatalog } from './quests.mjs'

describe('quest catalog helpers', () => {
  it('loads the bundled quest catalog from JSON', () => {
    const catalog = loadQuestCatalog()

    expect(catalog.builders).toHaveLength(2)
    expect(catalog.supporters).toHaveLength(14)
    expect(catalog.supporters.find((quest) => quest.id === 6)).toMatchObject({
      achievement: 'sequencer.votesCasted >= 5',
      callToAction: {
        icon: 'BadgeCheck',
        title: 'Verify a vote',
        url: '/profile/sequencer',
      },
      connectButton: {
        icon: 'Compass',
        title: 'Explore AskTheWorld processes',
        url: 'https://asktheworld.davinci.ninja/explore',
      },
    })
    expect(catalog.supporters.find((quest) => quest.id === 14)).toMatchObject({
      achievement: 'quests.supporters.completed == quests.supporters.total - 1',
      id: 14,
      points: 100,
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

  it('loads a custom quest catalog from an env-style file path', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'quests-catalog-'))
    const customCatalogPath = join(tempDir, 'quests.json')

    writeFileSync(
      customCatalogPath,
      JSON.stringify({
        builders: [],
        supporters: [
          {
            achievement: 'discord.isInTargetServer == true',
            callToAction: {
              help: 'Open the community page to join.',
              icon: 'Discord',
              title: 'Join now',
              url: 'https://example.org/join',
            },
            description: 'Custom supporter quest',
            id: 1,
            points: 25,
            title: 'Custom supporter quest',
          },
        ],
      }),
    )

    expect(loadQuestCatalog(customCatalogPath)).toEqual({
      builders: [],
      supporters: [
        {
          achievement: 'discord.isInTargetServer == true',
          callToAction: {
            help: 'Open the community page to join.',
            icon: 'Discord',
            title: 'Join now',
            url: 'https://example.org/join',
          },
          description: 'Custom supporter quest',
          id: 1,
          points: 25,
          title: 'Custom supporter quest',
        },
      ],
    })
  })

  it('accepts relative quest call to action routes', () => {
    expect(
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: 'sequencer.votesCasted >= 1',
            callToAction: {
              help: 'Open the sequencer page.',
              icon: 'Map',
              title: 'Verify process',
              url: '/profile/sequencer',
            },
            description: 'Quest with an internal route CTA',
            id: 1,
            points: 10,
            title: 'Quest with route CTA',
          },
        ],
      }),
    ).toEqual({
      builders: [],
      supporters: [
        {
          achievement: 'sequencer.votesCasted >= 1',
          callToAction: {
            help: 'Open the sequencer page.',
            icon: 'Map',
            title: 'Verify process',
            url: '/profile/sequencer',
          },
          description: 'Quest with an internal route CTA',
          id: 1,
          points: 10,
          title: 'Quest with route CTA',
        },
      ],
    })
  })

  it('accepts relative quest connect button routes', () => {
    expect(
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: 'discord.isInTargetServer == true',
            connectButton: {
              icon: 'UserPlus',
              title: 'Open profile',
              url: '/profile/sequencer',
            },
            description: 'Quest with a connect button',
            id: 1,
            points: 10,
            title: 'Quest with connect button',
          },
        ],
      }),
    ).toEqual({
      builders: [],
      supporters: [
        {
          achievement: 'discord.isInTargetServer == true',
          connectButton: {
            icon: 'UserPlus',
            title: 'Open profile',
            url: '/profile/sequencer',
          },
          description: 'Quest with a connect button',
          id: 1,
          points: 10,
          title: 'Quest with connect button',
        },
      ],
    })
  })

  it('normalizes optional quest call to actions', () => {
    expect(
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: 'discord.isInTargetServer == true',
            callToAction: {
              help: 'Optional helper copy',
              title: 'Open link',
              url: 'https://example.org/path',
            },
            description: 'Quest with a CTA',
            id: 1,
            points: 10,
            title: 'Quest with CTA',
          },
        ],
      }),
    ).toEqual({
      builders: [],
      supporters: [
        {
          achievement: 'discord.isInTargetServer == true',
          callToAction: {
            help: 'Optional helper copy',
            title: 'Open link',
            url: 'https://example.org/path',
          },
          description: 'Quest with a CTA',
          id: 1,
          points: 10,
          title: 'Quest with CTA',
        },
      ],
    })
  })

  it('preserves disabled quests in the normalized catalog', () => {
    expect(
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: 'discord.isInTargetServer == true',
            disabled: true,
            description: 'Disabled quest',
            id: 1,
            points: 10,
            title: 'Disabled quest',
          },
        ],
      }),
    ).toEqual({
      builders: [],
      supporters: [
        {
          achievement: 'discord.isInTargetServer == true',
          description: 'Disabled quest',
          disabled: true,
          id: 1,
          points: 10,
          title: 'Disabled quest',
        },
      ],
    })
  })

  it('rejects non-boolean disabled flags', () => {
    expect(() =>
      normalizeQuestCatalog({
        builders: [],
        supporters: [
          {
            achievement: 'discord.isInTargetServer == true',
            description: 'Disabled quest',
            disabled: 'true',
            id: 1,
            points: 10,
            title: 'Disabled quest',
          },
        ],
      }),
    ).toThrow('disabled must be a boolean')
  })

  it('falls back to the bundled catalog for the legacy ./src/quests.json path', () => {
    expect(loadQuestCatalog('./src/quests.json')).toEqual(loadQuestCatalog())
  })
})
