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

  it('classifies suspended text that also mentions "平常" in a recovery-guidance clause as suspended, not normal', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem(
        'odpt.Railway:TokyoMetro.Ginza',
        '人身事故の影響で、運転を見合わせています。平常運転に戻るまで今しばらくお待ちください。'
      )
    ])
    expect(result).toEqual([{ lineId: 'ginza', lineName: 'Ginza Line', status: 'suspended' }])
  })

  it('classifies delayed text that also mentions "平常" in a recovery-guidance clause as delayed, not normal', async () => {
    const { parseOperatorTrainInformation } = await import('./trainStatus')
    const result = parseOperatorTrainInformation([
      odptItem(
        'odpt.Railway:TokyoMetro.Hibiya',
        '車両点検の影響で、一部列車に遅れが出ています。平常ダイヤに戻るまでしばらくお待ちください。'
      )
    ])
    expect(result).toEqual([{ lineId: 'hibiya', lineName: 'Hibiya Line', status: 'delayed' }])
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
  responses: Record<string, { ok?: boolean; body?: unknown; throws?: boolean }>
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
