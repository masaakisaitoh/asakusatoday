import * as cheerio from 'cheerio'
import type Database from 'better-sqlite3'
import type { SourceSite } from '../config/sources'

export function extractArticleText(html: string): string {
  const $ = cheerio.load(html)
  $('script, style, nav, header, footer').remove()
  return $('body').text().replace(/\s+/g, ' ').trim()
}

export function extractArticleLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const $ = cheerio.load(html)
  const urls = new Set<string>()
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (!href || !pattern.test(href)) return
    try {
      urls.add(new URL(href, baseUrl).href)
    } catch {
      // 不正なURLは無視
    }
  })
  return [...urls]
}

export async function collectSource(
  db: Database.Database,
  site: Extract<SourceSite, { type: 'page' }>,
  fetchFn: typeof fetch = fetch
): Promise<'inserted' | 'skipped' | 'error'> {
  const existing = db.prepare('SELECT 1 FROM sources WHERE url = ?').get(site.url)
  if (existing) return 'skipped'
  try {
    const response = await fetchFn(site.url)
    if (!response.ok) {
      console.error(`収集エラー: ${site.url} (status ${response.status})`)
      return 'error'
    }
    const html = await response.text()
    const rawText = extractArticleText(html)
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(site.url, site.siteName, site.category, rawText)
    return result.changes > 0 ? 'inserted' : 'skipped'
  } catch (err) {
    console.error(`収集エラー: ${site.url}`, err)
    return 'error'
  }
}

export async function collectListSource(
  db: Database.Database,
  site: Extract<SourceSite, { type: 'list' }>,
  fetchFn: typeof fetch = fetch
): Promise<{ inserted: number; skipped: number; error: number }> {
  const counts = { inserted: 0, skipped: 0, error: 0 }

  let listHtml: string
  try {
    const response = await fetchFn(site.url)
    if (!response.ok) {
      console.error(`収集エラー: ${site.url} (status ${response.status})`)
      counts.error++
      return counts
    }
    listHtml = await response.text()
  } catch (err) {
    console.error(`収集エラー: ${site.url}`, err)
    counts.error++
    return counts
  }

  const articleUrls = extractArticleLinks(listHtml, site.url, site.articleLinkPattern)

  for (const articleUrl of articleUrls) {
    const existing = db.prepare('SELECT 1 FROM sources WHERE url = ?').get(articleUrl)
    if (existing) {
      counts.skipped++
      continue
    }
    try {
      const response = await fetchFn(articleUrl)
      if (!response.ok) {
        console.error(`収集エラー: ${articleUrl} (status ${response.status})`)
        counts.error++
        continue
      }
      const html = await response.text()
      const rawText = extractArticleText(html)
      const result = db
        .prepare(
          `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
        )
        .run(articleUrl, site.siteName, site.category, rawText)
      if (result.changes > 0) {
        counts.inserted++
      } else {
        counts.skipped++
      }
    } catch (err) {
      console.error(`収集エラー: ${articleUrl}`, err)
      counts.error++
    }
  }

  return counts
}

export async function collectAllSources(
  db: Database.Database,
  sites: SourceSite[],
  fetchFn: typeof fetch = fetch
): Promise<{ inserted: number; skipped: number; error: number }> {
  const counts = { inserted: 0, skipped: 0, error: 0 }
  for (const site of sites) {
    if (site.type === 'list') {
      const result = await collectListSource(db, site, fetchFn)
      counts.inserted += result.inserted
      counts.skipped += result.skipped
      counts.error += result.error
    } else {
      const result = await collectSource(db, site, fetchFn)
      counts[result]++
    }
  }
  return counts
}
