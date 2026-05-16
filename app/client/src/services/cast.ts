import { ref } from 'vue';

export const castState = ref<string>('NO_DEVICES_AVAILABLE');
export const castAvailable = ref(false);

let initialized = false;

export function initCast(): void {
  if (initialized) return;
  initialized = true;

  window.__onGCastApiAvailable = (isAvailable: boolean) => {
    if (!isAvailable) return;

    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: 'CC1AD845',
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (event: any) => {
      castState.value = event.castState;
      castAvailable.value = event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
    });
  };
}

export async function requestCastSession(): Promise<void> {
  const context = cast.framework.CastContext.getInstance();
  await context.requestSession();
}

export function getContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const types: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
  };
  return types[ext] ?? 'video/mp4';
}

export function isVideo(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'webm'].includes(ext);
}

export async function castMedia(url: string, title: string, contentType: string): Promise<void> {
  const context = cast.framework.CastContext.getInstance();
  const session = context.getCurrentSession();
  if (!session) {
    await context.requestSession();
    const newSession = context.getCurrentSession();
    if (!newSession) throw new Error('Failed to start Cast session');
    return loadMedia(newSession, url, title, contentType);
  }
  return loadMedia(session, url, title, contentType);
}

async function loadMedia(
  session: cast.framework.CastSession,
  url: string,
  title: string,
  contentType: string,
): Promise<void> {
  const mediaInfo = new chrome.cast.media.MediaInfo(url, contentType);
  const metadata = new chrome.cast.media.GenericMediaMetadata();
  metadata.title = title;
  mediaInfo.metadata = metadata;

  const request = new chrome.cast.media.LoadRequest(mediaInfo);
  request.autoplay = true;
  await session.loadMedia(request);
}

export function stopCasting(): void {
  const context = cast.framework.CastContext.getInstance();
  const session = context.getCurrentSession();
  session?.endSession(true);
}
