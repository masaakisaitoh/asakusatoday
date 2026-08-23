<script setup lang="ts">
const { t } = useUiText()
</script>

<template>
  <div class="h-full overflow-y-auto flex items-center justify-center px-4 py-12">
    <UCard class="w-full max-w-sm">
      <template #header>
        <h1 class="text-lg font-bold text-center">{{ t('login.title') }}</h1>
      </template>
      <div class="flex flex-col gap-3">
        <UButton to="/account/create" block size="lg">{{ t('login.createAccount') }}</UButton>
        <UButton to="/account/import" block size="lg" variant="outline" color="neutral">
          {{ t('login.loginExisting') }}
        </UButton>
      </div>
    </UCard>
  </div>
</template>
