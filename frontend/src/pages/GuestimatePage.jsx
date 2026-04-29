import { useCallback, useMemo, useState } from 'react'

import ApiTokenStatusCard from '../components/ApiTokenStatusCard.jsx'
import { useApiToken } from '../components/ApiTokenProvider.jsx'
import { API_BASE_URL } from '../lib/config.js'
import { getDiningHallName } from '../lib/diningHalls.js'

const SESSION_STORAGE_KEY = 'menumatch-guestimate-session'

const macros = [
  {
    key: 'kcal',
    label: 'Calories',
    unit: 'kcal',
    placeholder: '650',
    metricKey: 'kcal',
  },
  {
    key: 'carb_g',
    label: 'Carbs',
    unit: 'g',
    placeholder: '75',
    metricKey: 'carb_g',
  },
  {
    key: 'fat_g',
    label: 'Fat',
    unit: 'g',
    placeholder: '22',
    metricKey: 'fat_g',
  },
  {
    key: 'protein_g',
    label: 'Protein',
    unit: 'g',
    placeholder: '38',
    metricKey: 'protein_g',
  },
]

const initialGuess = Object.freeze({
  kcal: '',
  carb_g: '',
  fat_g: '',
  protein_g: '',
})

function getGuestimateSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
    if (existing) {
      return existing
    }

    const next =
      window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    window.localStorage.setItem(SESSION_STORAGE_KEY, next)
    return next
  } catch {
    return ''
  }
}

function createGuestimateRunSeed() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatNumber(value, options = {}) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '-'
  }

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: options.maximumFractionDigits ?? 1,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  }).format(numeric)
}

function formatMacro(value, unit, options = {}) {
  const formatted = formatNumber(value, options)
  return formatted === '-' ? '-' : `${formatted} ${unit}`
}

function formatPercent(value) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }

  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return '-'
  }

  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(numeric)
}

function formatSampleContext(sample) {
  if (!sample) {
    return ''
  }

  const parts = []
  const hallName = getDiningHallName(sample.diningHallId)
  if (hallName) {
    parts.push(hallName)
  } else if (sample.diningHallId) {
    parts.push(`Hall ${sample.diningHallId}`)
  }
  if (sample.mealtime) {
    parts.push(sample.mealtime.charAt(0).toUpperCase() + sample.mealtime.slice(1))
  }
  if (sample.mealDate) {
    parts.push(sample.mealDate)
  }
  if (sample.difficulty) {
    parts.push(sample.difficulty.charAt(0).toUpperCase() + sample.difficulty.slice(1))
  }

  return parts.join(' - ')
}

async function readApiError(response, fallback) {
  try {
    const payload = await response.json()
    if (payload?.message) {
      return payload.message
    }
  } catch {
    // Keep the status-based fallback.
  }

  return fallback
}

function GuestimatePage() {
  const { authToken, openTokenModal } = useApiToken()
  const [mode, setMode] = useState('home')
  const [sampleStatus, setSampleStatus] = useState('idle')
  const [sampleError, setSampleError] = useState('')
  const [sample, setSample] = useState(null)
  const [sampleIndex, setSampleIndex] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [guess, setGuess] = useState(() => ({ ...initialGuess }))
  const [guessError, setGuessError] = useState('')
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [submitError, setSubmitError] = useState('')
  const [result, setResult] = useState(null)
  const [analysisStatus, setAnalysisStatus] = useState('idle')
  const [analysisError, setAnalysisError] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [runSeed, setRunSeed] = useState('')

  const fetchSample = useCallback(
    async (index, seed = runSeed) => {
      if (!authToken) {
        openTokenModal()
        return
      }

      setSampleStatus('loading')
      setSampleError('')
      setSubmitError('')
      setGuessError('')
      setSubmitStatus('idle')
      setResult(null)
      setGuess({ ...initialGuess })

      try {
        const params = new URLSearchParams({ index: String(index) })
        if (seed) {
          params.set('seed', seed)
        }

        const response = await fetch(
          `${API_BASE_URL}/guestimate/sample?${params.toString()}`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'X-Api-Key': authToken,
            },
          },
        )

        if (!response.ok) {
          const message = await readApiError(
            response,
            `Sample request failed with status ${response.status}.`,
          )
          throw new Error(message)
        }

        const payload = await response.json()
        setSample(payload?.sample || null)
        setSampleIndex(typeof payload?.index === 'number' ? payload.index : index)
        setTotalCount(
          typeof payload?.totalCount === 'number' ? payload.totalCount : 0,
        )
        setSampleStatus('success')
        setMode('play')
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load sample.'
        setSampleStatus('error')
        setSampleError(message)
      }
    },
    [authToken, openTokenModal, runSeed],
  )

  const loadAnalysis = useCallback(async () => {
    if (!authToken) {
      openTokenModal()
      return
    }

    setAnalysisStatus('loading')
    setAnalysisError('')

    try {
      const response = await fetch(`${API_BASE_URL}/guestimate/analysis`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Api-Key': authToken,
        },
      })

      if (!response.ok) {
        const message = await readApiError(
          response,
          `Analysis request failed with status ${response.status}.`,
        )
        throw new Error(message)
      }

      const payload = await response.json()
      setAnalysis(payload)
      setAnalysisStatus('success')
      setMode('home')
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to load Guestimate analysis.'
      setAnalysisStatus('error')
      setAnalysisError(message)
    }
  }, [authToken, openTokenModal])

  const handlePlay = () => {
    setAnalysisError('')
    const seed = createGuestimateRunSeed()
    setRunSeed(seed)
    fetchSample(0, seed)
  }

  const handleNextSample = () => {
    const nextIndex = sampleIndex + 1
    if (totalCount > 0 && nextIndex >= totalCount) {
      setMode('home')
      setSample(null)
      setResult(null)
      loadAnalysis()
      return
    }

    fetchSample(nextIndex)
  }

  const parsedGuess = useMemo(() => {
    const values = {}
    for (const macro of macros) {
      const rawValue = guess[macro.key]
      if (rawValue === '') {
        values[macro.key] = null
        continue
      }
      const numeric = Number(rawValue)
      values[macro.key] = Number.isFinite(numeric) ? numeric : null
    }
    return values
  }, [guess])

  const canSubmit = useMemo(
    () =>
      Boolean(sample?.objectKey) &&
      submitStatus !== 'submitting' &&
      macros.every((macro) => {
        const value = parsedGuess[macro.key]
        return value !== null && value >= 0
      }),
    [parsedGuess, sample?.objectKey, submitStatus],
  )

  const handleSubmitGuess = async (event) => {
    event.preventDefault()

    if (!sample?.objectKey) {
      return
    }

    if (!canSubmit) {
      setGuessError('Enter a non-negative number for every macro.')
      return
    }

    setSubmitStatus('submitting')
    setSubmitError('')
    setGuessError('')

    try {
      const response = await fetch(`${API_BASE_URL}/guestimate/guess`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': authToken,
        },
        body: JSON.stringify({
          objectKey: sample.objectKey,
          guess: parsedGuess,
          clientSessionId: getGuestimateSessionId(),
        }),
      })

      if (!response.ok) {
        const message = await readApiError(
          response,
          `Guess request failed with status ${response.status}.`,
        )
        throw new Error(message)
      }

      const payload = await response.json()
      setResult(payload)
      setSubmitStatus('success')
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Failed to save guess.'
      setSubmitStatus('error')
      setSubmitError(message)
    }
  }

  const progressLabel =
    totalCount > 0
      ? `Sample ${sampleIndex + 1} of ${totalCount}`
      : 'Sample'
  const sampleContext = formatSampleContext(sample)
  const analysisNutrients = analysis?.byNutrient || {}
  const hasAnalysis = analysisStatus === 'success' && analysis
  const filterMaxPercent = analysis?.percentErrorFilter?.maxPercentError
  const filterMaxPercentLabel =
    filterMaxPercent === undefined || filterMaxPercent === null
      ? '150%'
      : formatPercent(filterMaxPercent)

  return (
    <section className="space-y-8">
      <ApiTokenStatusCard />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Guestimate
          </h1>
          <p className="max-w-2xl text-base text-slate-600">
            Collect human estimates for total plate calories, carbs, fat, and
            protein, then compare them with the labeled serving totals.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handlePlay}
            disabled={sampleStatus === 'loading'}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {sampleStatus === 'loading' ? 'Loading...' : 'Play'}
          </button>
          <button
            type="button"
            onClick={loadAnalysis}
            disabled={analysisStatus === 'loading'}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {analysisStatus === 'loading' ? 'Loading...' : 'Display results'}
          </button>
        </div>
      </header>

      {!authToken ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          Set the team API token above to play Guestimate.
        </div>
      ) : null}

      {sampleStatus === 'error' && sampleError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {sampleError}
        </div>
      ) : null}

      {analysisStatus === 'error' && analysisError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {analysisError}
        </div>
      ) : null}

      {mode === 'play' && sample ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {progressLabel}
              </p>
              <h2 className="mt-1 break-words font-mono text-sm font-semibold text-slate-900">
                {sample.objectKey}
              </h2>
              {sampleContext ? (
                <p className="mt-1 text-sm text-slate-600">{sampleContext}</p>
              ) : null}
            </div>

            <div className="bg-slate-100 p-4">
              <img
                key={sample.objectKey}
                src={sample.imageUrl}
                alt={`Guestimate sample ${sampleIndex + 1}`}
                className="mx-auto max-h-[580px] w-auto max-w-full rounded-md border border-slate-200 bg-white object-contain shadow-sm"
              />
            </div>
          </div>

          <div className="space-y-6">
            <form
              onSubmit={handleSubmitGuess}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Your estimate
                </h2>
                <p className="text-sm text-slate-600">
                  Estimate the total visible nutrition for the full plate.
                </p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {macros.map((macro) => (
                  <label key={macro.key} className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {macro.label}
                    </span>
                    <div className="flex rounded-md border border-slate-300 bg-white shadow-sm transition focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
                      <input
                        type="number"
                        min="0"
                        step={macro.key === 'kcal' ? '1' : '0.1'}
                        inputMode="decimal"
                        value={guess[macro.key]}
                        onChange={(event) =>
                          setGuess((previous) => ({
                            ...previous,
                            [macro.key]: event.target.value,
                          }))
                        }
                        disabled={Boolean(result)}
                        placeholder={macro.placeholder}
                        className="min-w-0 flex-1 rounded-l-md border-0 px-3 py-2 text-sm text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-500"
                      />
                      <span className="flex items-center rounded-r-md border-l border-slate-200 bg-slate-50 px-3 text-sm text-slate-500">
                        {macro.unit}
                      </span>
                    </div>
                  </label>
                ))}
              </div>

              {guessError ? (
                <p className="mt-3 text-sm text-red-600">{guessError}</p>
              ) : null}
              {submitStatus === 'error' && submitError ? (
                <p className="mt-3 text-sm text-red-600">{submitError}</p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={!canSubmit || Boolean(result)}
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {submitStatus === 'submitting' ? 'Scoring...' : 'Submit guess'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('home')
                    setSample(null)
                    setResult(null)
                    setSubmitStatus('idle')
                    setGuess({ ...initialGuess })
                  }}
                  className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Stop
                </button>
              </div>
            </form>

            {result ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-emerald-950">
                      Ground truth
                    </h2>
                    <p className="text-sm text-emerald-800">
                      Your guess was saved. These totals come from the labeled
                      servings and Husky Eats nutrition data.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextSample}
                    className="rounded-md bg-emerald-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800"
                  >
                    {sampleIndex + 1 >= totalCount ? 'Finish' : 'Next sample'}
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto rounded-md border border-emerald-200 bg-white">
                  <table className="min-w-full divide-y divide-emerald-100 text-sm">
                    <thead className="bg-emerald-100 text-xs uppercase tracking-wide text-emerald-900">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">
                          Macro
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Guess
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Truth
                        </th>
                        <th className="px-4 py-3 text-left font-semibold">
                          Off by
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-100">
                      {macros.map((macro) => {
                        const error = result.errors?.[macro.key]
                        const signed = Number(error?.signed)
                        const direction =
                          Number.isFinite(signed) && signed > 0
                            ? 'over'
                            : Number.isFinite(signed) && signed < 0
                              ? 'under'
                              : 'exact'

                        return (
                          <tr key={macro.key}>
                            <td className="px-4 py-3 font-medium text-slate-900">
                              {macro.label}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {formatMacro(result.guess?.[macro.key], macro.unit)}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              {formatMacro(
                                result.groundTruth?.[macro.key],
                                macro.unit,
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-700">
                              <span className="font-medium text-slate-900">
                                {formatMacro(error?.absolute, macro.unit)}
                              </span>
                              <span className="ml-2 text-xs text-slate-500">
                                {formatPercent(error?.percent)} {direction}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {Array.isArray(result.sourceItems) &&
                result.sourceItems.length > 0 ? (
                  <div className="mt-4">
                    <h3 className="text-sm font-semibold text-emerald-950">
                      Labeled items
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {result.sourceItems.map((item) => (
                        <span
                          key={`${item.id}-${item.servings}`}
                          className="rounded-full bg-white px-3 py-1 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200"
                        >
                          {item.name || item.id} - {formatNumber(item.servings)} serving
                          {Number(item.servings) === 1 ? '' : 's'}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {mode === 'home' ? (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Human benchmark
            </h2>
            <p className="text-sm text-slate-600">
              Start a run to score all samples, or load the aggregate results
              already stored in DynamoDB.
            </p>
          </div>

          <div className="px-6 py-5">
            {analysisStatus === 'loading' ? (
              <p className="text-sm text-slate-600">Loading results...</p>
            ) : null}

            {hasAnalysis ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Guesses
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatNumber(analysis.guessCount, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Samples covered
                    </p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatNumber(analysis.sampleCount, {
                        maximumFractionDigits: 0,
                      })}
                    </p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Metric set
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-900">
                      MAE, RMSE, filtered % MAE
                    </p>
                  </div>
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  % MAE excludes macro/sample pairs where ground truth is under
                  100 kcal or 5 g, and pairs with absolute percentage error over{' '}
                  {filterMaxPercentLabel}. MAE, RMSE, and bias still use all
                  guesses.
                </div>

                {Number(analysis.guessCount) > 0 ? (
                  <div className="overflow-x-auto rounded-md border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">
                            Macro
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            MAE
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            RMSE
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            % MAE
                          </th>
                          <th className="px-4 py-3 text-left font-semibold">
                            Bias
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {macros.map((macro) => {
                          const row = analysisNutrients[macro.metricKey] || {}
                          return (
                            <tr key={macro.key} className="even:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {macro.label}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {formatMacro(row.mae, macro.unit)}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {formatMacro(row.rmse, macro.unit)}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                <div className="flex flex-col gap-0.5">
                                  <span>{formatPercent(row.pmae)}</span>
                                  <span className="text-xs text-slate-500">
                                    n={formatNumber(row.percentCount, {
                                      maximumFractionDigits: 0,
                                    })}
                                    {Number(row.percentExcludedCount) > 0
                                      ? `, excluded ${formatNumber(
                                          row.percentExcludedCount,
                                          { maximumFractionDigits: 0 },
                                        )}`
                                      : ''}
                                  </span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {formatMacro(row.meanError, macro.unit)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                    No Guestimate guesses have been stored yet.
                  </div>
                )}
              </div>
            ) : analysisStatus !== 'loading' ? (
              <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
                Results will appear here after you click Display results.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default GuestimatePage
