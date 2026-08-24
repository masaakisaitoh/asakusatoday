import { useDb } from '../../../../utils/db'
import { requireAdminUser } from '../../../../utils/admin'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT id FROM articles WHERE id = ? AND status = 'draft'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Draft not found' })
  }

  const links = db
    .prepare(`SELECT source_id FROM article_sources WHERE article_id = ?`)
    .all(id) as { source_id: number }[]
  const resetSource = db.prepare(`UPDATE sources SET processed_at = NULL WHERE id = ?`)
  for (const { source_id } of links) {
    resetSource.run(source_id)
  }

  db.prepare(`DELETE FROM article_sources WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM article_translations WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM favorites WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
  return { ok: true }
})
