// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { parseServerConfig } from './config.mjs'

function createEnv(overrides = {}) {
  return {
    APP_SESSION_SECRET: 'super-secret',
    DISCORD_CLIENT_ID: '123456789012345678',
    DISCORD_CLIENT_SECRET: 'discord-client-secret',
    DISCORD_GUILD_ID: '987654321098765432',
    DISCORD_REDIRECT_URI: 'https://api.example.org/api/connections/discord/callback',
    FRONTEND_APP_URL: 'https://app.example.org',
    MONGODB_DB_NAME: 'quests-dashboard',
    MONGODB_URI: 'mongodb://mongo:27017/quests-dashboard',
    ONCHAIN_PROCESS_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000001',
    ONCHAIN_PROCESS_REGISTRY_START_BLOCK: '12345',
    ONCHAIN_RPC_URL: 'https://rpc.example.org',
    PROVIDER_TOKEN_ENCRYPTION_SECRET: 'provider-secret',
    TELEGRAM_APP_JWT_SECRET: 'telegram-secret',
    TELEGRAM_BOT_TOKEN: '123456:telegram-bot-token',
    TELEGRAM_CHANNEL_USERNAME: 'quest_channel',
    TELEGRAM_CLIENT_ID: '123456',
    TELEGRAM_CLIENT_SECRET: 'telegram-client-secret',
    TELEGRAM_REDIRECT_URI: 'https://api.example.org/api/connections/telegram/callback',
    ...overrides,
  }
}

describe('parseServerConfig', () => {
  it('parses the expected backend environment variables', () => {
    const config = parseServerConfig(createEnv())

    expect(config).toMatchObject({
      appSessionSecret: 'super-secret',
      discord: {
        clientId: '123456789012345678',
        clientSecret: 'discord-client-secret',
        guildId: '987654321098765432',
        redirectUri: 'https://api.example.org/api/connections/discord/callback',
      },
      frontendAppUrl: 'https://app.example.org/',
      frontendOrigin: 'https://app.example.org',
      mongo: {
        dbName: 'quests-dashboard',
        uri: 'mongodb://mongo:27017/quests-dashboard',
      },
      onchain: {
        contractAddress: '0x0000000000000000000000000000000000000001',
        rpcUrl: 'https://rpc.example.org/',
        startBlock: 12345n,
        statsTtlSeconds: 300,
      },
      providerTokenEncryptionSecret: 'provider-secret',
      telegram: {
        botToken: '123456:telegram-bot-token',
        channelUsername: '@quest_channel',
        clientId: '123456',
        clientSecret: 'telegram-client-secret',
        jwtSecret: 'telegram-secret',
        redirectUri: 'https://api.example.org/api/connections/telegram/callback',
      },
    })
  })

  it('reports all missing backend variables together', () => {
    expect(() => parseServerConfig({})).toThrow(
      'Missing required environment variables: APP_SESSION_SECRET, DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, DISCORD_REDIRECT_URI, FRONTEND_APP_URL, MONGODB_DB_NAME, MONGODB_URI, ONCHAIN_PROCESS_REGISTRY_ADDRESS, ONCHAIN_PROCESS_REGISTRY_START_BLOCK, ONCHAIN_RPC_URL, PROVIDER_TOKEN_ENCRYPTION_SECRET, TELEGRAM_APP_JWT_SECRET, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_USERNAME, TELEGRAM_CLIENT_ID, TELEGRAM_CLIENT_SECRET, TELEGRAM_REDIRECT_URI',
    )
  })
})
