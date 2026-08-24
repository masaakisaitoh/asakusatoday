import { useDb } from '../../utils/db'
import { requireSessionUser } from '../../utils/session'
import { normalizeLocale, parsePage } from '../../utils/articles'
import { listFavoriteArticles } from '../../utils/favorites'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const query = getQuery(event)
  const page = parsePage(query.page)
  const locale = normalizeLocale(query.lang)
  return listFavoriteArticles(db, user.id, page, locale)
})
