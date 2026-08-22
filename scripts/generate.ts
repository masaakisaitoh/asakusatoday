import Anthropic from '@anthropic-ai/sdk'
import { useDb } from '../server/utils/db'
import { generateDraftsForUnprocessedSources } from '../server/utils/generator'

async function main() {
  const db = useDb()
  const client = new Anthropic()
  const result = await generateDraftsForUnprocessedSources(db, client)
  console.log(`生成完了: 成功${result.generated}件, 失敗${result.failed}件`)
}

main()
