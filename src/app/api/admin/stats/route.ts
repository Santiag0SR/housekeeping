import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getBuilding } from '@/lib/process'

export const revalidate = 0

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const building = searchParams.get('building')

    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from/to params' }, { status: 400 })
    }

    const db = supabaseAdmin()

    let query = db
      .from('room_cleaning_status')
      .select('room_id, room_name, date, status, cleaned_at, cleaning_started_at, cleaning_finished_at')
      .eq('status', 'cleaned')
      .gte('date', from)
      .lte('date', to)

    const { data: rows, error } = await query

    if (error) throw error

    // Filter by building if specified
    let filtered = rows ?? []
    if (building && building !== 'all') {
      filtered = filtered.filter(r => getBuilding(r.room_name) === building)
    }

    // Compute stats
    let totalCleanings = filtered.length
    let durationsMinutes: number[] = []

    interface BuildingStats { count: number; durations: number[] }
    interface RoomStats { roomName: string; building: string; count: number; durations: number[] }

    const byBuildingMap = new Map<string, BuildingStats>()
    const byRoomMap = new Map<string, RoomStats>()

    let fastest: { roomName: string; durationMinutes: number; date: string } | null = null
    let slowest: { roomName: string; durationMinutes: number; date: string } | null = null

    for (const row of filtered) {
      const b = getBuilding(row.room_name)

      // Building stats
      if (!byBuildingMap.has(b)) byBuildingMap.set(b, { count: 0, durations: [] })
      const bs = byBuildingMap.get(b)!
      bs.count++

      // Room stats
      if (!byRoomMap.has(row.room_name)) byRoomMap.set(row.room_name, { roomName: row.room_name, building: b, count: 0, durations: [] })
      const rs = byRoomMap.get(row.room_name)!
      rs.count++

      // Duration (only if both timestamps exist)
      if (row.cleaning_started_at && row.cleaning_finished_at) {
        const start = new Date(row.cleaning_started_at).getTime()
        const end = new Date(row.cleaning_finished_at).getTime()
        const mins = Math.round((end - start) / 60000)
        if (mins >= 0) {
          durationsMinutes.push(mins)
          bs.durations.push(mins)
          rs.durations.push(mins)

          if (!fastest || mins < fastest.durationMinutes) {
            fastest = { roomName: row.room_name, durationMinutes: mins, date: row.date }
          }
          if (!slowest || mins > slowest.durationMinutes) {
            slowest = { roomName: row.room_name, durationMinutes: mins, date: row.date }
          }
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    const byBuilding = Array.from(byBuildingMap.entries())
      .map(([b, s]) => ({ building: b, count: s.count, avgDurationMinutes: avg(s.durations) }))
      .sort((a, b) => b.count - a.count)

    const byRoom = Array.from(byRoomMap.values())
      .map(r => ({ ...r, avgDurationMinutes: avg(r.durations), durations: undefined }))
      .sort((a, b) => b.count - a.count)

    // Detail list of each cleaning with times
    const cleanings = filtered
      .filter(r => r.cleaning_started_at && r.cleaning_finished_at)
      .map(r => {
        const start = new Date(r.cleaning_started_at).getTime()
        const end = new Date(r.cleaning_finished_at).getTime()
        return {
          roomName: r.room_name,
          building: getBuilding(r.room_name),
          date: r.date,
          startedAt: r.cleaning_started_at,
          finishedAt: r.cleaning_finished_at,
          durationMinutes: Math.round((end - start) / 60000),
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date) || a.roomName.localeCompare(b.roomName))

    return NextResponse.json({
      totalCleanings,
      avgDurationMinutes: avg(durationsMinutes),
      byBuilding,
      byRoom,
      cleanings,
      fastest,
      slowest,
    })
  } catch (err: any) {
    console.error('[admin stats API]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
