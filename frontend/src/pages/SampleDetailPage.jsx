import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

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

function SampleDetailPage() {
  const navigate = useNavigate()
  const { objectKey: objectKeyParam } = useParams()
  const objectKey = decodeURIComponent(objectKeyParam || '')
  const { authToken } = useApiToken()
  const [status, setStatus] = useState('idle')
  const [errorMessage, setErrorMessage] = useState('')
  const [record, setRecord] = useState(null)
  const [downloadStatus, setDownloadStatus] = useState('idle')
  const [downloadUrl, setDownloadUrl] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [downloadExpires, setDownloadExpires] = useState(null)

  useEffect(() => {
    if (!objectKey) {
      setErrorMessage('Missing object key.')
      setStatus('error')
      return
    }

    if (!authToken) {
      setStatus('idle')
      setErrorMessage('')
      setRecord(null)
      return
    }

    const controller = new AbortController()

    const fetchRecord = async () => {
      setStatus('loading')
      setErrorMessage('')
      try {
        const response = await fetch(
          `${API_BASE_URL}/dataset/${encodeURIComponent(objectKey)}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-Api-Key': authToken,
            },
            signal: controller.signal,
          },
        )

        if (!response.ok) {
          let message = `Dataset request failed with status ${response.status}.`
          try {
            const payload = await response.json()
            if (payload?.message) {
              message = payload.message
            }
          } catch (_error) {
            // ignore parse error
          }
          throw new Error(message)
        }

        const payload = await response.json()
        const item = payload?.item

        if (!item) {
          setStatus('error')
          setErrorMessage('Sample not found in dataset.')
          setRecord(null)
          return
        }

        setRecord(item)
        setStatus('success')
      } catch (error) {
        if (error && typeof error === 'object' && error.name === 'AbortError') {
          return
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load sample.'
        setStatus('error')
        setErrorMessage(message)
        setRecord(null)
      }
    }

    fetchRecord()
    return () => controller.abort()
  }, [authToken, objectKey])

  useEffect(() => {
    if (!authToken || !record?.objectKey) {
      setDownloadStatus('idle')
      setDownloadUrl('')
      setDownloadError('')
      setDownloadExpires(null)
      return
    }

    let cancelled = false
    const fetchPresign = async () => {
      setDownloadStatus('loading')
      setDownloadError('')
      try {
        const response = await fetch(`${API_BASE_URL}/downloads/presign`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': authToken,
          },
          body: JSON.stringify({
            objectKey: record.objectKey,
            bucket: record.bucket,
          }),
        })

        if (!response.ok) {
          let message = `Download URL request failed with status ${response.status}.`
          try {
            const payload = await response.json()
            if (payload?.message) {
              message = payload.message
            }
          } catch (_error) {
            // ignore parse error
          }
          throw new Error(message)
        }

        const payload = await response.json()
        if (cancelled) {
          return
        }

        setDownloadUrl(payload?.downloadUrl || '')
        setDownloadExpires(
          typeof payload?.expiresIn === 'number' ? payload.expiresIn : null,
        )
        setDownloadStatus('success')
      } catch (error) {
        if (cancelled) {
          return
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to get download URL.'
        setDownloadStatus('error')
        setDownloadError(message)
        setDownloadUrl('')
        setDownloadExpires(null)
      }
    }

    fetchPresign()
    return () => {
      cancelled = true
    }
  }, [authToken, record?.bucket, record?.objectKey])

  const items = useMemo(
    () => (Array.isArray(record?.items) ? record.items : []),
    [record],
  )

  const hallLabel = useMemo(() => {
    if (!record?.diningHallId) {
      return '—'
    }
    const hallName = getDiningHallName(record.diningHallId)
    return hallName
      ? `${hallName} (#${record.diningHallId})`
      : record.diningHallId
  }, [record?.diningHallId])

  return (
    <section className="space-y-8">
      <ApiTokenStatusCard />

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Dataset sample
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            {objectKey || 'Sample'}
          </h1>
          <p className="text-sm text-slate-600">
            View the full metadata for this labeled plate. Click back to return
            to the dataset table.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dataset')}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
        >
          Back to dataset
        </button>
      </div>

      {!authToken ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Set the team API token above to fetch sample details.
        </div>
      ) : null}

      {status === 'error' && errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {status === 'loading' ? (
        <p className="text-sm text-slate-600">Loading sample…</p>
      ) : null}

      {status === 'success' && record ? (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-500">
                  Object key
                </p>
                <p className="font-mono text-sm text-slate-900">
                  {record.objectKey || '—'}
                </p>
                {record.bucket ? (
                  <p className="text-xs text-slate-500">{record.bucket}</p>
                ) : null}
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>Recorded {formatTimestamp(record.createdAt)}</p>
                <p>Uploader: {record.uploadedBy || '—'}</p>
              </div>
            </div>

            {downloadStatus === 'loading' ? (
              <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Fetching image link…
              </div>
            ) : null}

            {downloadStatus === 'success' && downloadUrl ? (
              <div className="mt-4 flex justify-center">
                <img
                  src={downloadUrl}
                  alt="Plate"
                  className="max-h-[340px] w-auto max-w-full rounded-lg border border-slate-200 bg-slate-50 object-contain shadow-sm"
                  loading="lazy"
                />
              </div>
            ) : null}

            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Meal date
                </dt>
                <dd className="text-sm font-medium text-slate-900">
                  {formatDate(record.mealDate)}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Mealtime
                </dt>
                <dd className="text-sm font-medium text-slate-900">
                  {formatMealtime(record.mealtime)}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Dining hall
                </dt>
                <dd className="text-sm font-medium text-slate-900">
                  {hallLabel}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Difficulty
                </dt>
                <dd className="text-sm font-medium text-slate-900">
                  {formatDifficulty(record.difficulty)}
                </dd>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                <dt className="text-xs uppercase tracking-wide text-slate-500">
                  Items recorded
                </dt>
                <dd className="text-sm font-medium text-slate-900">
                  {items.length}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Plate items
                </h2>
                <p className="text-sm text-slate-600">
                  Servings recorded for this plate.
                </p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {items.length} item{items.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">
                      Menu item ID
                    </th>
                    <th className="px-4 py-2 text-left font-semibold">
                      Servings
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {items.length > 0 ? (
                    items.map((item, index) => (
                      <tr key={`${record.objectKey || 'item'}-${index}`}>
                        <td className="px-4 py-2 font-mono text-xs text-slate-800">
                          {item?.menuItemId || `Item ${index + 1}`}
                        </td>
                        <td className="px-4 py-2 text-slate-800">
                          {formatServings(item?.servings)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={2}
                        className="px-4 py-3 text-sm text-slate-600"
                      >
                        No items recorded.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default SampleDetailPage
