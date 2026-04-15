import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { roomId, roomName, date, status } = await req.json()

    if (!roomId || !date || !status) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const db = supabaseAdmin()

    const { error } = await db.from('room_cleaning_status').upsert(
      {
        room_id: roomId,
        room_name: roomName,
        date,
        status,
        cleaned_at: status === 'cleaned' ? new Date().toISOString() : null,
      },
      { onConflict: 'room_id,date' }
    )

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clean API]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
