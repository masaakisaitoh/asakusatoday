import { useDb } from '../../utils/db'
import { listPublishedArticles, normalizeLocale, parsePage } from '../../utils/articles'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const page = parsePage(query.page)
  const locale = normalizeLocale(query.lang)
  const category = typeof query.category === 'string' && query.category.length > 0 ? query.category : undefined
  const db = useDb()
  return listPublishedArticles(db, page, locale, category)
})
