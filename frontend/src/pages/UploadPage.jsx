import { useEffect, useMemo, useRef, useState } from 'react'
import DiningHallReference from '../components/DiningHallReference.jsx'

const difficultyOptions = [
  {
    value: 'very_simple',
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
  const [metadata, setMetadata] = useState({
    mealtime: '',
    date: '',
    diningHallId: '',
    difficulty: '',
  })
  const [items, setItems] = useState([{ id: 0, menuItemId: '', servings: '' }])
  const nextItemId = useRef(1)

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    setPlateImage((previous) => {
      if (previous?.previewUrl) {
        URL.revokeObjectURL(previous.previewUrl)
      }

      if (!file) {
        return null
      }

      return {
        file,
        previewUrl: URL.createObjectURL(file),
      }
    })
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

  const handleSubmit = (event) => {
    event.preventDefault()
    // Wire up to upload + metadata Lambda in a later pass.
  }

  return (
    <section className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Upload Plate Data
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          Start a new labeling session by uploading a plate image, tagging it
          with dining context, then listing every menu item and its serving
          count. We&apos;ll wire this form to S3 and DynamoDB in the next
          iteration.
        </p>
      </header>

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
            </div>
            <input
              id="plate-image"
              name="plate-image"
              type="file"
              accept="image/png, image/jpeg"
              className="sr-only"
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
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="e.g. 3 or dh-woodworth"
                    value={metadata.diningHallId}
                    onChange={setMetadataField('diningHallId')}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                    required
                  />
                  <p className="text-xs text-slate-500">
                    Tip: Select a hall from the reference list below to auto-fill this
                    field.
                  </p>
                </div>
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

            <DiningHallReference
              onSelect={(hall) =>
                setMetadata((previous) => ({
                  ...previous,
                  diningHallId: String(hall.id),
                }))
              }
            />
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
                items.map((item, index) => (
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
                          placeholder="e.g. menu-12345"
                          value={item.menuItemId}
                          onChange={(event) =>
                            updateItemField(item.id, 'menuItemId', event.target.value)
                          }
                          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                        />
                      </label>
                    </div>

                    <label className="w-full space-y-1 sm:w-40">
                      <span className="text-sm font-medium text-slate-700">
                        Servings
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
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
                ))
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
          <span className="text-sm text-slate-500">
            We&apos;ll enable submission once the backend upload flow is ready.
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              className="rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              Save Draft
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}

export default UploadPage
