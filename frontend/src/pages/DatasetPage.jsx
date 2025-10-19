import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'

import ApiTokenStatusCard from '../components/ApiTokenStatusCard.jsx'
import { useApiToken } from '../components/ApiTokenProvider.jsx'
import { API_BASE_URL } from '../lib/config.js'
import { getDiningHallName } from '../lib/diningHalls.js'

function formatDate(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

function formatTimestamp(value) {
  if (!value) {
    return '—'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatMealtime(value) {
  if (!value) {
    return '—'
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDifficulty(value) {
  if (!value) {
    return '—'
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatServings(value) {
  if (value === undefined || value === null || value === '') {
    return '—'
  }

  const numeric = Number(value)
  if (Number.isFinite(numeric)) {
    if (Number.isInteger(numeric)) {
      return numeric.toString()
    }
    return numeric.toFixed(2).replace(/\.?0+$/, '')
  }

  return String(value)
}

function DatasetPage() {
  const { authToken, openTokenModal } = useApiToken()
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [records, setRecords] = useState([])
  const [scannedCount, setScannedCount] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [expandedRows, setExpandedRows] = useState(() => new Set())

  const fetchDataset = useCallback(
    async (signal) => {
      if (!authToken) {
        return
      }

      setStatus('loading')
      setErrorMessage('')

      const requestInit = {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Api-Key': authToken,
        },
      }
      if (signal) {
        requestInit.signal = signal
      }

      try {
        const response = await fetch(`${API_BASE_URL}/dataset`, requestInit)
        if (!response.ok) {
          let message = `Dataset request failed with status ${response.status}.`
          try {
            const payload = await response.json()
            if (payload?.message) {
              message = payload.message
            }
          } catch (_error) {
            // Ignore JSON parse errors so we can surface the status message.
          }
          throw new Error(message)
        }

        const payload = await response.json()
        const items = Array.isArray(payload?.items) ? payload.items : []

        setRecords(items)
        setScannedCount(
          typeof payload?.scannedCount === 'number'
            ? payload.scannedCount
            : items.length,
        )
        setStatus('success')
        setLastUpdated(new Date().toISOString())
        setExpandedRows(new Set())
      } catch (error) {
        if (error && typeof error === 'object' && error.name === 'AbortError') {
          return
        }

        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load dataset.'
        setStatus('error')
        setErrorMessage(message)
      }
    },
    [authToken],
  )

  useEffect(() => {
    if (!authToken) {
      setStatus('idle')
      setErrorMessage('')
      setRecords([])
      setScannedCount(0)
      setLastUpdated(null)
      setExpandedRows(new Set())
      return
    }

    const controller = new AbortController()
    fetchDataset(controller.signal)
    return () => controller.abort()
  }, [authToken, fetchDataset])

  const handleRefresh = () => {
    if (!authToken) {
      openTokenModal()
      return
    }

    if (status === 'loading') {
      return
    }

    fetchDataset()
  }

  const toggleRow = (rowKey) => {
    setExpandedRows((previous) => {
      const next = new Set(previous)
      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }
      return next
    })
  }

  const recordCount = records.length

  const datasetSubtitle = useMemo(() => {
    if (!authToken) {
      return 'Authenticate with the team API token to load labeled plates.'
    }
    if (status === 'loading' && recordCount === 0) {
      return 'Loading dataset…'
    }
    if (status === 'error') {
      return 'Could not refresh the dataset. Showing the last loaded results if available.'
    }
    if (recordCount === 0) {
      return 'No labeled plates yet. Once uploads are saved they will show up here.'
    }
    const scannedPhrase =
      scannedCount > recordCount ? ` (scanned ${scannedCount})` : ''
    return `${recordCount} labeled ${
      recordCount === 1 ? 'plate' : 'plates'
    } loaded${scannedPhrase}.`
  }, [authToken, recordCount, scannedCount, status])

  const sortedRecords = useMemo(() => {
    const safeTime = (value) => {
      if (!value) {
        return 0
      }
      const timestamp = Date.parse(value)
      return Number.isNaN(timestamp) ? 0 : timestamp
    }

    return [...records].sort((a, b) => {
      const timeDifference = safeTime(b?.createdAt) - safeTime(a?.createdAt)
      if (timeDifference !== 0) {
        return timeDifference
      }
      const keyA = String(a?.objectKey || '')
      const keyB = String(b?.objectKey || '')
      return keyA.localeCompare(keyB)
    })
  }, [records])

  const lastUpdatedLabel = useMemo(
    () => (lastUpdated ? formatTimestamp(lastUpdated) : ''),
    [lastUpdated],
  )

  const showEmptyState =
    authToken && status === 'success' && recordCount === 0
  const showLoadingIndicator = status === 'loading' && recordCount === 0

  return (
    <section className="space-y-8">
      <ApiTokenStatusCard />

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Dataset Overview
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          Review every labeled plate in the MenuMatch dataset. Use this view to
          spot incomplete annotations, confirm menu context, and cross-check
          portion estimates before evaluating models.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Dataset entries
              </h2>
              <p className="text-sm text-slate-600">{datasetSubtitle}</p>
              {lastUpdatedLabel ? (
                <p className="text-xs text-slate-400">
                  Last updated {lastUpdatedLabel}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={!authToken || status === 'loading'}
                className={[
                  'rounded-md border px-4 py-2 text-sm font-medium transition',
                  !authToken || status === 'loading'
                    ? 'cursor-not-allowed border-slate-200 text-slate-400'
                    : 'border-slate-300 text-slate-700 hover:border-slate-400 hover:bg-slate-50',
                ].join(' ')}
              >
                {status === 'loading' ? 'Loading…' : 'Refresh'}
              </button>
              {status === 'loading' && recordCount > 0 ? (
                <span className="text-xs text-slate-500">Refreshing…</span>
              ) : null}
            </div>
          </div>

          <div className="px-6 py-5">
            {!authToken ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Set the team API token above to fetch dataset entries.
              </div>
            ) : (
              <>
                {status === 'error' && errorMessage ? (
                  <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {errorMessage}
                  </div>
                ) : null}

                {showLoadingIndicator ? (
                  <p className="text-sm text-slate-600">Loading dataset…</p>
                ) : null}

                {showEmptyState ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    No labeled plates found yet. Once uploads are recorded,
                    they&apos;ll appear here.
                  </div>
                ) : null}

                {recordCount > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Object key
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Meal date
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Mealtime
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Dining hall
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Difficulty
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Items
                          </th>
                          <th className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                            Recorded
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedRecords.map((entry, index) => {
                          const rowKey =
                            entry?.objectKey ||
                            entry?.createdAt ||
                            `row-${index}`
                          const isExpanded = expandedRows.has(rowKey)
                          const itemList = Array.isArray(entry?.items)
                            ? entry.items
                            : []
                          const hallName = getDiningHallName(
                            entry?.diningHallId,
                          )
                          const hallLabel = hallName
                            ? `${hallName} (#${entry.diningHallId})`
                            : entry?.diningHallId || '—'

                          return (
                            <Fragment key={rowKey}>
                              <tr className="even:bg-slate-50">
                                <td className="px-4 py-3 align-top">
                                  <div className="space-y-1">
                                    <div className="font-mono text-xs text-slate-900">
                                      {entry?.objectKey || '—'}
                                    </div>
                                    {entry?.bucket ? (
                                      <div className="text-xs text-slate-500">
                                        {entry.bucket}
                                      </div>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                  {formatDate(entry?.mealDate)}
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                  {formatMealtime(entry?.mealtime)}
                                </td>
                                <td className="px-4 py-3 text-slate-700">
                                  {hallLabel}
                                </td>
                                <td className="px-4 py-3 text-slate-700">
                                  {formatDifficulty(entry?.difficulty)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                      {itemList.length}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => toggleRow(rowKey)}
                                      className="text-xs font-medium text-slate-600 underline decoration-dotted underline-offset-4 hover:text-slate-900"
                                      aria-expanded={isExpanded}
                                    >
                                      {isExpanded ? 'Hide items' : 'View items'}
                                    </button>
                                  </div>
                                </td>
                                <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                                  {formatTimestamp(entry?.createdAt)}
                                </td>
                              </tr>
                              {isExpanded ? (
                                <tr>
                                  <td
                                    colSpan={7}
                                    className="bg-slate-50 px-6 pb-6 pt-0"
                                  >
                                    <div className="mt-3 rounded-md border border-slate-200 bg-white p-4">
                                      <h3 className="text-sm font-semibold text-slate-900">
                                        Plate items
                                      </h3>
                                      <p className="text-xs text-slate-500">
                                        Detailed servings recorded for this
                                        plate.
                                      </p>
                                      <div className="mt-3 overflow-x-auto">
                                        <table className="min-w-full border border-slate-200 text-sm">
                                          <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                                            <tr>
                                              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                                                Menu item ID
                                              </th>
                                              <th className="border-b border-slate-200 px-3 py-2 text-left font-semibold">
                                                Servings
                                              </th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {itemList.length > 0 ? (
                                              itemList.map((item, itemIndex) => (
                                                <tr
                                                  key={`${rowKey}-item-${itemIndex}`}
                                                  className="border-b border-slate-200 last:border-b-0 odd:bg-white even:bg-slate-50"
                                                >
                                                  <td className="px-3 py-2 font-mono text-xs text-slate-700">
                                                    {item?.menuItemId ||
                                                      `Item ${itemIndex + 1}`}
                                                  </td>
                                                  <td className="px-3 py-2 text-slate-700">
                                                    {formatServings(
                                                      item?.servings,
                                                    )}
                                                  </td>
                                                </tr>
                                              ))
                                            ) : (
                                              <tr>
                                                <td
                                                  colSpan={2}
                                                  className="px-3 py-3 text-sm text-slate-500"
                                                >
                                                  No menu items recorded.
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
    </section>
  )
}

export default DatasetPage
