import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { AppConfig } from '../config'
import {
  buildTelegramApiUrl,
  createTelegramSessionFromToken,
  fetchTelegramUserStats,
  isTelegramSessionExpired,
  parseTelegramAuthCallback,
  TelegramApiError,
  type TelegramSession,
} from '../lib/telegram'

const TELEGRAM_SESSION_STORAGE_PREFIX = 'quests-dashboard.telegram.session'

type TelegramBootstrapState = {
  authError: string | null
  session: TelegramSession | null
  shouldClearHash: boolean
  shouldClearStoredSession: boolean
  shouldPersistSession: boolean
}

function getSessionStorageKey(apiBaseUrl: string) {
  return `${TELEGRAM_SESSION_STORAGE_PREFIX}:${apiBaseUrl}`
}

function canUseSessionStorage() {
  return typeof window !== 'undefined' && Boolean(window.sessionStorage)
}

function isTelegramSession(value: unknown): value is TelegramSession {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'expiresAt' in value &&
      typeof value.expiresAt === 'number' &&
      'token' in value &&
      typeof value.token === 'string',
  )
}

function readStoredTelegramSession(apiBaseUrl: string) {
  if (!canUseSessionStorage()) {
    return null
  }

  try {
    const rawValue = window.sessionStorage.getItem(getSessionStorageKey(apiBaseUrl))

    if (!rawValue) {
      return null
    }

    const parsedValue = JSON.parse(rawValue)
    return isTelegramSession(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function writeStoredTelegramSession(apiBaseUrl: string, session: TelegramSession) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.setItem(
    getSessionStorageKey(apiBaseUrl),
    JSON.stringify(session),
  )
}

function clearStoredTelegramSession(apiBaseUrl: string) {
  if (!canUseSessionStorage()) {
    return
  }

  window.sessionStorage.removeItem(getSessionStorageKey(apiBaseUrl))
}

function clearAuthHash() {
  if (typeof window === 'undefined') {
    return
  }

  window.history.replaceState(
    null,
    document.title,
    `${window.location.pathname}${window.location.search}`,
  )
}

function bootstrapTelegramState(apiBaseUrl: string): TelegramBootstrapState {
  let session = readStoredTelegramSession(apiBaseUrl)
  let authError: string | null = null
  let shouldClearHash = false
  let shouldClearStoredSession = false
  let shouldPersistSession = false

  if (session && isTelegramSessionExpired(session)) {
    session = null
    shouldClearStoredSession = true
  }

  if (typeof window === 'undefined') {
    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldPersistSession,
    }
  }

  const callback = parseTelegramAuthCallback(window.location.hash)

  if (!callback) {
    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldPersistSession,
    }
  }

  shouldClearHash = true

  if (callback.kind === 'error') {
    session = null
    authError =
      callback.payload.description ?? 'Telegram login was cancelled or could not be completed.'
    shouldClearStoredSession = true

    return {
      authError,
      session,
      shouldClearHash,
      shouldClearStoredSession,
      shouldPersistSession,
    }
  }

  try {
    session = createTelegramSessionFromToken(callback.payload.token)
    shouldPersistSession = true
  } catch (error) {
    session = null
    authError =
      error instanceof Error
        ? error.message
        : 'Telegram login could not be completed.'
    shouldClearStoredSession = true
  }

  return {
    authError,
    session,
    shouldClearHash,
    shouldClearStoredSession,
    shouldPersistSession,
  }
}

export function useTelegramConnection(config: AppConfig) {
  const apiBaseUrl = config.telegram.apiBaseUrl
  const [bootstrapState] = useState(() => bootstrapTelegramState(apiBaseUrl))
  const [session, setSession] = useState<TelegramSession | null>(
    bootstrapState.session,
  )
  const [authError, setAuthError] = useState<string | null>(bootstrapState.authError)
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    if (bootstrapState.shouldClearHash) {
      clearAuthHash()
    }

    if (bootstrapState.shouldClearStoredSession) {
      clearStoredTelegramSession(apiBaseUrl)
    }

    if (bootstrapState.shouldPersistSession && bootstrapState.session) {
      writeStoredTelegramSession(apiBaseUrl, bootstrapState.session)
    }
  }, [apiBaseUrl, bootstrapState])

  const hasExpiredSession = Boolean(session && isTelegramSessionExpired(session))
  const activeSession = hasExpiredSession ? null : session

  useEffect(() => {
    if (!hasExpiredSession) {
      return
    }

    clearStoredTelegramSession(apiBaseUrl)
  }, [apiBaseUrl, hasExpiredSession])

  const telegramQuery = useQuery({
    enabled: Boolean(activeSession) && !isRedirecting,
    queryFn: async () => {
      if (!activeSession) {
        throw new Error('Telegram session is required to load Telegram data.')
      }

      return fetchTelegramUserStats({
        apiBaseUrl,
        token: activeSession.token,
      })
    },
    queryKey: ['telegram-user-stats', apiBaseUrl, activeSession?.token ?? null],
    retry: false,
  })

  const hasUnauthorizedSession =
    telegramQuery.error instanceof TelegramApiError &&
    telegramQuery.error.status === 401

  useEffect(() => {
    if (!hasUnauthorizedSession) {
      return
    }

    clearStoredTelegramSession(apiBaseUrl)
  }, [apiBaseUrl, hasUnauthorizedSession])

  const login = async () => {
    if (typeof window === 'undefined') {
      return
    }

    setAuthError(null)
    setIsRedirecting(true)
    window.location.assign(buildTelegramApiUrl(apiBaseUrl, '/api/telegram/auth/start'))
  }

  const logout = () => {
    clearStoredTelegramSession(apiBaseUrl)
    setSession(null)
    setAuthError(null)
    setIsRedirecting(false)
  }

  const isAuthenticated = Boolean(activeSession) && !hasUnauthorizedSession
  const isLoading =
    isRedirecting ||
    (Boolean(activeSession) && !hasUnauthorizedSession && telegramQuery.isPending)
  const isReady =
    !isRedirecting &&
    (!isAuthenticated || telegramQuery.isSuccess || telegramQuery.isError)

  return {
    displayName: isAuthenticated ? (telegramQuery.data?.displayName ?? null) : null,
    error:
      authError ??
      (hasExpiredSession || hasUnauthorizedSession
        ? 'Telegram session expired. Please sign in again.'
        : telegramQuery.data?.membershipError ??
          (telegramQuery.error instanceof Error
            ? telegramQuery.error.message
            : null)),
    isAuthenticated,
    isInTargetChannel: isAuthenticated
      ? (telegramQuery.data?.isInTargetChannel ?? null)
      : null,
    isLoading,
    isReady,
    login,
    logout,
    userId: isAuthenticated ? (telegramQuery.data?.userId ?? null) : null,
    username: isAuthenticated ? (telegramQuery.data?.username ?? null) : null,
  }
}
