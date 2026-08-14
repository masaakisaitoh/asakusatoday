<script setup lang="ts">
import { ref } from 'vue'

const { data: user, refresh } = await useFetch('/api/user/me')
const regenerating = ref(false)

async function regenerateAvatar() {
  regenerating.value = true
  await $fetch('/api/user/avatar/regenerate', { method: 'POST' })
  await refresh()
  regenerating.value = false
}

async function logout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}
</script>

<template>
  <div v-if="user">
    <UserAvatar :seed="user.avatar_seed" />
    <button :disabled="regenerating" @click="regenerateAvatar">作り直す</button>
    <p>{{ user.user_name }}</p>
    <button @click="logout">ログアウト</button>
  </div>
</template>
