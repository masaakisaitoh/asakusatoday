import { useDb } from '../../utils/db'
import { listMapPins } from '../../utils/mapPins'

export default defineEventHandler(() => {
  const db = useDb()
  return listMapPins(db)
})
