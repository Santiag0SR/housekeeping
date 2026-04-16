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

const CUNA_PRODUCT_ID = 'e97e8b00-f80e-4a3f-9fec-b42d00a99c2f'

/** Fetch order items to find which reservations have a crib (cuna) product */
export async function fetchMewsCribReservations(startUtc: string, endUtc: string): Promise<Set<string>> {
  const res = await fetch(`${MEWS_BASE}/orderItems/getAll`, {
    method: 'POST',
    headers: MEWS_HEADERS,
    body: JSON.stringify({
      ...BASE_BODY,
      CreatedUtc: { StartUtc: startUtc, EndUtc: endUtc },
      Limitation: { Count: 1000 },
    }),
    cache: 'no-store',
  })
  if (!res.ok) return new Set()
  const data = await res.json()
  const items = data.OrderItems ?? []

  // Collect reservation IDs that have an active (non-canceled) cuna product
  const reservationIds = new Set<string>()
  for (const item of items) {
    if (
      item.Data?.Product?.ProductId === CUNA_PRODUCT_ID &&
      !item.CanceledUtc
    ) {
      reservationIds.add(item.ServiceOrderId)
    }
  }
  return reservationIds
}
