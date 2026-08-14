<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'

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
    error.value = e?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <textarea v-model="privateKeyInput" placeholder="秘密鍵を貼り付け" />
    <button :disabled="loading" @click="submit">ログイン</button>
    <p v-if="error">{{ error }}</p>
  </div>
</template>
