<script setup lang="ts">
import { ref } from 'vue'
import { useAccount } from '../../composables/useAccount'
import type { SymbolAccount } from '../../utils/symbolCrypto'
import { buildPrivateKeyFileContent, PRIVATE_KEY_FILE_NAME } from '../../utils/privateKeyFile'

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
    error.value = e?.data?.message ?? 'ログインに失敗しました'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="!account">
      <p>
        この秘密鍵はあなたのアカウントの唯一の証明です。
        サーバーには保存されません。紛失すると二度と復元できません。
        誰にも教えないでください。
      </p>
      <label>
        <input v-model="understood" type="checkbox" />
        内容を理解しました
      </label>
      <button :disabled="!understood" @click="generate">アカウントを新規作成</button>
    </div>

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
