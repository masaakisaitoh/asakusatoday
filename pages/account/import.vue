<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'

const { t } = useUiText()
const { importExistingAccount, loginWithAccount } = useAccount()
const privateKeyInput = ref('')
const loading = ref(false)
const error = ref('')

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const account = await importExistingAccount(privateKeyInput.value.trim())
    await loginWithAccount(account)
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
        <h1 class="text-lg font-bold text-center">{{ t('importAccount.title') }}</h1>
      </template>
      <div class="flex flex-col gap-3">
        <UTextarea v-model="privateKeyInput" :placeholder="t('importAccount.placeholder')" :rows="4" autoresize />
        <UButton block size="lg" :loading="loading" :disabled="loading" @click="submit">
          {{ t('importAccount.submit') }}
        </UButton>
        <p v-if="error" class="text-sm text-error">{{ error }}</p>
      </div>
    </UCard>
  </div>
</template>
