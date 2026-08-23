# 地図タイル MapTiler移行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/map`ページの地図タイルソースを、外部サイトでの利用が禁止されているWikimedia(`maps.wikimedia.org`)から、正式に利用可能なMapTiler(MapLibre GL経由のベクタータイル)に切り替え、`OpaqueResponseBlocking`警告とタイル欠損を解消する。

**Architecture:** `components/AsakusaMap.vue`のLeaflet地図インスタンス・マーカー・パルスアニメーション・現在地ボタン・ジオロケーション連携はそのまま維持し、タイルレイヤーの生成部分だけを`@maplibre/maplibre-gl-leaflet`経由の`L.maplibreGL({ style })`に差し替える。言語切り替えはMapLibreの`setLayoutProperty`でシンボルレイヤーの`text-field`を書き換える方式に変更する。

**Tech Stack:** Nuxt 3 / Vue 3, Leaflet 1.9, MapLibre GL JS 6, `@maplibre/maplibre-gl-leaflet` 0.1, MapTiler(`streets-v2`スタイル)

参照design: `docs/superpowers/specs/2026-08-23-map-tile-maptiler-migration-design.md`

## Global Constraints

- git操作(`add`/`commit`含む)は人間が行う。各タスクの"Commit"ステップはコマンドを提示するのみで、実行者(このプランを進める人間またはエージェント)は実際にコマンドを叩かず、人間に実行を依頼すること
- `MAPTILER_KEY`のAPIキー発行はユーザー(人間)が別途MapTilerダッシュボードで行う。本プランのスコープ外
- 既存のe2eテスト`tests/e2e/map.test.ts`(5テスト)を壊さないこと
- design docの方針通り、新規のユニットテストは追加しない(`applyMapLanguage`はMapLibreの`Map`インスタンスに依存する薄いDOM操作のため)

---

### Task 1: 依存関係追加とNuxt設定

**Files:**
- Modify: `package.json`
- Modify: `nuxt.config.ts`
- Modify: `.env`

**Interfaces:**
- Consumes: なし(このタスクが最初)
- Produces: `nuxt.config.ts`の`runtimeConfig.public.maptilerKey`(Task 2で`useRuntimeConfig().public.maptilerKey`として消費される)。`nuxt.config.ts`の`css`配列に追加される`maplibre-gl/dist/maplibre-gl.css`(Task 2のスタイル適用に必要)

- [ ] **Step 1: パッケージをインストールする**

Run: `npm install @maplibre/maplibre-gl-leaflet@^0.1.4 maplibre-gl@^6.5.0`

Expected: `package.json`の`dependencies`に`@maplibre/maplibre-gl-leaflet`と`maplibre-gl`が追加され、`package-lock.json`が更新される

- [ ] **Step 2: `nuxt.config.ts`にMapLibreのCSSとruntimeConfigを追加する**

`nuxt.config.ts`を以下の内容に変更する(既存の`compatibilityDate`/`devtools`/`modules`/`app`は変更しない):

```ts
export default defineNuxtConfig({
  compatibilityDate: '2026-08-13',
  devtools: { enabled: false },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css', 'leaflet/dist/leaflet.css', 'maplibre-gl/dist/maplibre-gl.css'],
  runtimeConfig: {
    public: {
      maptilerKey: process.env.MAPTILER_KEY ?? ''
    }
  },
  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' }
      ],
      meta: [{ name: 'theme-color', content: '#c83b32' }]
    }
  }
})
```

- [ ] **Step 3: `.env`に`MAPTILER_KEY`のプレースホルダーを追記する**

`.env`ファイル末尾に以下の行を追加する(既存の`ANTHROPIC_API_KEY=...`行はそのまま残す):

```
MAPTILER_KEY=
```

このステップは値を空のまま追記するだけでよい。実際のキーはユーザーがMapTilerでアカウント発行後に自分で埋める。

- [ ] **Step 4: ビルドが通ることを確認する**

Run: `npm run build`

Expected: エラー無く終了する(`MAPTILER_KEY`が空でもビルド自体は失敗しない。ビルド成功のみを確認し、実行時の地図表示確認はTask 3で行う)

- [ ] **Step 5: 既存テストスイートが壊れていないことを確認する**

Run: `npm run test`

Expected: 全テストPASS(このタスクではコード変更をしていないため、既存の結果から変化しないはず)

- [ ] **Step 6: Commit**

以下のコマンドを提示する(実行は人間が行う):

```bash
git add package.json package-lock.json nuxt.config.ts .env
git commit -m "feat: add MapTiler/MapLibre GL dependencies and config"
```

---

### Task 2: `AsakusaMap.vue`のタイルレイヤーをMapTiler(MapLibre GL)に差し替え

**Files:**
- Modify: `components/AsakusaMap.vue`

**Interfaces:**
- Consumes: `nuxt.config.ts`の`runtimeConfig.public.maptilerKey`(Task 1で追加済み)。`@maplibre/maplibre-gl-leaflet`パッケージの`maplibreGL(options): L.MaplibreGL`(`options.style: string`、戻り値の`.getMaplibreMap(): import('maplibre-gl').Map`)。`maplibre-gl`パッケージの`Map`型(`.getStyle()`, `.getLayoutProperty(layerId, name)`, `.setLayoutProperty(layerId, name, value)`, `.isStyleLoaded()`, `.on('load', cb)`)
- Produces: なし(末端タスク。UIコンポーネントの変更のみ)

- [ ] **Step 1: `components/AsakusaMap.vue`の`<script setup>`を書き換える**

現在の`<script setup lang="ts">`ブロック全体を、以下の内容に置き換える(`tileUrlFor`関数を削除し、`styleUrl`・`applyMapLanguage`関数を追加、`onMounted`と`watch(locale, ...)`を書き換える。`mapLocaleToTileLang`・`pulseIcon`・現在地マーカー用の`watch`・`recenter`は変更しない):

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useGeolocation } from '../composables/useGeolocation'

const { t } = useUiText()
const { locale } = useArticleLocale()

const ASAKUSA_CENTER: [number, number] = [35.7148, 139.7967]
const DEFAULT_ZOOM = 16
const LOCATION_BLUE = '#4285f4'

const mapContainer = ref<HTMLElement | null>(null)
const { state: geo, start: startGeolocation, stop: stopGeolocation } = useGeolocation()

let map: import('leaflet').Map | null = null
let userMarker: import('leaflet').CircleMarker | null = null
let accuracyCircle: import('leaflet').Circle | null = null
let pulseMarker: import('leaflet').Marker | null = null
let glLayer: import('leaflet').MaplibreGL | null = null
let glMap: import('maplibre-gl').Map | null = null

function mapLocaleToTileLang(value: string): string {
  switch (value) {
    case 'zh-Hant':
      return 'zh-hant'
    case 'zh-Hans':
      return 'zh-hans'
    default:
      return value
  }
}

function styleUrl(): string {
  const config = useRuntimeConfig()
  return `https://api.maptiler.com/maps/streets-v2/style.json?key=${config.public.maptilerKey}`
}

function applyMapLanguage(glMap: import('maplibre-gl').Map, lang: string): void {
  const style = glMap.getStyle()
  if (!style?.layers) return
  for (const layer of style.layers) {
    if (layer.type !== 'symbol') continue
    const textField = glMap.getLayoutProperty(layer.id, 'text-field')
    if (textField === undefined) continue
    glMap.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', `name:${lang}`], ['get', 'name']])
  }
}

function pulseIcon(L: typeof import('leaflet')): import('leaflet').DivIcon {
  return L.divIcon({
    className: '',
    html: '<span class="map-user-pulse" aria-hidden="true"></span>',
    iconSize: [28, 28],
    iconAnchor: [14, 14]
  })
}

onMounted(async () => {
  const L = await import('leaflet')
  const { maplibreGL } = await import('@maplibre/maplibre-gl-leaflet')
  if (!mapContainer.value) return
  map = L.map(mapContainer.value, {
    zoomControl: false,
    maxBounds: [
      [180, -Infinity],
      [-180, Infinity]
    ],
    maxBoundsViscosity: 1,
    minZoom: 1
  }).setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  map.createPane('pulsePane')
  const pulsePane = map.getPane('pulsePane')
  if (pulsePane) {
    pulsePane.style.zIndex = '350'
    pulsePane.style.pointerEvents = 'none'
  }
  L.control.zoom({ position: 'topright' }).addTo(map)
  map.attributionControl.setPrefix(false)

  glLayer = maplibreGL({ style: styleUrl() }).addTo(map)
  glMap = glLayer.getMaplibreMap()
  glMap.on('load', () => {
    if (glMap) applyMapLanguage(glMap, mapLocaleToTileLang(locale.value))
  })

  startGeolocation()
})

onUnmounted(() => {
  stopGeolocation()
  map?.remove()
  map = null
})

watch(locale, (newLocale) => {
  if (glMap && glMap.isStyleLoaded()) {
    applyMapLanguage(glMap, mapLocaleToTileLang(newLocale))
  }
})

watch(
  () => [geo.value.lat, geo.value.lng, geo.value.accuracy] as const,
  async ([lat, lng, accuracy]) => {
    if (lat === null || lng === null || !map) return
    const L = await import('leaflet')
    if (!userMarker) {
      pulseMarker = L.marker([lat, lng], {
        icon: pulseIcon(L),
        pane: 'pulsePane',
        interactive: false,
        keyboard: false
      }).addTo(map)
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy ?? 0,
        color: LOCATION_BLUE,
        weight: 1,
        fillColor: LOCATION_BLUE,
        fillOpacity: 0.15
      }).addTo(map)
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: LOCATION_BLUE,
        fillOpacity: 1
      }).addTo(map)
    } else {
      pulseMarker?.setLatLng([lat, lng])
      accuracyCircle?.setLatLng([lat, lng]).setRadius(accuracy ?? 0)
      userMarker.setLatLng([lat, lng])
    }
  }
)

function recenter(): void {
  if (!map) return
  if (geo.value.lat !== null && geo.value.lng !== null) {
    map.setView([geo.value.lat, geo.value.lng], map.getZoom())
  } else {
    map.setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  }
}
</script>
```

`<template>`と`<style>`ブロックは変更しない(現在の内容のまま)。

- [ ] **Step 2: 型チェックが通ることを確認する**

Run: `npx vue-tsc --noEmit`

Expected: `components/AsakusaMap.vue`に関するエラーが出ない。もし`import('leaflet').MaplibreGL`が解決できないという型エラーが出た場合は、ファイル先頭に以下の副作用importを追加してから再実行する:

```ts
import type {} from '@maplibre/maplibre-gl-leaflet'
```

- [ ] **Step 3: 既存の単体テストスイートが壊れていないことを確認する**

Run: `npm run test -- --exclude tests/e2e`

Expected: 全テストPASS(`AsakusaMap.vue`には既存の単体テストが無いため、このコマンドは他のコンポーネント/composableのテストに影響が無いことの確認になる)

- [ ] **Step 4: Commit**

以下のコマンドを提示する(実行は人間が行う):

```bash
git add components/AsakusaMap.vue
git commit -m "feat: switch map tile layer from Wikimedia to MapTiler via MapLibre GL"
```

---

### Task 3: e2e確認とMapTilerキー適用後の手動確認

**Files:**
- なし(コード変更なし。確認作業のみ)

**Interfaces:**
- Consumes: Task 1・Task 2の変更一式
- Produces: なし(最終確認タスク)

- [ ] **Step 1: 既存e2eテストがキー未設定でも壊れないことを確認する**

Run: `npx vitest run tests/e2e/map.test.ts`

Expected: 5テスト全てPASS。`.leaflet-container`の表示・現在地マーカー(`path.leaflet-interactive`)の存在・スワイプ遷移は、MapTilerタイルの表示成否に関わらずLeaflet側の要素として描画されるため、`MAPTILER_KEY`が空でも通る想定(design doc記載の想定)。もしこのステップで失敗する場合は、`glLayer = maplibreGL(...)`の呼び出しが同期的に例外を投げていないか(`onMounted`内で`try/catch`していないため、スタイルURLの組み立てエラー等があるとコンポーネント初期化自体が止まる可能性がある)を疑い、Task 2のStep 1のコードを見直す

- [ ] **Step 2: 人間がMapTilerのAPIキーを取得し`.env`の`MAPTILER_KEY`に設定する**

これは実装者(人間)が行う作業。MapTilerのアカウントを作成し、無料枠のAPIキーを発行して`.env`の`MAPTILER_KEY=`の行に値を設定する

- [ ] **Step 3: devサーバーで目視確認する**

Run: `npm run dev`

ブラウザで`/map`を開き、以下を確認する:
- 地図タイル(ストリートマップ)が表示される
- ブラウザの開発者ツールのコンソールに`OpaqueResponseBlocking`の警告が出ない
- 地図をズーム・パンしても新しいタイルが正常に表示される
- 既存のロケール切り替えUIで言語を切り替えると、地図上の地名ラベルの言語が切り替わる
- 現在地に戻るボタン・ズームボタン・現在地の青いドット表示が今まで通り機能する

Expected: 上記すべてが問題なく動作する

- [ ] **Step 4: 本番環境にデプロイ後、コンソールに`OpaqueResponseBlocking`警告が出ないことを確認する**

これは実装者(人間)がデプロイ後に本番URLで確認する作業。本Issueの発端となった警告が解消していることを最終確認する

---

## Self-Review Notes

- **Spec coverage:** design docの Architecture節(依存追加・`AsakusaMap.vue`変更点・APIキー管理・`nuxt.config.ts`変更点)は Task 1・Task 2 でカバー。Testing節(既存e2eがそのまま通ること・新規ユニットテスト追加なし・手動確認)は Task 3 でカバー
- **Placeholder scan:** 「TBD」「後で実装」等の記述なし。Task 3 Step 2・4は人間が行う運用作業であり、コード上のプレースホルダーではない
- **Type consistency:** `glLayer: import('leaflet').MaplibreGL`、`glMap: import('maplibre-gl').Map`という型を Task 2 内で一貫して使用。`applyMapLanguage(glMap: import('maplibre-gl').Map, lang: string)`のシグネチャも呼び出し側(`onMounted`内・`watch(locale, ...)`内)と一致させた
