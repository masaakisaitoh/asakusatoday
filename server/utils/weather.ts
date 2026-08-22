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
