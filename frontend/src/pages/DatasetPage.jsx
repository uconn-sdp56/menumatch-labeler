function DatasetPage() {
  return (
    <section className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          Dataset Overview
        </h1>
        <p className="max-w-2xl text-base text-slate-600">
          Review every labeled plate in the MenuMatch dataset. This view will
          grow into a searchable, filterable table with quick links to each
          image, nutrition details, and serving annotations.
        </p>
      </header>

      <div className="rounded-lg border border-slate-200 bg-white p-8">
        <p className="text-sm text-slate-500">
          Dataset table UI coming soon. We&apos;ll surface image thumbnails and
          metadata in this space.
        </p>
      </div>
    </section>
  )
}

export default DatasetPage
