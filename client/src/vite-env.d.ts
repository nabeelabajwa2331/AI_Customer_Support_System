/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full API base URL in production, e.g. https://my-api.onrender.com/api. Defaults to /api. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
