import { useDb } from '../../utils/db'
import { listPublishedArticles, normalizeLocale } from '../../utils/articles'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = Number(query.page) || 1
  const locale = normalizeLocale(query.lang)
  const db = useDb()
  return listPublishedArticles(db, page, locale)
})
