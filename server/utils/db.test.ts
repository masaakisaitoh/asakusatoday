import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

describe('useDb', () => {
  it('creates users, nonces, sessions tables', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((row: any) => row.name)
    expect(tables).toEqual(expect.arrayContaining(['users', 'nonces', 'sessions']))
  })
})
