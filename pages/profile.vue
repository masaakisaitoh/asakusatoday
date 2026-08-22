<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { COUNTRIES } from '../utils/countries'

const { t } = useUiText()
const { data: user, refresh, error } = await useFetch('/api/user/me', { key: 'current-user' })

if (error.value) {
  await navigateTo('/login')
}

const regenerating = ref(false)

async function regenerateAvatar(): Promise<void> {
  regenerating.value = true
  await $fetch('/api/user/avatar/regenerate', { method: 'POST' })
  await refresh()
  regenerating.value = false
}

async function logout(): Promise<void> {
  await $fetch('/api/auth/logout', { method: 'POST' })
  await navigateTo('/login')
}

function formatJoinedDate(createdAt: string): string {
  return createdAt.slice(0, 10)
}

function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

const genderLabelKeys: Record<string, 'profile.genderMale' | 'profile.genderFemale' | 'profile.genderOther' | 'profile.notSet'> = {
  male: 'profile.genderMale',
  female: 'profile.genderFemale',
  other: 'profile.genderOther',
  unspecified: 'profile.notSet'
}

const themeLabelKeys: Record<'light' | 'dark' | 'system', 'profile.themeLight' | 'profile.themeDark' | 'profile.themeSystem'> = {
  light: 'profile.themeLight',
  dark: 'profile.themeDark',
  system: 'profile.themeSystem'
}

function genderLabel(gender: string | null): string {
  if (!gender) return t('profile.notSet')
  return t(genderLabelKeys[gender] ?? 'profile.notSet')
}

function nationalityLabel(code: string | null): string {
  if (!code) return t('profile.notSet')
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}

type Mode = 'view' | 'edit'
const mode = ref<Mode>('view')

const colorMode = useColorMode()

const profileSchema = computed(() =>
  z.object({
    userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, t('profile.usernameHint')),
    gender: z.enum(['male', 'female', 'other', 'unspecified']),
    birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
    nationality: z.string().length(2).nullable(),
    theme: z.enum(['light', 'dark', 'system'])
  })
)

const formState = ref<{
  userName: string
  gender: 'male' | 'female' | 'other' | 'unspecified'
  birthYear: number | null
  nationality: string | null
  theme: 'light' | 'dark' | 'system'
}>({
  userName: '',
  gender: 'unspecified',
  birthYear: null,
  nationality: null,
  theme: 'light'
})

const genderOptions = computed(() => [
  { label: t('profile.genderMale'), value: 'male' },
  { label: t('profile.genderFemale'), value: 'female' },
  { label: t('profile.genderOther'), value: 'other' },
  { label: t('profile.genderPreferNotToSay'), value: 'unspecified' }
])

const themeOptions = computed(() => [
  { label: t('profile.themeLight'), value: 'light' },
  { label: t('profile.themeDark'), value: 'dark' },
  { label: t('profile.themeSystem'), value: 'system' }
])

const saving = ref(false)
const submitError = ref('')

function startEdit(): void {
  if (!user.value) return
  formState.value = {
    userName: user.value.user_name,
    gender: (user.value.gender as typeof formState.value.gender) ?? 'unspecified',
    birthYear: user.value.birth_year,
    nationality: user.value.nationality,
    theme: user.value.theme
  }
  submitError.value = ''
  mode.value = 'edit'
}

function cancelEdit(): void {
  if (user.value) {
    colorMode.preference = user.value.theme
  }
  mode.value = 'view'
}

watch(
  () => formState.value.theme,
  (value) => {
    colorMode.preference = value
  }
)

async function onSubmit(event: FormSubmitEvent<typeof formState.value>): Promise<void> {
  saving.value = true
  submitError.value = ''
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: event.data })
    await refresh()
    mode.value = 'view'
  } catch (e: any) {
    submitError.value = e?.statusCode === 409 ? t('profile.usernameTaken') : t('profile.genericError')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-if="user" class="max-w-2xl mx-auto px-4 py-8">
    <UCard>
      <div v-if="mode === 'view'" class="flex flex-col gap-4">
        <div class="flex items-center gap-4">
          <UserAvatar :seed="user.avatar_seed" :size="72" />
          <UButton :loading="regenerating" variant="outline" size="sm" @click="regenerateAvatar">
            {{ t('profile.regenerateAvatar') }}
          </UButton>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">{{ t('profile.username') }}</dt>
          <dd>{{ user.user_name }}</dd>
          <dt class="text-muted">{{ t('profile.joined') }}</dt>
          <dd>{{ formatJoinedDate(user.created_at) }}</dd>
          <dt class="text-muted">{{ t('profile.gender') }}</dt>
          <dd>{{ genderLabel(user.gender) }}</dd>
          <dt class="text-muted">{{ t('profile.birthYear') }}</dt>
          <dd>{{ user.birth_year ?? t('profile.notSet') }}</dd>
          <dt class="text-muted">{{ t('profile.nationality') }}</dt>
          <dd>{{ nationalityLabel(user.nationality) }}</dd>
          <dt class="text-muted">{{ t('profile.theme') }}</dt>
          <dd>{{ t(themeLabelKeys[user.theme]) }}</dd>
          <dt class="text-muted">{{ t('profile.walletAddress') }}</dt>
          <dd class="font-mono" :title="user.address">{{ formatAddress(user.address) }}</dd>
        </dl>
        <div class="flex gap-3 pt-2">
          <UButton @click="startEdit">{{ t('profile.editProfile') }}</UButton>
          <UButton variant="outline" color="neutral" @click="logout">{{ t('profile.logOut') }}</UButton>
        </div>
      </div>

      <UForm v-else :schema="profileSchema" :state="formState" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField :label="t('profile.username')" name="userName">
          <UInput v-model="formState.userName" />
        </UFormField>
        <UFormField :label="t('profile.gender')" name="gender">
          <USelect v-model="formState.gender" :items="genderOptions" />
        </UFormField>
        <UFormField :label="t('profile.birthYear')" name="birthYear">
          <UInputNumber
            v-model="formState.birthYear"
            :min="1900"
            :max="new Date().getFullYear()"
            :format-options="{ useGrouping: false }"
          />
        </UFormField>
        <UFormField :label="t('profile.nationality')" name="nationality">
          <USelectMenu
            v-model="formState.nationality"
            :items="COUNTRIES"
            value-key="code"
            label-key="name"
            :placeholder="t('profile.nationalityPlaceholder')"
          />
        </UFormField>
        <UFormField :label="t('profile.theme')" name="theme">
          <USelect v-model="formState.theme" :items="themeOptions" />
        </UFormField>
        <p v-if="submitError" class="text-sm text-error">{{ submitError }}</p>
        <div class="flex gap-3 pt-2">
          <UButton type="submit" :loading="saving">{{ t('profile.save') }}</UButton>
          <UButton variant="outline" color="neutral" :disabled="saving" @click="cancelEdit">
            {{ t('profile.cancel') }}
          </UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>
