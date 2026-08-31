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

const NORMAL_OPERATION_PATTERN = /平常(どおり|通り)[^。、]{0,10}運転/
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
  if (NORMAL_OPERATION_PATTERN.test(text)) return 'normal'
  if (NORMAL_NEGATION_PATTERN.test(text)) return 'normal'
  if (text.includes('見合わせ')) return 'suspended'
  if (text.includes('遅延') || text.includes('遅れ')) return 'delayed'
  if (text.includes('平常')) return 'normal'
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
  const response = await fetchFn(url, { signal: AbortSignal.timeout(5000) })
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
