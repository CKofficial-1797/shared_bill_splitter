export type Home = {
  id: string
  name: string
}

export type Member = {
  id: string
  homeId: string
  name: string
}

export type Share = {
  id: string
  memberId: string
  amountCents: number
  paidAt: string | null
}

export type Bill = {
  id: string
  homeId: string
  title: string
  totalCents: number
  shares: Share[]
}

export type Balance = {
  memberId: string
  name: string
  outstandingCents: number
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const body: unknown = await response.json()

  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string'
        ? body.error
        : 'Request failed'

    throw new Error(message)
  }

  return body as T
}

export const api = {
  createHome: (name: string) =>
    request<Home>('/api/homes', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  addMember: (homeId: string, name: string) =>
    request<Member>(`/api/homes/${homeId}/members`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  createBill: (homeId: string, title: string, totalCents: number) =>
    request<Bill>(`/api/homes/${homeId}/bills`, {
      method: 'POST',
      body: JSON.stringify({ title, totalCents }),
    }),

  getBalances: (homeId: string) =>
    request<{ balances: Balance[] }>(`/api/homes/${homeId}/balances`),

  payShare: (billId: string, shareId: string, idempotencyKey: string) =>
    request<{ id: string; paidAt: string }>(`/api/bills/${billId}/shares/${shareId}/pay`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
}
