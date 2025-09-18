/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID: string;
  readonly VITE_ALLOWED_GH_LOGIN: string;
  readonly VITE_REPO_OWNER: string;
  readonly VITE_REPO_NAME: string;
  readonly VITE_DEFAULT_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
