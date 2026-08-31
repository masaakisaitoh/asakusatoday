# トップページ電車運行情報ウィジェット Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トップページに東京メトロ銀座線・日比谷線、都営浅草線・大江戸線、つくばエクスプレスの運行情報カードを追加する。

**Architecture:** `WeatherCard.vue`/`server/utils/weather.ts`と同型の構成。`pages/index.vue`が`GET /api/train-status`を`useFetch`で呼び、サーバー側(`server/utils/trainStatus.ts`)がODPTの`odpt:TrainInformation`を東京メトロ・都営・MIR(首都圏新都市鉄道)の3事業者に`Promise.allSettled`で並行fetchし、メモリキャッシュ(TTL5分)を挟んで整形済み配列(または`null`)を返す。`TrainStatusCard.vue`はpropsを受け取るだけの純粋表示コンポーネント。

**Tech Stack:** Nuxt 3 (Nitro server routes)、TypeScript、Vitest、`@nuxt/ui`、ODPT API v4 (`api.odpt.org`)。

## Global Constraints

- UI表示文言は`composables/useUiText.ts`(`utils/i18n/uiStrings.ts`)経由のi18nキーで6言語(ja/en/ko/zh-Hant/zh-Hans/pt)分すべて用意する。路線名(`lineName`)のみ英語固定の静的文字列。
- ODPTへの外部通信はサーバー側(`server/utils/trainStatus.ts`)でのみ行う。ブラウザから直接ODPTを叩かない。
- `ODPT_API_KEY`は`process.env.ODPT_API_KEY`から読む(`.env`に設定済み)。未設定時・全事業者fetch失敗時は`/api/train-status`は`null`を返す(500エラーにしない)。
- キャッシュTTLは`5 * 60 * 1000`ミリ秒。モジュールスコープの変数で保持する(DBは使わない)。
- 東京メトロ・都営・MIRへの問い合わせは`Promise.allSettled`で並行に行い、一部の事業者が失敗しても成功した事業者の路線分だけで結果を返す。
- 対象路線ID: `odpt.Railway:TokyoMetro.Ginza`(ginza/"Ginza Line")、`odpt.Railway:TokyoMetro.Hibiya`(hibiya/"Hibiya Line")、`odpt.Railway:Toei.Asakusa`(asakusa/"Asakusa Line")、`odpt.Railway:Toei.Oedo`(oedo/"Oedo Line")、`odpt.Railway:MIR.TsukubaExpress`(tx/"Tsukuba Express")。2026-08-31に実APIキーで疎通確認済み。
- ステータス判定は「平常」を含む→normal、「遅延/遅れ/見合わせ/運休」+15文字以内の「ありません/ございません」の打ち消し表現→normal、「見合わせ」→suspended、「遅延/遅れ」→delayed、それ以外の非空テキスト→disrupted、空または対象外路線→スキップ。都営地下鉄の平常時定型文言「現在、１５分以上の遅延はありません。」を`delayed`と誤判定しないための打ち消し表現の判定を、単純な「平常」判定より先に行う。

参照設計書: `docs/superpowers/specs/2026-08-16-train-status-widget-design.md`

---

### Task 1: `server/utils/trainStatus.ts` — パース・分類・キャッシュ・fetch

**Files:**
- Create: `server/utils/trainStatus.ts`
- Test: `server/utils/trainStatus.test.ts`

**Interfaces:**
- Produces:
  - `export type TrainStatusLevel = 'normal' | 'delayed' | 'suspended' | 'disrupted'`
  - `export interface TrainLineStatus { lineId: 'ginza' | 'hibiya' | 'asakusa' | 'oedo' | 'tx'; lineName: string; status: TrainStatusLevel }`
  - `export function parseOperatorTrainInformation(odptJson: unknown): TrainLineStatus[]`
  - `export function getTrainStatus(fetchFn?: typeof fetch, now?: () => Date): Promise<TrainLineStatus[] | null>`
  - `export function resetTrainStatusCacheForTests(): void`

- [ ] **Step 1: Write the failing tests**

Create `server/utils/trainStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'

function odptItem(railway: string, ja: string) {
  return {
    'odpt:railway': railway,
    'odpt:trainInformationText': { ja }
  }
}

describe('parseOperatorTrainInformation', () => {
  it('classifies Tokyo Metro normal wording ("平常どおり") as normal', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:TokyoMetro.Ginza', '現在、平常どおり運転しています。')
    ])
    expect(result).toEqual([{ lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' }])
  })

  it('classifies Toei normal wording ("〜分以上の遅延はありません") as normal, not delayed', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:Toei.Asakusa', '現在、１５分以上の遅延はありません。')
    ])
    expect(result).toEqual([{ lineId: 'asakusa', lineName: 'Asakusa Line', status: 'normal' }])
  })

  it('classifies text containing "見合わせ" as suspended', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:TokyoMetro.Ginza', '人身事故の影響で、運転を見合わせています。')
    ])
    expect(result).toEqual([{ lineId: 'ginza', lineName: 'Ginza Line', status: 'suspended' }])
  })

  it('classifies text containing "遅延" without a negation as delayed', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:TokyoMetro.Hibiya', '大雨の影響で、列車に遅延が発生しています。')
    ])
    expect(result).toEqual([{ lineId: 'hibiya', lineName: 'Hibiya Line', status: 'delayed' }])
  })

  it('classifies unrecognized non-empty text as disrupted', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:Toei.Oedo', '車両点検のため、一部列車に影響が出ています。')
    ])
    expect(result).toEqual([{ lineId: 'oedo', lineName: 'Oedo Line', status: 'disrupted' }])
  })

  it('excludes railways that are not in the target line list', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:TokyoMetro.Marunouchi', '現在、平常どおり運転しています。')
    ])
    expect(result).toEqual([])
  })

  it('excludes lines with empty status text', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([odptItem('odpt.Railway:TokyoMetro.Ginza', '')])
    expect(result).toEqual([])
  })

  it('returns an empty array for malformed input instead of throwing', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    expect(parseOperatorTrainInformation(null)).toEqual([])
    expect(parseOperatorTrainInformation({})).toEqual([])
    expect(parseOperatorTrainInformation('not json')).toEqual([])
  })

  it('parses multiple lines from one operator response', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem('odpt.Railway:TokyoMetro.Ginza', '現在、平常どおり運転しています。'),
      odptItem('odpt.Railway:TokyoMetro.Hibiya', '現在、平常どおり運転しています。')
    ])
    expect(result).toEqual([
      { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
      { lineId: 'hibiya', lineName: 'Hibiya Line', status: 'normal' }
    ])
  })
})

function fakeFetch(
  responses: Record<string, { ok: boolean; body?: unknown; throws?: boolean }>
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    const operator = Object.keys(responses).find((op) => url.includes(op))
    const response = operator ? responses[operator] : undefined
    if (!response || response.throws) throw new Error('network error')
    if (!response.ok) return { ok: false, status: 500 } as Response
    return { ok: true, json: async () => response.body } as Response
  }) as typeof fetch
}

describe('getTrainStatus', () => {
  it('returns null when ODPT_API_KEY is not set', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    const originalKey = process.env.ODPT_API_KEY
    delete process.env.ODPT_API_KEY

    const result = await getTrainStatus(fakeFetch({}), () => new Date('2026-08-31T12:00:00+09:00'))

    expect(result).toBeNull()
    if (originalKey !== undefined) process.env.ODPT_API_KEY = originalKey
  })

  it('combines lines from all operators on success', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    process.env.ODPT_API_KEY = 'test-key'
    const fetchFn = fakeFetch({
      'odpt.Operator:TokyoMetro': {
        ok: true,
        body: [odptItem('odpt.Railway:TokyoMetro.Ginza', '現在、平常どおり運転しています。')]
      },
      'odpt.Operator:Toei': {
        ok: true,
        body: [odptItem('odpt.Railway:Toei.Asakusa', '現在、１５分以上の遅延はありません。')]
      },
      'odpt.Operator:MIR': {
        ok: true,
        body: [odptItem('odpt.Railway:MIR.TsukubaExpress', '現在、平常通り運転しています。')]
      }
    })

    const result = await getTrainStatus(fetchFn, () => new Date('2026-08-31T12:00:00+09:00'))

    expect(result).toEqual([
      { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
      { lineId: 'asakusa', lineName: 'Asakusa Line', status: 'normal' },
      { lineId: 'tx', lineName: 'Tsukuba Express', status: 'normal' }
    ])
  })

  it('returns only the successful operators when some fail', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    process.env.ODPT_API_KEY = 'test-key'
    const fetchFn = fakeFetch({
      'odpt.Operator:TokyoMetro': {
        ok: true,
        body: [odptItem('odpt.Railway:TokyoMetro.Ginza', '現在、平常どおり運転しています。')]
      },
      'odpt.Operator:Toei': { ok: false },
      'odpt.Operator:MIR': { throws: true }
    })

    const result = await getTrainStatus(fetchFn, () => new Date('2026-08-31T12:00:00+09:00'))

    expect(result).toEqual([{ lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' }])
  })

  it('returns null when every operator fails', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    process.env.ODPT_API_KEY = 'test-key'
    const fetchFn = fakeFetch({
      'odpt.Operator:TokyoMetro': { ok: false },
      'odpt.Operator:Toei': { ok: false },
      'odpt.Operator:MIR': { ok: false }
    })

    const result = await getTrainStatus(fetchFn, () => new Date('2026-08-31T12:00:00+09:00'))

    expect(result).toBeNull()
  })

  it('does not refetch within the cache TTL', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    process.env.ODPT_API_KEY = 'test-key'
    let calls = 0
    const fetchFn = (async () => {
      calls++
      return { ok: true, json: async () => [] } as Response
    }) as typeof fetch
    const t0 = new Date('2026-08-31T12:00:00+09:00')

    await getTrainStatus(fetchFn, () => t0)
    await getTrainStatus(fetchFn, () => new Date(t0.getTime() + 4 * 60 * 1000))

    expect(calls).toBe(3)
  })

  it('refetches after the cache TTL expires', async () => {
    const { getTrainStatus, resetTrainStatusCacheForTests } = await import('./trainStatus')
    resetTrainStatusCacheForTests()
    process.env.ODPT_API_KEY = 'test-key'
    let calls = 0
    const fetchFn = (async () => {
      calls++
      return { ok: true, json: async () => [] } as Response
    }) as typeof fetch
    const t0 = new Date('2026-08-31T12:00:00+09:00')

    await getTrainStatus(fetchFn, () => t0)
    await getTrainStatus(fetchFn, () => new Date(t0.getTime() + 6 * 60 * 1000))

    expect(calls).toBe(6)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/utils/trainStatus.test.ts`
Expected: FAIL — `Cannot find module './trainStatus'` (file doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `server/utils/trainStatus.ts`:

```ts
export type TrainStatusLevel = 'normal' | 'delayed' | 'suspended' | 'disrupted'

export interface TrainLineStatus {
  lineId: 'ginza' | 'hibiya' | 'asakusa' | 'oedo' | 'tx'
  lineName: string
  status: TrainStatusLevel
}

const RAILWAY_MAP: Record<string, { lineId: TrainLineStatus['lineId']; lineName: string }> = {
  'odpt.Railway:TokyoMetro.Ginza': { lineId: 'ginza', lineName: 'Ginza Line' },
  'odpt.Railway:TokyoMetro.Hibiya': { lineId: 'hibiya', lineName: 'Hibiya Line' },
  'odpt.Railway:Toei.Asakusa': { lineId: 'asakusa', lineName: 'Asakusa Line' },
  'odpt.Railway:Toei.Oedo': { lineId: 'oedo', lineName: 'Oedo Line' },
  'odpt.Railway:MIR.TsukubaExpress': { lineId: 'tx', lineName: 'Tsukuba Express' }
}

const NORMAL_NEGATION_PATTERN = /(遅延|遅れ|見合わせ|運休)[^。、]{0,15}(ありません|ございません)/

function extractText(field: unknown): string {
  if (typeof field === 'string') return field
  if (field && typeof field === 'object') {
    const obj = field as Record<string, unknown>
    if (typeof obj.ja === 'string') return obj.ja
    const firstString = Object.values(obj).find((v) => typeof v === 'string')
    return typeof firstString === 'string' ? firstString : ''
  }
  return ''
}

function classifyStatusText(text: string): TrainStatusLevel | null {
  if (!text) return null
  if (text.includes('平常')) return 'normal'
  if (NORMAL_NEGATION_PATTERN.test(text)) return 'normal'
  if (text.includes('見合わせ')) return 'suspended'
  if (text.includes('遅延') || text.includes('遅れ')) return 'delayed'
  return 'disrupted'
}

interface OdptTrainInformationItem {
  'odpt:railway'?: unknown
  'odpt:trainInformationText'?: unknown
  'odpt:trainInformationStatus'?: unknown
}

export function parseOperatorTrainInformation(odptJson: unknown): TrainLineStatus[] {
  if (!Array.isArray(odptJson)) return []

  const result: TrainLineStatus[] = []
  for (const raw of odptJson) {
    const item = raw as OdptTrainInformationItem
    const railwayId = item['odpt:railway']
    if (typeof railwayId !== 'string') continue
    const meta = RAILWAY_MAP[railwayId]
    if (!meta) continue

    const combinedText = `${extractText(item['odpt:trainInformationStatus'])} ${extractText(item['odpt:trainInformationText'])}`.trim()
    const status = classifyStatusText(combinedText)
    if (!status) continue

    result.push({ lineId: meta.lineId, lineName: meta.lineName, status })
  }
  return result
}

const ODPT_TRAIN_INFO_URL = 'https://api.odpt.org/api/v4/odpt:TrainInformation'
const OPERATORS = ['odpt.Operator:TokyoMetro', 'odpt.Operator:Toei', 'odpt.Operator:MIR']
const CACHE_TTL_MS = 5 * 60 * 1000

interface CacheEntry {
  data: TrainLineStatus[] | null
  fetchedAt: number
}

let cache: CacheEntry | null = null

async function fetchOperatorTrainInformation(
  fetchFn: typeof fetch,
  operator: string,
  apiKey: string
): Promise<TrainLineStatus[]> {
  const url = `${ODPT_TRAIN_INFO_URL}?odpt:operator=${operator}&acl:consumerKey=${apiKey}`
  const response = await fetchFn(url)
  if (!response.ok) throw new Error(`ODPT request failed for ${operator}: ${response.status}`)
  const json = await response.json()
  return parseOperatorTrainInformation(json)
}

export async function getTrainStatus(
  fetchFn: typeof fetch = fetch,
  now: () => Date = () => new Date()
): Promise<TrainLineStatus[] | null> {
  const nowMs = now().getTime()
  if (cache && nowMs - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data
  }

  const apiKey = process.env.ODPT_API_KEY
  if (!apiKey) {
    cache = { data: null, fetchedAt: nowMs }
    return null
  }

  const settled = await Promise.allSettled(
    OPERATORS.map((operator) => fetchOperatorTrainInformation(fetchFn, operator, apiKey))
  )

  let anySucceeded = false
  const lines: TrainLineStatus[] = []
  for (const result of settled) {
    if (result.status === 'fulfilled') {
      anySucceeded = true
      lines.push(...result.value)
    }
  }

  const data = anySucceeded ? lines : null
  cache = { data, fetchedAt: nowMs }
  return data
}

export function resetTrainStatusCacheForTests(): void {
  cache = null
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run server/utils/trainStatus.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add server/utils/trainStatus.ts server/utils/trainStatus.test.ts
git commit -m "feat: add ODPT train status fetch/parse utility"
```

---

### Task 2: `server/api/train-status/index.get.ts` — API route

**Files:**
- Create: `server/api/train-status/index.get.ts`

**Interfaces:**
- Consumes: `getTrainStatus` from `../../utils/trainStatus` (Task 1)

- [ ] **Step 1: Write the implementation**

Create `server/api/train-status/index.get.ts`:

```ts
import { getTrainStatus } from '../../utils/trainStatus'

export default defineEventHandler(() => {
  return getTrainStatus()
})
```

- [ ] **Step 2: Manually verify against the real ODPT API**

Run: `npm run dev`

In another terminal:

```bash
curl -s http://localhost:3000/api/train-status | python3 -m json.tool
```

Expected: a JSON array of 5 objects (`lineId`/`lineName`/`status`), all `status: "normal"` under normal conditions (confirmed manually on 2026-08-31 that all 5 lines return `normal` this way). Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 3: Commit**

```bash
git add server/api/train-status/index.get.ts
git commit -m "feat: add GET /api/train-status route"
```

---

### Task 3: i18n keys for the train status card

**Files:**
- Modify: `utils/i18n/uiStrings.ts`
- Modify: `composables/useUiText.test.ts`

**Interfaces:**
- Produces: 5 new `UiStringKey` values (`train.allNormal`, `train.lineStatus`, `train.statusDelayed`, `train.statusSuspended`, `train.statusDisrupted`), each with a translation in all 6 locales.

- [ ] **Step 1: Add the new keys to the `UiStringKey` union**

In `utils/i18n/uiStrings.ts`, change:

```ts
  | 'weather.summary'
  | 'map.enableLocation'
  | 'map.recenterAria'
```

to:

```ts
  | 'weather.summary'
  | 'train.allNormal'
  | 'train.lineStatus'
  | 'train.statusDelayed'
  | 'train.statusSuspended'
  | 'train.statusDisrupted'
  | 'map.enableLocation'
  | 'map.recenterAria'
```

- [ ] **Step 2: Add English translations**

In the `en` block, change:

```ts
    'weather.summary': 'High {temp}°C · Rain {pop}%',
    'map.enableLocation': 'Enable location access to see your position on the map.',
```

to:

```ts
    'weather.summary': 'High {temp}°C · Rain {pop}%',
    'train.allNormal': 'All lines running normally.',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': 'Delayed',
    'train.statusSuspended': 'Suspended',
    'train.statusDisrupted': 'Service Alert',
    'map.enableLocation': 'Enable location access to see your position on the map.',
```

- [ ] **Step 3: Add Japanese translations**

In the `ja` block, change:

```ts
    'weather.summary': '最高気温 {temp}°C・降水確率 {pop}%',
    'map.enableLocation': '位置情報へのアクセスを許可すると、地図上に現在地が表示されます。',
```

to:

```ts
    'weather.summary': '最高気温 {temp}°C・降水確率 {pop}%',
    'train.allNormal': '全線、平常運転しています。',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': '遅延',
    'train.statusSuspended': '運転見合わせ',
    'train.statusDisrupted': '運行情報',
    'map.enableLocation': '位置情報へのアクセスを許可すると、地図上に現在地が表示されます。',
```

- [ ] **Step 4: Add Korean translations**

In the `ko` block, change:

```ts
    'weather.summary': '최고 기온 {temp}°C · 강수확률 {pop}%',
    'map.enableLocation': '위치 정보 접근을 허용하면 지도에서 현재 위치를 확인할 수 있습니다.',
```

to:

```ts
    'weather.summary': '최고 기온 {temp}°C · 강수확률 {pop}%',
    'train.allNormal': '모든 노선이 정상 운행 중입니다.',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': '지연',
    'train.statusSuspended': '운행 중단',
    'train.statusDisrupted': '운행 정보',
    'map.enableLocation': '위치 정보 접근을 허용하면 지도에서 현재 위치를 확인할 수 있습니다.',
```

- [ ] **Step 5: Add Traditional Chinese translations**

In the `'zh-Hant'` block, change:

```ts
    'weather.summary': '最高氣溫 {temp}°C・降雨機率 {pop}%',
    'map.enableLocation': '允許存取位置資訊即可在地圖上顯示您的位置。',
```

to:

```ts
    'weather.summary': '最高氣溫 {temp}°C・降雨機率 {pop}%',
    'train.allNormal': '所有路線正常行駛中。',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': '延誤',
    'train.statusSuspended': '停駛',
    'train.statusDisrupted': '行車資訊',
    'map.enableLocation': '允許存取位置資訊即可在地圖上顯示您的位置。',
```

- [ ] **Step 6: Add Simplified Chinese translations**

In the `'zh-Hans'` block, change:

```ts
    'weather.summary': '最高气温 {temp}°C・降雨概率 {pop}%',
    'map.enableLocation': '允许访问位置信息即可在地图上显示您的位置。',
```

to:

```ts
    'weather.summary': '最高气温 {temp}°C・降雨概率 {pop}%',
    'train.allNormal': '所有线路正常运行中。',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': '延误',
    'train.statusSuspended': '停运',
    'train.statusDisrupted': '行车信息',
    'map.enableLocation': '允许访问位置信息即可在地图上显示您的位置。',
```

- [ ] **Step 7: Add Portuguese translations**

In the `pt` block, change:

```ts
    'weather.summary': 'Máxima {temp}°C · Chuva {pop}%',
    'map.enableLocation': 'Ative o acesso à localização para ver sua posição no mapa.',
```

to:

```ts
    'weather.summary': 'Máxima {temp}°C · Chuva {pop}%',
    'train.allNormal': 'Todas as linhas operando normalmente.',
    'train.lineStatus': '⚠️ {line} — {status}',
    'train.statusDelayed': 'Atraso',
    'train.statusSuspended': 'Suspenso',
    'train.statusDisrupted': 'Alerta de serviço',
    'map.enableLocation': 'Ative o acesso à localização para ver sua posição no mapa.',
```

- [ ] **Step 8: Add a test confirming the new keys resolve in English and Japanese**

In `composables/useUiText.test.ts`, add a new `it` block inside the existing `describe('useUiText', ...)`, right after the `'substitutes {name}-style placeholders from params'` test:

```ts
  it('returns train status strings for en and ja', async () => {
    const { useArticleLocale } = await import('./useArticleLocale')
    vi.stubGlobal('useArticleLocale', useArticleLocale)
    const { useUiText } = await import('./useUiText')

    const { locale, setLocale } = useArticleLocale()
    const { t } = useUiText()
    expect(t('train.allNormal')).toBe('All lines running normally.')
    expect(t('train.lineStatus', { line: 'Ginza Line', status: 'Delayed' })).toBe('⚠️ Ginza Line — Delayed')
    expect(t('train.statusSuspended')).toBe('Suspended')

    setLocale('ja')
    expect(locale.value).toBe('ja')
    expect(t('train.allNormal')).toBe('全線、平常運転しています。')
    expect(t('train.statusDelayed')).toBe('遅延')
  })
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run composables/useUiText.test.ts`
Expected: PASS (all tests green, including the new one)

- [ ] **Step 10: Type-check to confirm every locale has every key**

Run: `npx vue-tsc --noEmit`
Expected: no errors (if a locale is missing one of the new keys, `Record<TranslationLocale, Record<UiStringKey, string>>` fails to compile with a "Property is missing" error)

- [ ] **Step 11: Commit**

```bash
git add utils/i18n/uiStrings.ts composables/useUiText.test.ts
git commit -m "feat: add i18n keys for train status widget"
```

---

### Task 4: `components/TrainStatusCard.vue` — display component

**Files:**
- Create: `components/TrainStatusCard.vue`
- Test: `components/TrainStatusCard.test.ts`

**Interfaces:**
- Consumes: `TrainLineStatus` from `../server/utils/trainStatus` (Task 1); i18n keys `train.allNormal`, `train.lineStatus`, `train.statusDelayed`, `train.statusSuspended`, `train.statusDisrupted` (Task 3)
- Produces: `TrainStatusCard.vue` component with props `{ lines: TrainLineStatus[] }`

- [ ] **Step 1: Write the failing tests**

Create `components/TrainStatusCard.test.ts`:

```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import TrainStatusCard from './TrainStatusCard.vue'
import { useArticleLocale } from '../composables/useArticleLocale'
import { useUiText } from '../composables/useUiText'
import type { TrainLineStatus } from '../server/utils/trainStatus'

const stubs = {
  UCard: { template: '<div><slot /></div>' }
}

beforeEach(() => {
  const stateCache = new Map()
  vi.stubGlobal('useState', (_key: string, init: () => unknown) => {
    if (!stateCache.has(_key)) {
      stateCache.set(_key, ref(init()))
    }
    return stateCache.get(_key)
  })
  vi.stubGlobal('useArticleLocale', useArticleLocale)
  vi.stubGlobal('useUiText', useUiText)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const allNormal: TrainLineStatus[] = [
  { lineId: 'ginza', lineName: 'Ginza Line', status: 'normal' },
  { lineId: 'hibiya', lineName: 'Hibiya Line', status: 'normal' },
  { lineId: 'asakusa', lineName: 'Asakusa Line', status: 'normal' },
  { lineId: 'oedo', lineName: 'Oedo Line', status: 'normal' },
  { lineId: 'tx', lineName: 'Tsukuba Express', status: 'normal' }
]

describe('TrainStatusCard', () => {
  it('shows the all-normal message when all 5 lines are normal', () => {
    const wrapper = mount(TrainStatusCard, {
      props: { lines: allNormal },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('All lines running normally.')
    expect(wrapper.text()).not.toContain('Ginza Line')
  })

  it('lists only the non-normal lines when some are disrupted', () => {
    const lines: TrainLineStatus[] = [
      ...allNormal.slice(0, 4),
      { lineId: 'tx', lineName: 'Tsukuba Express', status: 'delayed' }
    ]
    const wrapper = mount(TrainStatusCard, {
      props: { lines },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('Tsukuba Express')
    expect(wrapper.text()).toContain('Delayed')
    expect(wrapper.text()).not.toContain('Ginza Line')
    expect(wrapper.text()).not.toContain('All lines running normally.')
  })

  it('renders nothing when data is partial with no disruption', () => {
    const wrapper = mount(TrainStatusCard, {
      props: { lines: allNormal.slice(0, 2) },
      global: { stubs }
    })
    expect(wrapper.text().trim()).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run components/TrainStatusCard.test.ts`
Expected: FAIL — `Failed to resolve import "./TrainStatusCard.vue"` (component doesn't exist yet)

- [ ] **Step 3: Write the implementation**

Create `components/TrainStatusCard.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { TrainLineStatus, TrainStatusLevel } from '../server/utils/trainStatus'

const props = defineProps<{
  lines: TrainLineStatus[]
}>()

const { t } = useUiText()

const TOTAL_LINE_COUNT = 5

const statusKeyMap: Record<Exclude<TrainStatusLevel, 'normal'>, 'train.statusDelayed' | 'train.statusSuspended' | 'train.statusDisrupted'> = {
  delayed: 'train.statusDelayed',
  suspended: 'train.statusSuspended',
  disrupted: 'train.statusDisrupted'
}

const disruptedLines = computed(() => props.lines.filter((line) => line.status !== 'normal'))

const allNormal = computed(
  () => props.lines.length === TOTAL_LINE_COUNT && disruptedLines.value.length === 0
)

const shouldRender = computed(() => allNormal.value || disruptedLines.value.length > 0)
</script>

<template>
  <UCard v-if="shouldRender" :ui="{ body: 'p-4' }">
    <p v-if="allNormal" class="text-sm text-muted">{{ t('train.allNormal') }}</p>
    <ul v-else class="text-sm text-muted space-y-1">
      <li v-for="line in disruptedLines" :key="line.lineId">
        {{ t('train.lineStatus', { line: line.lineName, status: t(statusKeyMap[line.status as Exclude<TrainStatusLevel, 'normal'>]) }) }}
      </li>
    </ul>
  </UCard>
</template>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run components/TrainStatusCard.test.ts`
Expected: PASS (all tests green)

- [ ] **Step 5: Commit**

```bash
git add components/TrainStatusCard.vue components/TrainStatusCard.test.ts
git commit -m "feat: add TrainStatusCard component"
```

---

### Task 5: Wire into `pages/index.vue`

**Files:**
- Modify: `pages/index.vue`

**Interfaces:**
- Consumes: `TrainLineStatus` type and `/api/train-status` route (Task 2), `TrainStatusCard.vue` (Task 4)

- [ ] **Step 1: Add the fetch and import**

In `pages/index.vue`, change:

```ts
import type { WeatherForecast } from '../server/utils/weather'
```

to:

```ts
import type { WeatherForecast } from '../server/utils/weather'
import type { TrainLineStatus } from '../server/utils/trainStatus'
```

- [ ] **Step 2: Fetch the train status alongside the weather forecast**

Change:

```ts
const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
```

to:

```ts
const { data: weather } = await useFetch<WeatherForecast | null>('/api/weather')
const { data: trainStatus } = await useFetch<TrainLineStatus[] | null>('/api/train-status')
```

- [ ] **Step 3: Render the card below the weather card**

Change:

```html
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
```

to:

```html
    <WeatherCard
      v-if="weather"
      :weather-emoji="weather.weatherEmoji"
      :weather-label="weather.weatherLabel"
      :pop="weather.pop"
      :high-temp="weather.highTemp"
      class="mb-6"
    />
    <TrainStatusCard v-if="trainStatus" :lines="trainStatus" class="mb-6" />
```

- [ ] **Step 4: Run the smoke test**

Run: `npx vitest run tests/smoke.test.ts`
Expected: PASS (no regressions; `getTrainStatus()` returns `null` when `ODPT_API_KEY` is unset in the test env, so `TrainStatusCard` simply doesn't render)

- [ ] **Step 5: Manually verify in the browser**

Run: `npm run dev`, then open `http://localhost:3000/` in a browser.
Expected: the train status card appears below the weather card, showing either "All lines running normally." or a list of disrupted lines, matching what `curl http://localhost:3000/api/train-status` returns. Stop the dev server after confirming (Ctrl+C).

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS (all tests green, no regressions)

- [ ] **Step 7: Commit**

```bash
git add pages/index.vue
git commit -m "feat: show train status card on the top page"
```
