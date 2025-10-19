import { useApiToken } from './ApiTokenProvider.jsx'

function ApiTokenStatusCard({
  className = '',
  label = 'Team API token',
  description = '',
}) {
  const { authToken, maskedToken, openTokenModal, clearToken } = useApiToken()

  const statusLabel = authToken
    ? `Configured (${maskedToken || '••••'})`
    : 'Not yet configured'

  const classes = [
    'flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600',
    'sm:flex-row sm:items-center sm:justify-between',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes}>
      <div className="flex flex-col gap-1">
        <span className="font-medium text-slate-800">{label}</span>
        <span>{statusLabel}</span>
        {description ? (
          <span className="text-xs text-slate-500">{description}</span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={openTokenModal}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
        >
          {authToken ? 'Update token' : 'Set token'}
        </button>
        {authToken ? (
          <button
            type="button"
            onClick={clearToken}
            className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default ApiTokenStatusCard
