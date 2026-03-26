import { describe, expect, it } from 'vitest'
import { parseLinkFeedback } from './useAppSession'

describe('parseLinkFeedback', () => {
  it('parses GitHub callback feedback', () => {
    expect(parseLinkFeedback('#link_provider=github&link_status=success')).toEqual({
      error: null,
      provider: 'github',
      status: 'success',
    })
  })

  it('returns null for unsupported providers', () => {
    expect(parseLinkFeedback('#link_provider=unknown&link_status=success')).toBeNull()
  })
})
