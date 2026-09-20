import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TRAIN_LINE_META } from './trainLineMeta'

const LINE_IDS = ['ginza', 'hibiya', 'asakusa', 'oedo', 'tx'] as const

const OFFICIAL_HOSTS: Record<(typeof LINE_IDS)[number], string> = {
  ginza: 'www.tokyometro.jp',
  hibiya: 'www.tokyometro.jp',
  asakusa: 'www.kotsu.metro.tokyo.jp',
  oedo: 'www.kotsu.metro.tokyo.jp',
  tx: 'www.mir.co.jp'
}

describe('TRAIN_LINE_META', () => {
  it('has an entry for every line id', () => {
    expect(Object.keys(TRAIN_LINE_META).sort()).toEqual([...LINE_IDS].sort())
  })

  it('points every logo at an existing file under public/', () => {
    for (const id of LINE_IDS) {
      const logo = TRAIN_LINE_META[id].logo
      if (logo === null) continue
      expect(logo.startsWith('/train-logos/'), `${id}: ${logo}`).toBe(true)
      expect(existsSync(join(process.cwd(), 'public', logo)), `${id}: ${logo} is missing`).toBe(true)
    }
  })

  it('uses the operator official https domain for every official link', () => {
    for (const id of LINE_IDS) {
      const url = new URL(TRAIN_LINE_META[id].officialUrl)
      expect(url.protocol, id).toBe('https:')
      expect(url.hostname, id).toBe(OFFICIAL_HOSTS[id])
    }
  })

  it('gives every line a non-empty fallback label', () => {
    for (const id of LINE_IDS) {
      expect(TRAIN_LINE_META[id].fallbackLabel.length, id).toBeGreaterThan(0)
    }
  })
})
