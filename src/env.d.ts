/// <reference types="vite/client" />

interface Window {
  webkitAudioContext: typeof AudioContext;
  gtag?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
}

interface ImportMetaEnv {
  readonly VITE_GA_ID?: string;
  readonly VITE_CRONFORMER_API_URL?: string;
  readonly VITE_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
