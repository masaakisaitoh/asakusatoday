import { randomBytes } from 'node:crypto'
import type Database from 'better-sqlite3'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export function randomUserName(length = 16): string {
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return out
}

export function generateUniqueUserName(
  db: Database.Database,
  generator: () => string = randomUserName
): string {
  const exists = db.prepare('SELECT 1 FROM users WHERE user_name = ?')
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generator()
    if (!exists.get(candidate)) return candidate
  }
  throw new Error('user_name generation failed after 10 attempts')
}
