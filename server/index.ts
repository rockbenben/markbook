import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fastifyStatic from '@fastify/static'
import open from 'open'
import { buildApp } from './routes'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  // 显式指定优先(CLI 参数或 CV_ROOT);否则使用已保存配置;首次启动回退到 cwd。
  const explicitRoot = process.argv[2] ?? process.env.CV_ROOT // 可能是 undefined
  const port = Number(process.env.CV_PORT ?? 5179)
  const host = process.env.CV_HOST ?? '127.0.0.1' // 默认只听本机;对外需显式设 CV_HOST
  const token = process.env.CV_TOKEN || undefined  // 设置后 /api 与 /ws 需带令牌
  const baseDir = process.env.CV_BASE || undefined // 设置后浏览/根目录被限制在此目录内
  const configFile = path.join(os.homedir(), '.chapter-viewer', 'config.json')

  const app = await buildApp({ explicitRoot, configFile, token, baseDir })

  // 生产:serve 构建好的前端;开发由 vite dev server 提供
  const clientDir = path.resolve(__dirname, '../client')
  await app.register(fastifyStatic, { root: clientDir, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api') || req.url.startsWith('/ws')) return reply.code(404).send()
    return reply.sendFile('index.html')
  })

  await app.listen({ port, host })
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`
  const effectiveRoot = (app as unknown as { effectiveRoot: string }).effectiveRoot
  console.log(`Chapter viewer running at ${url}  (root: ${effectiveRoot})`)
  const exposed = host !== '127.0.0.1' && host !== 'localhost' && host !== '::1'
  if (exposed && !token) {
    console.warn('[安全警告] 已对外暴露(CV_HOST=' + host + ')但未设置 CV_TOKEN——任何人都能浏览并读写此服务器上的文件。' +
      '强烈建议设置 CV_TOKEN 鉴权,并用 CV_BASE 把可访问范围限制在某个目录内。')
  }
  if (!process.env.CV_NO_OPEN) await open(url)
}

main().catch((e) => { console.error(e); process.exit(1) })
