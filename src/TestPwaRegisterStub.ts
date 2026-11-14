/**
 * Test stand-in for `virtual:pwa-register/react`, which only exists inside a vite-plugin-pwa build.
 * vitest.config.ts aliases the module here; tests replace it with `vi.mock` as needed.
 */
const useRegisterSW = () => ({
    needRefresh: [false, () => undefined] as const,
    offlineReady: [false, () => undefined] as const,
    updateServiceWorker: async () => undefined,
});

export { useRegisterSW };
