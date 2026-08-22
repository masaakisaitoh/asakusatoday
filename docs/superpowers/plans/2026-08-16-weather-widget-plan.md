# 天気予報ウィジェット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トップページ(`pages/index.vue`)に、気象庁(JMA)の無料APIを使った「今日の天気」カードを表示する。

**Architecture:** `server/utils/weather.ts`にJMAレスポンスのパース(`parseWeatherForecast`)とキャッシュ付き取得(`getWeatherForecast`)を実装し、`server/api/weather/index.get.ts`が薄いラッパーとしてそれを公開する。`pages/index.vue`が`useFetch('/api/weather')`し、結果を`components/WeatherCard.vue`(props受け取りのみの表示コンポーネント)に渡す。

**Tech Stack:** Nuxt 3, TypeScript, Vitest, `@vue/test-utils`, `@nuxt/test-utils`, Nuxt UI(`UCard`)。外部依存の追加なし(標準`fetch`のみ)。

## Global Constraints

- 元スペック: `docs/superpowers/specs/2026-08-16-weather-widget-design.md`
- UI表示文言は英語で統一する([[2026-08-15-ui-design.md]]の方針)。
- 外部通信(JMAへのfetch)はサーバー側でのみ行う。ブラウザから直接JMAを叩かない。
- JMAへのfetch・パースが失敗した場合は例外を投げず`null`を返す。呼び出し側はカードを非表示にするだけで、ページ全体をエラーにしない。
- キャッシュTTLは30分(`CACHE_TTL_MS = 30 * 60 * 1000`)。
- **gitコマンド(`git add` / `git commit`含む)はこのプランの実行者(agentic worker含む)が実行してはいけない。各タスク末尾のコミットは行わず、変更内容を提示して人間のコミットを待つ。** (このプロジェクトの`CLAUDE.md`の方針)

---

## Task 1: JMAレスポンスのパース処理(`server/utils/weather.ts`)

`WeatherForecast`型と、JMAの生JSONから今日の天気を抜き出す純粋関数`parseWeatherForecast`、およびそれが使う`weatherCodeToEmoji`/`weatherCodeToLabel`を実装する。ネットワークやキャッシュには触れない。

**Files:**
- Create: `server/utils/weather.ts`
- Test: `server/utils/weather.test.ts`

**Interfaces:**
- Produces: `WeatherForecast`型、`parseWeatherForecast(jmaJson: unknown): WeatherForecast | null`、`weatherCodeToEmoji(weatherCode: string): string`、`weatherCodeToLabel(weatherCode: string): string`(Task 2, Task 4が使う)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/weather.test.ts`を新規作成する:

```ts
import { describe, it, expect } from 'vitest'

const sampleJmaJson = [
  {
    publishingOffice: '気象庁',
    reportDatetime: '2026-08-16T11:00:00+09:00',
    timeSeries: [
      {
        timeDefines: [
          '2026-08-16T11:00:00+09:00',
          '2026-08-17T00:00:00+09:00',
          '2026-08-18T00:00:00+09:00'
        ],
        areas: [
          {
            area: { name: '東京地方', code: '130010' },
            weatherCodes: ['200', '200', '201'],
            weathers: ['くもり　所により　雨', 'くもり　昼過ぎ　晴れ', 'くもり　時々　晴れ']
          },
          {
            area: { name: '伊豆諸島北部', code: '130020' },
            weatherCodes: ['201', '201', '201'],
            weathers: ['くもり　時々　晴れ', 'くもり　時々　晴れ', 'くもり　時々　晴れ']
          }
        ]
      },
      {
        timeDefines: [
          '2026-08-16T12:00:00+09:00',
          '2026-08-16T18:00:00+09:00',
          '2026-08-17T00:00:00+09:00'
        ],
        areas: [
          {
            area: { name: '東京地方', code: '130010' },
            pops: ['20', '30', '10']
          }
        ]
      },
      {
        timeDefines: [
          '2026-08-16T09:00:00+09:00',
          '2026-08-16T00:00:00+09:00',
          '2026-08-17T00:00:00+09:00',
          '2026-08-17T09:00:00+09:00'
        ],
        areas: [
          {
            area: { name: '東京', code: '44132' },
            temps: ['29', '29', '23', '31']
          }
        ]
      }
    ]
  },
  {
    publishingOffice: '気象庁',
    reportDatetime: '2026-08-16T11:00:00+09:00',
    timeSeries: [],
    tempAverage: {},
    precipAverage: {}
  }
]

describe('weatherCodeToEmoji', () => {
  it('maps the sunny/cloudy/rain/snow/unknown code families to an emoji', async () => {
    const { weatherCodeToEmoji } = await import('./weather')
    expect(weatherCodeToEmoji('100')).toBe('☀️')
    expect(weatherCodeToEmoji('200')).toBe('☁️')
    expect(weatherCodeToEmoji('300')).toBe('🌧️')
    expect(weatherCodeToEmoji('400')).toBe('❄️')
    expect(weatherCodeToEmoji('999')).toBe('🌡️')
  })
})

describe('weatherCodeToLabel', () => {
  it('maps the sunny/cloudy/rain/snow/unknown code families to an English label', async () => {
    const { weatherCodeToLabel } = await import('./weather')
    expect(weatherCodeToLabel('100')).toBe('Sunny')
    expect(weatherCodeToLabel('200')).toBe('Cloudy')
    expect(weatherCodeToLabel('300')).toBe('Rainy')
    expect(weatherCodeToLabel('400')).toBe('Snowy')
    expect(weatherCodeToLabel('999')).toBe('Unknown')
  })
})

describe('parseWeatherForecast', () => {
  it("extracts today's weather code, max pop for today, and high temp", async () => {
    const { parseWeatherForecast } = await import('./weather')
    const result = parseWeatherForecast(sampleJmaJson)
    expect(result).toEqual({
      weatherCode: '200',
      weatherLabel: 'Cloudy',
      weatherEmoji: '☁️',
      pop: 30,
      highTemp: 29,
      reportDatetime: '2026-08-16T11:00:00+09:00'
    })
  })

  it('returns null when the Tokyo mainland area (130010) is missing', async () => {
    const { parseWeatherForecast } = await import('./weather')
    const broken = JSON.parse(JSON.stringify(sampleJmaJson))
    broken[0].timeSeries[0].areas = broken[0].timeSeries[0].areas.filter(
      (a: any) => a.area.code !== '130010'
    )
    expect(parseWeatherForecast(broken)).toBeNull()
  })

  it('returns null when the high temp value is missing', async () => {
    const { parseWeatherForecast } = await import('./weather')
    const broken = JSON.parse(JSON.stringify(sampleJmaJson))
    broken[0].timeSeries[2].areas[0].temps[0] = ''
    expect(parseWeatherForecast(broken)).toBeNull()
  })

  it('returns null for malformed input instead of throwing', async () => {
    const { parseWeatherForecast } = await import('./weather')
    expect(parseWeatherForecast(null)).toBeNull()
    expect(parseWeatherForecast({})).toBeNull()
    expect(parseWeatherForecast([])).toBeNull()
    expect(parseWeatherForecast('not json')).toBeNull()
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/weather.test.ts`
Expected: FAIL(`./weather`が解決できずエラーになる、またはexportが`undefined`)

- [ ] **Step 3: 最小限の実装を書く**

`server/utils/weather.ts`を新規作成する:

```ts
const TOKYO_AREA_CODE = '130010'
const TOKYO_AMEDAS_CODE = '44132'

export interface WeatherForecast {
  weatherCode: string
  weatherLabel: string
  weatherEmoji: string
  pop: number
  highTemp: number
  reportDatetime: string
}

type WeatherCategory = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'unknown'

function weatherCodeToCategory(weatherCode: string): WeatherCategory {
  switch (weatherCode.charAt(0)) {
    case '1':
      return 'sunny'
    case '2':
      return 'cloudy'
    case '3':
      return 'rainy'
    case '4':
      return 'snowy'
    default:
      return 'unknown'
  }
}

const CATEGORY_EMOJI: Record<WeatherCategory, string> = {
  sunny: '☀️',
  cloudy: '☁️',
  rainy: '🌧️',
  snowy: '❄️',
  unknown: '🌡️'
}

const CATEGORY_LABEL: Record<WeatherCategory, string> = {
  sunny: 'Sunny',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  snowy: 'Snowy',
  unknown: 'Unknown'
}

export function weatherCodeToEmoji(weatherCode: string): string {
  return CATEGORY_EMOJI[weatherCodeToCategory(weatherCode)]
}

export function weatherCodeToLabel(weatherCode: string): string {
  return CATEGORY_LABEL[weatherCodeToCategory(weatherCode)]
}

interface JmaArea {
  area: { name: string; code: string }
  weatherCodes?: string[]
  pops?: string[]
  temps?: string[]
}

interface JmaTimeSeries {
  timeDefines: string[]
  areas: JmaArea[]
}

interface JmaReport {
  publishingOffice: string
  reportDatetime: string
  timeSeries: JmaTimeSeries[]
}

function findArea(timeSeries: JmaTimeSeries | undefined, areaCode: string): JmaArea | undefined {
  return timeSeries?.areas.find((a) => a.area.code === areaCode)
}

export function parseWeatherForecast(jmaJson: unknown): WeatherForecast | null {
  try {
    const reports = jmaJson as JmaReport[]
    const report = reports[0]
    if (!report || !Array.isArray(report.timeSeries)) return null

    const weatherArea = findArea(report.timeSeries[0], TOKYO_AREA_CODE)
    const weatherCode = weatherArea?.weatherCodes?.[0]
    if (!weatherCode) return null

    const popSeries = report.timeSeries[1]
    const popArea = findArea(popSeries, TOKYO_AREA_CODE)
    const today = report.reportDatetime.slice(0, 10)
    const todayPops = (popSeries?.timeDefines ?? [])
      .map((timeDefine, i) => ({ date: timeDefine.slice(0, 10), pop: popArea?.pops?.[i] }))
      .filter((entry): entry is { date: string; pop: string } => entry.date === today && entry.pop !== undefined)
      .map((entry) => Number(entry.pop))
    const pop = todayPops.length > 0 ? Math.max(...todayPops) : Number(popArea?.pops?.[0])
    if (Number.isNaN(pop)) return null

    const tempArea = findArea(report.timeSeries[2], TOKYO_AMEDAS_CODE)
    const highTempRaw = tempArea?.temps?.[0]
    if (!highTempRaw) return null
    const highTemp = Number(highTempRaw)
    if (Number.isNaN(highTemp)) return null

    return {
      weatherCode,
      weatherLabel: weatherCodeToLabel(weatherCode),
      weatherEmoji: weatherCodeToEmoji(weatherCode),
      pop,
      highTemp,
      reportDatetime: report.reportDatetime
    }
  } catch {
    return null
  }
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/weather.test.ts`
Expected: PASS(全件)

---

## Task 2: キャッシュ付き取得(`getWeatherForecast`)

`server/utils/weather.ts`に、JMAへのfetch・`parseWeatherForecast`呼び出し・TTL 30分のインメモリキャッシュを行う`getWeatherForecast`を追加する。`server/utils/collector.ts`の`collectSource`と同様、`fetchFn`を差し替え可能にする。TTL判定のテストのため時刻取得も差し替え可能にする。

**Files:**
- Modify: `server/utils/weather.ts`
- Test: `server/utils/weather.test.ts`(Task 1のファイルに追記)

**Interfaces:**
- Consumes: Task 1の`parseWeatherForecast`, `WeatherForecast`
- Produces: `getWeatherForecast(fetchFn?: typeof fetch, now?: () => Date): Promise<WeatherForecast | null>`、`resetWeatherCacheForTests(): void`(Task 3が`getWeatherForecast`を、このテストファイル自身が`resetWeatherCacheForTests`を使う)

- [ ] **Step 1: 失敗するテストを書く**

`server/utils/weather.test.ts`の末尾に追記する:

```ts
function fakeFetch(response: { ok: boolean; throws?: boolean }): typeof fetch {
  return (async () => {
    if (response.throws) throw new Error('network error')
    if (!response.ok) return { ok: false } as Response
    return { ok: true, json: async () => sampleJmaJson } as Response
  }) as typeof fetch
}

describe('getWeatherForecast', () => {
  it('returns the parsed forecast on success', async () => {
    const { getWeatherForecast, resetWeatherCacheForTests } = await import('./weather')
    resetWeatherCacheForTests()
    const fetchFn = fakeFetch({ ok: true })

    const result = await getWeatherForecast(fetchFn, () => new Date('2026-08-16T11:30:00+09:00'))

    expect(result?.pop).toBe(30)
  })

  it('returns null when the fetch response is not ok', async () => {
    const { getWeatherForecast, resetWeatherCacheForTests } = await import('./weather')
    resetWeatherCacheForTests()
    const fetchFn = fakeFetch({ ok: false })

    const result = await getWeatherForecast(fetchFn, () => new Date('2026-08-16T11:30:00+09:00'))

    expect(result).toBeNull()
  })

  it('returns null when fetch throws instead of propagating the error', async () => {
    const { getWeatherForecast, resetWeatherCacheForTests } = await import('./weather')
    resetWeatherCacheForTests()
    const fetchFn = fakeFetch({ ok: true, throws: true })

    const result = await getWeatherForecast(fetchFn, () => new Date('2026-08-16T11:30:00+09:00'))

    expect(result).toBeNull()
  })

  it('does not refetch within the cache TTL', async () => {
    const { getWeatherForecast, resetWeatherCacheForTests } = await import('./weather')
    resetWeatherCacheForTests()
    let calls = 0
    const fetchFn = (async () => {
      calls++
      return { ok: true, json: async () => sampleJmaJson } as Response
    }) as typeof fetch
    const t0 = new Date('2026-08-16T11:30:00+09:00')

    await getWeatherForecast(fetchFn, () => t0)
    await getWeatherForecast(fetchFn, () => new Date(t0.getTime() + 10 * 60 * 1000))

    expect(calls).toBe(1)
  })

  it('refetches after the cache TTL expires', async () => {
    const { getWeatherForecast, resetWeatherCacheForTests } = await import('./weather')
    resetWeatherCacheForTests()
    let calls = 0
    const fetchFn = (async () => {
      calls++
      return { ok: true, json: async () => sampleJmaJson } as Response
    }) as typeof fetch
    const t0 = new Date('2026-08-16T11:30:00+09:00')

    await getWeatherForecast(fetchFn, () => t0)
    await getWeatherForecast(fetchFn, () => new Date(t0.getTime() + 31 * 60 * 1000))

    expect(calls).toBe(2)
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run server/utils/weather.test.ts`
Expected: FAIL(`getWeatherForecast is not a function` 等)

- [ ] **Step 3: 最小限の実装を書く**

`server/utils/weather.ts`の末尾に追記する:

```ts
const JMA_FORECAST_URL = 'https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json'
const CACHE_TTL_MS = 30 * 60 * 1000

interface CacheEntry {
  data: WeatherForecast | null
  fetchedAt: number
}

let cache: CacheEntry | null = null

export async function getWeatherForecast(
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date()
): Promise<WeatherForecast | null> {
  const nowMs = now().getTime()
  if (cache && nowMs - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data
  }

  let data: WeatherForecast | null = null
  try {
    const response = await fetchFn(JMA_FORECAST_URL)
    if (response.ok) {
      const json = await response.json()
      data = parseWeatherForecast(json)
    }
  } catch {
    data = null
  }

  cache = { data, fetchedAt: nowMs }
  return data
}

export function resetWeatherCacheForTests(): void {
  cache = null
}
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run server/utils/weather.test.ts`
Expected: PASS(全件)

---

## Task 3: `GET /api/weather`ルート

`server/utils/weather.ts`の`getWeatherForecast()`を呼ぶだけの薄いイベントハンドラを追加する。自動テストは追加せず(理由はスペックのテスト方針section参照)、`npm run dev`での手動疎通確認を行う。

**Files:**
- Create: `server/api/weather/index.get.ts`

**Interfaces:**
- Consumes: Task 2の`getWeatherForecast(): Promise<WeatherForecast | null>`(`server/utils/weather`から)
- Produces: `GET /api/weather` エンドポイント(レスポンスボディは`WeatherForecast | null`)。Task 5の`pages/index.vue`が`useFetch('/api/weather')`で使う。

- [ ] **Step 1: ルートハンドラを実装する**

`server/api/weather/index.get.ts`を新規作成する:

```ts
import { getWeatherForecast } from '../../utils/weather'

export default defineEventHandler(() => {
  return getWeatherForecast()
})
```

- [ ] **Step 2: 開発サーバーで疎通確認する**

Run: `npm run dev` をバックグラウンドで起動し、数秒待ってから:
`curl -s http://localhost:3000/api/weather`

Expected: `{"weatherCode":"...","weatherLabel":"...","weatherEmoji":"...","pop":...,"highTemp":...,"reportDatetime":"..."}`という形のJSON、またはJMA側の一時的な取得失敗時は`null`。いずれの場合もHTTP 200で、サーバーがエラー終了しないこと。

確認後、devサーバーを停止する。

---

## Task 4: `components/WeatherCard.vue`

`ArticleCard.vue`と同じ流儀(propsを受け取るだけの表示コンポーネント)で、天気カードを実装する。

**Files:**
- Create: `components/WeatherCard.vue`
- Test: `components/WeatherCard.test.ts`

**Interfaces:**
- Consumes: props `{ weatherEmoji: string, weatherLabel: string, pop: number, highTemp: number }`
- Produces: `<WeatherCard>`コンポーネント(Task 5の`pages/index.vue`が使う)

- [ ] **Step 1: 失敗するテストを書く**

`components/WeatherCard.test.ts`を新規作成する:

```ts
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import WeatherCard from './WeatherCard.vue'

const stubs = {
  UCard: { template: '<div><slot /></div>' }
}

describe('WeatherCard', () => {
  it('renders the weather label, high temp, and pop', () => {
    const wrapper = mount(WeatherCard, {
      props: { weatherEmoji: '☁️', weatherLabel: 'Cloudy', pop: 30, highTemp: 29 },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('Cloudy')
    expect(wrapper.text()).toContain('High 29°C')
    expect(wrapper.text()).toContain('Rain 30%')
  })

  it('renders the weather emoji', () => {
    const wrapper = mount(WeatherCard, {
      props: { weatherEmoji: '☀️', weatherLabel: 'Sunny', pop: 0, highTemp: 31 },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('☀️')
  })
})
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `npx vitest run components/WeatherCard.test.ts`
Expected: FAIL(`Failed to resolve import "./WeatherCard.vue"`)

- [ ] **Step 3: 最小限の実装を書く**

`components/WeatherCard.vue`を新規作成する:

```vue
<script setup lang="ts">
defineProps<{
  weatherEmoji: string
  weatherLabel: string
  pop: number
  highTemp: number
}>()
</script>

<template>
  <UCard :ui="{ body: 'p-4' }">
    <div class="flex items-center gap-3">
      <span class="text-3xl">{{ weatherEmoji }}</span>
      <div class="text-sm text-muted">
        <p class="text-highlighted font-bold">{{ weatherLabel }}</p>
        <p>High {{ highTemp }}°C · Rain {{ pop }}%</p>
      </div>
    </div>
  </UCard>
</template>
```

- [ ] **Step 4: テストを実行して成功を確認する**

Run: `npx vitest run components/WeatherCard.test.ts`
Expected: PASS(全件)

---

## Task 5: `pages/index.vue`への組み込み

`pages/index.vue`に`useFetch('/api/weather')`を追加し、見出しの下・記事カードグリッドの上に`WeatherCard`を条件付きで表示する。

**Files:**
- Modify: `pages/index.vue`

**Interfaces:**
- Consumes: `GET /api/weather`(Task 3)、`<WeatherCard>`props(Task 4)

- [ ] **Step 1: `pages/index.vue`を編集する**

現在の内容:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/', query: { page: value } })
  }
})

const { data } = await useFetch('/api/articles', {
  query: { page },
  watch: [page]
})
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">ASAKUSA TODAY</h1>
    <p v-if="data && data.articles.length === 0" class="text-muted">
      No articles yet.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
```

以下に差し替える:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { WeatherForecast } from '../server/utils/weather'

const route = useRoute()
const router = useRouter()

const page = computed({
  get: () => Number(route.query.page) || 1,
  set: (value: number) => {
    router.push({ path: '/', query: { page: value } })
  }
})

const { data } = await useFetch('/api/articles', {
  query: { page },
  watch: [page]
})

const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-8">
    <h1 class="text-2xl font-bold text-primary mb-6">ASAKUSA TODAY</h1>
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
    <p v-if="data && data.articles.length === 0" class="text-muted">
      No articles yet.
    </p>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      <ArticleCard
        v-for="article in data?.articles"
        :id="article.id"
        :key="article.id"
        :title="article.title"
        :image-url="article.image_url"
        :published-at="article.published_at ?? ''"
      />
    </div>
    <div v-if="data && data.total > data.pageSize" class="flex justify-center mt-8">
      <UPagination v-model:page="page" :total="data.total" :items-per-page="data.pageSize" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 既存のsmokeテストが壊れていないことを確認する**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS(JMAへの実通信が失敗しても`getWeatherForecast()`は`null`を返すため、`WeatherCard`が描画されないだけでテスト自体は失敗しない)

- [ ] **Step 3: 全テストスイートを実行する**

Run: `npx vitest run`
Expected: PASS(全件。既存テストを含む)

- [ ] **Step 4: 開発サーバーで見た目を確認する**

Run: `npm run dev` をバックグラウンドで起動し、ブラウザ(またはcurl)で`http://localhost:3000/`を開く。

Expected: 見出し「ASAKUSA TODAY」の下、記事一覧の上に天気カード(絵文字・ラベル・最高気温・降水確率)が表示される。JMAが取得できない場合はカードが出ないだけでページの他の部分は正常。

確認後、devサーバーを停止する。

---

## Self-Review Notes

- **Spec coverage:** スコープの4項目(APIルート・パース処理・`WeatherCard.vue`・`pages/index.vue`組み込み)はTask 1〜5で全てカバー。エラーハンドリング方針(`null`フォールバック)はTask 1〜3に反映。キャッシュTTL 30分はTask 2に反映。UI英語化(`weatherLabel`)はTask 1・4に反映。
- **Placeholder scan:** 「TBD」「後で」等の記述なし。全ステップに実コード・実コマンドを記載。
- **Type consistency:** `WeatherForecast`(Task 1で定義)のフィールド名(`weatherCode`, `weatherLabel`, `weatherEmoji`, `pop`, `highTemp`, `reportDatetime`)はTask 2〜5で一貫して使用。`getWeatherForecast`/`resetWeatherCacheForTests`(Task 2で定義)はTask 3のみが`getWeatherForecast`を使用し、シグネチャも一致。
