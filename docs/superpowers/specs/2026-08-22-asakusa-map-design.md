# ASAKUSA MAP (v1) Design

## Context

浅草エリアを中心とした地図に、ユーザー自身の現在地をリアルタイムに表示する新規ページ`/map`を作る。ヘッダーのアバタードロップダウン(`layouts/default.vue`)から遷移できるようにし、ホームページ(`/`)からは左スワイプで、地図ページからは右スワイプでホームに戻れる、スライドアニメーション付きの遷移を実装する。

ユーザーから共有された参考画像は位置情報トラッカー系の別アプリのスクリーンショットであり、そのすべての要素を再現するわけではない。ブレインストーミングの結果、今回(v1)で取り込む要素は「自分の現在地(青いドット)+精度円」「ズーム/現在地に戻るボタン」に絞り、座標・時刻のデバッグ表示やAUTO/トマトアイコンなどの装飾UIは対象外とする。

「行きたい場所/行った場所」スポット機能(記事に紐づく地図ピン)は、記事への位置情報付与・ユーザー×記事の関係テーブルなど別途データモデルが必要な規模の機能のため、v2として別セッションでbrainstormする。本designのスコープには含めない。

## Goals

- `/map`ページで、OpenStreetMapベースの地図(浅草エリア中心)を表示する
- ブラウザのGeolocation APIで現在地を継続的に取得し、青いドット+精度円としてリアルタイムに地図上へ表示する
- ズームボタンと「現在地に戻る」ボタンを地図上に配置する
- ヘッダーのアバタードロップダウンに`/map`への「Map」リンクを追加する
- ホーム(`/`)⇄マップ(`/map`)間を、水平スワイプ操作でスライドアニメーション付きに遷移できるようにする(スワイプ検知後にスライド遷移する方式。指の動きへのリアルタイム追従はしない)

## Non-Goals

- 「行きたい場所/行った場所」スポットのピン留め機能(v2で別途design)
- 地図上のPOI検索・ルート検索・住所ジオコーディング
- ログイン必須化(`/map`は未ログインでも閲覧可能。ヘッダーのMapリンクはログイン中のアバターメニュー内にのみ表示されるが、これはリンクの置き場所の話であり、ページ自体へのアクセス制限ではない)
- 位置情報履歴の保存・軌跡表示
- MapLibre GL(ベクタータイル)への移行(将来的にOSMタイルの利用ポリシー上必要になれば別途検討)

## Architecture

### 新規ファイル

- `composables/useGeolocation.ts` — `navigator.geolocation.watchPosition`をラップするcomposable
- `composables/useSwipe.ts` — 水平スワイプ検知の軽量composable(新規npm依存なし)
- `components/AsakusaMap.vue` — Leafletの地図描画・現在地マーカー・ズーム/現在地ボタンを持つクライアント専用コンポーネント
- `pages/map.vue` — `/map`ページ本体(`AsakusaMap`を`<ClientOnly>`でラップして配置するだけの薄いページ)

### 既存ファイルの変更

- `package.json` — `leaflet`(dependencies)・`@types/leaflet`(devDependencies)を追加
- `nuxt.config.ts` — `css`配列に`leaflet/dist/leaflet.css`を追加
- `layouts/default.vue` — `userMenuItems`に`{ label: 'Map', to: '/map' }`を追加。`<NuxtPage>`をラップし、スワイプ遷移方向に応じたページトランジション名を渡す
- `pages/index.vue` — `useSwipe`で左スワイプを検知し、`/map`へ遷移(遷移方向を`forward`として記録)
- `pages/map.vue` — `useSwipe`で右スワイプを検知し、`/`へ遷移(遷移方向を`back`として記録)
- `assets/css/main.css` — スライドトランジション用のCSSクラスを追加

### `useGeolocation.ts`

```ts
export interface GeolocationState {
  lat: number | null
  lng: number | null
  accuracy: number | null
  status: 'idle' | 'watching' | 'denied' | 'unsupported' | 'error'
}

export function useGeolocation(): {
  state: Ref<GeolocationState>
  start: () => void
  stop: () => void
}
```

`start()`で`navigator.geolocation.watchPosition`を開始し、成功のたびに`state.value`の`lat`/`lng`/`accuracy`を更新して`status`を`'watching'`にする。`navigator.geolocation`が存在しない場合は`status`を`'unsupported'`にする。`watchPosition`のエラーコールバックで`PERMISSION_DENIED`(code 1)なら`status`を`'denied'`、それ以外のエラーは`'error'`にする。`stop()`は`clearWatch`する。呼び出し側(`AsakusaMap.vue`)が`onMounted`で`start()`、`onUnmounted`で`stop()`を呼ぶ。

### `useSwipe.ts`

```ts
export interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number // デフォルト60px
}

export function useSwipe(target: Ref<HTMLElement | null>, options: SwipeOptions): void
```

`target`要素に`touchstart`/`touchmove`/`touchend`のリスナーを登録する(`onMounted`/`onUnmounted`で着脱、`watch(target, ...)`で要素が後から差し変わっても対応)。`touchstart`で開始座標を記録し、`touchend`で終了座標との差分`deltaX`/`deltaY`を計算する。`Math.abs(deltaX) >= threshold`かつ`Math.abs(deltaX) > Math.abs(deltaY)`(縦方向より横方向の動きが大きい)の場合のみ、`deltaX < 0`なら`onSwipeLeft`、`deltaX > 0`なら`onSwipeRight`を呼ぶ。`touchmove`中の処理は無い(リアルタイム追従はしない設計のため)。

### `AsakusaMap.vue`

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useGeolocation } from '../composables/useGeolocation'

const ASAKUSA_CENTER: [number, number] = [35.7148, 139.7967]
const DEFAULT_ZOOM = 16

const mapContainer = ref<HTMLElement | null>(null)
const { state: geo, start: startGeolocation, stop: stopGeolocation } = useGeolocation()

let map: import('leaflet').Map | null = null
let userMarker: import('leaflet').CircleMarker | null = null
let accuracyCircle: import('leaflet').Circle | null = null

onMounted(async () => {
  const L = await import('leaflet')
  map = L.map(mapContainer.value!).setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)

  startGeolocation()
})

onUnmounted(() => {
  stopGeolocation()
  map?.remove()
})

watch(
  () => [geo.value.lat, geo.value.lng, geo.value.accuracy] as const,
  async ([lat, lng, accuracy]) => {
    if (lat === null || lng === null || !map) return
    const L = await import('leaflet')
    if (!userMarker) {
      userMarker = L.circleMarker([lat, lng], {
        radius: 8,
        color: '#287c7b',
        fillColor: '#287c7b',
        fillOpacity: 1
      }).addTo(map)
      accuracyCircle = L.circle([lat, lng], { radius: accuracy ?? 0, color: '#287c7b', fillOpacity: 0.15 }).addTo(map)
    } else {
      userMarker.setLatLng([lat, lng])
      accuracyCircle?.setLatLng([lat, lng]).setRadius(accuracy ?? 0)
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

<template>
  <div class="relative h-full w-full">
    <div ref="mapContainer" class="h-full w-full" />
    <button
      type="button"
      class="absolute bottom-6 right-4 z-[1000] flex h-11 w-11 items-center justify-center rounded-full bg-default shadow ring ring-default"
      aria-label="Recenter on my location"
      @click="recenter"
    >
      <span class="text-xl" aria-hidden="true">📍</span>
    </button>
    <p
      v-if="geo.status === 'denied' || geo.status === 'unsupported' || geo.status === 'error'"
      class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] rounded bg-default px-3 py-2 text-xs shadow ring ring-default"
    >
      Enable location access to see your position on the map.
    </p>
  </div>
</template>
```

(Leafletの標準ズームコントロール(+/-)は`L.tileLayer`と同様、デフォルトで地図左上に自動追加されるため、明示コードは不要。現在地に戻るボタンのみ独自実装する。)

### `pages/map.vue`

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useSwipe } from '../composables/useSwipe'

const pageRoot = ref<HTMLElement | null>(null)
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')

useSwipe(pageRoot, {
  onSwipeRight: () => {
    transitionDirection.value = 'back'
    navigateTo('/')
  }
})
</script>

<template>
  <div ref="pageRoot" class="h-full">
    <ClientOnly>
      <AsakusaMap />
    </ClientOnly>
  </div>
</template>
```

`layouts/default.vue`の`<main>`は`min-h-screen flex flex-col`の一員として`flex-1`で残り高さいっぱいに伸びる。この`h-full`はその`<main>`の高さを基準に100%を取る(`<main>`側の変更は後述のページトランジションの節で扱う)。

### `pages/index.vue`の変更

`<script setup>`に以下を追加する:

```ts
const pageRoot = ref<HTMLElement | null>(null)
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')

useSwipe(pageRoot, {
  onSwipeLeft: () => {
    transitionDirection.value = 'forward'
    navigateTo('/map')
  }
})
```

テンプレートのルート`<div>`に`ref="pageRoot"`を追加する。

### ページトランジション

トランジションの指定はページ側の`definePageMeta`ではなく、`app.vue`の`<NuxtPage>`に渡す`transition` propで一元的に行う(`layouts/default.vue`の`<main><slot /></main>`という構造自体は変更しない)。

`layouts/default.vue`の`<main>`のクラスを`flex-1`から`flex-1 min-h-0 relative overflow-hidden`に変更する(`min-h-0`は前述の高さ計算のため、`relative overflow-hidden`はトランジション中に`position: absolute`になる新旧ページを`<main>`の矩形内に重ねて表示するため)。

`app.vue`を以下のように変更する:

```vue
<script setup lang="ts">
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage :transition="{ name: `slide-${transitionDirection}` }" />
    </NuxtLayout>
  </UApp>
</template>
```

`assets/css/main.css`に以下のトランジションCSSを追加する:

```css
.slide-forward-enter-active,
.slide-forward-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  position: absolute;
  inset: 0;
  transition: transform 0.3s ease;
}

.slide-forward-enter-from {
  transform: translateX(100%);
}
.slide-forward-leave-to {
  transform: translateX(-30%);
}
.slide-back-enter-from {
  transform: translateX(-30%);
}
.slide-back-leave-to {
  transform: translateX(100%);
}
```

(`leave-to`側を`-30%`/`100%`とし完全な-100%にしないのは、iOSのスワイプバックのような「奥の画面が少し覗く」視覚効果を出すため。)

`transition`propの`name`が動的に変わる(`slide-forward`⇄`slide-back`)ため、Vueは新しいtransition名が指定されるたびに対応するCSSクラスを探す。ヘッダーからのリンククリックやブラウザの戻る/進むボタンなど、スワイプ以外の遷移経路では`transitionDirection`は直前の値のまま(通常は初期値`'forward'`)になるが、v1では問題として扱わない(スワイプ操作時に正しい方向になっていることが必須要件)。

## Testing

### ユニットテスト

- `composables/useSwipe.test.ts`: 疑似DOM要素に`touchstart`/`touchend`イベントを発火させ、閾値以上の左右スワイプで対応するコールバックが呼ばれること、縦方向優位の動きや閾値未満では呼ばれないことを検証する
- `composables/useGeolocation.test.ts`: `navigator.geolocation`をモックし、`watchPosition`の成功コールバックで`state`が更新されること、`PERMISSION_DENIED`エラーで`status`が`'denied'`になること、`navigator.geolocation`が無い環境で`status`が`'unsupported'`になることを検証する

### e2eテスト(`tests/e2e/`)

`AsakusaMap.vue`自体(Leafletの実描画・タイル読み込み)は単体テストで検証しづらいため、実ブラウザでの動作確認をe2eで行う。新規`tests/e2e/map.test.ts`を作成し、以下を検証する:

- `/map`に未ログインでアクセスでき、`.leaflet-container`が表示される(ログイン不要であることの確認)
- ヘッダーのアバターメニューに「Map」リンクがあり、クリックで`/map`に遷移する(ログイン状態で)
- ホームページで左スワイプ相当の操作をすると`/map`に遷移する(Playwrightの`page.touchscreen`または`page.mouse`で座標移動をシミュレートする。既存の`tests/e2e/account-flow.test.ts`と同じ`@nuxt/test-utils/e2e`の`createPage`パターンを使う)

### 手動確認

- devサーバーでブラウザの位置情報許可を出した状態・拒否した状態の両方で`/map`を開き、青いドット/精度円の表示、雷門中心へのフォールバック表示を目視確認する
- 実機(スマホブラウザ)でのスワイプ操作感を確認する(自動テストでは実際の指のジェスチャー感触までは検証できないため)

## Open Questions

なし(brainstormingセッション内で解消済み)
