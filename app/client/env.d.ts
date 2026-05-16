/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

interface Window {
  __onGCastApiAvailable?: (isAvailable: boolean) => void;
  chrome: {
    cast: typeof cast;
  };
  cast: {
    framework: typeof cast.framework;
  };
}

declare namespace cast {
  namespace framework {
    class CastContext {
      static getInstance(): CastContext;
      setOptions(options: CastOptions): void;
      requestSession(): Promise<void>;
      getCurrentSession(): CastSession | null;
      addEventListener(type: CastContextEventType, handler: (event: any) => void): void;
      removeEventListener(type: CastContextEventType, handler: (event: any) => void): void;
    }

    interface CastOptions {
      receiverApplicationId: string;
      autoJoinPolicy: string;
    }

    class CastSession {
      getMediaSession(): chrome.cast.media.Media | null;
      loadMedia(request: chrome.cast.media.LoadRequest): Promise<void>;
      endSession(stopCasting: boolean): void;
    }

    enum CastContextEventType {
      SESSION_STATE_CHANGED = 'sessionstatechanged',
      CAST_STATE_CHANGED = 'caststatechanged',
    }

    enum CastState {
      NO_DEVICES_AVAILABLE = 'NO_DEVICES_AVAILABLE',
      NOT_CONNECTED = 'NOT_CONNECTED',
      CONNECTING = 'CONNECTING',
      CONNECTED = 'CONNECTED',
    }
  }
}

declare namespace chrome.cast {
  namespace media {
    class MediaInfo {
      constructor(contentId: string, contentType: string);
      contentId: string;
      contentType: string;
      metadata: any;
    }

    class LoadRequest {
      constructor(mediaInfo: MediaInfo);
      autoplay: boolean;
    }

    class Media {
      play(request: any, onSuccess: () => void, onError: (err: any) => void): void;
      pause(request: any, onSuccess: () => void, onError: (err: any) => void): void;
      stop(request: any, onSuccess: () => void, onError: (err: any) => void): void;
    }

    class GenericMediaMetadata {
      title: string;
    }
  }

  const AutoJoinPolicy: {
    ORIGIN_SCOPED: string;
  };
}
