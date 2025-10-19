import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  clearAuthToken,
  getStoredAuthToken,
  persistAuthToken,
} from '../lib/auth.js'

const ApiTokenContext = createContext(null)

export function ApiTokenProvider({ children }) {
  const initialToken = getStoredAuthToken()
  const [authToken, setAuthToken] = useState(initialToken)
  const [tokenModalOpen, setTokenModalOpen] = useState(() => !initialToken)
  const [tokenInput, setTokenInput] = useState(initialToken)
  const [tokenFeedback, setTokenFeedback] = useState('')
  const [lastSavedAt, setLastSavedAt] = useState(null)
  const [lastClearedAt, setLastClearedAt] = useState(null)

  useEffect(() => {
    setTokenInput(authToken)
  }, [authToken])

  const maskedToken = useMemo(() => {
    if (!authToken) {
      return ''
    }
    if (authToken.length <= 4) {
      return '••••'
    }
    return `••••${authToken.slice(-4)}`
  }, [authToken])

  const openTokenModal = useCallback(() => {
    setTokenInput(authToken)
    setTokenFeedback('')
    setTokenModalOpen(true)
  }, [authToken])

  const closeTokenModal = useCallback(() => {
    setTokenModalOpen(false)
    setTokenFeedback('')
  }, [])

  const saveToken = useCallback((tokenValue) => {
    const normalized = String(tokenValue || '').trim()
    if (!normalized) {
      return false
    }

    persistAuthToken(normalized)
    setAuthToken(normalized)
    setTokenInput(normalized)
    setTokenFeedback('')
    setTokenModalOpen(false)
    setLastSavedAt(new Date().toISOString())
    return true
  }, [])

  const clearToken = useCallback(() => {
    clearAuthToken()
    setAuthToken('')
    setTokenInput('')
    setTokenFeedback('')
    setTokenModalOpen(true)
    setLastClearedAt(new Date().toISOString())
  }, [])

  const contextValue = useMemo(
    () => ({
      authToken,
      maskedToken,
      tokenModalOpen,
      tokenInput,
      setTokenInput,
      tokenFeedback,
      setTokenFeedback,
      openTokenModal,
      closeTokenModal,
      saveToken,
      clearToken,
      lastSavedAt,
      lastClearedAt,
    }),
    [
      authToken,
      maskedToken,
      tokenModalOpen,
      tokenInput,
      tokenFeedback,
      openTokenModal,
      closeTokenModal,
      saveToken,
      clearToken,
      lastSavedAt,
      lastClearedAt,
    ],
  )

  return (
    <ApiTokenContext.Provider value={contextValue}>
      {children}
    </ApiTokenContext.Provider>
  )
}

export function useApiToken() {
  const context = useContext(ApiTokenContext)
  if (context === null) {
    throw new Error('useApiToken must be used within an ApiTokenProvider')
  }
  return context
}
