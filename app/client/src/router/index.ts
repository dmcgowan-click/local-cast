/**
 * Vue Router configuration. Defines the login and media-browse routes
 * and enforces authentication via a global navigation guard.
 */
import { createRouter, createWebHistory } from 'vue-router';
import Login from '@/components/Login.vue';
import MediaBrowser from '@/components/MediaBrowser.vue';
import { checkSession } from '@/services/api';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: Login },
    { path: '/', name: 'browse', component: MediaBrowser, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(async (to) => {
  if (!to.meta.requiresAuth) return true;

  const authenticated = await checkSession();
  if (!authenticated) return { name: 'login' };
  return true;
});

export default router;
