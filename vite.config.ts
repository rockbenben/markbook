import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ mode }) => {
  // `vite build --mode static`:纯静态(浏览器)构建,输出到 dist/static,相对 base 便于任意路径托管。
  const isStatic = mode === 'static'
  return {
  root: 'client',
  base: isStatic ? './' : '/',
  plugins: [
    react(),
    // PWA 仅用于静态部署:可安装、离线可读、重复访问秒开;autoUpdate 避免卡旧版本。
    ...(isStatic ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'MarkBook · 文集',
        short_name: 'MarkBook',
        description: '本地 Markdown / 纯文本聚合阅读器,纯本地、零上传',
        lang: 'zh-CN',
        theme_color: '#1677ff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        navigateFallback: 'index.html',
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024, // 主 chunk 较大,放宽预缓存上限
      },
    })] : []),
  ],
  define: { __CV_STATIC__: JSON.stringify(isStatic) },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5179',
      '/ws': { target: 'ws://127.0.0.1:5179', ws: true },
    },
  },
  build: { outDir: isStatic ? '../dist/static' : '../dist/client', emptyOutDir: true },
  test: {
    globals: true,
    // Vitest 4 移除了 environmentMatchGlobs,改用 projects 按目录区分运行环境。
    projects: [
      {
        extends: true,
        test: { name: 'server', environment: 'node', include: ['../tests/server/**/*.test.ts'] },
      },
      {
        extends: true,
        test: { name: 'client', environment: 'jsdom', include: ['../tests/client/**/*.test.ts', '../tests/client/**/*.test.tsx'] },
      },
    ],
  },
  }
})
