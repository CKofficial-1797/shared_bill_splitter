import { Hono } from 'hono'

const app = new Hono<{ Bindings: Env }>()
// health check
app.get('/api/health', (c) => c.json({ status: 'ok' }))

// to create home
app.post('/api/homes', async (c) => {
  const body: unknown = await c.req.json().catch(() => null)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    typeof body.name !== 'string' ||
    body.name.trim().length === 0
  ) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO homes (id, name) VALUES (?, ?)').bind(id, name).run()

  return c.json({ id, name }, 201)
})

// to create members of certain home
app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body: unknown = await c.req.json().catch(() => null)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    typeof body.name !== 'string' ||
    body.name.trim().length === 0
  ) {
    return c.json({ error: 'Name is required' }, 400)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare('INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)')
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// Create a bill and split it across all members of the home.
app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const body: unknown = await c.req.json().catch(() => null)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('title' in body) ||
    typeof body.title !== 'string' ||
    body.title.trim().length === 0
  ) {
    return c.json({ error: 'Title is required' }, 400)
  }

  if (
    !('totalCents' in body) ||
    typeof body.totalCents !== 'number' ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'totalCents must be a positive integer' }, 422)
  }

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const members = await c.env.DB.prepare('SELECT id FROM members WHERE home_id = ? ORDER BY rowid')
    .bind(homeId)
    .all<{ id: string }>()

  if (members.results.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const title = body.title.trim()
  const totalCents = body.totalCents
  const billId = crypto.randomUUID()
  const baseShare = Math.floor(totalCents / members.results.length)
  const remainder = totalCents % members.results.length

  const shares = members.results.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: baseShare + (index < remainder ? 1 : 0),
    paidAt: null,
  }))

  const statements = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents),
    ...shares.map((share) =>
      c.env.DB.prepare(
        'INSERT INTO shares (id, bill_id, member_id, amount_cents) VALUES (?, ?, ?, ?)',
      ).bind(share.id, billId, share.memberId, share.amountCents),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// Pay a share. Repeated requests with the same idempotency key return the
// original payment result.
app.post('/api/bills/:billId/shares/:shareId/pay', async (c) => {
  const billId = c.req.param('billId')
  const shareId = c.req.param('shareId')
  const idempotencyKey = c.req.header('Idempotency-Key')

  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    return c.json({ error: 'Idempotency-Key header is required' }, 400)
  }

  const share = await c.env.DB.prepare(
    `SELECT shares.id, shares.paid_at
     FROM shares
     JOIN bills ON bills.id = shares.bill_id
     WHERE bills.id = ? AND shares.id = ?`,
  )
    .bind(billId, shareId)
    .first<{ id: string; paid_at: string | null }>()

  if (!share) {
    return c.json({ error: 'Bill or share not found' }, 404)
  }

  // A previously successful request with this key is an idempotent replay.
  const previousPayment = await c.env.DB.prepare(
    'SELECT share_id, paid_at FROM payment_idempotency WHERE idempotency_key = ?',
  )
    .bind(idempotencyKey)
    .first<{ share_id: string; paid_at: string }>()

  if (previousPayment) {
    if (previousPayment.share_id !== shareId) {
      return c.json({ error: 'Idempotency-Key was already used for another share' }, 409)
    }

    return c.json({ id: shareId, paidAt: previousPayment.paid_at }, 200)
  }

  if (share.paid_at !== null) {
    return c.json({ error: 'Share has already been paid' }, 409)
  }

  const paidAt = new Date().toISOString()

  // The conditional update ensures only one concurrent request can pay it.
  const update = await c.env.DB.prepare(
    'UPDATE shares SET paid_at = ? WHERE id = ? AND bill_id = ? AND paid_at IS NULL',
  )
    .bind(paidAt, shareId, billId)
    .run()

  if (update.meta.changes !== 1) {
    return c.json({ error: 'Share has already been paid' }, 409)
  }

  await c.env.DB.prepare(
    'INSERT INTO payment_idempotency (idempotency_key, share_id, paid_at) VALUES (?, ?, ?)',
  )
    .bind(idempotencyKey, shareId, paidAt)
    .run()

  return c.json({ id: shareId, paidAt }, 200)
})

// Return each member's unpaid total in the order they were added.
app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare('SELECT id FROM homes WHERE id = ?')
    .bind(homeId)
    .first<{ id: string }>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    `SELECT
       members.id AS memberId,
       members.name AS name,
       COALESCE(SUM(CASE WHEN shares.paid_at IS NULL THEN shares.amount_cents ELSE 0 END), 0)
         AS outstandingCents
     FROM members
     LEFT JOIN shares ON shares.member_id = members.id
     LEFT JOIN bills ON bills.id = shares.bill_id AND bills.home_id = members.home_id
     WHERE members.home_id = ?
     GROUP BY members.id, members.name, members.rowid
     ORDER BY members.rowid`,
  )
    .bind(homeId)
    .all<{
      memberId: string
      name: string
      outstandingCents: number
    }>()

  return c.json({ balances: result.results }, 200)
})

export default app
