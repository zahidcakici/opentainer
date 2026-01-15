import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // Tauri expects a fixed port for its dev server
    server: {
        port: 1420,
        strictPort: true,
        host: process.env.TAURI_DEV_HOST || false,
        hmr: process.env.TAURI_DEV_HOST
            ? {
                protocol: "ws",
                host: process.env.TAURI_DEV_HOST,
                port: 1421,
            }
            : undefined,
        watch: {
            // tell vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**"],
        },
    },
    // to make use of `TAURI_DEBUG` and other env variables
    envPrefix: ["VITE_", "TAURI_"],
    clearScreen: false,
    build: {
        minify: 'esbuild',
    },
    // @ts-ignore
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './src/test/setup.ts',
    }
})
