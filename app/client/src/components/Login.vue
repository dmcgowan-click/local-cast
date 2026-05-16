<template>
  <div class="login-page">
    <form class="login-form" @submit.prevent="handleLogin">
      <h1>Local Cast</h1>
      <div v-if="error" class="error">{{ error }}</div>
      <input v-model="username" type="text" placeholder="Username" autocomplete="username" required />
      <input v-model="password" type="password" placeholder="Password" autocomplete="current-password" required />
      <button type="submit" :disabled="loading">
        <LoadingSpinner v-if="loading" />
        <span v-else>Sign in</span>
      </button>
    </form>
  </div>
</template>

<script setup lang="ts">
/**
 * Login form component. Collects credentials and redirects
 * to the media browser on successful authentication.
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { login } from '@/services/api';
import LoadingSpinner from './LoadingSpinner.vue';

const router = useRouter();
const username = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

/** Submits credentials to the login endpoint and navigates on success. */
async function handleLogin() {
  error.value = '';
  loading.value = true;
  try {
    await login(username.value, password.value);
    router.push('/');
  } catch (err: any) {
    error.value = err.message || 'Login failed';
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;
  max-width: 320px;
  padding: 2rem;
}

.login-form h1 {
  text-align: center;
  margin: 0 0 0.5rem;
}

.login-form input {
  padding: 0.75rem;
  border: 1px solid #444;
  border-radius: 6px;
  background: #1e1e1e;
  color: #e0e0e0;
  font-size: 1rem;
}

.login-form button {
  padding: 0.75rem;
  border: none;
  border-radius: 6px;
  background: #4a9eff;
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
}

.login-form button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  background: #5c1a1a;
  color: #ff8a8a;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  font-size: 0.875rem;
}
</style>
