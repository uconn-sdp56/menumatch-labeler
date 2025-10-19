import {
  AUTH_TOKEN_STORAGE_KEY,
  LEGACY_AUTH_TOKEN_KEYS,
} from './config.js'

const isBrowser = typeof window !== 'undefined'

export function getStoredAuthToken() {
  if (!isBrowser) {
    return ''
  }

  const existing = window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  if (existing) {
    return existing
  }

  for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
    const legacyValue = window.localStorage.getItem(legacyKey)
    if (legacyValue) {
      window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, legacyValue)
      for (const otherKey of LEGACY_AUTH_TOKEN_KEYS) {
        if (otherKey !== legacyKey) {
          window.localStorage.removeItem(otherKey)
        }
      }
      return legacyValue
    }
  }

  return ''
}

export function persistAuthToken(token) {
  if (!isBrowser) {
    return
  }

  if (!token) {
    clearAuthToken()
    return
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token)
  for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
    window.localStorage.removeItem(legacyKey)
  }
}

export function clearAuthToken() {
  if (!isBrowser) {
    return
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
  for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
    window.localStorage.removeItem(legacyKey)
  }
}
