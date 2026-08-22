import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT * FROM articles WHERE id = ? AND status = 'draft'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }
  db.prepare(`UPDATE articles SET status = 'published', published_at = datetime('now') WHERE id = ?`).run(id)
  return db.prepare(`SELECT * FROM articles WHERE id = ?`).get(id)
})
