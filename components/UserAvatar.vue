<script setup lang="ts">
import { computed } from 'vue'
import { createAvatar } from '@dicebear/core'
import { pixelArt } from '@dicebear/collection'

const props = defineProps<{ seed: string; size?: number }>()

const svg = computed(() =>
  createAvatar(pixelArt, { seed: props.seed, size: props.size ?? 96 }).toString()
)
</script>

<template>
  <div class="user-avatar" v-html="svg" />
</template>
