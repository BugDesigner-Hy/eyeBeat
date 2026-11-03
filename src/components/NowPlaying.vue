<script setup lang="ts">
import { useUiStore } from '../stores/ui'

const ui = useUiStore()
</script>

<template>
  <div v-if="ui.detailOpen" class="np-placeholder">NOW PLAYING</div>
</template>
