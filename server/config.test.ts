// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseTelegramApiConfig } from './index.mjs'

function createEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    TELEGRAM_APP_JWT_SECRET: 'super-secret',
    TELEGRAM_BOT_TOKEN: '123456:telegram-bot-token',
    TELEGRAM_CHANNEL_USERNAME: 'quest_channel',
    TELEGRAM_CLIENT_ID: '123456',
    TELEGRAM_CLIENT_SECRET: 'telegram-client-secret',
    TELEGRAM_REDIRECT_URI: 'https://api.example.org/api/telegram/auth/callback',
    ...overrides,
  }
}

describe('parseTelegramApiConfig', () => {
  it('falls back to the Discord redirect origin when FRONTEND_APP_URL is missing', () => {
    const config = parseTelegramApiConfig(
      createEnv({
        VITE_DISCORD_REDIRECT_URI: 'http://localhost:5173/discord',
      }),
    )

    expect(config.frontendAppUrl).toBe('http://localhost:5173/')
    expect(config.frontendOrigin).toBe('http://localhost:5173')
  })

  it('reports all missing Telegram backend variables together', () => {
    expect(() =>
      parseTelegramApiConfig({
        VITE_DISCORD_REDIRECT_URI: 'http://localhost:5173/discord',
      }),
    ).toThrow(
      'Missing required environment variables: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_USERNAME, TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, TELEGRAM_APP_JWT_SECRET, TELEGRAM_REDIRECT_URI',
    )
  })
})
