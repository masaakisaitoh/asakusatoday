# 地図タイル: MapTiler(MapLibre GL)移行 Design

## Context

[[2026-08-22-asakusa-map-design.md]]で実装した`/map`ページのタイルソースは、実装時点で`maps.wikimedia.org`のOSMインターナショナルタイル(`osm-intl`、`lang`パラメータで多言語ラベル切り替え)を採用していた。

本番で`OpaqueResponseBlocking`の警告が多発する不具合調査の結果、これはブラウザ側のバグではなく、Wikimediaの地図タイルサービスの利用規約(`Forbidden: Map tiles are restricted to Wikimedia and affiliated sites only.`)によるものと判明した。Wikimedia側のVarnishキャッシュにヒットするタイルはたまたま返るが、キャッシュミスのタイルはオリジンで403(text/html)を返され、期待したimage/pngと異なるためブラウザにブロックされる。`referrerpolicy="no-referrer"`をタイル`<img>`に設定してRefererヘッダーを消しても、この403自体は解消しない(Referer有無に関わらずキャッシュ次第で不安定)ことをFirefox実機・curl両方で確認済み。

前回designの Non-Goals には「MapLibre GL(ベクタータイル)への移行(将来的にOSMタイルの利用ポリシー上必要になれば別途検討)」と明記されており、今回まさにその状況に該当したため、本designで対応する。

## Goals

- `/map`のタイルソースを、外部サイトでの利用が正式に許可されているMapTilerのベクタータイル(ストリートマップスタイル)に切り替える
- 現状の`AsakusaMap.vue`が持つ機能(現在地マーカー・パルスアニメーション・精度円・ズームコントロール・現在地に戻るボタン・ジオロケーション連携)を無改造で維持する
- `locale`(`ja`/`en`/`ko`/`zh-Hant`/`zh-Hans`/`pt`)に応じた地図ラベルの言語切り替えを維持する
- 既存のe2eテスト(`tests/e2e/map.test.ts`)がそのまま通ることを維持する

## Non-Goals

- Leafletから MapLibre GL JS への完全移行(マーカー・パルスアニメーション等のAPIをMapLibre側で作り直すこと)。今回はLeafletの地図インスタンス・マーカー実装はそのまま残し、タイルレイヤーだけをMapTilerのベクタータイルに差し替える
- ダークモード対応の地図スタイル切り替え(現状`AsakusaMap.vue`にテーマ連動の仕組みは無く、本designでも追加しない)
- MapTilerの無料枠を超える利用量が発生した場合の課金プラン変更手順の整備(運用者が別途MapTilerダッシュボードで対応する)

## Architecture

### 依存関係の追加

- `package.json`(dependencies)に`@maplibre/maplibre-gl-leaflet`と`maplibre-gl`を追加する
  - `@maplibre/maplibre-gl-leaflet`は、MapLibre GL JSをLeafletの`L.tileLayer`と同じ感覚で使えるようにするMapLibre公式のブリッジプラグイン。`L.maplibreGL({ style })`で生成したレイヤーオブジェクトを、通常のLeafletタイルレイヤーと同様に`.addTo(map)`できる

### `components/AsakusaMap.vue`の変更点

- `tileLayer`の型を`import('leaflet').TileLayer`から`ReturnType<typeof import('@maplibre/maplibre-gl-leaflet').maplibreGL>`相当に変更する
- `tileUrlFor(lang)`(Wikimediaの`{z}/{x}/{y}{r}.png?lang=`テンプレート生成)を廃止する。代わりにスタイルURLを組み立てる関数に置き換える:

  ```ts
  function styleUrl(): string {
    const config = useRuntimeConfig()
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${config.public.maptilerKey}`
  }
  ```

- `onMounted`内、`L.tileLayer(...)`を呼んでいた箇所を`L.maplibreGL({ style: styleUrl() }).addTo(map)`に置き換える
- 言語切り替え: スタイルロード完了時(MapLibreマップの`style.load`イベント)、および`locale`の`watch`発火時に、以下の`applyMapLanguage`関数を呼ぶ

  ```ts
  function applyMapLanguage(glMap: import('maplibre-gl').Map, lang: string): void {
    const style = glMap.getStyle()
    if (!style?.layers) return
    for (const layer of style.layers) {
      if (layer.type !== 'symbol') continue
      const textField = glMap.getLayoutProperty(layer.id, 'text-field')
      if (textField === undefined) continue
      glMap.setLayoutProperty(layer.id, 'text-field', [
        'coalesce',
        ['get', `name:${lang}`],
        ['get', 'name']
      ])
    }
  }
  ```

  `mapLocaleToTileLang`(`zh-Hant`→`zh-hant`等のマッピング関数)は既存のものをそのまま流用する(MapTiler/OpenMapTilesの言語フィールド命名規則もWikimediaのosm-intlと同じ`name:xx`系のため)
- `tileLayer`変数経由での`setUrl`呼び出しは廃止し、`watch(locale, ...)`の中身を「保持している`maplibre-gl`の`Map`インスタンスに対して`applyMapLanguage`を呼ぶ」処理に置き換える。MapLibreマップインスタンスは`L.maplibreGL(...)`の戻り値の`.getMaplibreMap()`で取得し、コンポーネントのローカル変数に保持しておく

### APIキー管理

- `nuxt.config.ts`の`runtimeConfig.public`に`maptilerKey: process.env.MAPTILER_KEY`を追加する
- `.env`(既存の`.env.example`があれば追記)に`MAPTILER_KEY=`のプレースホルダーを追加する
- MapTilerのAPIキーはブラウザから直接叩く前提の公開キーであり、秘匿情報としては扱わない(MapTiler側のダッシュボードでHTTPリファラー制限をかけて本番ドメイン以外からの利用を防ぐのが正規の運用)

### `nuxt.config.ts`の変更点

- `maplibre-gl`のCSS(`maplibre-gl/dist/maplibre-gl.css`)を`css`配列に追加する(既存の`leaflet/dist/leaflet.css`と並べる)

## Testing

- 既存の`tests/e2e/map.test.ts`(5テスト)は、`.leaflet-container`の表示確認・現在地マーカーの存在確認(`path.leaflet-interactive`)・スワイプ遷移のみを検証しており、タイル画像そのものは見ていないため、無改造で通る想定
- テスト実行環境(ローカル・CI)には有効な`MAPTILER_KEY`が必要になる。キーが無い/無効な場合はスタイルのロードに失敗し、地図タイルは表示されないが、Leaflet自体のコンテナやマーカーは変わらず描画されるため、既存アサーションへの影響は無い想定(要実装時に実機確認)
- 新規のユニットテストは追加しない(`applyMapLanguage`はMapLibreの`Map`インスタンスに依存する薄いDOM操作のため、e2eでの目視確認に留める)

### 手動確認

- devサーバーで`/map`を開き、MapTilerのタイルが表示されること、ズーム・パンで新しいタイルが正常にロードされること(コンソールに`OpaqueResponseBlocking`が出ないこと)を確認する
- 言語スイッチャー(既存のロケール切り替えUI)で地図ラベルの言語が切り替わることを確認する

## Open Questions

- MapTilerのAPIキー発行・料金プラン確認は実装者(人間)側の作業として別途必要
