import { useApiToken } from './ApiTokenProvider.jsx'

function ApiTokenModal() {
  const {
    authToken,
    tokenModalOpen,
    tokenInput,
    setTokenInput,
    tokenFeedback,
    setTokenFeedback,
    closeTokenModal,
    saveToken,
    clearToken,
  } = useApiToken()

  if (!tokenModalOpen) {
    return null
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmed = String(tokenInput || '').trim()
    if (!trimmed) {
      setTokenFeedback('Enter your team API token to continue.')
      return
    }

    const saved = saveToken(trimmed)
    if (!saved) {
      setTokenFeedback('Enter your team API token to continue.')
    }
  }

  const handleClose = () => {
    closeTokenModal()
  }

  const handleClear = () => {
    clearToken()
    setTokenFeedback('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-lg"
      >
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-slate-900">
            Enter API Token
          </h2>
          <p className="text-sm text-slate-600">
            This token authorizes MenuMatch API requests for uploads and dataset
            access. Ask a teammate for the shared token if you don&apos;t have it.
          </p>
        </div>
        <label className="space-y-2">
          <span className="text-sm font-medium text-slate-700">Team token</span>
          <input
            type="password"
            value={tokenInput || ''}
            onChange={(event) => setTokenInput(event.target.value)}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            autoComplete="off"
            placeholder="Paste token here"
          />
        </label>
        {tokenFeedback ? (
          <p className="text-sm text-red-600">{tokenFeedback}</p>
        ) : null}
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
          >
            Close
          </button>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
          >
            Save Token
          </button>
        </div>
        {authToken ? (
          <button
            type="button"
            onClick={handleClear}
            className="text-left text-xs font-medium text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-700"
          >
            Clear saved token
          </button>
        ) : null}
      </form>
    </div>
  )
}

export default ApiTokenModal
