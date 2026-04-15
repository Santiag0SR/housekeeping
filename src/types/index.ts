export type Building = 'jb' | 'ab' | 'fm' | 'ao' | 'gmc' | 'cdv' | 'all'

export const BUILDINGS: { id: Building; label: string }[] = [
  { id: 'jb',  label: 'JB'  },
  { id: 'ab',  label: 'AB'  },
  { id: 'fm',  label: 'FM'  },
  { id: 'ao',  label: 'AO'  },
  { id: 'gmc', label: 'GMC' },
  { id: 'cdv', label: 'CDV' },
  { id: 'all', label: 'Todos' },
]

export interface MewsReservation {
  Id: string
  AssignedResourceId: string
  StartUtc: string
  EndUtc: string
  ScheduledEndUtc: string
  State: 'Started' | 'Confirmed'
  PersonCounts: { AgeCategoryId: string; Count: number }[]
}

export interface MewsResource {
  Id: string
  Name: string
  State: string
  Data?: {
    Discriminator: string
    Value?: { FloorNumber?: number }
  }
}

export interface RoomDay {
  roomId: string
  roomName: string
  building: string
  date: string         // YYYY-MM-DD
  taskType: 'checkout' | 'stayover' | 'checkin' | 'empty'
  persons: number
  sofaBed: boolean     // persons > 2
  checkIn: string | null
  checkOut: string | null
  cleaningStatus: 'pending' | 'cleaned'
  cleanedAt: string | null
  crib: boolean
}

export interface ApiResponse {
  days: string[]       // YYYY-MM-DD array for the next 7 days
  rooms: RoomDay[]
}
