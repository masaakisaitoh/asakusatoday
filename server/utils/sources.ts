import type Database from 'better-sqlite3'

export interface SourceRow {
  id: number
  url: string
  site_name: string
  category: string
  fetched_at: string
  processed_at: string | null
}

export interface SourceListResult {
  sources: SourceRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 20

export function listSources(db: Database.Database, page: number): SourceListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (db.prepare(`SELECT COUNT(*) as count FROM sources`).get() as { count: number }).count

  const sources = db
    .prepare(
      `SELECT id, url, site_name, category, fetched_at, processed_at FROM sources ORDER BY fetched_at DESC, id DESC LIMIT ? OFFSET ?`
    )
    .all(PAGE_SIZE, offset) as SourceRow[]

  return { sources, total, page: safePage, pageSize: PAGE_SIZE }
}
