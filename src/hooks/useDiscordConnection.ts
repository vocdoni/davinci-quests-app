import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AppConfig } from '../config'
import {
  buildDiscordAuthorizationUrl,
  createDiscordOAuthState,
  createDiscordSessionFromCallback,
  DiscordApiError,
  fetchDiscordUserStats,
  isDiscordSessionExpired,
  parseDiscordOAuthCallback,
  type DiscordSession,
} from '../lib/discord'

const DISCORD_SESSION_STORAGE_PREFIX = 'quests-dashboard.discord.session'
const DISCORD_STATE_STORAGE_PREFIX = 'quests-dashboard.discord.state'

type DiscordBootstrapState = {
  authError: string | null
  session: DiscordSession | null
  shouldClearHash: boolean
  shouldClearStoredSession: boolean
  shouldClearStoredState: boolean
  shouldPersistSession: boolean
}

function getSessionStorageKey(clientId: string) {
  return `${DISCORD_SESSION_STORAGE_PREFIX}:${clientId}`
}

function getStateStorageKey(clientId: string) {
  return `${DISCORD_STATE_STORAGE_PREFIX}:${clientId}`
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage)
}

function isDiscordSession(value: unknown): value is DiscordSession {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'accessToken' in value &&
      typeof value.accessToken === 'string' &&
      'expiresAt' in value &&
      typeof value.expiresAt === 'number' &&
      'scope' in value &&
      typeof value.scope === 'string' &&
      'tokenType' in value &&
      typeof value.tokenType === 'string',
  )
}

function readStoredDiscordSession(clientId: string) {
  if (!canUseSessionStorage()) {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(getSessionStorageKey(clientId))
    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    return isDiscordSession(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function writeStoredDiscordSession(clientId: string, session: DiscordSession) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.setItem(
    getSessionStorageKey(clientId),
    JSON.stringify(session),
  )
}

function clearStoredDiscordSession(clientId: string) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.removeItem(getSessionStorageKey(clientId))
}

function readStoredDiscordState(clientId: string) {
  if (!canUseSessionStorage()) {
    return null
  }

  return window.sessionStorage.getItem(getStateStorageKey(clientId))
}

function writeStoredDiscordState(clientId: string, state: string) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.setItem(getStateStorageKey(clientId), state)
}

function clearStoredDiscordState(clientId: string) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.removeItem(getStateStorageKey(clientId))
}

function clearOAuthHash() {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState(
    null,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  )
}

function bootstrapDiscordState(clientId: string): DiscordBootstrapState {
  let session = readStoredDiscordSession(clientId)
  let authError: string | null = null
  let shouldClearHash = false
  let shouldClearStoredSession = false
  let shouldClearStoredState = false
  let shouldPersistSession = false

  if (session && isDiscordSessionExpired(session)) {
    session = null
    shouldClearStoredSession = true
  }

  if (typeof window === 'undefined') {
    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldClearStoredState,
      shouldPersistSession,
    }
  }

  const callback = parseDiscordOAuthCallback(window.location.hash)

  if (!callback) {
    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldClearStoredState,
      shouldPersistSession,
    }
  }

  shouldClearHash = true

  if (callback.kind === 'error') {
    session = null
    authError =
      callback.payload.errorDescription ??
      'Discord login was cancelled or could not be completed.'
    shouldClearStoredSession = true
    shouldClearStoredState = true

    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldClearStoredState,
      shouldPersistSession,
    }
  }

  const expectedState = readStoredDiscordState(clientId)
  shouldClearStoredState = true

  if (!expectedState || expectedState !== callback.payload.state) {
    session = null
    authError = 'Discord login could not be verified. Please try again.'
    shouldClearStoredSession = true

    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldClearStoredState,
      shouldPersistSession,
    }
  }

  session = createDiscordSessionFromCallback(callback.payload)

  if (isDiscordSessionExpired(session)) {
    session = null
    authError = 'Discord login expired before it could be used.'
    shouldClearStoredSession = true

    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldClearStoredState,
      shouldPersistSession,
    }
  }

  shouldPersistSession = true

  return {
    authError,
    session,
    shouldClearHash,
    shouldClearStoredSession,
    shouldClearStoredState,
    shouldPersistSession,
  }
}

export function useDiscordConnection(config: AppConfig) {
  const clientId = config.discord.clientId
  const [bootstrapState] = useState(() => bootstrapDiscordState(clientId))
  const [session, setSession] = useState<DiscordSession | null>(
    bootstrapState.session,
  )
  const [authError, setAuthError] = useState<string | null>(bootstrapState.authError)
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    if (bootstrapState.shouldClearHash) {
      clearOAuthHash()
    }

    if (bootstrapState.shouldClearStoredState) {
      clearStoredDiscordState(clientId)
    }

    if (bootstrapState.shouldClearStoredSession) {
      clearStoredDiscordSession(clientId)
    }

    if (bootstrapState.shouldPersistSession && bootstrapState.session) {
      writeStoredDiscordSession(clientId, bootstrapState.session)
    }
  }, [bootstrapState, clientId])

  const hasExpiredSession = Boolean(session && isDiscordSessionExpired(session))
  const activeSession = hasExpiredSession ? null : session

  useEffect(() => {
    if (!hasExpiredSession) {
      return
    }

    clearStoredDiscordSession(clientId)
  }, [clientId, hasExpiredSession])

  const discordQuery = useQuery({
    enabled: Boolean(activeSession) && !isRedirecting,
    queryFn: async () => {
      if (!activeSession) {
        throw new Error('Discord session is required to load Discord data.')
      }

      return fetchDiscordUserStats({
        accessToken: activeSession.accessToken,
        guildId: config.discord.guildId,
      })
    },
    queryKey: [
      'discord-user-stats',
      config.discord.guildId,
      activeSession?.accessToken ?? null,
    ],
    retry: false,
  })

  const hasUnauthorizedSession =
    discordQuery.error instanceof DiscordApiError && discordQuery.error.status === 401

  useEffect(() => {
    if (!hasUnauthorizedSession) {
      return
    }

    clearStoredDiscordSession(clientId)
  }, [clientId, hasUnauthorizedSession])

  const login = async () => {
    if (typeof window === 'undefined') {
      return
    }

    const state = createDiscordOAuthState()
    writeStoredDiscordState(clientId, state)
    setAuthError(null)
    setIsRedirecting(true)
    window.location.assign(buildDiscordAuthorizationUrl(config.discord, state))
  }

  const logout = () => {
    clearStoredDiscordSession(clientId)
    clearStoredDiscordState(clientId)
    setSession(null)
    setAuthError(null)
    setIsRedirecting(false)
  }

  const isAuthenticated = Boolean(activeSession) && !hasUnauthorizedSession
  const isLoading =
    isRedirecting || (Boolean(activeSession) && !hasUnauthorizedSession && discordQuery.isPending)
  const isReady =
    !isRedirecting &&
    (!isAuthenticated || discordQuery.isSuccess || discordQuery.isError)

  return {
    displayName: isAuthenticated ? (discordQuery.data?.displayName ?? null) : null,
    error:
      authError ??
      (hasExpiredSession || hasUnauthorizedSession
        ? 'Discord session expired. Please sign in again.'
        : discordQuery.error instanceof Error
          ? discordQuery.error.message
          : null),
    isAuthenticated,
    isInTargetServer: isAuthenticated ? (discordQuery.data?.isInTargetServer ?? null) : null,
    isLoading,
    isReady,
    login,
    logout,
    userId: isAuthenticated ? (discordQuery.data?.userId ?? null) : null,
    username: isAuthenticated ? (discordQuery.data?.username ?? null) : null,
  }
}
