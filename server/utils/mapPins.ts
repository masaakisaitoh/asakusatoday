import type Database from 'better-sqlite3'
import { createError } from 'h3'
import { PIN_CATEGORIES, PIN_ICONS, type MapPin } from '../../utils/mapPins'

export function listMapPins(db: Database.Database): MapPin[] {
  return db
    .prepare(`SELECT id, name, description, category, icon, lat, lng, created_at FROM map_pins ORDER BY id DESC`)
    .all() as MapPin[]
}

export interface MapPinInput {
  name: string
  description: string
  category: string
  icon: string
  lat: number
  lng: number
}

function validateInput(input: MapPinInput): void {
  if (!input.name || !input.name.trim()) {
    throw createError({ statusCode: 400, message: 'name is required' })
  }
  if (!(PIN_CATEGORIES as readonly string[]).includes(input.category)) {
    throw createError({ statusCode: 400, message: 'invalid category' })
  }
  if (!(PIN_ICONS as readonly string[]).includes(input.icon)) {
    throw createError({ statusCode: 400, message: 'invalid icon' })
  }
  if (typeof input.lat !== 'number' || Number.isNaN(input.lat) || input.lat < -90 || input.lat > 90) {
    throw createError({ statusCode: 400, message: 'invalid lat' })
  }
  if (typeof input.lng !== 'number' || Number.isNaN(input.lng) || input.lng < -180 || input.lng > 180) {
    throw createError({ statusCode: 400, message: 'invalid lng' })
  }
}

export function createMapPin(db: Database.Database, input: MapPinInput): MapPin {
  validateInput(input)
  const name = input.name.trim()
  const createdAt = new Date().toISOString()
  const result = db
    .prepare(
      `INSERT INTO map_pins (name, description, category, icon, lat, lng, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, input.description, input.category, input.icon, input.lat, input.lng, createdAt)
  return {
    id: Number(result.lastInsertRowid),
    name,
    description: input.description,
    category: input.category as MapPin['category'],
    icon: input.icon as MapPin['icon'],
    lat: input.lat,
    lng: input.lng,
    created_at: createdAt
  }
}

export function updateMapPin(db: Database.Database, id: number, input: MapPinInput): MapPin {
  validateInput(input)
  const existing = db.prepare(`SELECT id FROM map_pins WHERE id = ?`).get(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'pin not found' })
  }
  const name = input.name.trim()
  db.prepare(`UPDATE map_pins SET name = ?, description = ?, category = ?, icon = ?, lat = ?, lng = ? WHERE id = ?`)
    .run(name, input.description, input.category, input.icon, input.lat, input.lng, id)
  return db
    .prepare(`SELECT id, name, description, category, icon, lat, lng, created_at FROM map_pins WHERE id = ?`)
    .get(id) as MapPin
}

export function deleteMapPin(db: Database.Database, id: number): void {
  const existing = db.prepare(`SELECT id FROM map_pins WHERE id = ?`).get(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'pin not found' })
  }
  db.prepare(`DELETE FROM map_pins WHERE id = ?`).run(id)
}
