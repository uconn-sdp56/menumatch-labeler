import { useEffect, useMemo, useState } from 'react'

import ApiTokenStatusCard from '../components/ApiTokenStatusCard.jsx'
import { useApiToken } from '../components/ApiTokenProvider.jsx'
import { API_BASE_URL } from '../lib/config.js'
import { DINING_HALLS } from '../lib/diningHalls.js'

const mealtimeOptions = [
  { value: 'all', label: 'All meal times' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
]

const todayIsoDate = () => {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function CoveragePage() {
  const { authToken, openTokenModal } = useApiToken()
  const [datasetStatus, setDatasetStatus] = useState('idle')
  const [datasetError, setDatasetError] = useState('')
  const [records, setRecords] = useState([])

  const [menuStatus, setMenuStatus] = useState('idle')
  const [menuError, setMenuError] = useState('')
  const [menuItems, setMenuItems] = useState([])

  const [pendingSearch, setPendingSearch] = useState('')
  const [appliedSearch, setAppliedSearch] = useState('')
  const [menuDate, setMenuDate] = useState('')
  const [mealtime, setMealtime] = useState('all')
  const [diningHallId, setDiningHallId] = useState('all')
  const [menuFilterEnabled, setMenuFilterEnabled] = useState(false)
  const [filterVersion, setFilterVersion] = useState(0)
  const [menuContextItems, setMenuContextItems] = useState(new Set())
  const [menuContextStatus, setMenuContextStatus] = useState('idle')
  const [menuContextError, setMenuContextError] = useState('')
  const [contextLabels, setContextLabels] = useState(new Map())

  useEffect(() => {
    if (!authToken) {
      setDatasetStatus('idle')
      setDatasetError('')
      setRecords([])
      return
    }

    const controller = new AbortController()
    const fetchDataset = async () => {
      setDatasetStatus('loading')
      setDatasetError('')
      try {
        const response = await fetch(`${API_BASE_URL}/dataset`, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'X-Api-Key': authToken,
          },
          signal: controller.signal,
        })

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
        const items = Array.isArray(payload?.items) ? payload.items : []
        setRecords(items)
        setDatasetStatus('success')
      } catch (error) {
        if (error && typeof error === 'object' && error.name === 'AbortError') {
          return
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load dataset.'
        setDatasetStatus('error')
        setDatasetError(message)
      }
    }

    fetchDataset()
    return () => controller.abort()
  }, [authToken])

  useEffect(() => {
    const controller = new AbortController()
    const fetchMenu = async () => {
      setMenuStatus('loading')
      setMenuError('')
      try {
        const response = await fetch('https://husky-eats.onrender.com/api/menuitem', {
          method: 'GET',
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Menu request failed with status ${response.status}`)
        }

        const payload = await response.json()
        if (!Array.isArray(payload)) {
          throw new Error('Unexpected menu response format.')
        }

        setMenuItems(
          payload.map((item) => ({
            id: String(item?.id ?? ''),
            name: item?.name ? String(item.name) : '',
          })),
        )
        setMenuStatus('success')
      } catch (error) {
        if (error && typeof error === 'object' && error.name === 'AbortError') {
          return
        }
        setMenuStatus('error')
        setMenuError(
          error instanceof Error && error.message
            ? error.message
            : 'Failed to load menu items.',
        )
      }
    }

    fetchMenu()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const hasContext =
      menuFilterEnabled &&
      Boolean(menuDate) &&
      Boolean(mealtime) &&
      Boolean(diningHallId)
    if (!hasContext) {
      setMenuContextItems(new Set())
      setMenuContextStatus('idle')
      setMenuContextError('')
      setContextLabels(new Map())
      return
    }

    const controller = new AbortController()
    let cancelled = false

    const fetchMenuContext = async () => {
      setMenuContextStatus('loading')
      setMenuContextError('')

      const hallIds =
        diningHallId === 'all'
          ? DINING_HALLS.map((hall) => hall.id)
          : [diningHallId]
      const mealIds =
        mealtime === 'all'
          ? ['breakfast', 'lunch', 'dinner']
          : [mealtime]

      try {
        const allIds = new Set()
        const labels = new Map()
        for (const hall of hallIds) {
          for (const meal of mealIds) {
            const params = new URLSearchParams({
              hallid: hall,
              meal,
              date: menuDate,
            })
            const response = await fetch(
              `https://husky-eats.onrender.com/api/menu?${params.toString()}`,
              { signal: controller.signal },
            )

            if (!response.ok) {
              throw new Error(
                `Menu request failed with status ${response.status}`,
              )
            }

            const payload = await response.json()
            if (!Array.isArray(payload)) {
              throw new Error('Unexpected menu response format.')
            }

            for (const item of payload) {
              if (item?.id != null) {
                const key = String(item.id)
                allIds.add(key)
                const hallName =
                  hall === 'all'
                    ? 'All halls'
                    : DINING_HALLS.find((h) => String(h.id) === String(hall))
                        ?.name || `Hall ${hall}`

                const formatMeal = (value) =>
                  value.charAt(0).toUpperCase() + value.slice(1)

                const parts = []
                if (diningHallId === 'all') {
                  parts.push(hallName)
                }
                if (mealtime === 'all') {
                  parts.push(formatMeal(meal))
                }
                let label = parts.join(' — ')
                if (!label) {
                  label = mealtime !== 'all' ? formatMeal(meal) : hallName
                }
                if (!labels.has(key)) {
                  labels.set(key, new Set())
                }
                labels.get(key).add(label)
              }
            }
          }
        }

        if (cancelled) return
        setMenuContextItems(allIds)
        setMenuContextStatus('success')
        setContextLabels(labels)
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          error.name === 'AbortError'
        ) {
          return
        }
        if (!cancelled) {
          setMenuContextStatus('error')
          setMenuContextError(
            error instanceof Error && error.message
              ? error.message
              : 'Failed to load menu for selected context.',
          )
        }
      }
    }

    fetchMenuContext()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [diningHallId, mealtime, menuDate, menuFilterEnabled, filterVersion])

  const coverageById = useMemo(() => {
    const map = new Map()

    for (const record of records) {
      const items = Array.isArray(record?.items) ? record.items : []
      const plateHasMultiple = items.length > 1

      for (const item of items) {
        const id = String(item?.menuItemId || '').trim()
        if (!id) continue

        if (!map.has(id)) {
          map.set(id, {
            total: 0,
            multiCount: 0,
            solo0to1: 0,
            solo1to2: 0,
            solo2plus: 0,
          })
        }
        const entry = map.get(id)
        entry.total += 1
        if (plateHasMultiple) {
          entry.multiCount += 1
        } else {
          const servings = Number(item?.servings)
          if (Number.isFinite(servings)) {
            if (servings <= 1) {
              entry.solo0to1 += 1
            } else if (servings <= 2) {
              entry.solo1to2 += 1
            } else {
              entry.solo2plus += 1
            }
          } else {
            entry.solo0to1 += 1
          }
        }
      }
    }

    return map
  }, [records])

  const rows = useMemo(() => {
    const searchTerm = appliedSearch.trim().toLowerCase()
    const baseItems = menuItems.length > 0 ? menuItems : []

    const combined = baseItems.map((menuItem) => {
      const coverage = coverageById.get(menuItem.id) || {
        total: 0,
        multiCount: 0,
        solo0to1: 0,
        solo1to2: 0,
        solo2plus: 0,
      }

      return {
        id: menuItem.id,
        name: menuItem.name,
        ...coverage,
        inMenu: menuContextItems.has(menuItem.id),
        contexts: Array.from(contextLabels.get(menuItem.id) || []),
      }
    })

    // Include dataset-only IDs not in catalog
    for (const [id, coverage] of coverageById.entries()) {
      if (!combined.find((row) => row.id === id)) {
        combined.push({
          id,
          name: '',
          ...coverage,
          inMenu: menuContextItems.has(id),
          contexts: Array.from(contextLabels.get(id) || []),
        })
      }
    }

    const filtered = combined.filter((row) => {
      if (!searchTerm) return true
      return (
        row.id.toLowerCase().includes(searchTerm) ||
        (row.name || '').toLowerCase().includes(searchTerm)
      )
    })

    const menuFiltered = menuFilterEnabled
      ? filtered.filter((row) => row.inMenu)
      : filtered

    return menuFiltered.sort((a, b) => {
      const countDiff = b.multiCount - a.multiCount
      if (countDiff !== 0) return countDiff
      return a.id.localeCompare(b.id, undefined, { numeric: true })
    })
  }, [
    appliedSearch,
    coverageById,
    menuContextItems,
    menuItems,
    menuFilterEnabled,
    filterVersion,
  ])

  const totalCatalog = menuItems.length
  const coveredCount = useMemo(() => {
    let count = 0
    for (const menuItem of menuItems) {
      const coverage = coverageById.get(menuItem.id)
      if (coverage && coverage.total > 0) {
        count += 1
      }
    }
    return count
  }, [coverageById, menuItems])

  const visibleCount = rows.length

  return (
    <section className="space-y-8">
      <ApiTokenStatusCard />

      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Coverage Overview
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          See which Husky Eats menu items have been labeled, how often they appear
          on multi-item plates, and serving distributions for solo plates.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Menu item coverage
            </h2>
            <p className="text-sm text-slate-600">
              {totalCatalog
                ? `Showing ${visibleCount} ${
                    visibleCount === 1 ? 'item' : 'items'
                  } (covered ${coveredCount} of ${totalCatalog} catalog items).`
                : 'Loading catalog…'}
            </p>
            {datasetStatus === 'error' && datasetError ? (
              <p className="text-xs text-red-600">{datasetError}</p>
            ) : null}
            {menuStatus === 'error' && menuError ? (
              <p className="text-xs text-red-600">{menuError}</p>
            ) : null}
            {menuContextStatus === 'error' && menuContextError ? (
              <p className="text-xs text-red-600">{menuContextError}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                value={pendingSearch}
                onChange={(e) => setPendingSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    setAppliedSearch(pendingSearch)
                    if (!menuDate) {
                      setMenuFilterEnabled(false)
                      setMenuContextItems(new Set())
                      setMenuContextStatus('idle')
                      setMenuContextError('')
                    } else {
                      setMenuFilterEnabled(true)
                    }
                    setFilterVersion((prev) => prev + 1)
                  }
                }}
                placeholder="Search by ID or name"
                className="w-60 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
              />
              <button
                type="button"
                onClick={() => {
                  setAppliedSearch(pendingSearch)
                  if (!menuDate) {
                    setMenuFilterEnabled(false)
                    setMenuContextItems(new Set())
                    setMenuContextStatus('idle')
                    setMenuContextError('')
                  } else {
                    setMenuFilterEnabled(true)
                  }
                  setFilterVersion((prev) => prev + 1)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
              >
                Apply filters
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingSearch('')
                  setAppliedSearch('')
                  setMenuDate('')
                  setMealtime('all')
                  setDiningHallId('all')
                  setMenuFilterEnabled(false)
                  setMenuContextItems(new Set())
                  setMenuContextStatus('idle')
                  setMenuContextError('')
                  setFilterVersion((prev) => prev + 1)
                }}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
              >
                Reset filters
              </button>
              {!authToken ? (
                <button
                  type="button"
                  onClick={openTokenModal}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
                >
                  Set API token
                </button>
              ) : null}
            </div>
            <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Menu context
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="date"
                  value={menuDate}
                  onChange={(e) => setMenuDate(e.target.value)}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
                <select
                  value={mealtime}
                  onChange={(e) => setMealtime(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  {mealtimeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <select
                  value={diningHallId}
                  onChange={(e) => setDiningHallId(e.target.value)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                >
                  <option value="all">All halls</option>
                  {DINING_HALLS.map((hall) => (
                    <option key={hall.id} value={hall.id}>
                      {hall.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {!authToken ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-600">
              Set the team API token above to fetch dataset entries.
            </div>
          ) : null}

          {datasetStatus === 'loading' || menuStatus === 'loading' ? (
            <p className="text-sm text-slate-600">Loading coverage…</p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">ID</th>
                    <th className="px-4 py-3 text-left font-semibold">Name</th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Multi-item plates
                    </th>
                    {menuFilterEnabled ? (
                      <th className="px-4 py-3 text-left font-semibold">
                        Location
                      </th>
                    ) : null}
                    <th className="px-4 py-3 text-left font-semibold">
                      Total appearances
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">Solo 0–1</th>
                    <th className="px-4 py-3 text-left font-semibold">Solo 1–2</th>
                    <th className="px-4 py-3 text-left font-semibold">Solo 2+</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {rows.map((row) => {
                    const badgeClasses =
                      row.multiCount > 0
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    return (
                      <tr key={row.id} className="even:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-xs text-slate-800">
                          {row.id || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {row.name || '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeClasses}`}
                          >
                            {row.multiCount}
                          </span>
                        </td>
                        {menuFilterEnabled ? (
                          <td className="px-4 py-3 text-slate-800">
                            {row.contexts && row.contexts.length > 0 ? (
                              <div className="flex flex-col gap-2">
                                {row.contexts.map((context) => (
                                  <span
                                    key={`${row.id}-${context}`}
                                    className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
                                  >
                                    {context}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-500">—</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-slate-800">{row.total}</td>
                        <td className="px-4 py-3 text-slate-800">{row.solo0to1}</td>
                        <td className="px-4 py-3 text-slate-800">{row.solo1to2}</td>
                        <td className="px-4 py-3 text-slate-800">{row.solo2plus}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            authToken && (
              <p className="text-sm text-slate-600">
                {menuFilterEnabled
                  ? 'No menu items were found for the selected menu context.'
                  : 'No catalog items to display yet.'}
              </p>
            )
          )}
        </div>
      </div>
    </section>
  )
}

export default CoveragePage
