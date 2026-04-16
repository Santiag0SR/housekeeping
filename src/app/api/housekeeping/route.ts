import { NextRequest, NextResponse } from 'next/server'
import { fetchMewsResources, fetchMewsReservations, fetchMewsCribReservations } from '@/lib/mews'
import { processRoomsAndReservations, getWeekDays } from '@/lib/process'
import { supabaseAdmin } from '@/lib/supabase'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const days = getWeekDays(7)
    // Fetch reservations from 1 day before to catch checkouts happening today
    // (reservations ending today have ScheduledEndUtc = today, but started before)
    const dayBefore = new Date(days[0] + 'T12:00:00')
    dayBefore.setDate(dayBefore.getDate() - 1)
    const startUtc = dayBefore.toISOString().split('T')[0] + 'T00:00:00Z'
    const endUtc = days[days.length - 1] + 'T23:59:59Z'

    // Fetch from Mews in parallel
    const [resourcesData, reservationsData, cribReservationIds] = await Promise.all([
      fetchMewsResources(),
      fetchMewsReservations(startUtc, endUtc),
      fetchMewsCribReservations(startUtc, endUtc),
    ])

    const resources = resourcesData.Resources ?? []
    const reservations = reservationsData.Reservations ?? reservationsData[0]?.Reservations ?? []

    // Process into room-day pairs
    const roomDays = processRoomsAndReservations(resources, reservations, days)

    // Fetch cleaning statuses from Supabase for this week
    const db = supabaseAdmin()
    const { data: statuses } = await db
      .from('room_cleaning_status')
      .select('room_id, date, status, cleaned_at, crib, cleaning_started_at, cleaning_finished_at')
      .gte('date', days[0])
      .lte('date', days[days.length - 1])

    // Merge cleaning statuses
    const statusMap = new Map<string, { status: string; cleaned_at: string | null; crib: boolean; cleaning_started_at: string | null; cleaning_finished_at: string | null }>()
    for (const s of statuses ?? []) {
      statusMap.set(`${s.room_id}::${s.date}`, {
        status: s.status,
        cleaned_at: s.cleaned_at,
        crib: s.crib ?? false,
        cleaning_started_at: s.cleaning_started_at ?? null,
        cleaning_finished_at: s.cleaning_finished_at ?? null,
      })
    }

    const rooms = roomDays.map((r) => {
      const key = `${r.roomId}::${r.date}`
      const s = statusMap.get(key)
      // Crib only for incoming reservation (checkin/stayover), not outgoing (checkout)
      const mewsCrib = r.incomingReservationId ? cribReservationIds.has(r.incomingReservationId) : false
      const { incomingReservationId, ...rest } = r
      return {
        ...rest,
        cleaningStatus: (s?.status ?? 'pending') as 'pending' | 'cleaning' | 'cleaned',
        cleanedAt: s?.cleaned_at ?? null,
        cleaningStartedAt: s?.cleaning_started_at ?? null,
        cleaningFinishedAt: s?.cleaning_finished_at ?? null,
        crib: mewsCrib || (s?.crib ?? false),
      }
    })

    return NextResponse.json({ days, rooms })
  } catch (err: any) {
    console.error('[housekeeping API]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
