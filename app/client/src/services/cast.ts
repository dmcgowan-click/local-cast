/**
 * Google Cast SDK integration. Handles Chromecast discovery, session
 * management, and media loading. Exports reactive state so Vue components
 * can show/hide the Cast button and route playback accordingly.
 */
import { ref } from 'vue';

/** Current Cast SDK state (e.g. NO_DEVICES_AVAILABLE, NOT_CONNECTED, CONNECTED). */
export const castState = ref<string>('NO_DEVICES_AVAILABLE');
/** Whether at least one Chromecast device has been discovered on the LAN. */
export const castAvailable = ref(false);

let initialized = false;

/**
 * Initialises the Cast SDK. Handles the race condition where the SDK
 * may have already called __onGCastApiAvailable before this module loaded.
 */
export function initCast(): void {
  if (initialized) return;
  initialized = true;

  function setupCast() {
    const context = cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: 'CC1AD845',
      autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
    });

    context.addEventListener(cast.framework.CastContextEventType.CAST_STATE_CHANGED, (event: any) => {
      castState.value = event.castState;
      castAvailable.value = event.castState !== cast.framework.CastState.NO_DEVICES_AVAILABLE;
    });
  }

  // If the SDK already called back before this module ran, initialise immediately
  if ((window as any).__castApiAvailable) {
    setupCast();
  }

  window.__onGCastApiAvailable = (isAvailable: boolean) => {
    if (!isAvailable) return;
    setupCast();
  };
}

/** Prompts the user to select a Chromecast device and starts a Cast session. */
export async function requestCastSession(): Promise<void> {
  const context = cast.framework.CastContext.getInstance();
  await context.requestSession();
}

/** Maps a filename extension to its MIME type for Cast media loading. */
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

/** Returns true if the filename has a video extension (mp4, webm). */
export function isVideo(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ['mp4', 'webm'].includes(ext);
}

/**
 * Sends a media load request to the active Chromecast session.
 * If no session exists, prompts the user to select a device first.
 */
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

/** Builds a LoadRequest and sends it to the given Cast session. */
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

/** Ends the current Cast session and stops playback on the device. */
export function stopCasting(): void {
  const context = cast.framework.CastContext.getInstance();
  const session = context.getCurrentSession();
  session?.endSession(true);
}
