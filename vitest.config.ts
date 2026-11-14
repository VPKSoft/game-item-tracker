import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    resolve: {
        // The PWA plugin's virtual module exists only in app builds.
        alias: { "virtual:pwa-register/react": fileURLToPath(new URL("./src/TestPwaRegisterStub.ts", import.meta.url)) },
    },
    test: {
        environment: "jsdom",
        setupFiles: ["./src/TestSetup.ts"],
        include: ["src/**/*.test.{ts,tsx}", "scripts/**/*.test.ts"],
        css: false,
    },
});
