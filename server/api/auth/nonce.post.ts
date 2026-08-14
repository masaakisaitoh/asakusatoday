import { z } from 'zod'
import { useDb } from '../../utils/db'
import { issueNonce } from '../../utils/nonce'

const bodySchema = z.object({ address: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const { address } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()
  return issueNonce(db, address)
})
