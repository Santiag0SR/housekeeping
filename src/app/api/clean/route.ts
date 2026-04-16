import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { roomId, roomName, date, action } = await req.json()

    if (!roomId || !date || !action) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const db = supabaseAdmin()

    let upsertData: Record<string, any> = {
      room_id: roomId,
      room_name: roomName,
      date,
    }

    switch (action) {
      case 'start':
        upsertData.status = 'cleaning'
        upsertData.cleaning_started_at = now
        upsertData.cleaning_finished_at = null
        upsertData.cleaned_at = null
        break
      case 'finish':
        upsertData.status = 'cleaned'
        upsertData.cleaning_finished_at = now
        upsertData.cleaned_at = now
        break
      case 'cancel':
        upsertData.status = 'pending'
        upsertData.cleaning_started_at = null
        upsertData.cleaning_finished_at = null
        break
      case 'undo':
        upsertData.status = 'pending'
        upsertData.cleaning_started_at = null
        upsertData.cleaning_finished_at = null
        upsertData.cleaned_at = null
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { error } = await db.from('room_cleaning_status').upsert(
      upsertData,
      { onConflict: 'room_id,date' }
    )

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[clean API]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
