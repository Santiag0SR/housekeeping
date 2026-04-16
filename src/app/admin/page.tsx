'use client'

import { useEffect, useState, useCallback } from 'react'
import { BUILDINGS } from '@/types'
import Link from 'next/link'

interface BuildingStat {
  building: string
  count: number
  avgDurationMinutes: number | null
}

interface RoomStat {
  roomName: string
  building: string
  count: number
  avgDurationMinutes: number | null
}

interface CleaningDetail {
  roomName: string
  building: string
  date: string
  startedAt: string
  finishedAt: string
  durationMinutes: number
}

interface Stats {
  totalCleanings: number
  avgDurationMinutes: number | null
  byBuilding: BuildingStat[]
  byRoom: RoomStat[]
  cleanings: CleaningDetail[]
  fastest: { roomName: string; durationMinutes: number; date: string } | null
  slowest: { roomName: string; durationMinutes: number; date: string } | null
}

type RangePreset = 'today' | 'week' | 'month' | 'custom'

function getSpainToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Madrid' }))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonday(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getSunday(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const day = d.getDay()
  const diff = day === 0 ? 0 : 7 - day
  d.setDate(d.getDate() + diff)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getMonthStart(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function getMonthEnd(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  d.setMonth(d.getMonth() + 1, 0)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTime(utc: string) {
  const d = new Date(utc)
  return d.toTimeString().slice(0, 5)
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function formatDateShort(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

function formatDuration(mins: number | null) {
  if (mins === null) return '—'
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

export default function AdminPage() {
  const today = getSpainToday()

  const [range, setRange] = useState<RangePreset>('month')
  const [from, setFrom] = useState(getMonthStart(today))
  const [to, setTo] = useState(getMonthEnd(today))
  const [building, setBuilding] = useState('all')
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  function applyPreset(preset: RangePreset) {
    setRange(preset)
    switch (preset) {
      case 'today':
        setFrom(today)
        setTo(today)
        break
      case 'week':
        setFrom(getMonday(today))
        setTo(getSunday(today))
        break
      case 'month':
        setFrom(getMonthStart(today))
        setTo(getMonthEnd(today))
        break
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ from, to })
      if (building !== 'all') params.set('building', building)
      const res = await fetch(`/api/admin/stats?${params}`)
      if (!res.ok) throw new Error(`Error ${res.status}`)
      setStats(await res.json())
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [from, to, building])

  useEffect(() => {
    load()
  }, [load])

  const maxBuildingCount = stats ? Math.max(...stats.byBuilding.map(b => b.count), 1) : 1

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
          <Link href="/all" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.5px' }}>
            🧹 Housekeeping
          </Link>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--muted)' }}>/ Admin</span>
        </div>
      </header>

      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '1.5rem' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', marginBottom: '1.5rem' }}>
          Panel de Administración
        </h1>

        {/* Filters */}
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
        }}>
          {/* Range presets */}
          <div style={{ display: 'flex', gap: 4 }}>
            {([['today', 'Hoy'], ['week', 'Semana'], ['month', 'Mes'], ['custom', 'Personalizado']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 8,
                  border: 'none',
                  fontSize: 13,
                  fontWeight: 600,
                  background: range === key ? 'var(--accent)' : 'var(--surface2)',
                  color: range === key ? '#fff' : 'var(--muted)',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Date inputs */}
          {range === 'custom' && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>→</span>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '5px 8px',
                  color: 'var(--text)',
                  fontSize: 13,
                }}
              />
            </div>
          )}

          {/* Building filter */}
          <select
            value={building}
            onChange={e => setBuilding(e.target.value)}
            style={{
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 12px',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <option value="all">Todos los edificios</option>
            {BUILDINGS.filter(b => b.id !== 'all').map(b => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
            Cargando estadísticas...
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

        {stats && !loading && (
          <>
            {/* Summary cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
              gap: 12,
              marginBottom: '1.5rem',
            }}>
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 32, fontWeight: 800 }}>{stats.totalCleanings}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Limpiezas realizadas</div>
              </div>

              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--accent)' }}>
                  {formatDuration(stats.avgDurationMinutes)}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>Duración media</div>
              </div>

              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--checkin)' }}>
                  {stats.fastest ? formatDuration(stats.fastest.durationMinutes) : '—'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  Más rápida{stats.fastest ? ` (${stats.fastest.roomName})` : ''}
                </div>
              </div>

              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--checkout)' }}>
                  {stats.slowest ? formatDuration(stats.slowest.durationMinutes) : '—'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 2 }}>
                  Más lenta{stats.slowest ? ` (${stats.slowest.roomName})` : ''}
                </div>
              </div>
            </div>

            {/* Per-building breakdown */}
            {stats.byBuilding.length > 0 && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
                marginBottom: '1.5rem',
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Por edificio</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {stats.byBuilding.map(b => (
                    <div key={b.building} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, width: 40, textTransform: 'uppercase' }}>
                        {b.building}
                      </span>
                      <div style={{ flex: 1, height: 24, background: 'var(--surface2)', borderRadius: 6, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          width: `${(b.count / maxBuildingCount) * 100}%`,
                          background: 'var(--accent)',
                          borderRadius: 6,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 700, width: 40, textAlign: 'right' }}>
                        {b.count}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--muted)', width: 60, textAlign: 'right' }}>
                        {formatDuration(b.avgDurationMinutes)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-room breakdown */}
            {stats.byRoom.length > 0 && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Por apartamento</h2>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Apartamento</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Edificio</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Limpiezas</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Duración media</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.byRoom.map(r => (
                        <tr key={r.roomName} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{r.roomName}</td>
                          <td style={{ padding: '8px 12px', textTransform: 'uppercase', color: 'var(--muted)' }}>{r.building}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{r.count}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent)' }}>{formatDuration(r.avgDurationMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Cleaning detail table */}
            {stats.cleanings.length > 0 && (
              <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '16px 20px',
                marginTop: '1.5rem',
              }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Detalle de limpiezas</h2>
                <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Fecha</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Apartamento</th>
                        <th style={{ textAlign: 'left', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Edificio</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Inicio</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Fin</th>
                        <th style={{ textAlign: 'right', padding: '8px 12px', color: 'var(--muted)', fontWeight: 600 }}>Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.cleanings.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 12px', color: 'var(--muted)' }}>{formatDateShort(c.date)}</td>
                          <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.roomName}</td>
                          <td style={{ padding: '8px 12px', textTransform: 'uppercase', color: 'var(--muted)' }}>{c.building}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatTime(c.startedAt)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatTime(c.finishedAt)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>{formatDuration(c.durationMinutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {stats.totalCleanings === 0 && (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--muted)' }}>
                No hay limpiezas registradas en este periodo
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
