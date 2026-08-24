import type Database from 'better-sqlite3'
import type { ArticleColumns, ArticleListResult, TranslationLocale } from './articles'
import { attachArticleTranslations, attachArticleSources, ARTICLE_COLUMNS_SQL } from './articles'

const PAGE_SIZE = 5

export function isFavorited(db: Database.Database, userId: number, articleId: number): boolean {
  const row = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND article_id = ?').get(userId, articleId)
  return row !== undefined
}

export function toggleFavorite(db: Database.Database, userId: number, articleId: number): boolean {
  if (isFavorited(db, userId, articleId)) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND article_id = ?').run(userId, articleId)
    return false
  }
  db.prepare(
    `INSERT OR IGNORE INTO favorites (user_id, article_id, created_at) VALUES (?, ?, datetime('now'))`
  ).run(userId, articleId)
  return true
}

export function listFavoriteArticles(
  db: Database.Database,
  userId: number,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as count FROM favorites
         JOIN articles ON articles.id = favorites.article_id
         WHERE favorites.user_id = ? AND articles.status = 'published'`
      )
      .get(userId) as { count: number }
  ).count

  const articleColumns = db
    .prepare(
      `SELECT ${ARTICLE_COLUMNS_SQL} FROM favorites
       JOIN articles ON articles.id = favorites.article_id
       WHERE favorites.user_id = ? AND articles.status = 'published'
       ORDER BY favorites.created_at DESC, favorites.article_id DESC
       LIMIT ? OFFSET ?`
    )
    .all(userId, PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}
