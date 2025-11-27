import { useEffect, useMemo, useState } from 'react'

import ApiTokenStatusCard from '../components/ApiTokenStatusCard.jsx'
import { useApiToken } from '../components/ApiTokenProvider.jsx'
import { API_BASE_URL } from '../lib/config.js'

function CoveragePage() {
  const { authToken, openTokenModal } = useApiToken()
  const [datasetStatus, setDatasetStatus] = useState('idle')
  const [datasetError, setDatasetError] = useState('')
  const [records, setRecords] = useState([])

  const [menuStatus, setMenuStatus] = useState('idle')
  const [menuError, setMenuError] = useState('')
  const [menuItems, setMenuItems] = useState([])

  const [search, setSearch] = useState('')

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
    const searchTerm = search.trim().toLowerCase()
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
      }
    })

    // Include dataset-only IDs not in catalog
    for (const [id, coverage] of coverageById.entries()) {
      if (!combined.find((row) => row.id === id)) {
        combined.push({
          id,
          name: '',
          ...coverage,
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

    return filtered.sort((a, b) => {
      const countDiff = b.multiCount - a.multiCount
      if (countDiff !== 0) return countDiff
      return a.id.localeCompare(b.id, undefined, { numeric: true })
    })
  }, [coverageById, menuItems, search])

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
                ? `${coveredCount} of ${totalCatalog} catalog items have at least one label.`
                : 'Loading catalog…'}
            </p>
            {datasetStatus === 'error' && datasetError ? (
              <p className="text-xs text-red-600">{datasetError}</p>
            ) : null}
            {menuStatus === 'error' && menuError ? (
              <p className="text-xs text-red-600">{menuError}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID or name"
              className="w-60 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            />
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
                No catalog items to display yet.
              </p>
            )
          )}
        </div>
      </div>
    </section>
  )
}

export default CoveragePage
