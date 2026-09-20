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

function mountCard(lines: TrainLineStatus[]) {
  return mount(TrainStatusCard, { props: { lines }, global: { stubs } })
}

function rowOf(wrapper: ReturnType<typeof mountCard>, lineId: string) {
  return wrapper.find(`li[data-line-id="${lineId}"]`)
}

function withStatus(lineId: TrainLineStatus['lineId'], status: TrainLineStatus['status']): TrainLineStatus[] {
  return allNormal.map((line) => (line.lineId === lineId ? { ...line, status } : line))
}

describe('TrainStatusCard', () => {
  it('renders one row per line, in the given order', () => {
    const wrapper = mountCard(allNormal)
    const rows = wrapper.findAll('li')
    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.attributes('data-line-id'))).toEqual(['ginza', 'hibiya', 'asakusa', 'oedo', 'tx'])
  })

  it('shows each line name in its row', () => {
    const wrapper = mountCard(allNormal)
    expect(rowOf(wrapper, 'ginza').text()).toContain('Ginza Line')
    expect(rowOf(wrapper, 'tx').text()).toContain('Tsukuba Express')
  })

  it('shows the official logo image for lines that have one', () => {
    const wrapper = mountCard(allNormal)
    const expected: Record<string, string> = {
      ginza: '/train-logos/ginza.png',
      hibiya: '/train-logos/hibiya.png',
      asakusa: '/train-logos/asakusa.svg',
      oedo: '/train-logos/oedo.svg'
    }
    for (const [lineId, src] of Object.entries(expected)) {
      const img = rowOf(wrapper, lineId).find('img')
      expect(img.exists(), lineId).toBe(true)
      expect(img.attributes('src'), lineId).toBe(src)
    }
    expect(rowOf(wrapper, 'ginza').find('img').attributes('alt')).toBe('Ginza Line')
  })

  it('shows plain text instead of an image for a line without a logo (tx)', () => {
    const row = rowOf(mountCard(allNormal), 'tx')
    expect(row.find('img').exists()).toBe(false)
    expect(row.findAll('span').some((span) => span.text() === 'TX')).toBe(true)
  })

  it('shows the normal label and no official link for normal lines', () => {
    const wrapper = mountCard(allNormal)
    for (const line of allNormal) {
      const row = rowOf(wrapper, line.lineId)
      expect(row.text(), line.lineId).toContain('Normal')
      expect(row.find('a').exists(), line.lineId).toBe(false)
    }
    expect(wrapper.text()).not.toContain('⚠️')
  })

  it('marks a delayed line with a warning and links to its official page', () => {
    const wrapper = mountCard(withStatus('hibiya', 'delayed'))
    const row = rowOf(wrapper, 'hibiya')
    expect(row.text()).toContain('⚠️')
    expect(row.text()).toContain('Delayed')
    expect(row.text()).not.toContain('Normal')

    const link = row.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://www.tokyometro.jp/unkou/history/hibiya.html')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
    expect(link.text()).toBe('Check official site')

    // 他の(平常の)路線にはリンクも警告も出ない
    expect(rowOf(wrapper, 'ginza').find('a').exists()).toBe(false)
    expect(rowOf(wrapper, 'ginza').text()).not.toContain('⚠️')
  })

  it('links each abnormal line to its own operator page and shows its status label', () => {
    const cases: Array<[TrainLineStatus['lineId'], TrainLineStatus['status'], string, string]> = [
      ['ginza', 'suspended', 'Suspended', 'https://www.tokyometro.jp/unkou/history/ginza.html'],
      ['asakusa', 'delayed', 'Delayed', 'https://www.kotsu.metro.tokyo.jp/subway/schedule/asakusa.html'],
      ['oedo', 'disrupted', 'Service Alert', 'https://www.kotsu.metro.tokyo.jp/subway/schedule/oedo.html'],
      ['tx', 'delayed', 'Delayed', 'https://www.mir.co.jp/info/']
    ]
    for (const [lineId, status, label, url] of cases) {
      const row = rowOf(mountCard(withStatus(lineId, status)), lineId)
      expect(row.text(), `${lineId} label`).toContain(label)
      expect(row.find('a').attributes('href'), `${lineId} href`).toBe(url)
    }
  })

  it('only renders rows for the lines that are present', () => {
    const wrapper = mountCard(allNormal.slice(0, 2))
    expect(wrapper.findAll('li')).toHaveLength(2)
    expect(rowOf(wrapper, 'oedo').exists()).toBe(false)
  })

  it('renders nothing when there are no lines', () => {
    const wrapper = mountCard([])
    expect(wrapper.find('li').exists()).toBe(false)
    expect(wrapper.text().trim()).toBe('')
  })

  it('shows the data attribution with a link to ODPT', () => {
    const wrapper = mountCard(allNormal)
    const text = wrapper.text()
    expect(text).toContain('Tokyo Metro')
    expect(text).toContain('Bureau of Transportation')
    expect(text).toContain('Metropolitan Intercity Railway')
    expect(text).toContain('CC BY 4.0')
    expect(wrapper.find('a[href="https://www.odpt.org/"]').exists()).toBe(true)
    expect(text).toContain('Bureau of Transportation Tokyo Metropolitan Government (CC BY 4.0), Metropolitan Intercity Railway Company')
    expect(text).toContain('Data and line symbols:')
    expect(text).toContain('cropped and resized from the originals')
    const odptLink = wrapper.find('a[href="https://www.odpt.org/"]')
    expect(odptLink.attributes('target')).toBe('_blank')
    expect(odptLink.attributes('rel')).toContain('noopener')
  })

  it('shows Japanese labels when the locale is ja', () => {
    const { setLocale } = useArticleLocale()
    setLocale('ja')
    const wrapper = mountCard(withStatus('hibiya', 'delayed'))
    expect(rowOf(wrapper, 'ginza').text()).toContain('平常')
    expect(rowOf(wrapper, 'hibiya').text()).toContain('遅延')
    expect(rowOf(wrapper, 'hibiya').find('a').text()).toBe('公式サイトで確認')
    // 路線名は英語固定
    expect(rowOf(wrapper, 'hibiya').text()).toContain('Hibiya Line')
  })
})
