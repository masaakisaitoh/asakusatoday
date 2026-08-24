# SEO対策 Design

## Context

現在、`nuxt.config.ts`の`app.head`にはfavicon/manifestのlinkタグとtheme-colorのみが設定されており、ページ単位の`<title>`/`meta description`/OGP/canonicalは一切出力されていない。`sitemap.xml`・`robots.txt`・構造化データ(JSON-LD)も存在しない。本designは、これらモダンなSEO要素を一通り導入する範囲を定める。

サイトはNuxt3のSSR構成(Nitro `node-server`)で、記事はDB(`articles`/`article_translations`)から動的に配信される。`article_translations`は6言語(ja/en/ko/zh-Hant/zh-Hans/pt)を持つが、ロケール切り替えはクエリパラメータ+クライアントの`localStorage`任せで、SSR時点(=クローラーが見る内容)は常にデフォルトの`en`でレンダリングされる(`composables/useArticleLocale.ts`)。このため本designでは**英語コンテンツを唯一の対象として一本化**し、`hreflang`や多言語URL分割は対象外とする。

## Goals

- 全ページに適切な`<title>`/`meta description`/OGP/Twitter Card/canonical URLを出力する
- 記事ページ・トップページ・地図ページがそれぞれ意味のあるtitle/descriptionを持つ
- `sitemap.xml`をDBのpublished記事から動的に生成する
- `robots.txt`で管理・個人設定系ページのクロールを禁止し、sitemapの場所を明示する
- 記事ページに`NewsArticle`、全ページに`WebSite`のJSON-LD構造化データを付与する
- 本番ドメイン`https://asakusatoday.com`を基準に絶対URLを組み立てる(`runtimeConfig`経由で環境ごとに上書き可能にする)

## Non-Goals

- `hreflang`・言語別URL(`/en/`, `/ja/`等)の導入(SSRが常に`en`である現状に合わせ、将来の多言語URL化のタイミングで別途design)
- 記事の`description`専用カラムをDBに追加すること・生成パイプライン(`scripts/generate.ts`)の変更(bodyからの自動抽出で対応する)
- OGP専用画像(1200x630)の新規デザイン(既存`logo.png`を流用する)
- `dateModified`の構造化データ出力(`articles`テーブルに更新日時カラムが無いため。将来カラムが追加されたら対応)
- サイト内検索機能を前提にした`WebSite`の`SearchAction`(検索機能自体が存在しないため)
- サイトマップの`changefreq`/`priority`出力(現代の主要クローラーは無視するため省略)

## Architecture

### 1. `runtimeConfig.public.siteUrl`(`nuxt.config.ts`)

```ts
runtimeConfig: {
  public: {
    maptilerKey: process.env.MAPTILER_KEY ?? '',
    siteUrl: process.env.SITE_URL ?? 'https://asakusatoday.com'
  }
}
```

sitemap・canonical・OGP・JSON-LDの絶対URL組み立てに使う共通の基準値。末尾スラッシュなし固定。

### 2. サイト全体のデフォルトmeta(`nuxt.config.ts`の`app.head`)

既存のlink/metaに加えて以下を追加する:

```ts
titleTemplate: '%s | ASAKUSA TODAY',
meta: [
  { name: 'theme-color', content: '#c83b32' },
  { name: 'description', content: 'Local news and updates from Asakusa, Tokyo.' },
  { property: 'og:site_name', content: 'ASAKUSA TODAY' },
  { property: 'og:image', content: 'https://asakusatoday.com/logo.png' },
  { name: 'twitter:card', content: 'summary_large_image' }
]
```

個別ページの`useSeoMeta`で上書きされなかった場合のフォールバックとして機能する。

### 3. ページ別`useSeoMeta`

**`pages/index.vue`**

```ts
useSeoMeta({
  title: 'ASAKUSA TODAY — Local News from Asakusa',
  description: 'Local news and updates from Asakusa, Tokyo.',
  ogUrl: () => `${siteUrl}/`
})
```

**`pages/articles/[id].vue`**

```ts
const config = useRuntimeConfig()
const description = computed(() => article.value ? truncateForDescription(article.value.body) : '')
const canonicalUrl = computed(() => `${config.public.siteUrl}/articles/${route.params.id}`)

useSeoMeta({
  title: () => article.value?.title,
  description,
  ogTitle: () => article.value?.title,
  ogDescription: description,
  ogType: 'article',
  ogUrl: canonicalUrl,
  ogImage: () => article.value?.image_url || `${config.public.siteUrl}/logo.png`
})
useHead({
  link: [{ rel: 'canonical', href: canonicalUrl }]
})
```

`article`が未取得(初期ロード中)の間は`title`/`description`が`undefined`になりフォールバックが効く。

**`pages/map.vue`**

固定の`title`/`description`を`useSeoMeta`で設定する。

**noindex対象ページ**(`pages/login.vue`, `pages/profile.vue`, `pages/favorites.vue`, `pages/account/create.vue`, `pages/account/import.vue`, `pages/admin/drafts.vue`)

各ページに以下を追加:

```ts
useSeoMeta({ robots: 'noindex, nofollow' })
```

### 4. JSON-LD構造化データ

**`WebSite`(`layouts/default.vue`、全ページ共通)**

```ts
useHead({
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'ASAKUSA TODAY',
      url: config.public.siteUrl
    })
  }]
})
```

**`NewsArticle`(`pages/articles/[id].vue`、記事取得後)**

```ts
const jsonLd = computed(() => article.value ? {
  '@context': 'https://schema.org',
  '@type': 'NewsArticle',
  headline: article.value.title,
  image: [article.value.image_url || `${siteUrl}/logo.png`],
  datePublished: article.value.published_at,
  author: { '@type': 'Organization', name: 'ASAKUSA TODAY' },
  publisher: {
    '@type': 'Organization',
    name: 'ASAKUSA TODAY',
    logo: { '@type': 'ImageObject', url: `${siteUrl}/favicon.png` }
  }
} : null)

useHead({
  script: () => jsonLd.value ? [{ type: 'application/ld+json', innerHTML: JSON.stringify(jsonLd.value) }] : []
})
```

`publisher.logo`には正方形(499x499)の既存`favicon.png`を使う(`logo.png`は横長1363x499でGoogleのlogo要件に合わないため使い分ける)。`og:image`/`NewsArticle.image`には横長の`logo.png`を引き続き使う。

**エスケープ注意**: `headline`/`image`は記事本文由来のAI生成テキストであり、`</script>`のような文字列を偶然含む可能性がある。`JSON.stringify`した結果をそのまま`innerHTML`に渡すと、その文字列が`<script>`タグを途中で閉じてしまいうる。`utils/seo.ts`に`safeJsonLd(value: unknown): string`を追加し、`JSON.stringify(value).replace(/</g, '\\u003c')`でエスケープしたうえで`innerHTML`に渡す(`WebSite`・`NewsArticle`両方で使用する)。

### 5. `utils/seo.ts`(新規)

```ts
export function truncateForDescription(body: string, maxLen = 155): string {
  const normalized = body.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLen) return normalized
  const cut = normalized.slice(0, maxLen)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLen)}…`
}
```

単語の途中で切れないよう、上限文字数内で最後の空白位置まで戻してから末尾に`…`を付与する。

### 6. `server/utils/sitemap.ts`(新規)

```ts
export interface SitemapUrlRow {
  id: number
  published_at: string
}

export function listPublishedArticleUrlRows(db: Database.Database): SitemapUrlRow[] {
  return db
    .prepare(`SELECT id, published_at FROM articles WHERE status = 'published' AND published_at IS NOT NULL ORDER BY published_at DESC`)
    .all() as SitemapUrlRow[]
}

export function buildSitemapXml(siteUrl: string, articleRows: SitemapUrlRow[]): string {
  const staticUrls = ['/', '/map']
  const staticEntries = staticUrls.map((path) => `<url><loc>${siteUrl}${path}</loc></url>`)
  const articleEntries = articleRows.map(
    (row) => `<url><loc>${siteUrl}/articles/${row.id}</loc><lastmod>${row.published_at.slice(0, 10)}</lastmod></url>`
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticEntries, ...articleEntries].join('\n')}\n</urlset>`
}
```

既存の`listPublishedArticles`(ページネーション・翻訳・ソース結合あり)は用途が過剰なため、id/published_atのみ取る軽量クエリを別関数として用意する。

### 7. `server/routes/sitemap.xml.ts`(新規)

```ts
export default defineEventHandler((event) => {
  const db = useDb()
  const config = useRuntimeConfig()
  const rows = listPublishedArticleUrlRows(db)
  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return buildSitemapXml(config.public.siteUrl, rows)
})
```

### 8. `server/routes/robots.txt.ts`(新規)

```ts
export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return [
    'User-agent: *',
    'Disallow: /login',
    'Disallow: /profile',
    'Disallow: /favorites',
    'Disallow: /account/',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${config.public.siteUrl}/sitemap.xml`
  ].join('\n')
})
```

## Testing

### `server/utils/sitemap.test.ts`(新規)

- `listPublishedArticleUrlRows`: publishedのみ返す、`published_at`が`NULL`の記事(draft相当)を含まない
- `buildSitemapXml`: 静的URL2件+記事URLが正しいXML形式で出力される、`lastmod`が`YYYY-MM-DD`形式であること

### `utils/seo.test.ts`(新規)

- `truncateForDescription`: 上限以下の文字列はそのまま返す、上限超過時は単語境界で切って`…`が付く、改行・連続空白が1つのスペースに正規化される
- `safeJsonLd`: 値に`</script>`が含まれていても`<`がエスケープされ、結果の文字列に生の`</script>`が現れないこと

### `tests/api/sitemap-robots.test.ts`(新規、`tests/api/`の既存パターン踏襲)

- `GET /sitemap.xml`が`Content-Type: application/xml`でpublished記事のURLを含むこと、draft記事のURLを含まないこと
- `GET /robots.txt`が`Disallow`行と`Sitemap`行を含むこと

### 既存vitestスイートへの影響確認

`pages/articles/[id].vue`・`layouts/default.vue`に`useHead`/`useSeoMeta`を追加するため、既存のコンポーネントテストが壊れないことを`npm run test`で確認する。

## Open Questions

なし(brainstormingセッション内で解消済み)
