/**
 * Application entry point. Initialises Chromecast discovery, creates the
 * Vue app with client-side routing, and mounts it to the DOM.
 */
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import { initCast } from './services/cast';

initCast();

createApp(App).use(router).mount('#app');
