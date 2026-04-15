const MEWS_BASE = 'https://api.mews.com/api/connector/v1'

const MEWS_HEADERS = {
  'Content-Type': 'application/json',
}

const BASE_BODY = {
  ClientToken: process.env.MEWS_CLIENT_TOKEN!,
  AccessToken: process.env.MEWS_ACCESS_TOKEN!,
  Client: process.env.MEWS_CLIENT_NAME ?? 'Housekeeping 1.0.0',
}

export async function fetchMewsResources() {
  const res = await fetch(`${MEWS_BASE}/resources/getAll`, {
    method: 'POST',
    headers: MEWS_HEADERS,
    body: JSON.stringify({
      ...BASE_BODY,
      Extent: { Resources: true, Inactive: false },
      Limitation: { Count: 500 },
    }),
    next: { revalidate: 300 }, // cache 5 min
  })
  if (!res.ok) throw new Error(`Mews resources error: ${res.status}`)
  return res.json()
}

export async function fetchMewsReservations(startUtc: string, endUtc: string) {
  const res = await fetch(`${MEWS_BASE}/reservations/getAll/2023-06-06`, {
    method: 'POST',
    headers: MEWS_HEADERS,
    body: JSON.stringify({
      ...BASE_BODY,
      CollidingUtc: { StartUtc: startUtc, EndUtc: endUtc },
      States: ['Started', 'Confirmed', 'Processed'],
      Limitation: { Count: 1000 },
    }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Mews reservations error: ${res.status}`)
  return res.json()
}
