import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { api, type Balance, type Bill, type Member } from '../lib/api'

export const Route = createFileRoute('/')({
  component: Home,
})

function money(cents: number): string {
  return `₹${(cents / 100).toFixed(2)}`
}

function Home() {
  const [homeName, setHomeName] = useState('')
  const [homeId, setHomeId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function createHome() {
    setError('')
    setLoading(true)

    try {
      const home = await api.createHome(homeName)
      setHomeId(home.id)
      setHomeName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create home')
    } finally {
      setLoading(false)
    }
  }

  async function addMember() {
    if (!homeId) return

    setError('')
    setLoading(true)

    try {
      const member = await api.addMember(homeId, memberName)
      setMembers((current) => [...current, member])
      setMemberName('')
      await refreshBalances(homeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add member')
    } finally {
      setLoading(false)
    }
  }

  async function createBill() {
    if (!homeId) return

    const amount = Number(billAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Amount must be greater than zero')
      return
    }

    setError('')
    setLoading(true)

    try {
      const bill = await api.createBill(homeId, billTitle, Math.round(amount * 100))
      setBills((current) => [bill, ...current])
      setBillTitle('')
      setBillAmount('')
      await refreshBalances(homeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create bill')
    } finally {
      setLoading(false)
    }
  }

  async function refreshBalances(id: string) {
    const result = await api.getBalances(id)
    setBalances(result.balances)
  }

  async function payShare(bill: Bill, shareId: string) {
    setError('')
    setLoading(true)

    try {
      await api.payShare(bill.id, shareId, crypto.randomUUID())
      setBills((current) =>
        current.map((item) =>
          item.id === bill.id
            ? {
                ...item,
                shares: item.shares.map((share) =>
                  share.id === shareId ? { ...share, paidAt: new Date().toISOString() } : share,
                ),
              }
            : item,
        ),
      )
      await refreshBalances(homeId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main
      style={{
        maxWidth: 760,
        margin: '40px auto',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1>Shared Bill Splitter</h1>
      <p>Create a home, add members, and split bills evenly.</p>

      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      {!homeId ? (
        <section>
          <h2>Create a home</h2>
          <input
            value={homeName}
            onChange={(event) => setHomeName(event.target.value)}
            placeholder="Home name"
          />
          <button type="button" disabled={loading || !homeName.trim()} onClick={createHome}>
            Create home
          </button>
        </section>
      ) : (
        <>
          <section>
            <h2>Members</h2>
            <ul>
              {members.map((member) => (
                <li key={member.id}>{member.name}</li>
              ))}
            </ul>
            <input
              value={memberName}
              onChange={(event) => setMemberName(event.target.value)}
              placeholder="Member name"
            />
            <button type="button" disabled={loading || !memberName.trim()} onClick={addMember}>
              Add member
            </button>
          </section>

          <section>
            <h2>Add a bill</h2>
            <input
              value={billTitle}
              onChange={(event) => setBillTitle(event.target.value)}
              placeholder="Bill title"
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={billAmount}
              onChange={(event) => setBillAmount(event.target.value)}
              placeholder="Amount in rupees"
              inputMode="decimal"
            />
            <button
              type="button"
              disabled={loading || !billTitle.trim() || members.length === 0}
              onClick={createBill}
            >
              Split bill
            </button>
          </section>

          <section>
            <h2>Bills and shares</h2>
            {bills.length === 0 ? (
              <p>No bills yet.</p>
            ) : (
              bills.map((bill) => (
                <article
                  key={bill.id}
                  style={{ border: '1px solid #ddd', padding: 16, marginBottom: 12 }}
                >
                  <h3>
                    {bill.title} — {money(bill.totalCents)}
                  </h3>
                  <ul>
                    {bill.shares.map((share) => {
                      const member = members.find((item) => item.id === share.memberId)
                      return (
                        <li key={share.id}>
                          {member?.name ?? 'Member'}: {money(share.amountCents)}{' '}
                          {share.paidAt ? (
                            <span>Paid</span>
                          ) : (
                            <button
                              type="button"
                              disabled={loading}
                              onClick={() => payShare(bill, share.id)}
                            >
                              Mark paid
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </article>
              ))
            )}
          </section>

          <section>
            <h2>Outstanding balances</h2>
            {balances.length === 0 ? (
              <p>No outstanding balances.</p>
            ) : (
              <ul>
                {balances.map((balance) => (
                  <li key={balance.memberId}>
                    {balance.name}: {money(balance.outstandingCents)}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  )
}
