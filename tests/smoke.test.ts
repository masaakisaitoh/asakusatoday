// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'

describe('app boots', async () => {
  await setup({ server: true })

  it('serves the root page', async () => {
    const html = await $fetch('/')
    expect(html).toContain('ASAKUSA TODAY')
  })
})
