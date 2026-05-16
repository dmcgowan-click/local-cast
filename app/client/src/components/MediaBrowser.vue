<template>
  <div class="browser">
    <header class="toolbar">
      <h1>Local Cast</h1>
      <div class="toolbar-right">
        <CastButton />
        <button class="logout-btn" @click="handleLogout">Logout</button>
      </div>
    </header>

    <nav class="breadcrumb">
      <button @click="navigateTo('')">Home</button>
      <template v-for="(crumb, i) in breadcrumbs" :key="i">
        <span class="sep">/</span>
        <button @click="navigateTo(crumb.prefix)">{{ crumb.name }}</button>
      </template>
    </nav>

    <div v-if="loading" class="loading-state">
      <LoadingSpinner /> Loading...
    </div>

    <div v-else-if="error" class="error-state">
      {{ error }}
      <button @click="load(currentPrefix)">Retry</button>
    </div>

    <div v-else class="file-list">
      <div
        v-for="folder in folders"
        :key="folder"
        class="item folder"
        @click="navigateTo(folder)"
      >
        <span class="icon">📁</span>
        <span class="name">{{ displayName(folder) }}</span>
      </div>
      <div
        v-for="file in files"
        :key="file.key"
        class="item file"
        @click="playFile(file)"
      >
        <span class="icon">{{ isVideoFile(file.name) ? '🎬' : '🎵' }}</span>
        <span class="name">{{ file.name }}</span>
        <span class="size">{{ formatSize(file.size) }}</span>
      </div>
      <div v-if="!folders.length && !files.length" class="empty">
        No media files found
      </div>
    </div>

    <!-- Local playback -->
    <div v-if="playbackUrl" class="player">
      <div class="player-header">
        <span class="player-title">{{ playbackTitle }}</span>
        <button class="close-btn" @click="closePlayer">✕</button>
      </div>
      <video
        v-if="playbackIsVideo"
        :src="playbackUrl"
        controls
        autoplay
        class="media-player"
      />
      <audio
        v-else
        :src="playbackUrl"
        controls
        autoplay
        class="media-player"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { browse, getSignedUrl, logout } from '@/services/api';
import { castAvailable, castState, castMedia, getContentType, isVideo } from '@/services/cast';
import CastButton from './CastButton.vue';
import LoadingSpinner from './LoadingSpinner.vue';

const router = useRouter();

const currentPrefix = ref('');
const folders = ref<string[]>([]);
const files = ref<{ key: string; name: string; size: number; lastModified: string }[]>([]);
const loading = ref(false);
const error = ref('');

const playbackUrl = ref('');
const playbackTitle = ref('');
const playbackIsVideo = ref(false);

const breadcrumbs = computed(() => {
  if (!currentPrefix.value) return [];
  const parts = currentPrefix.value.replace(/\/$/, '').split('/');
  return parts.map((part, i) => ({
    name: part,
    prefix: parts.slice(0, i + 1).join('/') + '/',
  }));
});

function displayName(folder: string): string {
  const parts = folder.replace(/\/$/, '').split('/');
  return parts[parts.length - 1];
}

function isVideoFile(name: string): boolean {
  return isVideo(name);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function load(prefix: string) {
  loading.value = true;
  error.value = '';
  try {
    const result = await browse(prefix);
    folders.value = result.folders;
    files.value = result.files;
    currentPrefix.value = prefix;
  } catch (err: any) {
    error.value = err.message || 'Failed to load';
  } finally {
    loading.value = false;
  }
}

function navigateTo(prefix: string) {
  load(prefix);
}

async function playFile(file: { key: string; name: string }) {
  loading.value = true;
  try {
    const url = await getSignedUrl(file.key);
    const contentType = getContentType(file.name);

    if (castAvailable.value && castState.value === 'CONNECTED') {
      await castMedia(url, file.name, contentType);
    } else if (castAvailable.value) {
      try {
        await castMedia(url, file.name, contentType);
      } catch {
        playLocally(url, file.name);
      }
    } else {
      playLocally(url, file.name);
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to play';
  } finally {
    loading.value = false;
  }
}

function playLocally(url: string, name: string) {
  playbackUrl.value = url;
  playbackTitle.value = name;
  playbackIsVideo.value = isVideo(name);
}

function closePlayer() {
  playbackUrl.value = '';
}

async function handleLogout() {
  await logout();
  router.push('/login');
}

onMounted(() => load(''));
</script>

<style scoped>
.browser {
  max-width: 800px;
  margin: 0 auto;
  padding: 1rem;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.toolbar h1 {
  font-size: 1.25rem;
  margin: 0;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logout-btn {
  background: none;
  border: 1px solid #555;
  color: #ccc;
  padding: 0.4rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.875rem;
}

.logout-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.breadcrumb button {
  background: none;
  border: none;
  color: #4a9eff;
  cursor: pointer;
  padding: 0.25rem 0.4rem;
  border-radius: 4px;
  font-size: 0.875rem;
}

.breadcrumb button:hover {
  background: rgba(74, 158, 255, 0.15);
}

.sep {
  color: #666;
  font-size: 0.875rem;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: center;
  padding: 3rem;
  color: #aaa;
}

.error-state {
  text-align: center;
  padding: 2rem;
  color: #ff8a8a;
}

.error-state button {
  margin-top: 1rem;
  background: #333;
  border: 1px solid #555;
  color: #ccc;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
}

.file-list {
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border-radius: 6px;
  cursor: pointer;
}

.item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.icon {
  flex-shrink: 0;
}

.name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.size {
  color: #888;
  font-size: 0.8rem;
  white-space: nowrap;
}

.empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.player {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 0.75rem;
}

.player-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.player-title {
  font-size: 0.875rem;
  color: #ccc;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.25rem;
  padding: 0.25rem;
}

.media-player {
  width: 100%;
  max-height: 300px;
}
</style>
