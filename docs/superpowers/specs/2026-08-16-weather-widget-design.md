# ASAKUSA TODAY — トップページ天気予報ウィジェット

## 位置づけ

トップページ(`pages/index.vue`)に、気象庁(JMA)の無料API(`https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json`)を使った今日の天気予報カードを追加する。既存の`SOURCE_SITES`(`server/config/sources.ts`)にあるtenki.jpスクレイピングの`weather`カテゴリは記事生成パイプライン用の別系統であり、今回のウィジェットとは無関係。API呼び出し・DBスキーマ・記事系のロジックには手を入れない。

## スコープ

- サーバーAPI `GET /api/weather` の新規追加(JMAのJSONを取得・整形・キャッシュして返す)
- `server/utils/weather.ts`: JMAレスポンスのパース処理(純粋関数)
- `components/WeatherCard.vue` の新規追加
- `pages/index.vue` への組み込み(見出しの下、記事一覧の上)

**スコープ外**

- 今日以外の予報(明日・週間)
- 浅草以外のエリア切り替え
- 最低気温の表示(最高気温のみ)
- 既存の記事生成パイプライン・DBスキーマの変更

## 前提・方針

- [[2026-08-15-ui-design.md]]の方針を踏襲し、UI表示文言は英語で統一する。
- JMAのAPIはキーなしで叩ける公開JSONだが、アクセス頻度への配慮としてサーバー側でメモリキャッシュ(TTL 30分)を持ち、キャッシュが新鮮な間は再取得しない。
- 外部通信はサーバー側で行う(`server/utils/collector.ts`の`collectSource`と同じ方針)。ブラウザから直接JMAを叩かない。
- 取得・パースに失敗した場合はカード自体を非表示にし、ページ全体のエラーにはしない。

## アーキテクチャ

```
pages/index.vue ── useFetch('/api/weather')
  │                       │
  │                 GET /api/weather (server/api/weather/index.get.ts)
  │                       │  (メモリキャッシュ, TTL 30分)
  │                 fetch https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json
  │                       │
  │                 server/utils/weather.ts: parseWeatherForecast()
  └─ WeatherCard.vue (props受け取りのみ、v-ifは pages/index.vue 側)
```

- `server/api/weather/index.get.ts`: イベントハンドラ。`server/utils/weather.ts`の`getWeatherForecast()`を呼んで返すだけの薄いラッパー。
- `server/utils/weather.ts`の`getWeatherForecast()`: キャッシュが有効ならキャッシュを返す。無効なら`fetchFn`(既定`fetch`、テスト時は差し替え可能)でJMAのJSONを取得し、`parseWeatherForecast()`に渡して整形結果をキャッシュ・レスポンスする。取得・パースに失敗したら`null`を返す(HTTPステータスは200のまま。フロント側の分岐を単純にするため)。
- キャッシュはモジュールスコープの変数(`{ data, fetchedAt }`)で保持する、DBは使わない。サーバー再起動でクリアされる程度の軽いキャッシュで十分。

## コンポーネント

### 1. `server/utils/weather.ts`(新規)

```ts
export interface WeatherForecast {
  weatherCode: string
  weatherLabel: string // weatherCodeの4区分(Sunny/Cloudy/Rainy/Snowy)を英語ラベル化したもの
  weatherEmoji: string // weatherCodeの4区分から算出
  pop: number       // 降水確率(%)
  highTemp: number  // 最高気温(℃)
  reportDatetime: string
}

export function parseWeatherForecast(jmaJson: unknown): WeatherForecast | null
```

- JMAのレスポンス(配列)の`[0]`(短期予報)から東京地方(エリアコード`130010`)の`timeSeries[0]`(天気)・`timeSeries[1]`(降水確率)、アメダス地点「東京」(コード`44132`)の`timeSeries[2]`(気温)を取り出す。
- 天気: `weatherCodes[0]`(今日分、`timeDefines[0]`に対応)。JMAの`weathers[0]`は日本語の生文なのでUI表示には使わない。`weatherCode`の先頭1桁(1=晴,2=くもり,3=雨,4=雪)から`weatherLabel`(英語)・`weatherEmoji`を導出する。
- 降水確率: `timeSeries[1]`の`timeDefines`のうち、`reportDatetime`と同じ日付に該当する`pops`の最大値。
- 最高気温: `timeSeries[2]`の`temps[0]`を数値化。
- 該当エリアコードが見つからない、必要な値が欠けている、JSON形式が想定と違う、などの場合は`null`を返す(例外は投げない)。

### 2. `server/api/weather/index.get.ts`(新規)

```ts
export default defineEventHandler(async (event) => {
  // キャッシュ有効ならキャッシュを返す
  // fetchFn で JMA JSON 取得 → parseWeatherForecast() → キャッシュ更新 → 返す
  // 取得失敗 or パース失敗なら null を返す
})
```

- テスト容易性のため、fetch関数を差し替え可能な形(`collectSource`と同様のパターン)にする。
- タイムアウトは特別なハンドリングをせず、`fetch`失敗(reject)をtry/catchで拾って`null`にフォールバックする。

### 3. `components/WeatherCard.vue`(新規)

- `ArticleCard.vue`と同じく、propsを受け取って表示するだけの純粋な表示コンポーネント(`useFetch`はしない)。
- `UCard`ベース。天気アイコン(絵文字)・天気ラベル・最高気温・降水確率を1〜2行で表示。
- 表示文言は英語(例: "Cloudy", "High 29°C", "Rain 30%")。

### 4. `pages/index.vue`(既存を修正)

- `useFetch('/api/weather')`を追加し、結果が真値の場合のみ見出し`<h1>`の直下・記事カードグリッドの上に`<WeatherCard v-if="weather" ... />`を描画する。

## データフロー

1. `pages/index.vue`がSSR/CSRで描画される際、自身が`GET /api/weather`を呼ぶ。
2. サーバーはキャッシュ確認 → (必要なら)JMAへfetch → パース → 整形済みJSONを返す。
3. `pages/index.vue`は結果を`WeatherCard.vue`にpropsとして渡す。`null`ならカードごと非表示。

## エラーハンドリング

- JMAへのfetch失敗(ネットワークエラー・非200)、レスポンスのJSON parse失敗、`parseWeatherForecast()`が`null`を返すケース、いずれも`/api/weather`は`null`を返す(500エラーにはしない)。
- フロント側はエラー時に何も表示しない(トースト等も出さない)。ページ全体の他の機能(記事一覧)には影響しない。

## テスト方針

- `server/utils/weather.test.ts`: 実際のJMA JSON構造を模したサンプルデータを使い、`parseWeatherForecast()`の正常系(値が正しく抜き出せる)・異常系(エリアが見つからない、必要な値が欠けている、想定外の形)、および`getWeatherForecast()`の正常系・fetch失敗時に`null`を返すこと・キャッシュが効くこと(TTL内は`fetchFn`が再度呼ばれない・TTL超過後は呼ばれる)を`fetchFn`と`now`を差し替えてテストする。
- `server/api/weather/index.get.ts`自体は`getWeatherForecast()`を呼ぶだけの薄いラッパーであり、`tests/api/*.test.ts`が使う`@nuxt/test-utils`の`setup({ server: true })`はテストプロセスとは別プロセスでサーバーを起動する(`tests/api/admin.test.ts`のコメント参照)ため、そのプロセス内で`fetchFn`を差し替えることができない。よって自動テストは追加せず、実装後に`npm run dev`を起動して`curl`で疎通確認する(手動確認)。
- `components/WeatherCard.test.ts`: props(整形済みデータ)を渡した時の表示内容をテストする。
- `pages/index.vue`側の統合的な確認は既存の`tests/smoke.test.ts`等で大きな崩れがないことを流して確認する程度とし、新規のE2Eテストは追加しない。JMAへのfetchが失敗しても`getWeatherForecast()`は`null`を返す設計のため、`tests/smoke.test.ts`実行時にネットワークが使えない環境でもテストは失敗しない。
