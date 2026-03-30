import { describe, expect, it, vi } from 'vitest'
import { fetchDiscordUserStats } from './discord.mjs'

function createJsonResponse(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
    },
    status,
  })
}

function createMessage(id, authorId) {
  return {
    author: {
      id: authorId,
    },
    id,
  }
}

describe('fetchDiscordUserStats', () => {
  it('counts messages authored by the linked user across paginated channel history', async () => {
    const firstPage = Array.from({ length: 100 }, (_value, index) =>
      createMessage(`page-1-${index}`, index === 0 ? 'discord-user' : 'other-user'),
    )
    const secondPage = Array.from({ length: 100 }, (_value, index) =>
      createMessage(
        `page-2-${index}`,
        index === 10 || index === 99 ? 'discord-user' : 'other-user',
      ),
    )
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === 'https://discord.com/api/v10/users/@me') {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer discord-access-token',
        })

        return createJsonResponse({
          global_name: 'Quest Master',
          id: 'discord-user',
          username: 'questmaster',
        })
      }

      if (url === 'https://discord.com/api/v10/users/@me/guilds/987654321098765432/member') {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer discord-access-token',
        })

        return createJsonResponse({})
      }

      if (url === 'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100') {
        expect(options.headers).toMatchObject({
          Authorization: 'Bot discord-bot-token',
        })

        return createJsonResponse(firstPage)
      }

      if (
        url ===
        'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100&before=page-1-99'
      ) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bot discord-bot-token',
        })

        return createJsonResponse(secondPage)
      }

      if (
        url ===
        'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100&before=page-2-99'
      ) {
        expect(options.headers).toMatchObject({
          Authorization: 'Bot discord-bot-token',
        })

        return createJsonResponse([])
      }

      throw new Error(`Unexpected Discord request: ${url}`)
    })

    const stats = await fetchDiscordUserStats(
      {
        accessToken: 'discord-access-token',
        botToken: 'discord-bot-token',
        channelId: '555555555555555555',
        guildId: '987654321098765432',
      },
      fetchImpl,
    )

    const requestUrls = fetchImpl.mock.calls.map(([url]) => url)

    expect(requestUrls).toEqual([
      'https://discord.com/api/v10/users/@me',
      'https://discord.com/api/v10/users/@me/guilds/987654321098765432/member',
      'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100',
      'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100&before=page-1-99',
      'https://discord.com/api/v10/channels/555555555555555555/messages?limit=100&before=page-2-99',
    ])
    expect(stats).toEqual({
      displayName: 'Quest Master',
      isInTargetServer: true,
      messagesInTargetChannel: 3,
      userId: 'discord-user',
      username: 'questmaster',
    })
  })

  it('skips channel counting when no discord bot token is configured', async () => {
    const fetchImpl = vi.fn(async (url, options = {}) => {
      if (url === 'https://discord.com/api/v10/users/@me') {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer discord-access-token',
        })

        return createJsonResponse({
          global_name: 'Quest Master',
          id: 'discord-user',
          username: 'questmaster',
        })
      }

      if (url === 'https://discord.com/api/v10/users/@me/guilds/987654321098765432/member') {
        expect(options.headers).toMatchObject({
          Authorization: 'Bearer discord-access-token',
        })

        return createJsonResponse({})
      }

      throw new Error(`Unexpected Discord request: ${url}`)
    })

    const stats = await fetchDiscordUserStats(
      {
        accessToken: 'discord-access-token',
        channelId: '555555555555555555',
        guildId: '987654321098765432',
      },
      fetchImpl,
    )

    const requestUrls = fetchImpl.mock.calls.map(([url]) => url)

    expect(requestUrls).toEqual([
      'https://discord.com/api/v10/users/@me',
      'https://discord.com/api/v10/users/@me/guilds/987654321098765432/member',
    ])
    expect(stats).toEqual({
      displayName: 'Quest Master',
      isInTargetServer: true,
      messagesInTargetChannel: null,
      userId: 'discord-user',
      username: 'questmaster',
    })
  })
})
