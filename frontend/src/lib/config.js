const configuredApiBaseUrl = import.meta.env.VITE_UPLOAD_API_BASE_URL?.trim()

if (!configuredApiBaseUrl) {
  throw new Error(
    'Missing VITE_UPLOAD_API_BASE_URL. Create frontend/.env from frontend/.env.example.',
  )
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, '')

export const AUTH_TOKEN_STORAGE_KEY = 'menumatch-auth-token'
export const LEGACY_AUTH_TOKEN_KEYS = ['menumatch-upload-token']
