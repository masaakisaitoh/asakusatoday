# keizai.biz系サイトの個別記事収集(list型ソース) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `asakusa.keizai.biz`・`sumida.keizai.biz`のようなホームページに個別記事へのリンク一覧を持つニュースサイトから、個別記事URLを発見して`sources`テーブルに収集できるようにする(list型ソース)。新しい記事が公開されるたびに、次回の`npm run collect`実行で自然に拾われるようにする。

**Architecture:** `server/config/sources.ts`の`SourceSite`型を`page`(既存の単一ページ収集)と`list`(一覧ページから個別記事URLを収集)の判別可能なunion型に変更する。`server/utils/collector.ts`に、一覧ページのHTMLから個別記事リンクを抽出する`extractArticleLinks()`と、それを使って複数記事を収集する`collectListSource()`を追加し、`collectAllSources()`が`site.type`で分岐して呼び分ける。既存の`collectSource()`にはfetch前のDB存在チェックを追加し、page型・list型どちらの個別記事収集でも無駄なHTTPリクエストを避ける。

**Tech Stack:** TypeScript, Vitest, better-sqlite3, cheerio(既存依存のみ、新規追加なし)

## Global Constraints

- 両keizai.bizソースの`articleLinkPattern`は`/\/headline\/\d+\//`を使う(仕様書より)
- `asakusa.keizai.biz`は`category: 'asakusa-area'`、`sumida.keizai.biz`は`category: 'oshiage-area'`(仕様書より)
- list型: 一覧ページ自体のfetch失敗・非200は、そのサイト全体を`{inserted:0, skipped:0, error:1}`として扱い、個別記事の処理は行わない(仕様書より)
- list型: 個別記事のfetch失敗は`error`を1件加算するのみで、他の記事の処理は継続する(仕様書より)
- `sources.url`のUNIQUE制約はDB安全網として維持し、変更しない(仕様書より)
- CLAUDE.mdの方針により、gitコマンド(`git add`/`git commit`等)は実行しない。各タスクの最後の「コミット」ステップは、実行者(人間)が内容を確認してから手動で行う

---

### Task 1: `SourceSite`型のunion化とsources.tsの更新

**Files:**
- Modify: `server/config/sources.ts`
- Modify: `server/utils/collector.test.ts`(既存の`SourceSite`リテラルに`type: 'page'`を追加)

**Interfaces:**
- Produces: `export type SourceSite = { type: 'page'; url: string; siteName: string; category: SourceCategory } | { type: 'list'; url: string; siteName: string; category: SourceCategory; articleLinkPattern: RegExp }`(以降の全タスクがこの型を使う)
- Produces: `SOURCE_SITES: SourceSite[]`(既存45件全てに`type`フィールドが付与され、`asakusa.keizai.biz`・`sumida.keizai.biz`が`type: 'list'`になる)

- [ ] **Step 1: `server/config/sources.ts`を書き換える**

ファイル全体を以下の内容で置き換える:

```ts
export type SourceCategory =
  | 'disaster-prevention'
  | 'asakusa-area'
  | 'asakusa-culture'
  | 'kappabashi-area'
  | 'shitaya-area'
  | 'shin-okachimachi-area'
  | 'kuramae-area'
  | 'oshiage-area'
  | 'asakusabashi-area'
  | 'akihabara-area'
  | 'ueno-okachimachi-area'
  | 'ueno-okachimachi-culture'
  | 'ameyoko-area'
  | 'ryogoku-area'
  | 'minowa-area'
  | 'yanesen-area'

export type SourceSite =
  | { type: 'page'; url: string; siteName: string; category: SourceCategory }
  | { type: 'list'; url: string; siteName: string; category: SourceCategory; articleLinkPattern: RegExp }

export const SOURCE_SITES: SourceSite[] = [
  { type: 'page', url: 'https://www.city.taito.lg.jp/', siteName: 'www.city.taito.lg.jp', category: 'disaster-prevention' },

  { type: 'page', url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.senso-ji.jp/', siteName: 'www.senso-ji.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://asakusajinja.jp/', siteName: 'asakusajinja.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://asakusa-tawara.com/', siteName: 'asakusa-tawara.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.asakusa-nakamise.jp/', siteName: 'www.asakusa-nakamise.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.asakusa-shinnaka.com/', siteName: 'www.asakusa-shinnaka.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://senzokudori.com/', siteName: 'senzokudori.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://orange-st.jp/', siteName: 'orange-st.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://yanagikouji.com/', siteName: 'yanagikouji.com', category: 'asakusa-area' },
  { type: 'page', url: 'http://tanuki-dori.com/', siteName: 'tanuki-dori.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://asakusa-kokusaidori.jp/', siteName: 'asakusa-kokusaidori.jp', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.denbouin-dori.com/', siteName: 'www.denbouin-dori.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://asakusanioideyo.com/', siteName: 'asakusanioideyo.com', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.asakusa-samba.org/', siteName: 'www.asakusa-samba.org', category: 'asakusa-area' },
  { type: 'page', url: 'https://www.sumidagawa-hanabi.com/', siteName: 'www.sumidagawa-hanabi.com', category: 'asakusa-area' },
  { type: 'list', url: 'https://asakusa.keizai.biz/', siteName: 'asakusa.keizai.biz', category: 'asakusa-area', articleLinkPattern: /\/headline\/\d+\// },

  { type: 'page', url: 'https://www.asakusaengei.com/', siteName: 'www.asakusaengei.com', category: 'asakusa-culture' },
  { type: 'page', url: 'https://www.asakusatoyokan.com/', siteName: 'www.asakusatoyokan.com', category: 'asakusa-culture' },

  { type: 'page', url: 'https://www.kappabashi.or.jp/', siteName: 'www.kappabashi.or.jp', category: 'kappabashi-area' },
  { type: 'page', url: 'https://www.asakusakappawest.com/', siteName: 'www.asakusakappawest.com', category: 'kappabashi-area' },

  { type: 'page', url: 'https://shitayajinja.or.jp/', siteName: 'shitayajinja.or.jp', category: 'shitaya-area' },

  { type: 'page', url: 'https://satakeshotengai.com/', siteName: 'satakeshotengai.com', category: 'shin-okachimachi-area' },

  { type: 'page', url: 'https://kuramaejinja.tokyo/', siteName: 'kuramaejinja.tokyo', category: 'kuramae-area' },

  { type: 'page', url: 'https://www.tokyo-skytree.jp/', siteName: 'www.tokyo-skytree.jp', category: 'oshiage-area' },
  { type: 'page', url: 'https://www.tokyo-solamachi.jp/', siteName: 'www.tokyo-solamachi.jp', category: 'oshiage-area' },
  { type: 'page', url: 'https://sumidapark.jp/', siteName: 'sumidapark.jp', category: 'oshiage-area' },
  { type: 'page', url: 'https://www.tabashio.jp/', siteName: 'www.tabashio.jp', category: 'oshiage-area' },
  { type: 'list', url: 'https://sumida.keizai.biz/', siteName: 'sumida.keizai.biz', category: 'oshiage-area', articleLinkPattern: /\/headline\/\d+\// },

  { type: 'page', url: 'https://asakusabashi.tokyo/', siteName: 'asakusabashi.tokyo', category: 'asakusabashi-area' },

  { type: 'page', url: 'https://www.kandamyoujin.or.jp/', siteName: 'www.kandamyoujin.or.jp', category: 'akihabara-area' },

  { type: 'page', url: 'https://www.tnm.jp/', siteName: 'www.tnm.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.nmwa.go.jp/jp/', siteName: 'www.nmwa.go.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.ueno-mori.org/', siteName: 'www.ueno-mori.org', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.tobikan.jp/', siteName: 'www.tobikan.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.kahaku.go.jp/', siteName: 'www.kahaku.go.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.tokyo-zoo.net/ueno/', siteName: 'www.tokyo-zoo.net', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.t-bunka.jp/', siteName: 'www.t-bunka.jp', category: 'ueno-okachimachi-area' },
  { type: 'page', url: 'https://www.kensetsu.metro.tokyo.lg.jp/jimusho/toubuk/ueno/event', siteName: 'www.kensetsu.metro.tokyo.lg.jp', category: 'ueno-okachimachi-area' },

  { type: 'page', url: 'https://www.rakugo-kyokai.jp/joseki/suzumoto', siteName: 'www.rakugo-kyokai.jp', category: 'ueno-okachimachi-culture' },
  { type: 'page', url: 'http://www.ntgp.co.jp/engei/ueno/index.html', siteName: 'www.ntgp.co.jp', category: 'ueno-okachimachi-culture' },

  { type: 'page', url: 'https://www.ameyoko.net/', siteName: 'www.ameyoko.net', category: 'ameyoko-area' },
  { type: 'page', url: 'https://www.ameyoko-plaza.com/', siteName: 'www.ameyoko-plaza.com', category: 'ameyoko-area' },
  { type: 'page', url: 'https://ameyoko-center.jp/', siteName: 'ameyoko-center.jp', category: 'ameyoko-area' },
  { type: 'page', url: 'https://www.ueno-ameyoko.jp/', siteName: 'www.ueno-ameyoko.jp', category: 'ameyoko-area' },
  { type: 'page', url: 'https://ameyokoinfo.com/news', siteName: 'ameyokoinfo.com', category: 'ameyoko-area' },

  { type: 'page', url: 'https://www.sumo.or.jp/', siteName: 'www.sumo.or.jp', category: 'ryogoku-area' },
  { type: 'page', url: 'https://www.edo-tokyo-museum.or.jp/', siteName: 'www.edo-tokyo-museum.or.jp', category: 'ryogoku-area' },
  { type: 'page', url: 'https://hokusai-museum.jp/', siteName: 'hokusai-museum.jp', category: 'ryogoku-area' },
  { type: 'page', url: 'https://www.touken.or.jp/museum/', siteName: 'www.touken.or.jp', category: 'ryogoku-area' },
  { type: 'page', url: 'https://kokugikan-st.com/', siteName: 'kokugikan-st.com', category: 'ryogoku-area' },

  { type: 'page', url: 'https://joyfulminowa.com/', siteName: 'joyfulminowa.com', category: 'minowa-area' },
  { type: 'page', url: 'https://www.taitogeibun.net/ichiyo/', siteName: 'www.taitogeibun.net', category: 'minowa-area' },

  { type: 'page', url: 'https://www.yanakaginza.com/', siteName: 'www.yanakaginza.com', category: 'yanesen-area' }
]
```

- [ ] **Step 2: `server/utils/collector.test.ts`の既存`SourceSite`リテラルに`type: 'page'`を追加する**

`describe('collectSource', ...)`ブロック内の3箇所の`const site: SourceSite = {...}`を、それぞれ`type: 'page'`を追加した形に書き換える(3箇所とも同じ書き方):

```ts
    const site: SourceSite = { type: 'page', url: 'https://e-asakusa.jp/', siteName: 'e-asakusa.jp', category: 'asakusa-area' }
```

(2つ目の`it('skips a url that was already collected', ...)`と3つ目の`it('returns error when the fetch response is not ok', ...)`も同様に、既存の`site`宣言の`{ url: ...`の直後に`type: 'page', `を挿入する。3つ目は`url: 'https://e-asakusa.jp/broken'`なのでURLはそのまま。)

`describe('collectAllSources', ...)`ブロック内の`sites`配列も同様に書き換える:

```ts
    const sites: SourceSite[] = [
      { type: 'page', url: 'https://a.example/', siteName: 'a', category: 'asakusa-area' },
      { type: 'page', url: 'https://b.example/', siteName: 'b', category: 'asakusa-area' }
    ]
```

- [ ] **Step 3: 型チェックを実行する**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: エラーなし(exit code 0)

- [ ] **Step 4: 既存テストスイートを実行する**

Run: `npx vitest run server/utils/collector.test.ts`
Expected: 全テストPASS(既存の4テストがそのまま通る)

- [ ] **Step 5: コミット**

```bash
git add server/config/sources.ts server/utils/collector.test.ts
git commit -m "SourceSite型をpage/listのunion型に変更し、keizai.biz2件をlist型にする"
```

---

### Task 2: `collectSource()`にfetch前のDB存在チェックを追加する

**Files:**
- Modify: `server/utils/collector.ts:11-30`(`collectSource`)
- Modify: `server/utils/collector.test.ts`(既存3テストの型注釈更新 + 新規テスト追加)

**Interfaces:**
- Consumes: `SourceSite`型(Task 1で定義済み)
- Produces: `collectSource(db: Database.Database, site: Extract<SourceSite, { type: 'page' }>, fetchFn?: typeof fetch): Promise<'inserted' | 'skipped' | 'error'>`(既にDBに存在するURLの場合、`fetchFn`を呼び出さずに`'skipped'`を返す。以降のタスクが参照する)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/collector.test.ts`の`describe('collectSource', ...)`ブロックの最後(3つ目の`it`の後、`})`の直前)に以下のテストを追加する:

```ts

  it('does not call fetchFn when the url already exists in the db', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectSource } = await import('./collector')
    const site: Extract<SourceSite, { type: 'page' }> = {
      type: 'page',
      url: 'https://e-asakusa.jp/',
      siteName: 'e-asakusa.jp',
      category: 'asakusa-area'
    }
    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(site.url, site.siteName, site.category, '既存の本文')

    let callCount = 0
    const fetchFn = (async () => {
      callCount++
      return { ok: true, text: async () => '<p>新しい本文</p>' } as Response
    }) as typeof fetch

    const result = await collectSource(db, site, fetchFn)

    expect(result).toBe('skipped')
    expect(callCount).toBe(0)
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "does not call fetchFn when the url already exists in the db"`
Expected: FAIL(`callCount`が`1`になり`expect(callCount).toBe(0)`が失敗する。現状の`collectSource`はDB存在チェックをせず必ず`fetchFn`を呼ぶため)

- [ ] **Step 3: `collectSource`にDB存在チェックを追加する**

`server/utils/collector.ts`の`collectSource`関数を以下に置き換える:

```ts
export async function collectSource(
  db: Database.Database,
  site: Extract<SourceSite, { type: 'page' }>,
  fetchFn: typeof fetch = fetch
): Promise<'inserted' | 'skipped' | 'error'> {
  const existing = db.prepare('SELECT 1 FROM sources WHERE url = ?').get(site.url)
  if (existing) return 'skipped'
  try {
    const response = await fetchFn(site.url)
    if (!response.ok) return 'error'
    const html = await response.text()
    const rawText = extractArticleText(html)
    const result = db
      .prepare(
        `INSERT OR IGNORE INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
      )
      .run(site.url, site.siteName, site.category, rawText)
    return result.changes > 0 ? 'inserted' : 'skipped'
  } catch {
    return 'error'
  }
}
```

- [ ] **Step 4: 既存3テストの型注釈を`Extract<SourceSite, { type: 'page' }>`に変更する**

`describe('collectSource', ...)`ブロック内の、Task1で`type: 'page'`を追加した3つの`const site: SourceSite = {...}`宣言を、いずれも`const site: Extract<SourceSite, { type: 'page' }> = {...}`に変更する(中身の値は変更しない)。

例(1つ目のテスト):

```ts
    const site: Extract<SourceSite, { type: 'page' }> = {
      type: 'page',
      url: 'https://e-asakusa.jp/',
      siteName: 'e-asakusa.jp',
      category: 'asakusa-area'
    }
```

同様に2つ目(`skips a url that was already collected`)、3つ目(`returns error when the fetch response is not ok`、URLは`https://e-asakusa.jp/broken`のまま)も型注釈のみ変更する。

- [ ] **Step 5: 型チェックとテストを実行して全て通ることを確認する**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run server/utils/collector.test.ts`
Expected: 型チェックがエラーなしで通り、`collectSource`関連の全テスト(既存3件 + 新規1件)がPASS

- [ ] **Step 6: コミット**

```bash
git add server/utils/collector.ts server/utils/collector.test.ts
git commit -m "collectSourceにfetch前のDB存在チェックを追加し、収集済みURLへの無駄なfetchを避ける"
```

---

### Task 3: `extractArticleLinks()`を追加する

**Files:**
- Modify: `server/utils/collector.ts`(新規関数追加)
- Modify: `server/utils/collector.test.ts`(新規テスト追加)

**Interfaces:**
- Produces: `extractArticleLinks(html: string, baseUrl: string, pattern: RegExp): string[]`(絶対URL化・重複排除済みの配列を返す。Task 4が使う)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/collector.test.ts`の`describe('extractArticleText', ...)`ブロックの後(`describe('collectSource', ...)`の前)に、以下を追加する:

```ts
describe('extractArticleLinks', () => {
  it('extracts links matching the pattern and resolves them to absolute URLs', async () => {
    const { extractArticleLinks } = await import('./collector')
    const html = `
      <html><body>
        <a href="/headline/1059/">記事1</a>
        <a href="/headline/1058/">記事2</a>
        <a href="/gourmet/archives/1/">カテゴリ一覧</a>
        <a href="https://asakusa.keizai.biz/headline/1057/">記事3(絶対URL)</a>
      </body></html>
    `
    const links = extractArticleLinks(html, 'https://asakusa.keizai.biz/', /\/headline\/\d+\//)
    expect(links).toEqual([
      'https://asakusa.keizai.biz/headline/1059/',
      'https://asakusa.keizai.biz/headline/1058/',
      'https://asakusa.keizai.biz/headline/1057/'
    ])
  })

  it('dedupes repeated hrefs pointing to the same article', async () => {
    const { extractArticleLinks } = await import('./collector')
    const html = `
      <html><body>
        <a href="/headline/1059/"><img src="thumb.jpg" /></a>
        <a href="/headline/1059/">記事1</a>
      </body></html>
    `
    const links = extractArticleLinks(html, 'https://asakusa.keizai.biz/', /\/headline\/\d+\//)
    expect(links).toEqual(['https://asakusa.keizai.biz/headline/1059/'])
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "extractArticleLinks"`
Expected: FAIL(`extractArticleLinks`が存在せず、`{ extractArticleLinks } = await import('./collector')`が`undefined`になりエラーになる)

- [ ] **Step 3: `extractArticleLinks`を実装する**

`server/utils/collector.ts`の`extractArticleText`関数の直後に以下を追加する:

```ts
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
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "extractArticleLinks"`
Expected: PASS(2件とも)

- [ ] **Step 5: コミット**

```bash
git add server/utils/collector.ts server/utils/collector.test.ts
git commit -m "一覧ページから個別記事リンクを抽出するextractArticleLinksを追加"
```

---

### Task 4: `collectListSource()`を追加する

**Files:**
- Modify: `server/utils/collector.ts`(新規関数追加)
- Modify: `server/utils/collector.test.ts`(新規テスト追加)

**Interfaces:**
- Consumes: `extractArticleLinks(html, baseUrl, pattern): string[]`(Task 3)、`extractArticleText(html): string`(既存)
- Produces: `collectListSource(db: Database.Database, site: Extract<SourceSite, { type: 'list' }>, fetchFn?: typeof fetch): Promise<{ inserted: number; skipped: number; error: number }>`(Task 5が使う)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/collector.test.ts`の`describe('collectAllSources', ...)`ブロックの前に、以下を追加する:

```ts
describe('collectListSource', () => {
  const site: Extract<SourceSite, { type: 'list' }> = {
    type: 'list',
    url: 'https://asakusa.keizai.biz/',
    siteName: 'asakusa.keizai.biz',
    category: 'asakusa-area',
    articleLinkPattern: /\/headline\/\d+\//
  }

  function listFetchFn(overrides: Record<string, { ok: boolean; text: string } | 'throw'>): {
    fetchFn: typeof fetch
    calls: string[]
  } {
    const calls: string[] = []
    const fetchFn = (async (url: string) => {
      calls.push(url)
      const entry = overrides[url]
      if (entry === 'throw') throw new Error('network error')
      if (!entry) throw new Error(`unexpected url in test: ${url}`)
      return { ok: entry.ok, text: async () => entry.text } as Response
    }) as typeof fetch
    return { fetchFn, calls }
  }

  it('collects multiple new articles found on the list page', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1059/': { ok: true, text: '<p>記事1本文</p>' },
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 2, skipped: 0, error: 0 })
    const rows = db.prepare('SELECT url, site_name, category, raw_text FROM sources ORDER BY url').all() as any[]
    expect(rows).toHaveLength(2)
    expect(rows[0].url).toBe('https://asakusa.keizai.biz/headline/1058/')
    expect(rows[0].site_name).toBe('asakusa.keizai.biz')
    expect(rows[0].category).toBe('asakusa-area')
    expect(rows[0].raw_text).toContain('記事2本文')
  })

  it('skips article urls already in the db without calling fetchFn for them', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    db.prepare(
      `INSERT INTO sources (url, site_name, category, raw_text, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))`
    ).run('https://asakusa.keizai.biz/headline/1059/', site.siteName, site.category, '既存記事')

    const { fetchFn, calls } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 1, skipped: 1, error: 0 })
    expect(calls).not.toContain('https://asakusa.keizai.biz/headline/1059/')
  })

  it('counts a failed article fetch as error and continues with other articles', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': {
        ok: true,
        text: '<a href="/headline/1059/">記事1</a><a href="/headline/1058/">記事2</a>'
      },
      'https://asakusa.keizai.biz/headline/1059/': 'throw',
      'https://asakusa.keizai.biz/headline/1058/': { ok: true, text: '<p>記事2本文</p>' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 1, skipped: 0, error: 1 })
  })

  it('returns an all-error tally when the list page itself fails to fetch', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectListSource } = await import('./collector')

    const { fetchFn } = listFetchFn({
      'https://asakusa.keizai.biz/': { ok: false, text: '' }
    })

    const result = await collectListSource(db, site, fetchFn)

    expect(result).toEqual({ inserted: 0, skipped: 0, error: 1 })
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "collectListSource"`
Expected: FAIL(`collectListSource`が存在せず`undefined`エラーになる)

- [ ] **Step 3: `collectListSource`を実装する**

`server/utils/collector.ts`の`collectSource`関数の直後に以下を追加する:

```ts
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
      counts.error++
      return counts
    }
    listHtml = await response.text()
  } catch {
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
    } catch {
      counts.error++
    }
  }

  return counts
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "collectListSource"`
Expected: PASS(4件とも)

- [ ] **Step 5: コミット**

```bash
git add server/utils/collector.ts server/utils/collector.test.ts
git commit -m "一覧ページから複数の個別記事を収集するcollectListSourceを追加"
```

---

### Task 5: `collectAllSources()`をtype別に分岐させる

**Files:**
- Modify: `server/utils/collector.ts:32-43`(`collectAllSources`)
- Modify: `server/utils/collector.test.ts`(新規テスト追加)

**Interfaces:**
- Consumes: `collectSource`(Task 2)、`collectListSource`(Task 4)
- Produces: `collectAllSources(db: Database.Database, sites: SourceSite[], fetchFn?: typeof fetch): Promise<{ inserted: number; skipped: number; error: number }>`(`site.type`に応じて内部で分岐する。`scripts/collect.ts`はこのシグネチャのまま変更不要)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/collector.test.ts`の`describe('collectAllSources', ...)`ブロック内、既存の`it('continues past a failing site and tallies results', ...)`の後に以下を追加する:

```ts

  it('aggregates counts across mixed page and list type sites', async () => {
    process.env.DATABASE_PATH = ':memory:'
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db: Database.Database = useDb()
    const { collectAllSources } = await import('./collector')
    const sites: SourceSite[] = [
      { type: 'page', url: 'https://a.example/', siteName: 'a', category: 'asakusa-area' },
      {
        type: 'list',
        url: 'https://list.example/',
        siteName: 'list.example',
        category: 'asakusa-area',
        articleLinkPattern: /\/headline\/\d+\//
      }
    ]
    const responses: Record<string, { ok: boolean; text: string }> = {
      'https://a.example/': { ok: true, text: '<p>a</p>' },
      'https://list.example/': {
        ok: true,
        text: '<a href="/headline/1/">記事1</a><a href="/headline/2/">記事2</a>'
      },
      'https://list.example/headline/1/': { ok: true, text: '<p>記事1</p>' },
      'https://list.example/headline/2/': { ok: true, text: '<p>記事2</p>' }
    }
    const fetchFn = (async (url: string) => {
      const res = responses[url]
      return { ok: res.ok, text: async () => res.text } as Response
    }) as typeof fetch

    const result = await collectAllSources(db, sites, fetchFn)

    expect(result).toEqual({ inserted: 3, skipped: 0, error: 0 })
  })
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/collector.test.ts -t "aggregates counts across mixed page and list type sites"`
Expected: FAIL(現状の`collectAllSources`は`site.type`を見ずに常に`collectSource`を呼ぶため、list型サイトの`site.url`単体だけがpageとして収集されようとし、期待した`{inserted: 3, ...}`にならない)

- [ ] **Step 3: `collectAllSources`をtype別に分岐させる**

`server/utils/collector.ts`の`collectAllSources`関数を以下に置き換える:

```ts
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
```

- [ ] **Step 4: 型チェックと全テストを実行する**

Run: `npx tsc --noEmit -p tsconfig.json && npx vitest run server/utils/collector.test.ts`
Expected: 型チェックがエラーなしで通り、`collector.test.ts`の全テスト(既存分 + Task2〜5で追加した分)がPASS

- [ ] **Step 5: コミット**

```bash
git add server/utils/collector.ts server/utils/collector.test.ts
git commit -m "collectAllSourcesをsite.typeで分岐させ、list型サイトの集計に対応"
```

---

### Task 6: プロジェクト全体のテストと、実サイトに対する手動疎通確認

**Files:** なし(確認のみ)

**Interfaces:**
- Consumes: Task 1〜5で実装した全機能

- [ ] **Step 1: プロジェクト全体のテストスイートを実行する**

Run: `npm run test`
Expected: 全テストPASS(既存の天気・電車・記事関連のテストを含め、今回変更した`collector.test.ts`以外に影響が無いことを確認する)

- [ ] **Step 2: 実サイトに対して`npm run collect`を手動実行する**

Run: `npm run collect`
Expected: コンソールに`収集完了: 新規X件, スキップY件, エラーZ件`が出力される。`asakusa.keizai.biz`・`sumida.keizai.biz`から複数の`/headline/`個別記事URLが新規収集されているはず。

- [ ] **Step 3: DBの中身を確認する**

Run: `sqlite3 data/app.sqlite3 "SELECT url, site_name, category FROM sources WHERE url LIKE '%keizai.biz%' ORDER BY url;"`
Expected: `https://asakusa.keizai.biz/headline/...`形式のURLが`asakusa-area`、`https://sumida.keizai.biz/headline/...`形式のURLが`oshiage-area`で複数行表示される。`https://asakusa.keizai.biz/`・`https://sumida.keizai.biz/`自体(ホームページのURL)は行として登録されていないことも確認する(list型はホームページ自体を`sources`に保存しないため)。

- [ ] **Step 4: 再実行して冪等性を確認する**

Run: `npm run collect`
Expected: 2回目の実行では、1回目で収集済みの記事URLは全て`スキップ`としてカウントされ、`sources`テーブルの行数が増えていないこと(ホームページの見出しリストに変化が無ければ新規件数は0件)。ホームページに新しい記事が追加されていれば、その分だけ新規件数が増える。

このタスクはコード変更を含まないため、コミットは不要。
