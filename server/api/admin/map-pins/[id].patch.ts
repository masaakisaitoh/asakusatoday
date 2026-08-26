import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { updateMapPin, type MapPinInput } from '../../../utils/mapPins'

export default defineEventHandler(async (event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody<MapPinInput>(event)
  return updateMapPin(db, id, body)
})
