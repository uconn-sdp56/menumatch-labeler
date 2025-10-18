import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_RESULTS = 8

function MenuItemSearch({
  items,
  status,
  error,
  selectedId,
  onSelect,
  onRetry,
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  const selectedItem = useMemo(() => {
    if (!selectedId) {
      return undefined
    }
    return items.find((item) => item.id === selectedId)
  }, [items, selectedId])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) {
      return
    }

    const handlePointerDown = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        inputRef.current?.blur()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKey)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const normalizedQuery = query.trim().toLowerCase()
  const canSearch = status === 'success'

  const filteredItems = useMemo(() => {
    if (!canSearch || !items.length) {
      return []
    }

    if (!normalizedQuery) {
      return items.slice(0, MAX_RESULTS)
    }

    const matches = items.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(normalizedQuery)
      const idMatch = item.id.includes(normalizedQuery)
      return nameMatch || idMatch
    })

    return matches.slice(0, MAX_RESULTS)
  }, [canSearch, items, normalizedQuery])

  useEffect(() => {
    if (activeIndex >= filteredItems.length) {
      setActiveIndex(0)
    }
  }, [filteredItems.length, activeIndex])

  const handleFocus = () => {
    setOpen(true)
    setQuery((previous) => {
      if (previous) {
        return previous
      }
      return selectedItem ? selectedItem.name : ''
    })
  }

  const handleSelect = (item) => {
    onSelect(item.id)
    setOpen(false)
    setQuery('')
    inputRef.current?.blur()
  }

  const handleKeyDown = (event) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      setOpen(true)
      return
    }

    if (!open) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((previous) =>
        filteredItems.length === 0
          ? 0
          : (previous + 1) % filteredItems.length,
      )
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((previous) =>
        filteredItems.length === 0
          ? 0
          : (previous - 1 + filteredItems.length) % filteredItems.length,
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const focusedItem = filteredItems[activeIndex]
      if (focusedItem) {
        handleSelect(focusedItem)
      }
    }
  }

  const showDropdown = open

  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
        Search Husky Eats catalog
      </span>
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="search"
          placeholder="Search by name or ID"
          value={showDropdown ? query : selectedItem?.name ?? ''}
          onFocus={handleFocus}
          onChange={(event) => {
            setQuery(event.target.value)
            if (!open) {
              setOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        />

        {showDropdown ? (
          <div className="absolute left-0 right-0 z-20 mt-2 max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {status === 'loading' ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                Loading menu catalog…
              </p>
            ) : status === 'error' ? (
              <div className="space-y-2 px-3 py-3 text-sm text-red-600">
                <p>Unable to load menu items. You can still enter the ID.</p>
                {onRetry ? (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:border-red-300 hover:bg-red-50"
                  >
                    Retry fetch
                  </button>
                ) : null}
                {error ? (
                  <p className="text-xs text-red-500">Error: {error}</p>
                ) : null}
              </div>
            ) : filteredItems.length > 0 ? (
              <ul className="divide-y divide-slate-100 text-sm text-slate-700">
                {filteredItems.map((item, index) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => handleSelect(item)}
                      className={[
                        'flex w-full flex-col gap-0.5 px-3 py-2 text-left transition',
                        index === activeIndex
                          ? 'bg-slate-100 text-slate-900'
                          : 'hover:bg-slate-50',
                      ].join(' ')}
                    >
                      <span className="font-medium">{item.name}</span>
                      <span className="text-xs text-slate-500">
                        Item ID: {item.id}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : canSearch ? (
              <p className="px-3 py-2 text-sm text-slate-500">
                No matches. Try a different name or ID.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default MenuItemSearch
