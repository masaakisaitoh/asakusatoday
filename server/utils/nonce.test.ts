import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

afterEach(() => {
  vi.useRealTimers()
})

describe('issueNonce / consumeNonce', () => {
  it('consumes a freshly issued nonce for the matching address', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    expect(consumeNonce(db, 'addrA', nonce)).toBe(true)
  })

  it('cannot reuse a nonce (replay protection)', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    consumeNonce(db, 'addrA', nonce)
    expect(consumeNonce(db, 'addrA', nonce)).toBe(false)
  })

  it('rejects a nonce issued for a different address', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    const { nonce } = issueNonce(db, 'addrA')
    expect(consumeNonce(db, 'addrB', nonce)).toBe(false)
  })

  it('rejects an expired nonce', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { issueNonce, consumeNonce } = await import('./nonce')

    vi.useFakeTimers()
    const { nonce } = issueNonce(db, 'addrA')
    vi.advanceTimersByTime(6 * 60 * 1000)
    expect(consumeNonce(db, 'addrA', nonce)).toBe(false)
  })
})
