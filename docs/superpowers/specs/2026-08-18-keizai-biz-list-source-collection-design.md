# ASAKUSA TODAY — keizai.biz系サイトの個別記事収集(list型ソース) 設計

## 位置づけ

[[2026-08-14-article-pipeline-design.md]]で設計した収集(`npm run collect`)は、`sources.ts`に登録したURL1件＝1つの静的ページとして本文を抽出し、`sources`テーブルに`url`のUNIQUE制約で重複排除して保存する設計だった。この方式は、一度収集したURLを二度と再取得しない(＝内容が更新されても拾われない)という制約がある。

2026-08-18に収集対象へ追加した`asakusa.keizai.biz`(浅草経済新聞)・`sumida.keizai.biz`(墨田経済新聞)は「みんなの経済新聞ネットワーク」系の地域ニュースサイトで、ホームページ自体ではなく`/headline/[数字]/`形式の個別記事ページに実際のニュース本文がある。ホームページには最新の個別記事へのリンク一覧が並ぶ。個別記事ページは公開後に内容が変わらない(＝URLごとに内容が固定)という性質があるため、「ホームページから個別記事URLを見つけて`sources`に追加する」方式にすれば、既存のURL単位の重複排除の仕組みをそのまま使って「新しい記事が公開されるたびに次回collectで自然に拾われる」動作が実現できる。内容ハッシュによる差分検知のような新方式は不要。

## スコープ

- `server/config/sources.ts`の`SourceSite`型を`page`(既存の単一ページ収集)と`list`(一覧ページから個別記事URLを収集)の判別可能なunion型に変更する
- `server/utils/collector.ts`に一覧ページから個別記事リンクを抽出する処理(`extractArticleLinks`)と、それを使って複数記事を収集する処理(`collectListSource`)を追加する
- 既存の`collectSource`(page型)に、fetch前のDB存在チェックを追加する(既に収集済みのURLへの無駄なHTTPリクエストを避ける。page型・list型双方の個別記事収集で使う)
- `asakusa.keizai.biz`・`sumida.keizai.biz`を`sources.ts`で`list`型に変更する(`articleLinkPattern: /\/headline\/\d+\//`)

**スコープ外**

- 既存43件の`page`型サイトのうち、list型に変えた方がよいサイトの洗い出し・移行(別タスク)。今回の設計はlist型の仕組みを汎用化するに留め、他サイトへの適用は後日個別に判断する
- RSS/サイトマップ経由の収集([[2026-08-14-article-pipeline-design.md]]の方針通り、汎用的なHTML本文抽出を継続する)
- 一覧ページの「もっと見る」以降のページネーションを辿った過去記事の遡及収集。ホームページに表示される直近の見出しリンクのみを対象とする
- 内容ハッシュによる差分検知・再取得の仕組み(個別記事URLが内容不変である前提のため不要と判断)

## 前提・方針

- `list`型の`SourceSite`は`articleLinkPattern: RegExp`を持ち、一覧ページのHTML内の`<a href>`のうちこのパターンにマッチするものを個別記事URLとして抽出する
- リンクの絶対URL化は`new URL(href, site.url).href`で行う。相対パスのリンクにも対応する
- 抽出したURLは重複排除した上で、`sources`テーブルに未登録のものだけを対象にfetch・本文抽出・保存する。既に登録済みのURLはfetchFnを呼び出さずスキップする(不要なHTTPリクエストを避ける)
- 個別記事の本文抽出は既存の`extractArticleText()`をそのまま再利用する。`category`・`site_name`は一覧ページ側(list型のSourceSite)の設定値を継承する
- `collectSource()`(page型)にも同様のfetch前DB存在チェックを追加する。DBの`sources.url` UNIQUE制約はそのまま安全網として残す
- 一覧ページ自体のfetch失敗は、そのlistサイト全体を1件のエラーとして扱う(個別記事の処理は行わない)。個別記事側のfetch失敗は、その記事だけをスキップし他の記事の処理は継続する

## アーキテクチャ

```
npm run collect
  │
  ├─ page型サイト(既存43件)
  │    collectSource(db, site, fetchFn)
  │      1. DB存在チェック(SELECT url) → 登録済みなら fetchFn を呼ばず 'skipped'
  │      2. 未登録なら fetch → extractArticleText → INSERT OR IGNORE → 'inserted' | 'error'
  │
  └─ list型サイト(asakusa.keizai.biz, sumida.keizai.biz)
       collectListSource(db, site, fetchFn)
         1. 一覧ページ(site.url)をfetch。失敗時は { inserted:0, skipped:0, error:1 } を返す
         2. extractArticleLinks(html, site.url, site.articleLinkPattern) で個別記事URLを抽出・絶対URL化・重複排除
         3. 各記事URLについて:
              DB存在チェック → 登録済みなら fetchFn を呼ばず skipped++
              未登録なら fetch → extractArticleText → INSERT → inserted++ (fetch失敗は error++、他URLの処理は継続)
         4. 集計 { inserted, skipped, error } を返す

collectAllSources(db, sites, fetchFn) は各 site.type を見て上記いずれかを呼び分け、
返ってきたカウントを合算する。
```

## コンポーネント

### 1. `server/config/sources.ts`(変更)

```ts
export type SourceSite =
  | { type: 'page'; url: string; siteName: string; category: SourceCategory }
  | { type: 'list'; url: string; siteName: string; category: SourceCategory; articleLinkPattern: RegExp }
```

- 既存43件全てに`type: 'page'`を追加する(挙動は変わらない)
- `asakusa.keizai.biz`・`sumida.keizai.biz`を以下に変更:
  ```ts
  { type: 'list', url: 'https://asakusa.keizai.biz/', siteName: 'asakusa.keizai.biz', category: 'asakusa-area', articleLinkPattern: /\/headline\/\d+\// },
  { type: 'list', url: 'https://sumida.keizai.biz/', siteName: 'sumida.keizai.biz', category: 'oshiage-area', articleLinkPattern: /\/headline\/\d+\// },
  ```

### 2. `server/utils/collector.ts`(変更・追加)

```ts
export function extractArticleLinks(html: string, baseUrl: string, pattern: RegExp): string[]

export async function collectSource(
  db: Database.Database,
  site: Extract<SourceSite, { type: 'page' }>,
  fetchFn?: typeof fetch
): Promise<'inserted' | 'skipped' | 'error'>

export async function collectListSource(
  db: Database.Database,
  site: Extract<SourceSite, { type: 'list' }>,
  fetchFn?: typeof fetch
): Promise<{ inserted: number; skipped: number; error: number }>

export async function collectAllSources(
  db: Database.Database,
  sites: SourceSite[],
  fetchFn?: typeof fetch
): Promise<{ inserted: number; skipped: number; error: number }>
```

- `extractArticleLinks`: cheerioで`<a href>`を走査し、`articleLinkPattern`にマッチする`href`を`new URL(href, baseUrl).href`で絶対URL化し、`Set`で重複排除して配列で返す
- `collectSource`: 冒頭で`SELECT 1 FROM sources WHERE url = ?`を実行し、存在すれば`fetchFn`を呼ばずに`'skipped'`を返す。存在しなければ従来通りfetch・本文抽出・`INSERT OR IGNORE`(UNIQUE制約は安全網として維持)
- `collectListSource`: 上記アーキテクチャ図の通り。一覧ページのfetch失敗は`{inserted:0, skipped:0, error:1}`。個別記事は`collectSource`と同様のDB存在チェック→fetch→本文抽出→INSERTの流れを記事URLごとに行う
- `collectAllSources`: `site.type`で分岐し、`page`は`collectSource`の結果(文字列)をカウントに反映、`list`は`collectListSource`の結果(オブジェクト)を加算する

## データフロー

1. 開発者が`npm run collect`を実行
2. `page`型サイトは、DBに未登録のもののみfetch・本文抽出・保存(登録済みは何もせずスキップ)
3. `list`型サイトは、一覧ページをfetchして個別記事URLを洗い出し、DBに未登録の記事URLのみfetch・本文抽出・保存する。次回以降の実行では、前回までに収集済みの記事URLはスキップされ、一覧ページに新しく追加された記事URLだけが新規収集される
4. `npm run generate`は変更なし。新しく`sources`に追加された行(`processed_at IS NULL`)を対象に記事を生成する([[2026-08-14-article-pipeline-design.md]]の既存フロー通り)

## エラーハンドリング

- `page`型: 個別サイトのfetch失敗・非200は`'error'`。他サイトの処理は継続([[2026-08-14-article-pipeline-design.md]]から変更なし)
- `list`型: 一覧ページ自体のfetch失敗・非200は、そのサイト全体を1件のエラーとして計上し個別記事の処理は行わない。個別記事のfetch失敗は、その記事のみエラーとしてカウントし、他の記事・他サイトの処理は継続する
- `sources.url`のUNIQUE制約は維持するため、DB存在チェックとfetch処理の間に競合が発生しても(本パイプラインは`npm run collect`の単一プロセス・逐次実行のため通常発生しないが)二重挿入は防止される

## テスト方針

- `server/utils/collector.test.ts`に追加:
  - `extractArticleLinks`: パターンにマッチするリンクの抽出、相対URLの絶対URL化、重複排除、マッチしないリンクの除外
  - `collectListSource`: 複数の新規記事URLがそれぞれ`sources`にinsertされること、既にDB登録済みのURLは`fetchFn`が呼ばれずスキップされること、一部の記事のfetch失敗が他記事の処理に影響しないこと、一覧ページ自体のfetch失敗時は`{inserted:0, skipped:0, error:1}`を返すこと
  - `collectSource`: 既にDB登録済みのURLに対して`fetchFn`が呼び出されないこと(呼び出し回数のアサーション)
  - `collectAllSources`: `page`型・`list`型が混在する場合に、それぞれの結果が正しく合算されること
- 既存の`collectSource`/`collectAllSources`のテスト(重複URLのスキップ、fetch失敗時の継続)は型変更に合わせて`type: 'page'`を追加した上でそのまま維持する
