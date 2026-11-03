/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MUSIC_PROVIDER?: string
  readonly VITE_AUDIUS_API_BASE?: string
  readonly VITE_NETEASE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
