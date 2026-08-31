import { getTrainStatus } from '../../utils/trainStatus'

export default defineEventHandler(() => {
  return getTrainStatus()
})
