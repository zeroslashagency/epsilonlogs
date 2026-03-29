import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import type { ClientRequest, IncomingMessage } from 'http'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    optimizeDeps: {
        exclude: ['exceljs'],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "./src"),
        },
    },
    server: {
        proxy: {
            '/api/v1': {
                target: 'https://www.epsilonengg.site',
                changeOrigin: true,
                secure: false,
                configure: (proxy) => {
                    proxy.on('proxyReq', (proxyReq: ClientRequest, req: IncomingMessage) => {
                        if (req.headers.cookie) {
                            proxyReq.removeHeader('cookie')
                        }
                        proxyReq.removeHeader('origin')
                        proxyReq.removeHeader('referer')
                    })
                },
            },
            '/api/v2': {
                target: 'https://app.epsilonengg.in',
                changeOrigin: true,
                secure: false,
            }
        }
    }
})
