export const DINING_HALLS = [
  { id: 1, name: 'Whitney' },
  { id: 3, name: 'Connecticut' },
  { id: 5, name: 'McMahon' },
  { id: 6, name: 'Putnam' },
  { id: 7, name: 'North' },
  { id: 15, name: 'Northwest' },
  { id: 16, name: 'South' },
  { id: 42, name: 'Towers' },
]

export const DINING_HALL_LOOKUP = new Map(
  DINING_HALLS.map((hall) => [String(hall.id), hall.name]),
)

export function getDiningHallName(identifier) {
  if (identifier === undefined || identifier === null) {
    return ''
  }
  return DINING_HALL_LOOKUP.get(String(identifier)) || ''
}
