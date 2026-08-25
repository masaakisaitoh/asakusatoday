import type Database from 'better-sqlite3'

export interface ArticleSource {
  url: string
  siteName: string
}

export type TranslationLocale = 'ja' | 'en' | 'ko' | 'zh-Hant' | 'zh-Hans' | 'pt'

export const SUPPORTED_LOCALES: TranslationLocale[] = ['ja', 'en', 'ko', 'zh-Hant', 'zh-Hans', 'pt']

export function normalizeLocale(value: unknown): TranslationLocale {
  return (SUPPORTED_LOCALES as string[]).includes(value as string)
    ? (value as TranslationLocale)
    : 'en'
}

export function parsePage(value: unknown): number {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 ? n : 1
}

export interface ArticleColumns {
  id: number
  image_url: string | null
  status: string
  category: string
  published_at: string | null
  created_at: string
}

export interface ArticleWithTranslation extends ArticleColumns {
  title: string
  body: string
}

export interface ArticleRow extends ArticleWithTranslation {
  sources: ArticleSource[]
}

export function attachArticleTranslations(
  db: Database.Database,
  articles: ArticleColumns[],
  locale: TranslationLocale
): ArticleWithTranslation[] {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT article_id, locale, title, body FROM article_translations WHERE article_id IN (${placeholders})`
    )
    .all(...ids) as { article_id: number; locale: string; title: string; body: string }[]

  const translationsByArticle = new Map<number, Map<string, { title: string; body: string }>>()
  for (const row of rows) {
    const map = translationsByArticle.get(row.article_id) ?? new Map()
    map.set(row.locale, { title: row.title, body: row.body })
    translationsByArticle.set(row.article_id, map)
  }

  return articles.map((a) => {
    const translations = translationsByArticle.get(a.id)
    const translation = translations?.get(locale) ?? translations?.get('ja')
    return { ...a, title: translation?.title ?? '', body: translation?.body ?? '' }
  })
}

export function attachArticleSources<T extends { id: number }>(
  db: Database.Database,
  articles: T[]
): (T & { sources: ArticleSource[] })[] {
  if (articles.length === 0) return []
  const ids = articles.map((a) => a.id)
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT article_sources.article_id as article_id, sources.url as url, sources.site_name as site_name
       FROM article_sources
       JOIN sources ON sources.id = article_sources.source_id
       WHERE article_sources.article_id IN (${placeholders})`
    )
    .all(...ids) as { article_id: number; url: string; site_name: string }[]

  const sourcesByArticle = new Map<number, ArticleSource[]>()
  for (const row of rows) {
    const list = sourcesByArticle.get(row.article_id) ?? []
    list.push({ url: row.url, siteName: row.site_name })
    sourcesByArticle.set(row.article_id, list)
  }

  return articles.map((a) => ({ ...a, sources: sourcesByArticle.get(a.id) ?? [] }))
}

export interface ArticleListResult {
  articles: ArticleRow[]
  total: number
  page: number
  pageSize: number
}

const PAGE_SIZE = 5

export const ARTICLE_COLUMNS_SQL =
  'articles.id, articles.image_url, articles.status, articles.category, articles.published_at, articles.created_at'

export function listPublishedArticles(
  db: Database.Database,
  page: number,
  locale: TranslationLocale,
  category?: string
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const whereClause = category ? `status = 'published' AND category = ?` : `status = 'published'`
  const whereParams = category ? [category] : []

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM articles WHERE ${whereClause}`).get(...whereParams) as {
      count: number
    }
  ).count

  const articleColumns = db
    .prepare(
      `SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE ${whereClause} ORDER BY published_at DESC LIMIT ? OFFSET ?`
    )
    .all(...whereParams, PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}

export function listDraftArticles(
  db: Database.Database,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM articles WHERE status = 'draft'`).get() as { count: number }
  ).count

  const articleColumns = db
    .prepare(
      `SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE status = 'draft' ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}

export function listAllArticles(
  db: Database.Database,
  page: number,
  locale: TranslationLocale
): ArticleListResult {
  const safePage = page < 1 ? 1 : page
  const offset = (safePage - 1) * PAGE_SIZE

  const total = (db.prepare(`SELECT COUNT(*) as count FROM articles`).get() as { count: number }).count

  const articleColumns = db
    .prepare(`SELECT ${ARTICLE_COLUMNS_SQL} FROM articles ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(PAGE_SIZE, offset) as ArticleColumns[]

  const withTranslations = attachArticleTranslations(db, articleColumns, locale)
  return { articles: attachArticleSources(db, withTranslations), total, page: safePage, pageSize: PAGE_SIZE }
}

export function getPublishedArticleById(
  db: Database.Database,
  id: number,
  locale: TranslationLocale
): ArticleRow | undefined {
  const articleColumns = db
    .prepare(`SELECT ${ARTICLE_COLUMNS_SQL} FROM articles WHERE id = ? AND status = 'published'`)
    .get(id) as ArticleColumns | undefined
  if (!articleColumns) return undefined
  const withTranslations = attachArticleTranslations(db, [articleColumns], locale)
  return attachArticleSources(db, withTranslations)[0]
}

export function publishedArticleExists(db: Database.Database, id: number): boolean {
  const row = db.prepare(`SELECT 1 FROM articles WHERE id = ? AND status = 'published'`).get(id)
  return row !== undefined
}

export function deleteArticleRows(db: Database.Database, id: number): void {
  db.prepare(`DELETE FROM article_sources WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM article_translations WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM favorites WHERE article_id = ?`).run(id)
  db.prepare(`DELETE FROM articles WHERE id = ?`).run(id)
}
