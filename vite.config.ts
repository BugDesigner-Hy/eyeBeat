import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { neteaseApi } from './scripts/netease-api-plugin.ts'

const DAY = 86400

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const neteaseBase = env.VITE_NETEASE_API_BASE ?? ''
  // 部署到子路径（如 GitHub Pages 的 /eyeBeat/）时用 BASE_PATH 指定；本地仍为根路径
  const base = (env.BASE_PATH || '/').replace(/\/*$/, '/')

  return {
    base,
    plugins: [
      vue(),
      // 相对路径表示由本地 dev / preview 服务代理到自带的 API 子进程
      neteaseBase.startsWith('/') &&
        neteaseApi({ prefix: neteaseBase.replace(/\/$/, ''), port: Number(env.NETEASE_API_PORT || 3000) }),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          name: 'EyeBeat',
          short_name: 'EyeBeat',
          description: '像素风封面墙音乐播放器',
          lang: 'zh-CN',
          display: 'standalone',
          theme_color: '#0a0c0f',
          background_color: '#0a0c0f',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff,woff2,png}'],
          // 中文像素字体共 1.4MB，按 unicode-range 用到哪片才下哪片，不能预缓存
          globIgnores: ['**/fonts/ark-pixel-12/**'],
          navigateFallbackDenylist: neteaseBase.startsWith('/') ? [new RegExp(`^${neteaseBase}`)] : [],
          runtimeCaching: [
            {
              // 分片文件名是内容哈希，可以一直用缓存；样式表名字固定，需要后台更新
              urlPattern: ({ url }) => url.pathname.includes('/fonts/ark-pixel-12/') && url.pathname.endsWith('.woff2'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'ark-pixel-12',
                expiration: { maxEntries: 80, maxAgeSeconds: 365 * DAY },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('/fonts/ark-pixel-12/ark-pixel-12.css'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'ark-pixel-12-css',
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              // 只缓存带 CORS 的封面；音频流体积大且走 Range 请求，不缓存
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'covers',
                expiration: { maxEntries: 400, maxAgeSeconds: 30 * DAY },
                cacheableResponse: { statuses: [200] },
              },
            },
            {
              urlPattern: ({ url }) => url.hostname === 'api.audius.co' && !url.pathname.endsWith('/stream'),
              handler: 'NetworkFirst',
              options: {
                cacheName: 'audius-api',
                networkTimeoutSeconds: 6,
                expiration: { maxEntries: 60, maxAgeSeconds: DAY },
                cacheableResponse: { statuses: [200] },
              },
            },
          ],
        },
      }),
    ],
  }
})
