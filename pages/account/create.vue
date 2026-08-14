<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'

const { createNewAccount, loginWithAccount } = useAccount()
const account = ref<SymbolAccount | null>(null)
const confirmed = ref(false)
const loading = ref(false)
const error = ref('')

async function generate() {
  account.value = await createNewAccount()
  confirmed.value = false
}

async function proceed() {
  if (!account.value || !confirmed.value) return
  loading.value = true
  error.value = ''
  try {
    await loginWithAccount(account.value)
    await navigateTo('/profile')
  } catch (e: any) {
    error.value = e?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <button v-if="!account" @click="generate">アカウントを新規作成</button>

    <div v-else>
      <p>この秘密鍵を必ず保存してください。再表示はできません。</p>
      <code>{{ account.privateKey }}</code>
      <label>
        <input v-model="confirmed" type="checkbox" />
        秘密鍵を保存しました
      </label>
      <button :disabled="!confirmed || loading" @click="proceed">続ける</button>
      <p v-if="error">{{ error }}</p>
    </div>
  </div>
</template>
