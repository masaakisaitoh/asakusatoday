import { describe, it, expect } from 'vitest'

describe('randomUserName', () => {
  it('returns a 16-character alphanumeric string', async () => {
    const { randomUserName } = await import('./username')
    expect(randomUserName()).toMatch(/^[A-Za-z0-9]{16}$/)
  })
})

describe('generateUniqueUserName', () => {
  it('retries when the candidate collides with an existing user_name', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    process.env.DATABASE_PATH = ':memory:'
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addrA', 'pubA', 'TAKEN0000000000', 'seedA', datetime('now'))`
    ).run()

    const { generateUniqueUserName } = await import('./username')
    let calls = 0
    const generator = () => {
      calls++
      return calls === 1 ? 'TAKEN0000000000' : 'FRESH0000000000'
    }

    expect(generateUniqueUserName(db, generator)).toBe('FRESH0000000000')
    expect(calls).toBe(2)
  })
})
