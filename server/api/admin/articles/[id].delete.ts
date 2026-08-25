import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { deleteArticleRows } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const article = db.prepare(`SELECT id FROM articles WHERE id = ? AND status = 'published'`).get(id)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Published article not found' })
  }
  deleteArticleRows(db, id)
  return { ok: true }
})
