// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { createEvent } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

function fakeEvent() {
  const req = new IncomingMessage(new Socket())
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

describe('requireAdminUser', () => {
  it('throws 403 for a logged-in non-admin user', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, is_admin, created_at)
       VALUES ('addr1', 'pub1', 'NonAdmin00000001', 'seed1', 0, datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users').get() as { id: number }).id
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES ('session1', ?, ?, datetime('now'))`
    ).run(userId, new Date(Date.now() + 60000).toISOString())

    const event = fakeEvent()
    event.node.req.headers.cookie = 'session_id=session1'

    const { requireAdminUser } = await import('./admin')
    expect(() => requireAdminUser(db, event)).toThrow()
  })

  it('returns the user for a logged-in admin user', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    db.prepare(
      `INSERT INTO users (address, public_key, user_name, avatar_seed, is_admin, created_at)
       VALUES ('addr2', 'pub2', 'AdminUser0000001', 'seed2', 1, datetime('now'))`
    ).run()
    const userId = (db.prepare('SELECT id FROM users').get() as { id: number }).id
    db.prepare(
      `INSERT INTO sessions (id, user_id, expires_at, created_at)
       VALUES ('session2', ?, ?, datetime('now'))`
    ).run(userId, new Date(Date.now() + 60000).toISOString())

    const event = fakeEvent()
    event.node.req.headers.cookie = 'session_id=session2'

    const { requireAdminUser } = await import('./admin')
    const user = requireAdminUser(db, event)
    expect(user.user_name).toBe('AdminUser0000001')
  })
})
