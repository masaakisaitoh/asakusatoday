import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { attachArticleSources, attachArticleTranslations, type ArticleColumns } from '../../../utils/articles'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const articles = db
    .prepare(
      `SELECT id, image_url, status, category, published_at, created_at
       FROM articles WHERE status = 'draft' ORDER BY created_at DESC`
    )
    .all() as ArticleColumns[]
  const withTranslations = attachArticleTranslations(db, articles, 'ja')
  return attachArticleSources(db, withTranslations)
})
