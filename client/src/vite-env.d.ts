/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Same-origin, reverse-proxied API base path. Defaults to '/api' when unset. */
  readonly VITE_BASE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
