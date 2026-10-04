import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 打磨稿(design-preview/*.html)只在 dev 同源可达,供稿子里的活 iframe 挂真页面。
 * 它绝不能放进 client/public:publicDir 会被构建原样复制进产物,而 workbox 的
 * globPatterns 含 html —— 内部评审稿就会被部署出去并长期缓存。
 */
function serveDesignPreview(): Plugin {
  const dir = fileURLToPath(new URL('./design-preview', import.meta.url))
  return {
    name: 'serve-design-preview',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/design-preview', (req, res, next) => {
        // basename 一刀:请求里带 ../ 也走不出这个目录。
        const file = path.join(dir, path.basename(req.url.split('?')[0]))
        if (!file.startsWith(dir) || !fs.existsSync(file)) return next()
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        fs.createReadStream(file).pipe(res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // `vite build --mode static`:纯静态(浏览器)构建,输出到 dist/static,相对 base 便于任意路径托管。
  const isStatic = mode === 'static'
  return {
  root: 'client',
  base: isStatic ? './' : '/',
  plugins: [
    react(),
    serveDesignPreview(),
    // PWA 仅用于静态部署:可安装、离线可读、重复访问秒开;autoUpdate 避免卡旧版本。
    ...(isStatic ? [VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        // 安装名不带「· 文集」:英文界面用户装出来的应用若叫中文名，既读不出也搜不到。
        // 中文题旨留在 description 里，并给英文界面用户一句对应的译文。
        name: 'MarkBook',
        short_name: 'MarkBook',
        description: '散落文本，聚合成书 · Scattered text, gathered into one local-first book',
        lang: 'zh-CN',
        theme_color: '#2c5a80',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
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
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['../tests/client/**/*.test.ts', '../tests/client/**/*.test.tsx'],
          // 界面语言默认跟随 navigator.language(jsdom 里是 en-US);现有断言写的是中文渲染,
          // 故用 setup 把语言钉死为 zh,保证测试结果确定。
          setupFiles: ['./test-setup.ts'],
        },
      },
    ],
  },
  }
})
