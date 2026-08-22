<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'
import { buildPrivateKeyFileContent, PRIVATE_KEY_FILE_NAME } from '../../utils/privateKeyFile'

const { t } = useUiText()
const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const understood = ref(false)
const confirmed = ref(false)
const loading = ref(false)
const error = ref('')

function downloadPrivateKeyFile(privateKey: string) {
  const content = buildPrivateKeyFileContent(privateKey, new Date())
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = PRIVATE_KEY_FILE_NAME
  link.click()
  URL.revokeObjectURL(url)
}

async function generate() {
  account.value = await createNewAccount()
  confirmed.value = false
  downloadPrivateKeyFile(account.value.privateKey)
}

async function proceed() {
  if (!account.value || !confirmed.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithAccount(account.value)
    await navigateTo('/profile')
  } catch (e: any) {
    error.value = e?.data?.message ?? t('common.loginFailed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-full flex items-center justify-center px-4 py-12">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-bold text-center">{{ t('createAccount.title') }}</h1>
      </template>

      <div v-if="!account" class="flex flex-col gap-3">
        <p class="text-sm text-muted">{{ t('createAccount.disclosure') }}</p>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="understood" type="checkbox" />
          {{ t('createAccount.understand') }}
        </label>
        <UButton block size="lg" :disabled="!understood" @click="generate">{{ t('createAccount.submit') }}</UButton>
      </div>

      <div v-else class="flex flex-col gap-3">
        <p class="text-sm text-muted">{{ t('createAccount.savePrompt') }}</p>
        <code class="block break-all rounded-md bg-elevated px-3 py-2 text-xs">{{ account.privateKey }}</code>
        <label class="flex items-center gap-2 text-sm">
          <input v-model="confirmed" type="checkbox" />
          {{ t('createAccount.saved') }}
        </label>
        <UButton block size="lg" :loading="loading" :disabled="!confirmed || loading" @click="proceed">
          {{ t('createAccount.continue') }}
        </UButton>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </UCard>
  </div>
</template>
