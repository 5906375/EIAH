interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_TOKEN?: string;
  readonly VITE_TENANT_ID?: string;
  readonly VITE_WORKSPACE_ID?: string;
  readonly VITE_CHAT_ROLLOUT_STAGE?: string;
  readonly VITE_PRE_DUIMP_FRONTEND_ENABLED?: string;
  readonly [key: string]: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
