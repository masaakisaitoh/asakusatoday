import { useDb } from '../../utils/db'
import { getPublishedArticleById, normalizeLocale } from '../../utils/articles'

export default defineEventHandler((event) => {
  const id = Number(getRouterParam(event, 'id'))
  const query = getQuery(event)
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  const article = getPublishedArticleById(db, id, locale)
  if (!article) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  return article
})
