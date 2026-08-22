# ASAKUSA MAP (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 浅草エリア中心のOpenStreetMap地図に現在地(青いドット+精度円)をリアルタイム表示する`/map`ページを作り、ヘッダーのアバターメニューからの導線と、ホーム⇄マップ間のスワイプ・スライド遷移を実装する。

**Architecture:** Leaflet + OSMタイルで地図を描画するクライアント専用コンポーネント`AsakusaMap.vue`を作り、薄いページ`pages/map.vue`に載せる。現在地取得は`composables/useGeolocation.ts`、スワイプ検知は`composables/useSwipe.ts`に切り出す。ページ遷移の方向(forward/back)を`useState`で共有し、`app.vue`の`<NuxtPage>`に渡す`transition`propで方向別のスライドCSSを適用する。

**Tech Stack:** Vue 3(`<script setup>`)、Nuxt 3、Leaflet 1.9、Vitest、`@nuxt/test-utils/e2e`(Playwright)

## Global Constraints

- CLAUDE.mdの方針により、gitコマンドは実行しない。各タスク末尾の「コミット」ステップは実行者(人間)が手動で行う
- 新規に書く文言はすべて英語にする(既存の`pages/profile.vue`等と同じ方針)
- `AsakusaMap.vue`のLeaflet描画自体は単体テストで検証しない(実DOM/タイル読み込みが絡むため)。この部分の検証はe2e(Task 5)と手動確認(Task 6)で行う。これは`pages/profile.vue`が単体テストを持たずe2eのみで検証されているのと同じ方針
- 地図中心のデフォルト座標(雷門付近): `[35.7148, 139.7967]`、初期ズーム`16`
- 現在地ドット/精度円の色は`TOKYO TEAL`(`#287c7b`)を使う

**実行時の追記(Task 5で発覚):** Task 3・4に書かれている`h-full`ベースのクラス指定(`<main class="flex-1 min-h-0">`、`pages/map.vue`の`class="h-full"`、`AsakusaMap.vue`の`class="relative h-full w-full"`/`class="h-full w-full"`)では、実ブラウザで`<main>`の子孫までパーセンテージ指定の高さが伝播せず、地図コンテナの高さが0になり非表示になることが実e2eテストで判明した(`display:block`な`<main>`の子に`height:100%`を指定しても、`<main>`自身がflexアイテムとして得た高さは子の`%`指定の基準にならない)。実装時は以下の構成に修正済み:
- `layouts/default.vue`の`<main>`: `flex-1 min-h-0 flex flex-col relative overflow-hidden`(`flex flex-col`を追加)
- `pages/map.vue`のルート`<div>`: `flex-1 min-h-0 flex flex-col`(`h-full`ではなく`flex-1`+自身も`flex flex-col`)
- `AsakusaMap.vue`のルート`<div>`: `relative flex-1 min-h-0 w-full`(`h-full`ではなく`flex-1`)
- `AsakusaMap.vue`の地図コンテナ`<div ref="mapContainer">`: `absolute inset-0`(`h-full w-full`ではなく、`relative`な親いっぱいに絶対配置)

以降のタスク本文中のコード例はこの追記より前の(バグを含む)バージョンのままだが、実装時は上記の修正版クラスを使うこと。

---

### Task 1: `composables/useSwipe.ts` — 水平スワイプ検知

**Files:**
- Create: `composables/useSwipe.ts`
- Test: `composables/useSwipe.test.ts`

**Interfaces:**
- Produces: `export interface SwipeOptions { onSwipeLeft?: () => void; onSwipeRight?: () => void; threshold?: number }` / `export function useSwipe(target: Ref<HTMLElement | null>, options: SwipeOptions): void`(Task 4が`pages/index.vue`・`pages/map.vue`から使う)

- [ ] **Step 1: 失敗するテストを書く**

`composables/useSwipe.test.ts`を新規作成:

```ts
import { describe, it, expect, vi } from 'vitest'
import { defineComponent, ref, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useSwipe, type SwipeOptions } from './useSwipe'

function mountSwipeTarget(options: SwipeOptions) {
  const TestComponent = defineComponent({
    setup() {
      const el = ref<HTMLElement | null>(null)
      useSwipe(el, options)
      return () => h('div', { ref: el })
    }
  })
  return mount(TestComponent)
}

function touch(clientX: number, clientY: number, target: Element): Touch {
  return new Touch({ identifier: 1, target, clientX, clientY })
}

describe('useSwipe', () => {
  it('calls onSwipeLeft when swiping left past the threshold', () => {
    const onSwipeLeft = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(200, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(100, 100, el)] }))

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })

  it('calls onSwipeRight when swiping right past the threshold', () => {
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200, 100, el)] }))

    expect(onSwipeRight).toHaveBeenCalledOnce()
  })

  it('does not call either callback when the swipe is below the threshold', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(130, 100, el)] }))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('does not call either callback when the vertical movement dominates', () => {
    const onSwipeLeft = vi.fn()
    const onSwipeRight = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, onSwipeRight })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(200, 300, el)] }))

    expect(onSwipeLeft).not.toHaveBeenCalled()
    expect(onSwipeRight).not.toHaveBeenCalled()
  })

  it('respects a custom threshold', () => {
    const onSwipeLeft = vi.fn()
    const wrapper = mountSwipeTarget({ onSwipeLeft, threshold: 10 })
    const el = wrapper.element

    el.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(100, 100, el)] }))
    el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [touch(85, 100, el)] }))

    expect(onSwipeLeft).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run composables/useSwipe.test.ts`
Expected: FAIL(`./useSwipe`モジュールが存在せずエラーになる)

- [ ] **Step 3: `composables/useSwipe.ts`を実装する**

```ts
import { onMounted, onUnmounted, type Ref } from 'vue'

export interface SwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe(target: Ref<HTMLElement | null>, options: SwipeOptions): void {
  const threshold = options.threshold ?? 60
  let startX = 0
  let startY = 0

  function onTouchStart(event: TouchEvent): void {
    const touch = event.touches[0]
    startX = touch.clientX
    startY = touch.clientY
  }

  function onTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - startX
    const deltaY = touch.clientY - startY
    if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY)) return
    if (deltaX < 0) {
      options.onSwipeLeft?.()
    } else {
      options.onSwipeRight?.()
    }
  }

  onMounted(() => {
    target.value?.addEventListener('touchstart', onTouchStart)
    target.value?.addEventListener('touchend', onTouchEnd)
  })

  onUnmounted(() => {
    target.value?.removeEventListener('touchstart', onTouchStart)
    target.value?.removeEventListener('touchend', onTouchEnd)
  })
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run composables/useSwipe.test.ts`
Expected: PASS(5件とも)

- [ ] **Step 5: コミット**

```bash
git add composables/useSwipe.ts composables/useSwipe.test.ts
git commit -m "水平スワイプを検知するuseSwipeを追加"
```

---

### Task 2: `composables/useGeolocation.ts` — 現在地の継続取得

**Files:**
- Create: `composables/useGeolocation.ts`
- Test: `composables/useGeolocation.test.ts`

**Interfaces:**
- Produces: `export interface GeolocationState { lat: number | null; lng: number | null; accuracy: number | null; status: 'idle' | 'watching' | 'denied' | 'unsupported' | 'error' }` / `export function useGeolocation(): { state: Ref<GeolocationState>; start: () => void; stop: () => void }`(Task 3が`AsakusaMap.vue`から使う)

- [ ] **Step 1: 失敗するテストを書く**

`composables/useGeolocation.test.ts`を新規作成:

```ts
import { describe, it, expect, afterEach } from 'vitest'
import { useGeolocation } from './useGeolocation'

afterEach(() => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true })
})

describe('useGeolocation', () => {
  it('updates state and sets status to watching on a successful position', () => {
    let successCallback: PositionCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (success: PositionCallback) => {
          successCallback = success
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    successCallback({
      coords: { latitude: 35.71, longitude: 139.79, accuracy: 12 }
    } as GeolocationPosition)

    expect(state.value).toEqual({ lat: 35.71, lng: 139.79, accuracy: 12, status: 'watching' })
  })

  it('sets status to denied when the error code is PERMISSION_DENIED', () => {
    let errorCallback: PositionErrorCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    errorCallback({
      code: 1,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'denied'
    } as GeolocationPositionError)

    expect(state.value.status).toBe('denied')
  })

  it('sets status to error for non-permission errors', () => {
    let errorCallback: PositionErrorCallback = () => {}
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
          errorCallback = error
          return 1
        },
        clearWatch: () => {}
      }
    })

    const { state, start } = useGeolocation()
    start()
    errorCallback({
      code: 2,
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'unavailable'
    } as GeolocationPositionError)

    expect(state.value.status).toBe('error')
  })

  it('sets status to unsupported when navigator.geolocation is unavailable', () => {
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined })

    const { state, start } = useGeolocation()
    start()

    expect(state.value.status).toBe('unsupported')
  })

  it('calls clearWatch with the watch id on stop', () => {
    let clearedId: number | null = null
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: () => 42,
        clearWatch: (id: number) => {
          clearedId = id
        }
      }
    })

    const { start, stop } = useGeolocation()
    start()
    stop()

    expect(clearedId).toBe(42)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run composables/useGeolocation.test.ts`
Expected: FAIL(`./useGeolocation`モジュールが存在せずエラーになる)

- [ ] **Step 3: `composables/useGeolocation.ts`を実装する**

```ts
import { ref, type Ref } from 'vue'

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
} {
  const state = ref<GeolocationState>({ lat: null, lng: null, accuracy: null, status: 'idle' })
  let watchId: number | null = null

  function start(): void {
    if (!navigator.geolocation) {
      state.value = { ...state.value, status: 'unsupported' }
      return
    }
    watchId = navigator.geolocation.watchPosition(
      (position) => {
        state.value = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          status: 'watching'
        }
      },
      (error) => {
        state.value = { ...state.value, status: error.code === error.PERMISSION_DENIED ? 'denied' : 'error' }
      }
    )
  }

  function stop(): void {
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId)
      watchId = null
    }
  }

  return { state, start, stop }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run composables/useGeolocation.test.ts`
Expected: PASS(5件とも)

- [ ] **Step 5: コミット**

```bash
git add composables/useGeolocation.ts composables/useGeolocation.test.ts
git commit -m "現在地を継続監視するuseGeolocationを追加"
```

---

### Task 3: `/map`ページ本体(Leaflet地図 + 現在地表示)

**Files:**
- Modify: `package.json`(`leaflet`・`@types/leaflet`を追加)
- Modify: `nuxt.config.ts`(Leaflet CSSを追加)
- Create: `components/AsakusaMap.vue`
- Create: `pages/map.vue`

**Interfaces:**
- Consumes: `useGeolocation`(Task 2)
- Produces: `/map`にアクセスすると地図が表示される状態(Task 4がここにヘッダーリンク・スワイプ遷移を追加する)

- [ ] **Step 1: Leafletをインストールする**

Run: `npm install leaflet && npm install -D @types/leaflet`
Expected: `package.json`の`dependencies`に`leaflet`、`devDependencies`に`@types/leaflet`が追加される

- [ ] **Step 2: `nuxt.config.ts`にLeafletのCSSを追加する**

`nuxt.config.ts`の`css`配列を書き換える。変更前:

```ts
  css: ['~/assets/css/main.css'],
```

変更後:

```ts
  css: ['~/assets/css/main.css', 'leaflet/dist/leaflet.css'],
```

- [ ] **Step 3: `components/AsakusaMap.vue`を作成する**

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
  if (!mapContainer.value) return
  map = L.map(mapContainer.value).setView(ASAKUSA_CENTER, DEFAULT_ZOOM)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map)

  startGeolocation()
})

onUnmounted(() => {
  stopGeolocation()
  map?.remove()
  map = null
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
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy ?? 0,
        color: '#287c7b',
        fillOpacity: 0.15
      }).addTo(map)
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

- [ ] **Step 4: `pages/map.vue`を作成する**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="h-full">
    <ClientOnly>
      <AsakusaMap />
    </ClientOnly>
  </div>
</template>
```

- [ ] **Step 5: `layouts/default.vue`の`<main>`を、子要素が高さいっぱいに広がれるようにする**

`layouts/default.vue`の該当行を書き換える。変更前:

```html
    <main class="flex-1">
```

変更後:

```html
    <main class="flex-1 min-h-0">
```

(`relative overflow-hidden`はTask 4でページトランジションを入れる際にあわせて追加する。ここでは高さ計算のための`min-h-0`のみ追加する。)

- [ ] **Step 6: 型チェックを実行する**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: `components/AsakusaMap.vue`・`pages/map.vue`起因の新規エラーが無いこと(既存の`.vue`モジュール解決や`generator.test.ts`の型エラーは無関係な既知の問題)

- [ ] **Step 7: devサーバーで`/map`が描画されることを確認する**

Run: `npm run dev`(バックグラウンド起動)

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/map
```

Expected: `200`(SSR時点では`<ClientOnly>`内のLeafletは描画されないため、地図タイル自体はまだ確認できない。クライアント側での実描画確認はTask 5のe2eテストで行う)

devサーバーを停止する。

- [ ] **Step 8: コミット**

```bash
git add package.json package-lock.json nuxt.config.ts components/AsakusaMap.vue pages/map.vue layouts/default.vue
git commit -m "Leaflet+OSMタイルで現在地表示する/mapページを追加"
```

---

### Task 4: ヘッダーリンク・スワイプ遷移・スライドアニメーション

**Files:**
- Modify: `layouts/default.vue`(userMenuItemsにMapを追加、`<main>`にトランジション用クラス追加)
- Modify: `pages/index.vue`(左スワイプで`/map`へ)
- Modify: `pages/map.vue`(右スワイプで`/`へ)
- Modify: `app.vue`(方向別トランジション)
- Modify: `assets/css/main.css`(スライドCSS追加)

**Interfaces:**
- Consumes: `useSwipe`(Task 1)
- Produces: ホーム⇄マップ間のスワイプ・スライド遷移(Task 5のe2eテストが検証する)

- [ ] **Step 1: `layouts/default.vue`のアバターメニューに「Map」を追加する**

`userMenuItems`の定義を書き換える。変更前:

```ts
const userMenuItems = [
  [{ label: 'Profile', to: '/profile' }],
  [{ label: 'Log out', onSelect: logout }]
]
```

変更後:

```ts
const userMenuItems = [
  [
    { label: 'Profile', to: '/profile' },
    { label: 'Map', to: '/map' }
  ],
  [{ label: 'Log out', onSelect: logout }]
]
```

- [ ] **Step 2: `layouts/default.vue`の`<main>`にトランジション用のクラスを追加する**

変更前:

```html
    <main class="flex-1 min-h-0">
```

変更後:

```html
    <main class="flex-1 min-h-0 relative overflow-hidden">
```

- [ ] **Step 3: `assets/css/main.css`にスライドトランジションのCSSを追加する**

ファイル末尾に追記する:

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

- [ ] **Step 4: `app.vue`に方向別トランジションを設定する**

`app.vue`の内容を丸ごと以下に置き換える:

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

- [ ] **Step 5: `pages/index.vue`に左スワイプで`/map`へ遷移する処理を追加する**

`<script setup>`のimport行を書き換える。変更前:

```ts
<script setup lang="ts">
import { computed } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()
```

変更後:

```ts
<script setup lang="ts">
import { computed, ref } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'
import { useSwipe } from '../composables/useSwipe'

const route = useRoute()
const router = useRouter()
const { locale } = useArticleLocale()

const pageRoot = ref<HTMLElement | null>(null)
const transitionDirection = useState<'forward' | 'back'>('swipeTransitionDirection', () => 'forward')

useSwipe(pageRoot, {
  onSwipeLeft: () => {
    transitionDirection.value = 'forward'
    navigateTo('/map')
  }
})
```

テンプレートのルート`<div>`を書き換える。変更前:

```html
  <div class="max-w-5xl mx-auto px-4 py-8">
```

変更後:

```html
  <div ref="pageRoot" data-swipe-target class="max-w-5xl mx-auto px-4 py-8">
```

- [ ] **Step 6: `pages/map.vue`に右スワイプで`/`へ戻る処理を追加する**

`pages/map.vue`の内容を丸ごと以下に置き換える:

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
  <div ref="pageRoot" data-swipe-target class="h-full">
    <ClientOnly>
      <AsakusaMap />
    </ClientOnly>
  </div>
</template>
```

- [ ] **Step 7: 型チェックを実行する**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: このタスクで変更したファイル起因の新規エラーが無いこと

- [ ] **Step 8: 既存テストが壊れていないことを確認する**

Run: `npx vitest run layouts/default.test.ts`
Expected: 8件全てPASS(アバターメニューに項目が増えたが、既存テストは項目数を検証していないため影響なし)

- [ ] **Step 9: コミット**

```bash
git add layouts/default.vue pages/index.vue pages/map.vue app.vue assets/css/main.css
git commit -m "ホーム⇄マップ間のスワイプ・スライド遷移とヘッダーMapリンクを追加"
```

---

### Task 5: e2eテスト

**Files:**
- Create: `tests/e2e/map.test.ts`

**Interfaces:**
- Consumes: Task 1〜4で実装した全機能

- [ ] **Step 1: `tests/e2e/map.test.ts`を作成する**

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, createPage } from '@nuxt/test-utils/e2e'

describe('map page', async () => {
  await setup({ server: true, env: { DATABASE_PATH: ':memory:' } })

  it('is accessible without logging in and renders the Leaflet map', async () => {
    const page = await createPage('/map')
    await page.waitForSelector('.leaflet-container')
    expect(await page.locator('.leaflet-container').isVisible()).toBe(true)

    await page.close()
  }, 60000)

  it('shows the current-location dot when geolocation permission is granted', async () => {
    const page = await createPage('/map', {
      permissions: ['geolocation'],
      geolocation: { latitude: 35.7148, longitude: 139.7967, accuracy: 10 }
    })
    await page.waitForSelector('.leaflet-container')
    await page.waitForSelector('path.leaflet-interactive')

    expect(await page.locator('path.leaflet-interactive').count()).toBeGreaterThan(0)

    await page.close()
  }, 60000)

  it('shows the fallback message when geolocation permission is denied', async () => {
    const page = await createPage('/map', { permissions: [] })
    await page.waitForSelector('.leaflet-container')

    await page.waitForSelector('text=Enable location access to see your position on the map.')

    await page.close()
  }, 60000)

  it('navigates to /map when swiping left on the home page', async () => {
    const page = await createPage('/', { hasTouch: true })
    await page.waitForSelector('[data-swipe-target]')

    await page.evaluate(() => {
      const el = document.querySelector('[data-swipe-target]')
      if (!el) throw new Error('swipe target not found')
      const makeTouch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [makeTouch(300, 200)] }))
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [makeTouch(50, 200)] }))
    })

    await page.waitForURL(/\/map/)

    await page.close()
  }, 60000)

  it('navigates back to / when swiping right on the map page', async () => {
    const page = await createPage('/map', { hasTouch: true })
    await page.waitForSelector('[data-swipe-target]')

    await page.evaluate(() => {
      const el = document.querySelector('[data-swipe-target]')
      if (!el) throw new Error('swipe target not found')
      const makeTouch = (x: number, y: number) =>
        new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [makeTouch(50, 200)] }))
      el.dispatchEvent(new TouchEvent('touchend', { changedTouches: [makeTouch(300, 200)] }))
    })

    await page.waitForURL((url) => url.pathname === '/')

    await page.close()
  }, 60000)
})
```

- [ ] **Step 2: テストを実行する**

Run: `npx vitest run tests/e2e/map.test.ts`
Expected: 5件全てPASS。失敗する場合は以下を疑って調整する:
  - Leafletの現在地ドットは`L.circleMarker`がSVGレンダラーで`<path class="leaflet-interactive">`として描画される想定。実際のDOM構造が異なる場合はブラウザで確認してセレクタを直す
  - `page.waitForURL`に渡す正規表現/関数がNuxtのクライアントサイドルーティング後のURLと一致しているか

- [ ] **Step 3: コミット**

```bash
git add tests/e2e/map.test.ts
git commit -m "ASAKUSA MAPページのe2eテストを追加"
```

---

### Task 6: 最終検証

**Files:** なし(検証のみ)

**Interfaces:**
- Consumes: Task 1〜5で実装した全機能

- [ ] **Step 1: 型チェックを実行する**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: このプロジェクトの既知の既存エラー(`.vue`モジュール解決・`generator.test.ts`)以外に新規エラーが無いこと

- [ ] **Step 2: プロジェクト全体のテストスイートを実行する**

Run: `npx vitest run`
Expected: 全テストPASS

- [ ] **Step 3: devサーバーで実際に画面を確認する**

Run: `npm run dev`(バックグラウンド起動)

- ブラウザで`/`を開き、ヘッダーのアバターメニューに「Map」があることを確認する(ログイン中の場合)
- 「Map」をクリックして`/map`に遷移し、浅草・雷門付近を中心に地図が表示されることを確認する
- ブラウザの位置情報許可を出し、青いドット+精度円がリアルタイムに表示・追従することを確認する
- 「現在地に戻る」ボタン(📍)をクリックして地図が現在地に戻ることを確認する
- 可能であればスマホ実機でホーム→マップの左スワイプ、マップ→ホームの右スワイプのスライドアニメーションを確認する
- 確認後devサーバーを停止する

- [ ] **Step 4: 完了報告**

このタスクはコード変更を含まないため、コミットは不要。Task 1〜5のコミットが完了していることを確認して完了とする。
