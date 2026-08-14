import { describe, it, expect } from 'vitest'

describe('createSession', () => {
  it('creates a session row for a user and returns id + expiry', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    process.env.DATABASE_PATH = ':memory:'
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, created_at)
       VALUES ('addrA', 'pubA', 'USERNAME0000000A', 'seedA', datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users WHERE address = ?').get('addrA') as { id: number }).id

    const { createSession } = await import('./session')
    const session = createSession(db, userId)

    const row = db.prepare('SELECT user_id FROM sessions WHERE id = ?').get(session.id) as { user_id: number }
    expect(row.user_id).toBe(userId)
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })
})
