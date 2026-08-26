import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { createMapPin, type MapPinInput } from '../../../utils/mapPins'

export default defineEventHandler(async (event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const body = await readBody<MapPinInput>(event)
  return createMapPin(db, body)
})
