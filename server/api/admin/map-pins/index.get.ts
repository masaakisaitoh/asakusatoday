import { useDb } from '../../../utils/db'
import { requireAdminUser } from '../../../utils/admin'
import { listMapPins } from '../../../utils/mapPins'

export default defineEventHandler((event) => {
  const db = useDb()
  requireAdminUser(db, event)
  return listMapPins(db)
})
