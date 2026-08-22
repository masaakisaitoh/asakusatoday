<script setup lang="ts">
import { ref } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { COUNTRIES } from '../utils/countries'

const { data: user, refresh, error } = await useFetch('/api/user/me')

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

const GENDER_LABELS: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  unspecified: 'Not set'
}

function genderLabel(gender: string | null): string {
  if (!gender) return 'Not set'
  return GENDER_LABELS[gender] ?? 'Not set'
}

function nationalityLabel(code: string | null): string {
  if (!code) return 'Not set'
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}

type Mode = 'view' | 'edit'
const mode = ref<Mode>('view')

const profileSchema = z.object({
  userName: z.string().regex(/^[A-Za-z0-9_-]{3,32}$/, 'Use 3-32 letters, numbers, _ or -'),
  gender: z.enum(['male', 'female', 'other', 'unspecified']),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).nullable(),
  nationality: z.string().length(2).nullable()
})
type ProfileFormState = z.infer<typeof profileSchema>

const formState = ref<ProfileFormState>({
  userName: '',
  gender: 'unspecified',
  birthYear: null,
  nationality: null
})

const genderOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Other', value: 'other' },
  { label: 'Prefer not to say', value: 'unspecified' }
]

const saving = ref(false)
const submitError = ref('')

function startEdit(): void {
  if (!user.value) return
  formState.value = {
    userName: user.value.user_name,
    gender: (user.value.gender as ProfileFormState['gender']) ?? 'unspecified',
    birthYear: user.value.birth_year,
    nationality: user.value.nationality
  }
  submitError.value = ''
  mode.value = 'edit'
}

function cancelEdit(): void {
  mode.value = 'view'
}

async function onSubmit(event: FormSubmitEvent<ProfileFormState>): Promise<void> {
  saving.value = true
  submitError.value = ''
  try {
    await $fetch('/api/user/profile', { method: 'PATCH', body: event.data })
    await refresh()
    mode.value = 'view'
  } catch (e: any) {
    submitError.value =
      e?.statusCode === 409 ? 'This username is already taken.' : 'Something went wrong. Please try again.'
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
            Regenerate avatar
          </UButton>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt class="text-muted">Username</dt>
          <dd>{{ user.user_name }}</dd>
          <dt class="text-muted">Joined</dt>
          <dd>{{ formatJoinedDate(user.created_at) }}</dd>
          <dt class="text-muted">Gender</dt>
          <dd>{{ genderLabel(user.gender) }}</dd>
          <dt class="text-muted">Birth year</dt>
          <dd>{{ user.birth_year ?? 'Not set' }}</dd>
          <dt class="text-muted">Nationality</dt>
          <dd>{{ nationalityLabel(user.nationality) }}</dd>
          <dt class="text-muted">Wallet address</dt>
          <dd class="font-mono" :title="user.address">{{ formatAddress(user.address) }}</dd>
        </dl>
        <div class="flex gap-3 pt-2">
          <UButton @click="startEdit">Edit profile</UButton>
          <UButton variant="outline" color="neutral" @click="logout">Log out</UButton>
        </div>
      </div>

      <UForm v-else :schema="profileSchema" :state="formState" class="flex flex-col gap-4" @submit="onSubmit">
        <UFormField label="Username" name="userName">
          <UInput v-model="formState.userName" />
        </UFormField>
        <UFormField label="Gender" name="gender">
          <USelect v-model="formState.gender" :items="genderOptions" />
        </UFormField>
        <UFormField label="Birth year" name="birthYear">
          <UInputNumber v-model="formState.birthYear" :min="1900" :max="new Date().getFullYear()" />
        </UFormField>
        <UFormField label="Nationality" name="nationality">
          <USelectMenu
            v-model="formState.nationality"
            :items="COUNTRIES"
            value-key="code"
            label-key="name"
            placeholder="Select a country"
          />
        </UFormField>
        <p v-if="submitError" class="text-sm text-error">{{ submitError }}</p>
        <div class="flex gap-3 pt-2">
          <UButton type="submit" :loading="saving">Save</UButton>
          <UButton variant="outline" color="neutral" :disabled="saving" @click="cancelEdit">Cancel</UButton>
        </div>
      </UForm>
    </UCard>
  </div>
</template>
