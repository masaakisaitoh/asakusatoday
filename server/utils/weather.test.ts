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
