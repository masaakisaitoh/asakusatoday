import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { H3Event } from 'h3'
import { setCookie, getCookie, deleteCookie, createError } from 'h3'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const COOKIE_NAME = 'session_id'

export interface UserRow {
  id: number
  address: string
  public_key: string
  user_name: string
  gender: string | null
  birth_year: number | null
  nationality: string | null
  avatar_seed: string
  is_admin: number
  theme: 'light' | 'dark' | 'system'
  created_at: string
}

export function createSession(db: Database.Database, userId: number): { id: string; expiresAt: string } {
  const id = randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()
  db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, datetime('now'))`
  ).run(id, userId, expiresAt)
  return { id, expiresAt }
}

export function attachSessionCookie(event: H3Event, sessionId: string, expiresAt: string): void {
  setCookie(event, COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt)
  })
}

export function destroySession(db: Database.Database, event: H3Event): void {
  const sessionId = getCookie(event, COOKIE_NAME)
  if (sessionId) db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId)
  deleteCookie(event, COOKIE_NAME, { path: '/' })
}

export function getSessionUser(db: Database.Database, event: H3Event): UserRow | null {
  const sessionId = getCookie(event, COOKIE_NAME)
  if (!sessionId) return null

  const session = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?')
    .get(sessionId) as { user_id: number; expires_at: string } | undefined
  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) return null

  return db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id) as UserRow
}

export function requireSessionUser(db: Database.Database, event: H3Event): UserRow {
  const user = getSessionUser(db, event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'ログインが必要です' })
  }
  return user
}
