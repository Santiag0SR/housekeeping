import type { MewsReservation, MewsResource, RoomDay } from '@/types'

/** Extract building prefix from room name (case-insensitive) */
export function getBuilding(roomName: string): string {
  const name = roomName.toLowerCase()
  const prefixes = ['gmc', 'cdv', 'jb', 'ab', 'fm', 'ao']
  for (const prefix of prefixes) {
    if (name.startsWith(prefix)) return prefix
  }
  return 'other'
}

/** Generate array of YYYY-MM-DD strings for next N days starting today (Spain time) */
export function getWeekDays(n = 7): string[] {
  const days: string[] = []
  // Use Spain timezone to determine "today"
  const nowInSpain = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  nowInSpain.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) {
    const d = new Date(nowInSpain)
    d.setDate(nowInSpain.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    days.push(`${yyyy}-${mm}-${dd}`)
  }
  return days
}

/** Convert UTC datetime string to local date string YYYY-MM-DD (Spain time UTC+2) */
function toLocalDate(utc: string): string {
  const d = new Date(utc)
  // Add 2 hours for Spain (CET/CEST) — you can adjust if needed
  d.setHours(d.getHours() + 2)
  return d.toISOString().split('T')[0]
}

export interface ProcessedData {
  days: string[]
  rooms: Omit<RoomDay, 'cleaningStatus' | 'cleanedAt'>[]
}

export function processRoomsAndReservations(
  resources: MewsResource[],
  reservations: MewsReservation[],
  days: string[]
): ProcessedData['rooms'] {
  // Only Space-type rooms
  const rooms = resources.filter(
    (r) => !r.Data || r.Data.Discriminator === 'Space'
  )

  // Index reservations by room
  const resByRoom = new Map<string, MewsReservation[]>()
  for (const res of reservations) {
    const arr = resByRoom.get(res.AssignedResourceId) ?? []
    arr.push(res)
    resByRoom.set(res.AssignedResourceId, arr)
  }

  const result: ProcessedData['rooms'] = []

  for (const room of rooms) {
    const roomReservations = resByRoom.get(room.Id) ?? []

    for (const date of days) {
      const dateObj = new Date(date)

      // Find reservation active on this date
      const activeRes = roomReservations.find((r) => {
        const start = new Date(toLocalDate(r.StartUtc))
        const end = new Date(toLocalDate(r.ScheduledEndUtc))
        return dateObj >= start && dateObj < end
      })

      // Find reservation checking out today
      const checkoutRes = roomReservations.find((r) => {
        return toLocalDate(r.ScheduledEndUtc) === date
      })

      // Find reservation checking in today
      const checkinRes = roomReservations.find((r) => {
        return toLocalDate(r.StartUtc) === date
      })

      let taskType: RoomDay['taskType'] = 'empty'
      let persons = 0
      let checkIn: string | null = null
      let checkOut: string | null = null

      if (checkoutRes && checkinRes) {
        // Checkout + checkin same day: treat as checkout (change everything)
        taskType = 'checkout'
        persons = checkinRes.PersonCounts.reduce((s, p) => s + p.Count, 0)
        checkOut = checkoutRes.ScheduledEndUtc
        checkIn = checkinRes.StartUtc
      } else if (checkoutRes) {
        taskType = 'checkout'
        persons = 0
        checkOut = checkoutRes.ScheduledEndUtc
      } else if (checkinRes) {
        taskType = 'checkin'
        persons = checkinRes.PersonCounts.reduce((s, p) => s + p.Count, 0)
        checkIn = checkinRes.StartUtc
      } else if (activeRes) {
        taskType = 'stayover'
        persons = activeRes.PersonCounts.reduce((s, p) => s + p.Count, 0)
      } else {
        taskType = 'empty'
      }

      // Only include rooms that need attention (skip truly empty rooms with no activity all week)
      if (taskType === 'empty') continue

      result.push({
        roomId: room.Id,
        roomName: room.Name,
        building: getBuilding(room.Name),
        date,
        taskType,
        persons,
        sofaBed: persons > 2,
        checkIn,
        checkOut,
      })
    }
  }

  return result
}
