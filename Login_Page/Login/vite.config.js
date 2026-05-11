import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // test config is picked up by vitest automatically when present in defineConfig

  return {
    plugins: [react()],
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/__tests__/setup.js'],
    },
    server: {
      proxy: {
        // Proxy all /api/now/* calls to your ServiceNow PDI
        // This bypasses browser CORS restrictions during development
        '/api/now': {
          target: env.VITE_SN_INSTANCE || 'https://dev286774.service-now.com',
          changeOrigin: true,
          secure: true,
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Attach Basic Auth header server-side (avoids CORS preflight issues)
              const username = env.VITE_SN_USERNAME || 'admin'
              const password = env.VITE_SN_PASSWORD || ''
              const token = Buffer.from(`${username}:${password}`).toString('base64')
              proxyReq.setHeader('Authorization', `Basic ${token}`)
              proxyReq.setHeader('Content-Type', 'application/json')
              proxyReq.setHeader('Accept', 'application/json')
            })
          },
        },
      },
    },
  }
})
