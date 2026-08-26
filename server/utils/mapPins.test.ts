import { describe, it, expect, beforeEach } from 'vitest'

beforeEach(() => {
  process.env.DATABASE_PATH = ':memory:'
})

const validInput = {
  name: 'Kaminarimon',
  description: 'The iconic gate of Senso-ji.',
  category: 'spot' as const,
  icon: 'lucide:landmark' as const,
  lat: 35.7148,
  lng: 139.7967
}

describe('listMapPins', () => {
  it('returns an empty array when there are no pins', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { listMapPins } = await import('./mapPins')
    expect(listMapPins(db)).toEqual([])
  })

  it('returns pins ordered by id desc', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin, listMapPins } = await import('./mapPins')
    createMapPin(db, { ...validInput, name: 'First' })
    createMapPin(db, { ...validInput, name: 'Second' })
    const result = listMapPins(db)
    expect(result.map((p) => p.name)).toEqual(['Second', 'First'])
  })
})

describe('createMapPin', () => {
  it('inserts a pin and returns it with id and created_at', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    const pin = createMapPin(db, validInput)
    expect(pin.id).toBeGreaterThan(0)
    expect(pin.name).toBe('Kaminarimon')
    expect(pin.created_at).toBeTruthy()
  })

  it('trims the name', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    const pin = createMapPin(db, { ...validInput, name: '  Spaced  ' })
    expect(pin.name).toBe('Spaced')
  })

  it('throws for an empty name', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    expect(() => createMapPin(db, { ...validInput, name: '   ' })).toThrow()
  })

  it('throws for an invalid category', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    expect(() => createMapPin(db, { ...validInput, category: 'not-a-category' as any })).toThrow()
  })

  it('throws for an invalid icon', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    expect(() => createMapPin(db, { ...validInput, icon: 'lucide:not-a-real-icon' as any })).toThrow()
  })

  it('throws for an out-of-range lat', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    expect(() => createMapPin(db, { ...validInput, lat: 200 })).toThrow()
  })

  it('throws for an out-of-range lng', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin } = await import('./mapPins')
    expect(() => createMapPin(db, { ...validInput, lng: -200 })).toThrow()
  })
})

describe('updateMapPin', () => {
  it('updates an existing pin', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin, updateMapPin } = await import('./mapPins')
    const pin = createMapPin(db, validInput)
    const updated = updateMapPin(db, pin.id, { ...validInput, name: 'Updated Name', category: 'restaurant' })
    expect(updated.name).toBe('Updated Name')
    expect(updated.category).toBe('restaurant')
    expect(updated.id).toBe(pin.id)
  })

  it('throws 404 for a non-existent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { updateMapPin } = await import('./mapPins')
    expect(() => updateMapPin(db, 999, validInput)).toThrow()
  })

  it('throws for an invalid category on update', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin, updateMapPin } = await import('./mapPins')
    const pin = createMapPin(db, validInput)
    expect(() => updateMapPin(db, pin.id, { ...validInput, category: 'nope' as any })).toThrow()
  })
})

describe('deleteMapPin', () => {
  it('deletes an existing pin', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { createMapPin, deleteMapPin, listMapPins } = await import('./mapPins')
    const pin = createMapPin(db, validInput)
    deleteMapPin(db, pin.id)
    expect(listMapPins(db)).toEqual([])
  })

  it('throws 404 for a non-existent id', async () => {
    const { useDb, resetDbForTests } = await import('./db')
    resetDbForTests()
    const db = useDb()
    const { deleteMapPin } = await import('./mapPins')
    expect(() => deleteMapPin(db, 999)).toThrow()
  })
})
