import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { deleteMapPin } from '../../../utils/mapPins'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  const id = Number(getRouterParam(event, 'id'))
  deleteMapPin(db, id)
  return { ok: true }
})
