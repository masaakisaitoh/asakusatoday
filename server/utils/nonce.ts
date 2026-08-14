import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

const NONCE_TTL_MS = 5 * 60 * 1000

export function issueNonce(db: Database.Database, address: string): { nonce: string; expiresAt: string } {
  const nonce = randomBytes(16).toString('hex')
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString()
  db.prepare('INSERT INTO nonces (nonce, address, expires_at) VALUES (?, ?, ?)').run(nonce, address, expiresAt)
  return { nonce, expiresAt }
}

export function consumeNonce(db: Database.Database, address: string, nonce: string): boolean {
  const row = db.prepare('SELECT address, expires_at FROM nonces WHERE nonce = ?').get(nonce) as
    | { address: string; expires_at: string }
    | undefined

  db.prepare('DELETE FROM nonces WHERE nonce = ?').run(nonce)

  if (!row) return false
  if (row.address !== address) return false
  if (new Date(row.expires_at).getTime() < Date.now()) return false
  return true
}
