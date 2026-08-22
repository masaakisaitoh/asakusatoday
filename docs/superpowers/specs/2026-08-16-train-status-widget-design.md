# ASAKUSA TODAY — トップページ電車運行情報ウィジェット

## 位置づけ

トップページ(`pages/index.vue`)に、対象路線(東京メトロ銀座線・日比谷線、都営浅草線・大江戸線、および追加候補のつくばエクスプレス)の運行情報カードを追加する。[[2026-08-16-weather-widget-design.md]]で導入した天気カードと同じ構成(サーバー側でキャッシュ付き取得 → props受け取りの表示コンポーネント)を踏襲する。

## 経緯・スコープ判断

当初の依頼は7路線(東京メトロ銀座線・日比谷線、都営浅草線・大江戸線、東武スカイツリーライン、JR山手線、JR総武線)だったが、事前調査の結果、無料APIで実際に取得できるのは4路線のみと判明した。

- **東京メトロ・都営地下鉄**: ODPT(公共交通オープンデータセンター、`api.odpt.org`)の運行情報(`odpt:TrainInformation`)で取得可能。東京メトロは「公共交通オープンデータ基本ライセンス」(商用利用可・出典表示要)、都営はCC BY 4.0。ユーザー登録によるAPIキー発行制(無料、承認待ちあり)。
  - 出典: https://ckan.odpt.org/organization/tokyometro , https://ckan.odpt.org/organization/toei
- **JR東日本(山手線・総武線)・東武鉄道(スカイツリーライン)**: ODPT上にデータセット自体は存在するが、いずれも「公共交通オープンデータチャレンジ限定ライセンス」(コンテスト年限定・一般利用不可)でのみ提供されており、一般サイトでの利用はできない。2026-08-18時点で東武を再確認したが、依然として全データセット(「東武鉄道 運行情報」含む)が「チャレンジ2026限定」のチャレンジ限定ライセンスのままで状況は変わっていない。
  - 出典: https://ckan.odpt.org/organization/jreast , https://ckan.odpt.org/organization/tobu
  - 代替として知られる第三者集約API(rti-giken.jp)も2022-05-13付けで無料提供を終了しており(現在は有料プランのみ)、他に無料の代替APIは見つからなかった。
  - 出典: https://rti-giken.jp/fhc/api/train_tetsudo/
- **首都圏新都市鉄道(つくばエクスプレス)**: 2026-08-18に追加調査。「運行情報」データセットが「公共交通オープンデータ基本ライセンス」(商用利用可・出典表示要)で提供されており、東京メトロ・都営と同様に一般利用が可能と見られる。5路線目の追加候補とする(路線ID・レスポンス構造は東京メトロ・都営同様、実APIキー入手前は未検証)。
  - 出典: https://ckan.odpt.org/dataset/?organization=mir

このため、本機能のスコープはJR・東武を除いた路線とする(東京メトロ2路線・都営2路線の既存4路線 + つくばエクスプレスを追加候補とする5路線目)。JR・東武向けの無料APIが将来公開された場合は別途スコープに追加する。

## スコープ

- サーバーAPI `GET /api/train-status` の新規追加(ODPTの運行情報を東京メトロ・都営地下鉄、および追加候補のつくばエクスプレスからそれぞれ取得・整形・キャッシュして返す)
- `server/utils/trainStatus.ts`: ODPTレスポンスのパース・ステータス分類処理(純粋関数)
- `components/TrainStatusCard.vue` の新規追加
- `pages/index.vue` への組み込み(天気カードの下)

**スコープ外**

- JR山手線・総武線、東武スカイツリーラインの運行情報(上記の理由により無料APIが存在しないため)
- 運行情報の詳細本文表示(遅延理由・再開見込み等)。ステータス区分とラベルのみ表示する。
- 過去の運行情報履歴

## 前提・方針

- [[2026-08-15-ui-design.md]]の方針を踏襲し、UI表示文言は英語で統一する。
- 外部通信(ODPTへのfetch)はサーバー側でのみ行う([[2026-08-16-weather-widget-design.md]]と同じ方針)。
- ODPTのAPIキー(`consumerKey`)はユーザー自身が https://developer.odpt.org/ で登録・取得し、`.env`に`ODPT_API_KEY`として設定する。キー未設定・取得失敗時はカードを非表示にし、ページ全体のエラーにはしない。
- キャッシュTTLは5分(`CACHE_TTL_MS = 5 * 60 * 1000`)。運行情報は天気より鮮度の重要度が高いため、天気(30分)より短くする。
- 東京メトロ・都営地下鉄(・追加候補のつくばエクスプレス)への問い合わせは`Promise.allSettled`で並行に行い、一部の事業者が失敗しても残りの結果だけで動作する。
- ODPTの路線ID・レスポンスのフィールド名は公開ドキュメントからの推測であり、実APIキー入手前は未検証。キー入手後に実データで疎通確認し、ズレがあれば修正する前提とする。

## アーキテクチャ

```
pages/index.vue ── useFetch('/api/train-status')
  │                       │
  │                 GET /api/train-status (server/api/train-status/index.get.ts)
  │                       │  (メモリキャッシュ, TTL 5分)
  │                 ODPT TrainInformation を TokyoMetro・Toei(・追加候補MIR) それぞれに fetch (Promise.allSettled)
  │                       │
  │                 server/utils/trainStatus.ts: parseOperatorTrainInformation()
  └─ TrainStatusCard.vue (props: lines、v-ifは pages/index.vue 側)
```

- `server/api/train-status/index.get.ts`: `getTrainStatus()`を呼ぶだけの薄いラッパー。
- `server/utils/trainStatus.ts`の`getTrainStatus()`: キャッシュが有効ならキャッシュを返す。無効なら`ODPT_API_KEY`未設定時は`null`。設定済みなら東京メトロ・都営地下鉄(・追加候補のつくばエクスプレス)それぞれにfetch(`fetchFn`差し替え可能)し、成功した分だけ`parseOperatorTrainInformation()`でパースして結合する。全事業者とも失敗した場合は`null`を返す。
- キャッシュはモジュールスコープの変数(`{ data, fetchedAt }`)で保持する。

## コンポーネント

### 1. `server/utils/trainStatus.ts`(新規)

```ts
export type TrainStatusLevel = 'normal' | 'delayed' | 'suspended' | 'disrupted'

export interface TrainLineStatus {
  lineId: 'ginza' | 'hibiya' | 'asakusa' | 'oedo' | 'tx'
  lineName: string // 'Ginza Line' 等、英語の静的文字列
  status: TrainStatusLevel
}

export function parseOperatorTrainInformation(odptJson: unknown): TrainLineStatus[]
export function getTrainStatus(fetchFn?: typeof fetch, now?: () => Date): Promise<TrainLineStatus[] | null>
export function resetTrainStatusCacheForTests(): void
```

- 対象路線ID(推測。要実データ検証):
  - `odpt.Railway:TokyoMetro.Ginza` → `ginza` / "Ginza Line"
  - `odpt.Railway:TokyoMetro.Hibiya` → `hibiya` / "Hibiya Line"
  - `odpt.Railway:Toei.Asakusa` → `asakusa` / "Asakusa Line"
  - `odpt.Railway:Toei.Oedo` → `oedo` / "Oedo Line"
  - `odpt.Railway:MIR.TsukubaExpress` → `tx` / "Tsukuba Express"(追加候補。事業者コード・路線IDとも未検証。運行情報提供元は`api.odpt.org`上の首都圏新都市鉄道(MIR)の`odpt:TrainInformation`)
- ODPTのレスポンス(配列)の各要素から`odpt:railway`で対象路線を絞り込み、`odpt:trainInformationStatus`・`odpt:trainInformationText`の両フィールド(それぞれ文字列 or `{ja, en, ...}`形式のどちらも許容)からテキストを取り出し、2つを連結した1本の文字列に対してキーワード判定する(どちらか一方にしかキーワードが無くても拾えるようにするため):
  - 「平常」を含む → `normal`
  - 「見合わせ」を含む → `suspended`
  - 「遅延」または「遅れ」を含む → `delayed`
  - 上記以外の空でないテキスト → `disrupted`(未知の異常。判定できないテキストは「異常あり」寄りに倒す)
  - テキストが空、または対象路線が見つからない → その路線はスキップ(`unknown`として結果から除外し、"正常"と決めつけない)
- `getTrainStatus()`のキャッシュ・fetch方針は[[2026-08-16-weather-widget-design.md]]の`getWeatherForecast()`と同型(`fetchFn`・`now`を差し替え可能にし、TTL経過で再取得)。

### 2. `server/api/train-status/index.get.ts`(新規)

```ts
export default defineEventHandler(() => {
  return getTrainStatus()
})
```

### 3. `components/TrainStatusCard.vue`(新規)

- `ArticleCard.vue`/`WeatherCard.vue`と同じく、propsを受け取って表示するだけの純粋な表示コンポーネント。
- props: `{ lines: TrainLineStatus[] }`
- 表示ロジック(コンポーネント内で`lines`から算出):
  - `lines`の長さが対象路線の全数(つくばエクスプレスを追加する場合は5)かつ全て`normal` → "All lines running normally." の一行のみ表示
  - `normal`以外のものが1件以上ある → その路線だけ「⚠️ Ginza Line — Delayed」のように列挙する(`normal`の路線は出さない)
  - 上記どちらにも該当しない(部分的なデータのみで異常も無い) → 何も描画しない(`UCard`ごと出さない)
- `UCard`ベース。表示文言は英語(例: "All lines running normally.", "Delayed", "Suspended", "Service Alert"(`disrupted`用))。

### 4. `pages/index.vue`(既存を修正)

- `useFetch('/api/train-status')`を追加し、結果が`null`でない場合のみ、天気カードの下に`<TrainStatusCard v-if="trainStatus" :lines="trainStatus" />`を描画する。

## データフロー

1. `pages/index.vue`がSSR/CSRで描画される際、自身が`GET /api/train-status`を呼ぶ。
2. サーバーはキャッシュ確認 → (必要なら)ODPTへ東京メトロ・都営地下鉄(・追加候補のつくばエクスプレス)それぞれfetch(`Promise.allSettled`) → 成功分だけパース・結合 → 整形済み配列(または全事業者失敗時は`null`)を返す。
3. `pages/index.vue`は結果を`TrainStatusCard.vue`にpropsとして渡す。`null`ならカードごと非表示。カード内部でも「表示すべき内容が無い」場合は何も描画しない。

## エラーハンドリング

- `ODPT_API_KEY`未設定、fetch失敗(ネットワークエラー・非200)、レスポンスのJSON parse失敗、いずれの事業者も上記に該当する場合は`/api/train-status`は`null`を返す(500エラーにはしない)。
- 一部の事業者だけ失敗した場合は、成功した事業者の路線分だけで判定を続行する。
- フロント側はエラー時に何も表示しない。ページ全体の他の機能(記事一覧・天気カード)には影響しない。

## テスト方針

- `server/utils/trainStatus.test.ts`: ODPTのレスポンス構造を模したサンプルデータ(東京メトロ・都営、および追加する場合はつくばエクスプレスそれぞれ)を使い、`parseOperatorTrainInformation()`の正常系(4区分それぞれの判定、対象外路線の除外、テキスト空の路線の除外)、`getTrainStatus()`の正常系・キー未設定時に`null`・一部の事業者だけ失敗しても結果が返ること・全事業者失敗時に`null`・キャッシュのTTL挙動([[2026-08-16-weather-widget-design.md]]の`weather.test.ts`と同様に`fetchFn`・`now`を差し替えて)をテストする。
- `server/api/train-status/index.get.ts`自体は薄いラッパーであり、[[2026-08-16-weather-widget-design.md]]の`/api/weather`と同じ理由(`@nuxt/test-utils`のサーバーが別プロセスで起動するため`fetchFn`を差し替えられない)で自動テストは追加せず、ODPTキー入手後に`npm run dev` + `curl`で手動疎通確認する。
- `components/TrainStatusCard.test.ts`: props(`lines`配列)を渡した時の3パターン(全路線正常、一部異常、部分データで異常なし=非表示)の表示内容をテストする。
- `pages/index.vue`側は既存の`tests/smoke.test.ts`が壊れていないことを確認する程度とし、新規のE2Eテストは追加しない。ODPTキー未設定・fetch失敗時も`getTrainStatus()`は`null`を返す設計のため、キー未設定の環境(CI等)でもテストは失敗しない。
