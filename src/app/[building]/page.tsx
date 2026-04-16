'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import type { RoomDay } from '@/types'
import { BUILDINGS } from '@/types'
import Link from 'next/link'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

function formatTime(utc: string | null) {
  if (!utc) return null
  const d = new Date(utc)
  return d.toTimeString().slice(0, 5)
}

function formatDuration(startedAt: string | null, finishedAt: string | null) {
  if (!startedAt || !finishedAt) return null
  const mins = Math.round((new Date(finishedAt).getTime() - new Date(startedAt).getTime()) / 60000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

interface RoomCard {
  roomId: string
  roomName: string
  building: string
  days: Record<string, RoomDay | undefined>
}

export default function BuildingPage() {
  const params = useParams()
  const building = (params.building as string).toLowerCase()

  const [days, setDays] = useState<string[]>([])
  const [rooms, setRooms] = useState<RoomCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/housekeeping', { cache: 'no-store' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      setDays(data.days)

      const filtered: RoomDay[] = building === 'all'
        ? data.rooms
        : data.rooms.filter((r: RoomDay) => r.building === building)

      const roomMap = new Map<string, RoomCard>()
      for (const r of filtered) {
        if (!roomMap.has(r.roomId)) {
          roomMap.set(r.roomId, {
            roomId: r.roomId,
            roomName: r.roomName,
            building: r.building,
            days: {},
          })
        }
        roomMap.get(r.roomId)!.days[r.date] = r
      }

      const sorted = Array.from(roomMap.values()).sort((a, b) =>
        a.roomName.localeCompare(b.roomName)
      )
      setRooms(sorted)
      setLastRefresh(new Date())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [building])

  useEffect(() => {
    load()
    const interval = setInterval(load, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [load])

  async function cleaningAction(roomDay: RoomDay, action: 'start' | 'finish' | 'cancel' | 'undo') {
    const key = `${roomDay.roomId}::${roomDay.date}`
    setUpdating(key)
    const nowIso = new Date().toISOString()
    try {
      await fetch('/api/clean', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomDay.roomId,
          roomName: roomDay.roomName,
          date: roomDay.date,
          action,
        }),
      })
      // Optimistic update
      setRooms(prev => prev.map(room => {
        if (room.roomId !== roomDay.roomId) return room
        const updated = { ...room.days }
        if (updated[roomDay.date]) {
          const rd = updated[roomDay.date]!
          switch (action) {
            case 'start':
              updated[roomDay.date] = { ...rd, cleaningStatus: 'cleaning', cleaningStartedAt: nowIso, cleaningFinishedAt: null, cleanedAt: null }
              break
            case 'finish':
              updated[roomDay.date] = { ...rd, cleaningStatus: 'cleaned', cleaningFinishedAt: nowIso, cleanedAt: nowIso }
              break
            case 'cancel':
              updated[roomDay.date] = { ...rd, cleaningStatus: 'pending', cleaningStartedAt: null, cleaningFinishedAt: null }
              break
            case 'undo':
              updated[roomDay.date] = { ...rd, cleaningStatus: 'pending', cleaningStartedAt: null, cleaningFinishedAt: null, cleanedAt: null }
              break
          }
        }
        return { ...room, days: updated }
      }))
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(null)
    }
  }

  async function toggleCrib(roomDay: RoomDay) {
    const key = `${roomDay.roomId}::${roomDay.date}`
    setUpdating(key)
    const newCrib = !roomDay.crib
    try {
      await fetch('/api/crib', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomDay.roomId,
          roomName: roomDay.roomName,
          date: roomDay.date,
          crib: newCrib,
        }),
      })
      setRooms(prev => prev.map(room => {
        if (room.roomId !== roomDay.roomId) return room
        const updated = { ...room.days }
        if (updated[roomDay.date]) {
          updated[roomDay.date] = { ...updated[roomDay.date]!, crib: newCrib }
        }
        return { ...room, days: updated }
      }))
    } catch (e) {
      console.error(e)
    } finally {
      setUpdating(null)
    }
  }

  const buildingLabel = BUILDINGS.find(b => b.id === building)?.label ?? building.toUpperCase()
  const spainDate = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  const todayStr = `${spainDate.getFullYear()}-${String(spainDate.getMonth() + 1).padStart(2, '0')}-${String(spainDate.getDate()).padStart(2, '0')}`

  function getRoomsForDay(date: string) {
    const checkouts: { room: RoomCard; rd: RoomDay }[] = []
    const checkins: { room: RoomCard; rd: RoomDay }[] = []
    const stayovers: { room: RoomCard; rd: RoomDay }[] = []

    for (const room of rooms) {
      const rd = room.days[date]
      if (!rd) continue
      if (rd.taskType === 'checkout') checkouts.push({ room, rd })
      else if (rd.taskType === 'checkin') checkins.push({ room, rd })
      else if (rd.taskType === 'stayover') stayovers.push({ room, rd })
    }

    return { checkouts, checkins, stayovers }
  }

  function toggleDay(date: string) {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  const todayData = getRoomsForDay(todayStr)
  const todayCheckoutsTotal = todayData.checkouts.length
  const todayCheckoutsCleaned = todayData.checkouts.filter(c => c.rd.cleaningStatus === 'cleaned').length

  // Render cleaning button for checkout cards
  function renderCleaningButton(rd: RoomDay, isUpdating: boolean) {
    const status = rd.cleaningStatus

    if (status === 'pending') {
      return (
        <button
          onClick={() => cleaningAction(rd, 'start')}
          disabled={isUpdating}
          style={{
            flex: 1,
            padding: '8px 0',
            borderRadius: 8,
            border: '1px solid var(--accent)',
            background: 'rgba(79, 142, 247, 0.15)',
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 700,
            transition: 'all 0.15s',
          }}
        >
          {isUpdating ? '...' : '▶ Empezar limpieza'}
        </button>
      )
    }

    if (status === 'cleaning') {
      return (
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          <button
            onClick={() => cleaningAction(rd, 'finish')}
            disabled={isUpdating}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 8,
              border: '1px solid var(--cleaned-text)',
              background: 'rgba(79, 201, 126, 0.15)',
              color: 'var(--cleaned-text)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {isUpdating ? '...' : '✓ Finalizar limpieza'}
          </button>
          <button
            onClick={() => cleaningAction(rd, 'cancel')}
            disabled={isUpdating}
            style={{
              padding: '5px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              color: 'var(--muted)',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            ✕
          </button>
        </div>
      )
    }

    // cleaned
    return (
      <div style={{ flex: 1 }}>
        <button
          onClick={() => cleaningAction(rd, 'undo')}
          disabled={isUpdating}
          style={{
            width: '100%',
            padding: '5px 0',
            borderRadius: 8,
            border: '1px solid #2a5c3f',
            background: '#1a3028',
            color: 'var(--cleaned-text)',
            fontSize: 11,
            fontWeight: 600,
            transition: 'all 0.15s',
          }}
        >
          {isUpdating ? '...' : '↩ Desmarcar'}
        </button>
        <div style={{ fontSize: 11, color: 'var(--cleaned-text)', marginTop: 4, textAlign: 'center' }}>
          ✅ {formatTime(rd.cleanedAt)}
          {rd.cleaningStartedAt && rd.cleaningFinishedAt && (
            <span style={{ color: 'var(--muted)', marginLeft: 6 }}>
              {formatDuration(rd.cleaningStartedAt, rd.cleaningFinishedAt)}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', gap: '1.5rem', height: 60 }}>
          <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>🧹 Housekeeping</span>

          <nav style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
            {BUILDINGS.map(b => (
              <Link
                key={b.id}
                href={`/${b.id}`}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  background: building === b.id ? 'var(--accent)' : 'transparent',
                  color: building === b.id ? '#fff' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >
                {b.label}
              </Link>
            ))}
          </nav>

          <Link
            href="/admin"
            style={{
              fontSize: 12,
              color: 'var(--muted)',
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface2)',
              flexShrink: 0,
            }}
          >
            Admin
          </Link>

          <button
            onClick={load}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              color: 'var(--muted)',
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            ↻ Actualizar
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        {/* Title + summary */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px' }}>
              Edificio {buildingLabel}
            </h1>
            <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>
              Actualizado {lastRefresh.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          {todayCheckoutsTotal > 0 && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '12px 24px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: todayCheckoutsCleaned === todayCheckoutsTotal ? 'var(--cleaned-text)' : 'var(--text)' }}>
                {todayCheckoutsCleaned}/{todayCheckoutsTotal}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>Checkouts limpios hoy</div>
              <div style={{
                marginTop: 8,
                height: 4,
                borderRadius: 2,
                background: 'var(--border)',
                overflow: 'hidden',
                width: 120,
              }}>
                <div style={{
                  height: '100%',
                  width: `${todayCheckoutsTotal > 0 ? (todayCheckoutsCleaned / todayCheckoutsTotal) * 100 : 0}%`,
                  background: 'var(--cleaned-text)',
                  transition: 'width 0.3s',
                }} />
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            Cargando habitaciones...
          </div>
        )}

        {error && (
          <div style={{
            background: '#2d1a1a',
            border: '1px solid var(--checkout)',
            borderRadius: 10,
            padding: '1rem 1.5rem',
            color: 'var(--checkout)',
            marginBottom: '1rem',
          }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && rooms.length === 0 && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            No hay apartamentos con actividad esta semana
          </div>
        )}

        {/* Day sections */}
        {!loading && rooms.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {days.map(date => {
              const isToday = date === todayStr
              const { checkouts, checkins, stayovers } = getRoomsForDay(date)
              const totalActivity = checkouts.length + checkins.length + stayovers.length
              const isCollapsed = collapsedDays.has(date)
              const cleanedCount = checkouts.filter(c => c.rd.cleaningStatus === 'cleaned').length

              if (totalActivity === 0) return null

              return (
                <div key={date} style={{
                  background: 'var(--surface)',
                  border: isToday ? '2px solid var(--accent)' : '1px solid var(--border)',
                  borderRadius: 14,
                  overflow: 'hidden',
                }}>
                  {/* Day header */}
                  <button
                    onClick={() => toggleDay(date)}
                    style={{
                      width: '100%',
                      background: isToday ? 'rgba(79, 142, 247, 0.08)' : 'transparent',
                      border: 'none',
                      padding: '14px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      borderBottom: isCollapsed ? 'none' : '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{
                        fontSize: 18,
                        fontWeight: 800,
                        color: isToday ? 'var(--accent)' : 'var(--text)',
                      }}>
                        {formatDate(date)}
                      </span>
                      {isToday && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 700,
                          background: 'var(--accent)',
                          color: '#fff',
                          padding: '3px 10px',
                          borderRadius: 6,
                        }}>
                          HOY
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      {checkouts.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--checkout)' }}>
                          🔄 {cleanedCount}/{checkouts.length}
                        </span>
                      )}
                      {checkins.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--checkin)' }}>
                          🛎️ {checkins.length}
                        </span>
                      )}
                      {stayovers.length > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--stayover)' }}>
                          🏠 {stayovers.length}
                        </span>
                      )}
                      <span style={{ fontSize: 14, color: 'var(--muted)', transition: 'transform 0.2s', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                        ▼
                      </span>
                    </div>
                  </button>

                  {/* Day content */}
                  {!isCollapsed && (
                    <div style={{ padding: '12px 16px' }}>

                      {/* CHECKOUTS section */}
                      {checkouts.length > 0 && (
                        <div style={{ marginBottom: checkins.length > 0 || stayovers.length > 0 ? 16 : 0 }}>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--checkout)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            🔄 Checkouts — Limpiar
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: 8,
                          }}>
                            {checkouts.map(({ room, rd }) => {
                              const status = rd.cleaningStatus
                              const key = `${rd.roomId}::${rd.date}`
                              const isUpd = key === updating
                              const hasCheckinAfter = !!rd.checkIn
                              const cardBg = status === 'cleaned'
                                ? 'rgba(42, 92, 63, 0.3)'
                                : status === 'cleaning'
                                  ? 'rgba(79, 142, 247, 0.08)'
                                  : 'rgba(229, 90, 90, 0.08)'
                              const cardBorder = status === 'cleaned'
                                ? '#2a5c3f'
                                : status === 'cleaning'
                                  ? 'rgba(79, 142, 247, 0.3)'
                                  : 'rgba(229, 90, 90, 0.25)'

                              return (
                                <div key={room.roomId} style={{
                                  background: cardBg,
                                  border: `1px solid ${cardBorder}`,
                                  borderRadius: 10,
                                  padding: '10px 14px',
                                  opacity: isUpd ? 0.6 : 1,
                                  transition: 'all 0.2s',
                                }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontWeight: 700, fontSize: 15 }}>{room.roomName}</span>
                                      {building === 'all' && (
                                        <span style={{
                                          fontSize: 10,
                                          fontWeight: 600,
                                          background: 'var(--surface2)',
                                          color: 'var(--muted)',
                                          padding: '1px 6px',
                                          borderRadius: 4,
                                          textTransform: 'uppercase',
                                        }}>
                                          {room.building}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                                    {rd.persons > 0 && (
                                      <span>👥 {rd.persons}</span>
                                    )}
                                    {rd.sofaBed && (
                                      <span style={{ color: '#f0a030' }}>🛋️ Sofá</span>
                                    )}
                                    {rd.checkOut && (
                                      <span>OUT {formatTime(rd.checkOut)}</span>
                                    )}
                                  </div>

                                  {hasCheckinAfter && (
                                    <div style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: 'var(--checkin)',
                                      background: 'rgba(79, 201, 126, 0.1)',
                                      border: '1px solid rgba(79, 201, 126, 0.2)',
                                      borderRadius: 6,
                                      padding: '4px 8px',
                                      marginBottom: 8,
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 4,
                                    }}>
                                      ⚡ Entrada hoy{rd.checkIn ? ` a las ${formatTime(rd.checkIn)}` : ''}
                                      {rd.persons > 0 ? ` · ${rd.persons} pers.` : ''}
                                    </div>
                                  )}

                                  {rd.crib && (
                                    <div style={{
                                      fontSize: 11,
                                      fontWeight: 600,
                                      color: '#c084fc',
                                      background: 'rgba(192, 132, 252, 0.1)',
                                      border: '1px solid rgba(192, 132, 252, 0.25)',
                                      borderRadius: 6,
                                      padding: '4px 8px',
                                      marginBottom: 8,
                                    }}>
                                      🛏️ Necesita cuna
                                    </div>
                                  )}

                                  <div style={{ display: 'flex', gap: 6 }}>
                                    {renderCleaningButton(rd, isUpd)}
                                    <button
                                      onClick={() => toggleCrib(rd)}
                                      disabled={isUpd}
                                      style={{
                                        padding: '5px 8px',
                                        borderRadius: 8,
                                        border: `1px solid ${rd.crib ? 'rgba(192, 132, 252, 0.4)' : 'var(--border)'}`,
                                        background: rd.crib ? 'rgba(192, 132, 252, 0.15)' : 'var(--surface2)',
                                        color: rd.crib ? '#c084fc' : 'var(--muted)',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        transition: 'all 0.15s',
                                      }}
                                    >
                                      🛏️
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* CHECKINS section */}
                      {checkins.length > 0 && (
                        <div style={{ marginBottom: stayovers.length > 0 ? 16 : 0 }}>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--checkin)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            🛎️ Entradas
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                            gap: 8,
                          }}>
                            {checkins.map(({ room, rd }) => (
                              <div key={room.roomId} style={{
                                background: 'rgba(79, 201, 126, 0.06)',
                                border: '1px solid rgba(79, 201, 126, 0.2)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}>
                                <div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>{room.roomName}</span>
                                    {building === 'all' && (
                                      <span style={{
                                        fontSize: 10,
                                        fontWeight: 600,
                                        background: 'var(--surface2)',
                                        color: 'var(--muted)',
                                        padding: '1px 6px',
                                        borderRadius: 4,
                                        textTransform: 'uppercase',
                                      }}>
                                        {room.building}
                                      </span>
                                    )}
                                    {rd.crib && (
                                      <span style={{ fontSize: 11, color: '#c084fc', fontWeight: 600 }}>🛏️ Cuna</span>
                                    )}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                                    {rd.persons > 0 && <span>👥 {rd.persons}</span>}
                                    {rd.sofaBed && <span style={{ color: '#f0a030' }}>🛋️ Sofá</span>}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--checkin)' }}>
                                    {rd.checkIn ? formatTime(rd.checkIn) : 'Pendiente'}
                                  </div>
                                  <button
                                    onClick={() => toggleCrib(rd)}
                                    style={{
                                      padding: '4px 7px',
                                      borderRadius: 6,
                                      border: `1px solid ${rd.crib ? 'rgba(192, 132, 252, 0.4)' : 'var(--border)'}`,
                                      background: rd.crib ? 'rgba(192, 132, 252, 0.15)' : 'var(--surface2)',
                                      color: rd.crib ? '#c084fc' : 'var(--muted)',
                                      fontSize: 11,
                                      fontWeight: 600,
                                    }}
                                  >
                                    🛏️
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* STAYOVERS section */}
                      {stayovers.length > 0 && (
                        <div>
                          <div style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color: 'var(--stayover)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            marginBottom: 8,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            🏠 Estancias
                          </div>
                          <div style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                          }}>
                            {stayovers.map(({ room, rd }) => (
                              <div key={room.roomId} style={{
                                background: 'rgba(240, 160, 48, 0.06)',
                                border: '1px solid rgba(240, 160, 48, 0.15)',
                                borderRadius: 8,
                                padding: '4px 10px',
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--stayover)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}>
                                {room.roomName}
                                {building === 'all' && (
                                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>
                                    {room.building}
                                  </span>
                                )}
                                {rd.persons > 0 && (
                                  <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>
                                    👥{rd.persons}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
