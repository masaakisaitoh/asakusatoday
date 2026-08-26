<script setup lang="ts">
import { computed, ref } from 'vue'
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { PIN_CATEGORIES, PIN_ICONS, type PinCategory, type PinIcon, type MapPin } from '../../utils/mapPins'
import { mapPinCategoryLabelFor } from '../../utils/i18n/mapPinCategoryLabels'

useSeoMeta({ title: 'Map Pin Management', robots: 'noindex, nofollow' })

const { data: pins, error, refresh } = await useFetch<MapPin[]>('/api/admin/map-pins')

const pinSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string(),
  category: z.enum(PIN_CATEGORIES),
  icon: z.enum(PIN_ICONS)
})

const formState = ref<{ name: string; description: string; category: PinCategory; icon: PinIcon }>({
  name: '',
  description: '',
  category: 'spot',
  icon: 'lucide:map-pin'
})
const pickedLat = ref<number | null>(null)
const pickedLng = ref<number | null>(null)
const editingId = ref<number | null>(null)
const saving = ref(false)
const submitError = ref('')

const categoryOptions = PIN_CATEGORIES.map((c) => ({ label: mapPinCategoryLabelFor('en', c), value: c }))

function onPick(lat: number, lng: number): void {
  pickedLat.value = lat
  pickedLng.value = lng
}

function resetForm(): void {
  formState.value = { name: '', description: '', category: 'spot', icon: 'lucide:map-pin' }
  pickedLat.value = null
  pickedLng.value = null
  editingId.value = null
  submitError.value = ''
}

function startEdit(pin: MapPin): void {
  formState.value = {
    name: pin.name,
    description: pin.description,
    category: pin.category,
    icon: pin.icon
  }
  pickedLat.value = pin.lat
  pickedLng.value = pin.lng
  editingId.value = pin.id
  submitError.value = ''
}

async function onSubmit(event: FormSubmitEvent<typeof formState.value>): Promise<void> {
  if (pickedLat.value === null || pickedLng.value === null) {
    submitError.value = 'Select a location on the map first.'
    return
  }
  saving.value = true
  submitError.value = ''
  try {
    const body = { ...event.data, lat: pickedLat.value, lng: pickedLng.value }
    if (editingId.value === null) {
      await $fetch('/api/admin/map-pins', { method: 'POST', body })
    } else {
      await $fetch(`/api/admin/map-pins/${editingId.value}`, { method: 'PATCH', body })
    }
    resetForm()
    await refresh()
  } catch (e: any) {
    submitError.value = e?.data?.message ?? 'Failed to save the pin. Please try again.'
  } finally {
    saving.value = false
  }
}

const pendingDeleteId = ref<number | null>(null)
const deleteModalOpen = computed({
  get: () => pendingDeleteId.value !== null,
  set: (value: boolean) => {
    if (!value) pendingDeleteId.value = null
  }
})

function requestDelete(id: number): void {
  pendingDeleteId.value = id
}

const deleting = ref(false)
async function confirmDelete(): Promise<void> {
  if (pendingDeleteId.value === null || deleting.value) return
  deleting.value = true
  try {
    await $fetch(`/api/admin/map-pins/${pendingDeleteId.value}`, { method: 'DELETE' })
  } finally {
    deleting.value = false
    pendingDeleteId.value = null
    await refresh()
  }
}
</script>

<template>
  <div class="h-full w-full overflow-y-auto max-w-3xl mx-auto px-4 py-8">
    <AdminNav />
    <h1 class="text-2xl font-bold text-primary mb-6">Map Pin Management</h1>
    <p v-if="error" class="text-muted">You do not have access to this page.</p>
    <template v-else>
      <UCard class="mb-8">
        <h2 class="text-lg font-bold text-highlighted mb-4">{{ editingId ? 'Edit Pin' : 'Register a New Pin' }}</h2>
        <UForm :schema="pinSchema" :state="formState" class="flex flex-col gap-4" @submit="onSubmit">
          <UFormField label="Pin name" name="name">
            <UInput v-model="formState.name" />
          </UFormField>
          <UFormField label="Description" name="description">
            <UTextarea v-model="formState.description" :rows="3" autoresize />
          </UFormField>
          <UFormField label="Category" name="category">
            <USelect v-model="formState.category" :items="categoryOptions" />
          </UFormField>
          <UFormField label="Icon" name="icon">
            <div class="grid grid-cols-6 gap-2">
              <button
                v-for="icon in PIN_ICONS"
                :key="icon"
                type="button"
                class="flex h-10 items-center justify-center rounded ring ring-default"
                :class="formState.icon === icon ? 'ring-2 ring-primary bg-elevated' : ''"
                @click="formState.icon = icon"
              >
                <UIcon :name="icon" class="size-5" />
              </button>
            </div>
          </UFormField>
          <UFormField label="Location">
            <p class="text-sm text-muted mb-2">
              {{ pickedLat !== null && pickedLng !== null ? `Selected: ${pickedLat}, ${pickedLng}` : 'Click on the map to set the pin location.' }}
            </p>
            <ClientOnly>
              <AsakusaMap
                pick-mode
                :picked-lat="pickedLat"
                :picked-lng="pickedLng"
                class="h-64 block"
                @pick="onPick"
              />
            </ClientOnly>
          </UFormField>
          <p v-if="submitError" class="text-sm text-error">{{ submitError }}</p>
          <div class="flex gap-3 pt-2">
            <UButton type="submit" :loading="saving">{{ editingId ? 'Update' : 'Register' }}</UButton>
            <UButton v-if="editingId" variant="outline" color="neutral" :disabled="saving" @click="resetForm">
              Cancel
            </UButton>
          </div>
        </UForm>
      </UCard>

      <p v-if="pins && pins.length === 0" class="text-muted">No pins yet.</p>
      <UCard v-for="pin in pins" :key="pin.id" class="mb-4">
        <div class="flex items-center gap-2 mb-2">
          <UIcon :name="pin.icon" class="size-5" />
          <h3 class="font-bold text-highlighted">{{ pin.name }}</h3>
          <span class="text-sm text-muted">({{ mapPinCategoryLabelFor('en', pin.category) }})</span>
        </div>
        <p class="text-sm text-muted mb-4">{{ pin.description }}</p>
        <div class="flex gap-3">
          <UButton variant="outline" @click="startEdit(pin)">Edit</UButton>
          <UButton color="error" variant="outline" @click="requestDelete(pin.id)">Delete</UButton>
        </div>
      </UCard>
    </template>

    <UModal v-model:open="deleteModalOpen" title="Delete pin?" description="This cannot be undone.">
      <template #footer="{ close }">
        <UButton color="neutral" variant="outline" @click="close">Cancel</UButton>
        <UButton color="error" :loading="deleting" @click="confirmDelete">Delete</UButton>
      </template>
    </UModal>
  </div>
</template>
