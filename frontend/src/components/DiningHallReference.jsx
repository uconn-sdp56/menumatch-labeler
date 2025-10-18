const halls = [
  {
    id: 3,
    name: 'Connecticut',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-14:30',
    wddinner: '16:00-19:15',
    webrunch: '10:30-14:30',
    wedinner: '16:00-19:15',
    haslatenight: false,
    hasgrabngo: false,
  },
  {
    id: 5,
    name: 'McMahon',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-15:00',
    wddinner: '16-19:15',
    webrunch: '10:30-14:00',
    wedinner: '15:30-19:15',
    haslatenight: false,
    hasgrabngo: false,
  },
  {
    id: 7,
    name: 'North',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-15:00',
    wddinner: '16:30-19:15',
    webrunch: '10:30-15:00',
    wedinner: '16:30-19:15',
    haslatenight: false,
    hasgrabngo: false,
  },
  {
    id: 15,
    name: 'Northwest',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-14:15',
    wddinner: '15:45-19:15',
    webrunch: '10:30-14:15',
    wedinner: '15:45-19:15',
    haslatenight: true,
    hasgrabngo: false,
  },
  {
    id: 6,
    name: 'Putnam',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-14:30',
    wddinner: '16:00-19:15',
    webrunch: '09:30-14:30',
    wedinner: '16:00-19:15',
    haslatenight: false,
    hasgrabngo: true,
  },
  {
    id: 16,
    name: 'South',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-15:00',
    wddinner: '16:30-19:15',
    wesatbreakfast: '07:00-09:30',
    wesunbreakfast: '08:00-09:30',
    webrunch: '9:30-15:00',
    wedinner: '16:30-19:15',
    haslatenight: true,
    hasgrabngo: false,
  },
  {
    id: 42,
    name: 'Towers',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-15:00',
    wddinner: '16:30-19:15',
    webrunch: '09:30-15:00',
    wedinner: '16:30-19:15',
    haslatenight: false,
    hasgrabngo: true,
  },
  {
    id: 1,
    name: 'Whitney',
    wdbreakfast: '07:00-10:45',
    wdlunch: '11:00-15:00',
    wddinner: '16:30-19:15',
    webrunch: '10:30-15:00',
    wedinner: '16:30-19:15',
    haslatenight: false,
    hasgrabngo: false,
  },
]

function DiningHallReference({ onSelect }) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Dining Hall IDs
          </h3>
          <p className="text-xs text-slate-500">
            Click an ID to use it in the form.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
          {halls.length} halls
        </span>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-slate-100">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">
                ID
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Hall
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">
                Weekday Meals
              </th>
              <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">
                Extras
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {halls.map((hall) => (
              <tr
                key={hall.id}
                className="group cursor-pointer hover:bg-slate-50"
                onClick={() => onSelect?.(hall)}
              >
                <td className="whitespace-nowrap px-3 py-2 font-medium text-slate-900">
                  {hall.id}
                </td>
                <td className="px-3 py-2 text-slate-700">
                  <div>{hall.name}</div>
                  <div className="text-[11px] text-slate-500 lg:hidden">
                    {hall.wdbreakfast} • {hall.wdlunch} • {hall.wddinner}
                  </div>
                </td>
                <td className="hidden px-3 py-2 text-[11px] text-slate-500 lg:table-cell">
                  B: {hall.wdbreakfast}
                  <br />
                  L: {hall.wdlunch}
                  <br />
                  D: {hall.wddinner}
                </td>
                <td className="hidden px-3 py-2 text-[11px] text-slate-500 lg:table-cell">
                  {hall.haslatenight ? 'Late night ✔' : 'Late night —'}
                  <br />
                  {hall.hasgrabngo ? 'Grab & go ✔' : 'Grab & go —'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default DiningHallReference
