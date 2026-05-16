<template>
  <span class="spinner" />
</template>

<style scoped>
.spinner {
  display: inline-block;
  width: 1.25em;
  height: 1.25em;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
