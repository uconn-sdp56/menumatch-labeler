import { useEffect, useMemo, useRef, useState } from 'react'
import MenuItemSearch from '../components/MenuItemSearch.jsx'
import { API_BASE_URL } from '../lib/config.js'
import { DINING_HALLS } from '../lib/diningHalls.js'
import {
  clearAuthToken,
  getStoredAuthToken,
  persistAuthToken,
} from '../lib/auth.js'

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024
const REQUIRED_IMAGE_SIZE = 1024
const INITIAL_METADATA = Object.freeze({
  mealtime: '',
  date: '',
  diningHallId: '',
  difficulty: '',
})
const INITIAL_ITEM = Object.freeze({ id: 0, menuItemId: '', servings: '' })

const difficultyOptions = [
  {
    value: 'simple',
    label: 'Simple',
    helper: '1 item, minimal stacking',
  },
  {
    value: 'moderate',
    label: 'Moderate',
    helper: '2-4 items, clearly separated',
  },
  {
    value: 'difficult',
    label: 'Difficult',
    helper: '2-4 items, mixed around',
  },
  {
    value: 'impossible',
    label: 'Impossible',
    helper: 'Literal blob of many different items',
  },
]

function UploadPage() {
  const [plateImage, setPlateImage] = useState(null)
  const [metadata, setMetadata] = useState(() => ({ ...INITIAL_METADATA }))
  const [items, setItems] = useState(() => [{ ...INITIAL_ITEM }])
  const [menuItems, setMenuItems] = useState([])
  const [menuItemsStatus, setMenuItemsStatus] = useState('idle')
  const [menuItemsError, setMenuItemsError] = useState('')
  const [menuItemsRequestId, setMenuItemsRequestId] = useState(0)
  const nextItemId = useRef(1)
  const [uploadError, setUploadError] = useState('')
  const [submitStatus, setSubmitStatus] = useState('idle')
  const [submitMessage, setSubmitMessage] = useState('')
  const [authToken, setAuthToken] = useState(() => getStoredAuthToken())
  const [tokenInput, setTokenInput] = useState(() => getStoredAuthToken())
  const [tokenModalOpen, setTokenModalOpen] = useState(() => !getStoredAuthToken())
  const [tokenFeedback, setTokenFeedback] = useState('')
  const fileInputRef = useRef(null)
  const validationTokenRef = useRef(0)
  const isSubmitting = submitStatus === 'submitting'
  const maskedToken = useMemo(() => {
    if (!authToken) {
      return ''
    }
    if (authToken.length <= 4) {
      return '••••'
    }
    return `••••${authToken.slice(-4)}`
  }, [authToken])
  const menuContextReady =
    Boolean(metadata.mealtime) &&
    Boolean(metadata.date) &&
    Boolean(metadata.diningHallId)

  const formatFileSize = (bytes) => {
    if (!bytes) {
      return '0 B'
    }
    if (bytes < 1024) {
      return `${bytes} B`
    }
    if (bytes < 1024 * 1024) {
      return `${Math.round(bytes / 1024)} KB`
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  const menuItemsLookup = useMemo(() => {
    const lookup = new Map()
    for (const item of menuItems) {
      lookup.set(item.id, item)
    }
    return lookup
  }, [menuItems])

  const selectedDiningHall = useMemo(
    () => DINING_HALLS.find((hall) => String(hall.id) === metadata.diningHallId),
    [metadata.diningHallId],
  )

  const formattedMenuDate = useMemo(() => {
    if (!metadata.date) {
      return ''
    }
    const date = new Date(`${metadata.date}T00:00:00`)
    if (Number.isNaN(date.getTime())) {
      return metadata.date
    }
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date)
  }, [metadata.date])

  const menuContextSummary = useMemo(() => {
    if (!menuContextReady) {
      return ''
    }
    const parts = []
    if (selectedDiningHall?.name) {
      parts.push(selectedDiningHall.name)
    } else if (metadata.diningHallId) {
      parts.push(`Hall ${metadata.diningHallId}`)
    }
    if (metadata.mealtime) {
      parts.push(
        metadata.mealtime.charAt(0).toUpperCase() + metadata.mealtime.slice(1),
      )
    }
    if (formattedMenuDate) {
      parts.push(formattedMenuDate)
    }
    return parts.join(' • ')
  }, [
    formattedMenuDate,
    menuContextReady,
    metadata.diningHallId,
    metadata.mealtime,
    selectedDiningHall?.name,
  ])

  const menuHelperMessage = useMemo(() => {
    if (!menuContextReady) {
      return 'Select mealtime, date, and dining hall to load the current menu.'
    }
    if (menuItemsStatus === 'loading') {
      return menuContextSummary
        ? `Loading menu for ${menuContextSummary}…`
        : 'Loading menu for selected context…'
    }
    if (menuItemsStatus === 'error') {
      return 'We couldn’t load the menu. You can still type an item ID manually or retry.'
    }
    if (menuItemsStatus === 'success' && menuItems.length === 0) {
      return menuContextSummary
        ? `No items listed for ${menuContextSummary}. Enter IDs manually if needed.`
        : 'No items listed for this selection. Enter IDs manually if needed.'
    }
    if (menuItemsStatus === 'success') {
      return menuContextSummary
        ? `Showing ${menuItems.length} items for ${menuContextSummary}.`
        : `Showing ${menuItems.length} items.`
    }
    return ''
  }, [
    menuContextReady,
    menuItems.length,
    menuItemsStatus,
    menuContextSummary,
  ])

  const retryMenuItems = () => {
    if (menuContextReady) {
      setMenuItemsRequestId((previous) => previous + 1)
    }
  }

  useEffect(() => {
    if (!menuContextReady) {
      setMenuItems([])
      setMenuItemsStatus('idle')
      setMenuItemsError('')
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const loadMenuItems = async () => {
      setMenuItemsStatus('loading')
      setMenuItemsError('')
      try {
        const params = new URLSearchParams({
          hallid: metadata.diningHallId,
          meal: metadata.mealtime,
          date: metadata.date,
        })

        const response = await fetch(
          `https://husky-eats.onrender.com/api/menu?${params.toString()}`,
          { signal: controller.signal },
        )

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }

        const payload = await response.json()
        if (cancelled) {
          return
        }

        if (!Array.isArray(payload)) {
          throw new Error('Unexpected response format.')
        }

        const uniqueById = new Map()
        for (const item of payload) {
          if (!item || item.id == null || !item.name) {
            continue
          }
          const id = String(item.id)
          if (!uniqueById.has(id)) {
            uniqueById.set(id, {
              id,
              name: item.name,
              station: item.station ?? '',
            })
          }
        }

        const uniqueItems = Array.from(uniqueById.values()).sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
        )

        setMenuItems(uniqueItems)
        setMenuItemsStatus('success')
      } catch (error) {
        if (cancelled || error.name === 'AbortError') {
          return
        }

        setMenuItems([])
        setMenuItemsStatus('error')
        setMenuItemsError(error.message ?? 'Failed to load menu items.')
      }
    }

    loadMenuItems()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [
    menuContextReady,
    metadata.date,
    metadata.diningHallId,
    metadata.mealtime,
    menuItemsRequestId,
  ])

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    validationTokenRef.current += 1
    const currentToken = validationTokenRef.current

    setPlateImage(null)

    if (!file) {
      setUploadError('')
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        `Image must be under 2 MB. Selected file is ${formatFileSize(file.size)}.`,
      )
      window.alert(
        `Image must be under 2 MB. Selected file is ${formatFileSize(file.size)}.`,
      )
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return
    }

    const previewUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      if (validationTokenRef.current !== currentToken) {
        URL.revokeObjectURL(previewUrl)
        return
      }

      const { width, height } = img

      if (width !== REQUIRED_IMAGE_SIZE || height !== REQUIRED_IMAGE_SIZE) {
        URL.revokeObjectURL(previewUrl)
        setUploadError(
          `Image must be ${REQUIRED_IMAGE_SIZE}×${REQUIRED_IMAGE_SIZE}. Selected file is ${width}×${height}.`,
        )
        window.alert(
          `Image must be ${REQUIRED_IMAGE_SIZE}×${REQUIRED_IMAGE_SIZE}. Selected file is ${width}×${height}.`,
        )
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }

      setUploadError('')
      setPlateImage({
        file,
        previewUrl,
        width,
        height,
      })
    }

    img.onerror = () => {
      if (validationTokenRef.current === currentToken) {
        setUploadError('Unable to read image file. Please try again.')
        window.alert('Unable to read image file. Please try again.')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }
      URL.revokeObjectURL(previewUrl)
    }

    img.src = previewUrl
  }

  useEffect(() => {
    return () => {
      if (plateImage?.previewUrl) {
        URL.revokeObjectURL(plateImage.previewUrl)
      }
    }
  }, [plateImage])

  const setMetadataField = (field) => (event) => {
    const { value } = event.target
    setMetadata((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const updateItemField = (itemId, field, value) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === itemId
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    )
  }

  const addItem = () => {
    const newItem = {
      id: nextItemId.current,
      menuItemId: '',
      servings: '',
    }
    nextItemId.current += 1
    setItems((previous) => [...previous, newItem])
  }

  const removeItem = (itemId) => {
    setItems((previous) => previous.filter((item) => item.id !== itemId))
  }

  const hasItems = useMemo(() => items.length > 0, [items.length])

  const resetForm = () => {
    if (plateImage?.previewUrl) {
      URL.revokeObjectURL(plateImage.previewUrl)
    }

    validationTokenRef.current += 1
    setPlateImage(null)
    setMetadata(() => ({ ...INITIAL_METADATA }))
    nextItemId.current = 1
    setItems(() => [{ ...INITIAL_ITEM }])

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openTokenDialog = () => {
    setTokenInput(authToken)
    setTokenFeedback('')
    setTokenModalOpen(true)
  }

  const handleTokenSubmit = (event) => {
    event.preventDefault()
    const trimmed = tokenInput.trim()
    if (!trimmed) {
      setTokenFeedback('Enter your team API token to continue.')
      return
    }
    persistAuthToken(trimmed)
    setAuthToken(trimmed)
    setTokenInput(trimmed)
    setTokenModalOpen(false)
    setTokenFeedback('')
  }

  const handleTokenReset = () => {
    clearAuthToken()
    setAuthToken('')
    setTokenInput('')
    setTokenFeedback('')
    setTokenModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (submitStatus === 'submitting') {
      return
    }

    if (!plateImage?.file) {
      setSubmitStatus('error')
      setSubmitMessage('Upload a plate image before saving the draft.')
      return
    }

    if (!authToken) {
      setSubmitStatus('error')
      setSubmitMessage('Enter the team API token before saving the draft.')
      openTokenDialog()
      return
    }

    const normalizedItems = items
      .map((item) => ({
        menuItemId: String(item.menuItemId || '').trim(),
        servings: Number(item.servings),
      }))
      .filter((item) => item.menuItemId.length > 0)

    if (normalizedItems.length === 0) {
      setSubmitStatus('error')
      setSubmitMessage('Add at least one menu item with servings.')
      return
    }

    const invalidItem = normalizedItems.find(
      (item) => Number.isNaN(item.servings) || !Number.isFinite(item.servings),
    )
    if (invalidItem) {
      setSubmitStatus('error')
      setSubmitMessage('Servings must be a valid number for every item.')
      return
    }

    setSubmitStatus('submitting')
    setSubmitMessage('')

    try {
      const authHeaders = {
        'X-Api-Key': authToken,
      }

      const presignResponse = await fetch(`${API_BASE_URL}/uploads/presign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          filename: plateImage.file.name,
          contentType: plateImage.file.type,
        }),
      })

      if (!presignResponse.ok) {
        let errorMessage = `Failed to get upload URL (status ${presignResponse.status}).`
        try {
          const payload = await presignResponse.json()
          if (payload?.message) {
            errorMessage = payload.message
          }
        } catch (error) {
          // ignore JSON parse failures
        }
        throw new Error(errorMessage)
      }

      const presignData = await presignResponse.json()
      const uploadHeaders = new Headers(presignData.headers || {})
      if (!uploadHeaders.has('Content-Type') && plateImage.file.type) {
        uploadHeaders.set('Content-Type', plateImage.file.type)
      }

      const uploadResponse = await fetch(presignData.uploadUrl, {
        method: presignData.method || 'PUT',
        headers: uploadHeaders,
        body: plateImage.file,
      })

      if (!uploadResponse.ok) {
        throw new Error(`S3 upload failed with status ${uploadResponse.status}.`)
      }

      const metadataPayload = {
        objectKey: presignData.objectKey,
        bucket: presignData.bucket,
        mealtime: metadata.mealtime,
        date: metadata.date,
        diningHallId: metadata.diningHallId,
        difficulty: metadata.difficulty,
        items: normalizedItems,
      }

      if (!metadataPayload.bucket) {
        delete metadataPayload.bucket
      }

      const metadataResponse = await fetch(`${API_BASE_URL}/uploads/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify(metadataPayload),
      })

      if (!metadataResponse.ok) {
        let errorMessage = `Failed to save metadata (status ${metadataResponse.status}).`
        try {
          const payload = await metadataResponse.json()
          if (payload?.message) {
            errorMessage = payload.message
          }
        } catch (error) {
          // ignore JSON parse failures
        }
        throw new Error(errorMessage)
      }

      const metadataResult = await metadataResponse.json()

      resetForm()

      setSubmitStatus('success')
      setSubmitMessage(
        metadataResult?.objectKey
          ? 'Upload saved. Ready for the next plate!'
          : 'Upload saved.',
      )
    } catch (error) {
      console.error(error)
      setSubmitStatus('error')
      setSubmitMessage(error.message || 'Upload failed. Please try again.')
    }
  }

  return (
    <>
      {tokenModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-8">
          <form
            onSubmit={handleTokenSubmit}
            className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-lg"
          >
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">
                Enter API Token
              </h2>
              <p className="text-sm text-slate-600">
                This token authorizes MenuMatch API requests for uploads and
                dataset access. Ask a teammate for the shared token if you
                don&apos;t have it.
              </p>
            </div>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-700">Team token</span>
              <input
                type="password"
                value={tokenInput}
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
                onClick={() => setTokenModalOpen(false)}
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
                onClick={handleTokenReset}
                className="text-left text-xs font-medium text-slate-500 underline decoration-dotted underline-offset-4 hover:text-slate-700"
              >
                Clear saved token
              </button>
            ) : null}
          </form>
        </div>
      ) : null}

      <section className="space-y-10">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Upload Plate Data
          </h1>
          <p className="max-w-2xl text-base text-slate-600">
            Start a new labeling session by uploading a plate image, tagging it
            with dining context, then listing every menu item and its serving
            count. The form now uploads directly to S3 and stores the metadata in
            DynamoDB for your evaluation set.
          </p>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">Before you upload:</p>
            <ul className="mt-1 list-inside list-disc space-y-1">
              <li>
                Resize the photo to{' '}
                <span className="font-semibold">1024 × 1024 pixels</span> using{' '}
                <a
                  className="underline decoration-dotted underline-offset-4 hover:text-amber-900"
                  href="https://new.express.adobe.com/tools/resize-image"
                  target="_blank"
                  rel="noreferrer"
                >
                  Adobe Express
                </a>
                .
              </li>
              <li>
                Keep the file under <span className="font-semibold">2 MB</span> if
                possible for faster uploads.
              </li>
              <li>
                Crop or frame the image so the plate is centered in the square.
              </li>
            </ul>
          </div>
        </header>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-slate-800">Team API token</span>
            <span>
              {authToken
                ? `Configured (${maskedToken || '••••'})`
                : 'Not yet configured'}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={openTokenDialog}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-white"
            >
              {authToken ? 'Update token' : 'Set token'}
            </button>
            {authToken ? (
              <button
                type="button"
                onClick={handleTokenReset}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-500 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>

        <form
        onSubmit={handleSubmit}
        className="space-y-10 rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h2 className="text-xl font-semibold text-slate-900">
              1. Plate Image
            </h2>
            <p className="text-sm text-slate-500">
              Upload the reference photo you&apos;ll annotate. We support JPG or
              PNG up to 25 MB.
            </p>
          </div>

          <label
            htmlFor="plate-image"
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:border-slate-400 hover:bg-slate-100"
          >
            <div className="flex flex-col items-center gap-2 text-slate-500">
              <span className="text-sm font-medium text-slate-700">
                Drag & drop or click to upload
              </span>
              <span className="text-xs">
                {plateImage?.file
                  ? plateImage.file.name
                  : 'High-quality photo of the plate'}
              </span>
              {plateImage?.file ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 shadow">
                  {formatFileSize(plateImage.file.size)}
                  {plateImage.width && plateImage.height
                    ? ` • ${plateImage.width}×${plateImage.height}`
                    : null}
                </span>
              ) : (
                <span className="text-[11px] text-slate-400">
                  Target &lt; 2 MB, 1024×1024
                </span>
              )}
            </div>
            <input
              id="plate-image"
              name="plate-image"
              type="file"
              accept="image/png, image/jpeg"
              className="sr-only"
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            {plateImage?.previewUrl ? (
              <div className="mt-4 flex justify-center">
                <img
                  src={plateImage.previewUrl}
                  alt="Plate preview"
                  className="h-44 w-44 rounded-md object-cover shadow-sm"
                />
              </div>
            ) : null}
          </label>
          {uploadError ? (
            <div
              className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700 shadow-sm"
              role="alert"
            >
              <span className="text-lg leading-none">⚠️</span>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-red-800">
                  Image needs adjustment
                </p>
                <p className="text-sm text-red-700">{uploadError}</p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-slate-900">
                2. Dining Context
              </h2>
              <p className="text-sm text-slate-500">
                Capture when and where the photo was taken so we can group
                plates by meal service.
              </p>
            </div>
          </div>
          <div className="lg:col-span-3 space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Mealtime
                </span>
                <select
                  value={metadata.mealtime}
                  onChange={setMetadataField('mealtime')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  required
                >
                  <option value="" disabled>
                    Select mealtime
                  </option>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-slate-700">
                  Date
                </span>
                <input
                  type="date"
                  value={metadata.date}
                  onChange={setMetadataField('date')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  required
                />
              </label>

              <label className="space-y-2 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  Dining Hall ID
                </span>
                <select
                  value={metadata.diningHallId}
                  onChange={setMetadataField('diningHallId')}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                  required
                >
                  <option value="" disabled>
                    Select dining hall
                  </option>
                  {DINING_HALLS.map((hall) => (
                    <option key={hall.id} value={hall.id}>
                      {hall.id} — {hall.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-700">
                Classification Difficulty
              </legend>
              <div className="space-y-2">
                {difficultyOptions.map(({ value, label, helper }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={value}
                      checked={metadata.difficulty === value}
                      onChange={setMetadataField('difficulty')}
                      className="mt-1 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-200"
                      required
                    />
                    <span>
                      <span className="font-medium text-slate-900">{label}</span>
                      <span className="block text-xs text-slate-500">
                        {helper}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="space-y-1.5">
              <h2 className="text-xl font-semibold text-slate-900">
                3. Plate Items
              </h2>
              <p className="text-sm text-slate-500">
                Add every menu item you see on the plate along with the number
                of servings. We&apos;ll support autocomplete and nutrition
                lookups later.
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 space-y-4">
            <div className="space-y-4">
              {hasItems ? (
                items.map((item, index) => {
                  const selectedMenuItem = menuItemsLookup.get(item.menuItemId)
                  const unmatchedSelection =
                    item.menuItemId &&
                    !selectedMenuItem &&
                    menuItemsStatus === 'success'

                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 shadow-sm sm:flex-row sm:items-start"
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-500">
                          <span>Item {index + 1}</span>
                          <span>ID: {item.id}</span>
                        </div>
                        <label className="space-y-1">
                          <span className="text-sm font-medium text-slate-700">
                            Menu Item ID
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. 61001"
                            value={item.menuItemId}
                            onChange={(event) =>
                              updateItemField(item.id, 'menuItemId', event.target.value)
                            }
                            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                          <MenuItemSearch
                            items={menuItems}
                            status={menuItemsStatus}
                            error={menuItemsError}
                            selectedId={item.menuItemId}
                            helperMessage={menuHelperMessage}
                            onSelect={(menuItemId) =>
                              updateItemField(item.id, 'menuItemId', menuItemId)
                            }
                            onRetry={retryMenuItems}
                          />
                          {selectedMenuItem ? (
                            <p className="text-xs text-slate-500">
                              Selected:{' '}
                              <span className="font-medium text-slate-700">
                                {selectedMenuItem.name}
                              </span>
                            </p>
                          ) : null}
                          {unmatchedSelection ? (
                            <p className="text-xs text-amber-600">
                              This ID is not in the Husky Eats catalog. Double-check
                              the value or search again.
                            </p>
                          ) : null}
                        </label>
                      </div>

                      <label className="w-full space-y-1 sm:w-40">
                      <span className="text-sm font-medium text-slate-700">
                        Servings
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        required
                        placeholder="1"
                        value={item.servings}
                        onChange={(event) =>
                          updateItemField(item.id, 'servings', event.target.value)
                        }
                        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      className="self-start rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                    >
                      Remove
                    </button>
                  </div>
                  )
                })
              ) : (
                <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  No items yet. Add your first menu item below.
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-100"
            >
              <span className="text-base leading-none">＋</span>
              Add Menu Item
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2 text-sm text-slate-500 sm:max-w-md">
            <p>
              Saving uploads the plate image to S3 and records the labeling metadata.
            </p>
            {submitStatus === 'error' ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
                {submitMessage}
              </div>
            ) : null}
            {submitStatus === 'success' ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-sm">
                {submitMessage}
              </div>
            ) : null}
            {isSubmitting ? (
              <p className="text-xs font-medium text-slate-500">Uploading…</p>
            ) : null}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                resetForm()
                setSubmitStatus('idle')
                setSubmitMessage('')
              }}
              disabled={isSubmitting}
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:hover:bg-slate-700"
            >
              {isSubmitting ? 'Saving…' : 'Save Draft'}
            </button>
          </div>
        </div>
      </form>
      </section>
    </>
  )
}

export default UploadPage
