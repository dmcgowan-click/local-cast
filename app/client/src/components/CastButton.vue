<template>
  <button
    v-if="castAvailable"
    class="cast-btn"
    :class="{ connected: isConnected }"
    :title="isConnected ? 'Connected to Chromecast' : 'Cast to device'"
    @click="handleClick"
  >
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
    </svg>
  </button>
</template>

<script setup lang="ts">
/**
 * Chromecast button. Visible only when a Cast device is discovered on the LAN.
 * Toggles between starting and ending a Cast session.
 */
import { computed } from 'vue';
import { castState, castAvailable, requestCastSession, stopCasting } from '@/services/cast';

const isConnected = computed(() => castState.value === 'CONNECTED');

/** Toggles the Cast session — connects if idle, disconnects if active. */
function handleClick() {
  if (isConnected.value) {
    stopCasting();
  } else {
    requestCastSession();
  }
}
</script>

<style scoped>
.cast-btn {
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 6px;
  display: flex;
  align-items: center;
}

.cast-btn:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.cast-btn.connected {
  color: #4a9eff;
}
</style>
