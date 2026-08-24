import { useDb } from '../../../utils/db'
import { requireSessionUser } from '../../../utils/session'
import { publishedArticleExists } from '../../../utils/articles'
import { toggleFavorite } from '../../../utils/favorites'

export default defineEventHandler((event) => {
  const db = useDb()
  const user = requireSessionUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  if (!publishedArticleExists(db, id)) {
    throw createError({ statusCode: 404, message: 'Article not found' })
  }
  const favorited = toggleFavorite(db, user.id, id)
  return { favorited }
})
