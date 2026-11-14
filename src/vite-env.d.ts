/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
    /** Overrides the URL of the online template catalog (`index.json`). */
    readonly VITE_CATALOG_URL?: string;
}
