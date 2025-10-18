function UploadPage() {
  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Upload Plate Data
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          Start a new labeling session by uploading a reference photo of a
          plate, then list every menu item along with optional serving
          information. We&apos;ll expand this form with image upload, item
          collections, and nutrition helpers next.
        </p>
      </header>

      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
        Upload workflow UI coming soon. You&apos;ll be able to add a plate
        image, create menu item entries, and capture serving details here.
      </div>
    </section>
  )
}

export default UploadPage
