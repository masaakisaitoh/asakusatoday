import type Database from 'better-sqlite3'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { requireSessionUser, type UserRow } from './session'

export function requireAdminUser(db: Database.Database, event: H3Event): UserRow {
  const user = requireSessionUser(db, event)
  if (!user.is_admin) {
    throw createError({ statusCode: 403, message: '管理者権限が必要です' })
  }
  return user
}
