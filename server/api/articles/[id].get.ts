import { useDb } from '../../utils/db'
import { getPublishedArticleById, normalizeLocale } from '../../utils/articles'
import { getSessionUser } from '../../utils/session'
import { isFavorited } from '../../utils/favorites'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  const article = getPublishedArticleById(db, id, locale)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  const user = getSessionUser(db, event)
  return { ...article, is_favorited: user ? isFavorited(db, user.id, id) : false }
})
