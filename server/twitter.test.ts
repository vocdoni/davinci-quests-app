// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import {
  extractTwitterHandleFromAuthorUrl,
  extractTwitterTextFromOEmbedHtml,
  fetchTwitterProofTweet,
  normalizeTwitterTweetUrl,
} from './twitter.mjs'

function createJsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    json: async () => body,
    ok,
    status,
  }
}

describe('twitter backend helpers', () => {
  it('normalizes supported Twitter and X status URLs', () => {
    expect(
      normalizeTwitterTweetUrl('https://x.com/QuestTweeter/status/1234567890?s=20'),
    ).toBe('https://twitter.com/questtweeter/status/1234567890')
    expect(
      normalizeTwitterTweetUrl('https://twitter.com/i/web/status/1234567890'),
    ).toBe('https://twitter.com/i/web/status/1234567890')
  })

  it('extracts author handles and plain tweet text from the oEmbed payload', () => {
    expect(
      extractTwitterHandleFromAuthorUrl('https://twitter.com/QuestTweeter'),
    ).toBe('questtweeter')
    expect(
      extractTwitterTextFromOEmbedHtml(
        '<blockquote><p>Hello <a href="https://t.co/example">link</a><br>proof-code &amp; more</p></blockquote>',
      ),
    ).toBe('Hello link proof-code & more')
  })

  it('fetches and parses a public Twitter proof tweet from oEmbed', async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        author_name: 'Quest Tweeter',
        author_url: 'https://twitter.com/questtweeter',
        html: '<blockquote><p>proof twitter-proof-code</p></blockquote>',
      }),
    )

    const tweet = await fetchTwitterProofTweet(
      {
        tweetUrl: 'https://x.com/questtweeter/status/1234567890',
      },
      fetchImpl,
    )

    expect(tweet).toEqual({
      displayName: 'Quest Tweeter',
      normalizedTweetUrl: 'https://twitter.com/questtweeter/status/1234567890',
      text: 'proof twitter-proof-code',
      tweetId: '1234567890',
      username: 'questtweeter',
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('https://publish.twitter.com/oembed?'),
      expect.any(Object),
    )
  })
})
