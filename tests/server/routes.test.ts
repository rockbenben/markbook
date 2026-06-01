import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildApp } from '../../server/routes'

let root: string
let app: Awaited<ReturnType<typeof buildApp>>
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), 'cv-routes-'))
  await writeFile(path.join(root, '第1章.md'), '# 第1章\n正文内容')
  app = await buildApp({ explicitRoot: root, configFile: path.join(root, '.cv.json') })
})
afterEach(async () => { await app.close(); await rm(root, { recursive: true, force: true }) })

describe('routes', () => {
  it('GET /api/chapters 返回有序列表(无正文)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/chapters' })
    expect(res.statusCode).toBe(200)
    const chapters = res.json()
    expect(chapters[0].title).toBe('第1章')
    expect(chapters[0]).not.toHaveProperty('content')
  })
  it('GET /api/chapters/:id/raw 返回正文与 mtime', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const res = await app.inject({ method: 'GET', url: `/api/chapters/${list[0].id}/raw` })
    expect(res.json().content).toContain('正文内容')
    expect(res.json().mtime).toBeGreaterThan(0)
  })
  it('PUT /api/chapters/:id 用过期 baseMtime 返回 409', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const res = await app.inject({
      method: 'PUT', url: `/api/chapters/${list[0].id}`,
      payload: { content: 'x', baseMtime: 1 },
    })
    expect(res.statusCode).toBe(409)
  })
  it('PUT 用正确 baseMtime 写入成功并返回新 mtime', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const raw = (await app.inject({ method: 'GET', url: `/api/chapters/${list[0].id}/raw` })).json()
    const res = await app.inject({
      method: 'PUT', url: `/api/chapters/${list[0].id}`,
      payload: { content: '# 第1章\n改过了', baseMtime: raw.mtime },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().mtime).toBeGreaterThanOrEqual(raw.mtime)
  })
  it('POST /api/tidy 整理目录文件并写回(全角转半角 + 压缩空行)', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const raw = (await app.inject({ method: 'GET', url: `/api/chapters/${list[0].id}/raw` })).json()
    // 先写入带可整理内容:全角数字 + 多余空行
    await app.inject({
      method: 'PUT', url: `/api/chapters/${list[0].id}`,
      payload: { content: '# 第１章\n\n\n\n正文', baseMtime: raw.mtime },
    })
    const res = await app.inject({
      method: 'POST', url: '/api/tidy',
      payload: { options: { halfWidth: true, compressBlankLines: true } },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().changed).toBe(1)
    const after = (await app.inject({ method: 'GET', url: `/api/chapters/${list[0].id}/raw` })).json()
    expect(after.content).toBe('# 第1章\n\n正文')
  })
  it('POST /api/tidy 无改动返回 changed 0', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tidy', payload: { options: { halfWidth: true } } })
    expect(res.json().changed).toBe(0)
  })

  it('GET /api/asset 在根目录内的图片返回 200 + content-type', async () => {
    await writeFile(path.join(root, 'pic.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))
    const res = await app.inject({ method: 'GET', url: '/api/asset?path=' + encodeURIComponent('pic.png') })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/png')
    expect(res.rawPayload.length).toBe(7)
  })
  it('GET /api/asset 目录穿越被拒(403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/asset?path=' + encodeURIComponent('../../etc/hosts') })
    expect(res.statusCode).toBe(403)
  })
  it('GET /api/asset 不存在的资源返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/asset?path=nope.png' })
    expect(res.statusCode).toBe(404)
  })

  it('GET /api/search?q= 命中返回章节', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=正文' })
    expect(res.json()).toHaveLength(1)
  })
  it('PUT /api/config 用不存在的 root 返回 400 且不改配置', async () => {
    const bogus = path.join(os.tmpdir(), 'cv-does-not-exist-' + Math.random().toString(36).slice(2))
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { root: bogus } })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'invalid_root' })
    const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(cfg.root).toBe(root)
  })
  it('PUT /api/config 用非法 sortMode 返回 400 且不改配置', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { sortMode: 'bogus' } })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'invalid_field' })
    const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(cfg.sortMode).not.toBe('bogus')
  })
  it('PUT /api/config 用字符串 ignore(应为数组)返回 400 且不改配置', async () => {
    const before = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { ignore: 'x' } })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'invalid_field' })
    const after = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(after.ignore).toEqual(before.ignore)
  })
  it('PUT /api/config 拒绝持久化未知字段', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { bogusKey: 123 } })
    expect(res.statusCode).toBe(200)
    const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(cfg).not.toHaveProperty('bogusKey')
  })
  it('PUT /api/config 用合法 sortMode 生效', async () => {
    const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { sortMode: 'volume' } })
    expect(res.statusCode).toBe(200)
    const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(cfg.sortMode).toBe('volume')
  })
  it('GET /api/browse?path= 返回子目录列表', async () => {
    await mkdir(path.join(root, '子目录A'))
    const res = await app.inject({ method: 'GET', url: `/api/browse?path=${encodeURIComponent(root)}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.path).toBe(path.resolve(root))
    expect(body.parent).toBe(path.dirname(path.resolve(root)))
    expect(body.dirs).toContain('子目录A')
  })
  it('GET /api/browse 用不存在的目录返回 400', async () => {
    const bogus = path.join(os.tmpdir(), 'cv-browse-missing-' + Math.random().toString(36).slice(2))
    const res = await app.inject({ method: 'GET', url: `/api/browse?path=${encodeURIComponent(bogus)}` })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: 'cannot_read' })
  })
  it('GET /api/browse 也返回 .md/.txt 文件名', async () => {
    await writeFile(path.join(root, 'novel.md'), '# x')
    const res = await app.inject({ method: 'GET', url: `/api/browse?path=${encodeURIComponent(root)}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().files).toContain('novel.md')
    expect(res.json().files).toContain('第1章.md')
  })
  it('PUT /api/config 接受单个文件作为 root,拆成章节', async () => {
    const dir2 = await mkdtemp(path.join(os.tmpdir(), 'cv-sf-routes-'))
    const file = path.join(dir2, 'whole.md')
    try {
      await writeFile(file, '# 第一章\n甲\n# 第二章\n乙\n')
      const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { root: file } })
      expect(res.statusCode).toBe(200)
      const chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      expect(chapters.map((c: { title: string }) => c.title)).toEqual(['第一章', '第二章'])
      // raw + 编辑回环
      const raw = (await app.inject({ method: 'GET', url: `/api/chapters/${chapters[0].id}/raw` })).json()
      expect(raw.content).toContain('甲')
      const put = await app.inject({
        method: 'PUT', url: `/api/chapters/${chapters[0].id}`,
        payload: { content: '# 第一章\n甲改了\n', baseMtime: raw.mtime },
      })
      expect(put.statusCode).toBe(200)
      const raw2 = (await app.inject({ method: 'GET', url: `/api/chapters/${chapters[0].id}/raw` })).json()
      expect(raw2.content).toContain('甲改了')
      // 第二章未受影响
      const list2 = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      const raw3 = (await app.inject({ method: 'GET', url: `/api/chapters/${list2[1].id}/raw` })).json()
      expect(raw3.content).toContain('乙')
    } finally {
      await rm(dir2, { recursive: true, force: true })
    }
  })
  it('POST /api/replace dryRun 预览两章命中,非 dryRun 全部替换', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\n苹果和苹果')
      await writeFile(path.join(dir, '乙.md'), '# 乙\n一个苹果')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        // dryRun:两章都命中,总数 3(2+1)
        const dry = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉', dryRun: true },
        })
        expect(dry.statusCode).toBe(200)
        const dj = dry.json()
        expect(dj.total).toBe(3)
        expect(dj.chapters).toHaveLength(2)
        const counts = Object.fromEntries(dj.chapters.map((c: { title: string; count: number }) => [c.title, c.count]))
        expect(counts['甲']).toBe(2)
        expect(counts['乙']).toBe(1)

        // 非 dryRun:替换 2 章,总数 3
        const run = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉' },
        })
        expect(run.statusCode).toBe(200)
        expect(run.json()).toMatchObject({ replaced: 2, total: 3 })

        // raw 显示替换后的词
        const list = (await app2.inject({ method: 'GET', url: '/api/chapters' })).json()
        for (const c of list) {
          const raw = (await app2.inject({ method: 'GET', url: `/api/chapters/${c.id}/raw` })).json()
          expect(raw.content).toContain('香蕉')
          expect(raw.content).not.toContain('苹果')
        }
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 某文件写入失败时,其余继续并返回 failed 计数', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-fail-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\n苹果')
      await writeFile(path.join(dir, '乙.md'), '# 乙\n苹果')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        // 把乙.md 从磁盘删掉,但 store 内存里仍有它 → replace 时 readRaw 抛错,计入 failed。
        await rm(path.join(dir, '乙.md'))
        const run = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉' },
        })
        expect(run.statusCode).toBe(200)
        const body = run.json()
        expect(body.replaced).toBe(1)
        expect(body.failed).toBe(1)
        // 甲.md 仍被成功替换
        const onDisk = await readFile(path.join(dir, '甲.md'), 'utf8')
        expect(onDisk).toContain('香蕉')
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 全部文件失败返回 500', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-allfail-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\n苹果')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        await rm(path.join(dir, '甲.md'))
        const run = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉' },
        })
        expect(run.statusCode).toBe(500)
        expect(run.json()).toMatchObject({ error: 'replace_failed' })
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 单文件模式:替换命中两个 section,写回磁盘,section 仍可解析', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-sf-'))
    const file = path.join(dir, 'whole.md')
    try {
      await writeFile(file, '# 第一章\n苹果在这\n# 第二章\n还有苹果\n')
      const app2 = await buildApp({ explicitRoot: file, configFile: path.join(dir, '.cv.json') })
      try {
        // dryRun:两 section 命中,总数 2
        const dry = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉', dryRun: true },
        })
        expect(dry.statusCode).toBe(200)
        expect(dry.json().total).toBe(2)
        // apply:replaced=2(含命中的 section 数),total=2
        const run = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉', dryRun: false },
        })
        expect(run.statusCode).toBe(200)
        expect(run.json()).toMatchObject({ replaced: 2, total: 2 })
        // 磁盘文件已替换
        const onDisk = await readFile(file, 'utf8')
        expect(onDisk).toContain('香蕉')
        expect(onDisk).not.toContain('苹果')
        // 替换后 section 仍正常解析(两章标题不变)
        const chapters = (await app2.inject({ method: 'GET', url: '/api/chapters' })).json()
        expect(chapters.map((c: { title: string }) => c.title)).toEqual(['第一章', '第二章'])
        const raw0 = (await app2.inject({ method: 'GET', url: `/api/chapters/${chapters[0].id}/raw` })).json()
        expect(raw0.content).toContain('香蕉在这')
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 单文件模式:无命中返回 {replaced:0,total:0} 且不写盘(mtime 不变)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-sf-nomatch-'))
    const file = path.join(dir, 'whole.md')
    try {
      await writeFile(file, '# 第一章\n苹果\n# 第二章\n香蕉\n')
      const app2 = await buildApp({ explicitRoot: file, configFile: path.join(dir, '.cv.json') })
      try {
        const before = (await stat(file)).mtimeMs
        const run = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '葡萄', replace: 'X', dryRun: false },
        })
        expect(run.statusCode).toBe(200)
        expect(run.json()).toMatchObject({ replaced: 0, total: 0 })
        const after = (await stat(file)).mtimeMs
        expect(after).toBe(before) // 未写盘
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace dryRun 的 total 与 apply 的 total 一致(目录模式)', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-parity-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\n苹果苹果')
      await writeFile(path.join(dir, '乙.md'), '# 乙\n苹果')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        const dry = (await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉', dryRun: true },
        })).json()
        const run = (await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '苹果', replace: '香蕉', dryRun: false },
        })).json()
        expect(dry.total).toBe(3)
        expect(run.total).toBe(dry.total)
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 正则模式:捕获组替换生效,dryRun total == apply total', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-regex-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\n第12章 与 第34节')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        const dry = (await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '(\\d+)', replace: '#$1', useRegex: true, dryRun: true },
        })).json()
        expect(dry.total).toBe(2) // 12, 34
        const run = (await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: '(\\d+)', replace: '#$1', useRegex: true, dryRun: false },
        })).json()
        expect(run.total).toBe(dry.total)
        const list = (await app2.inject({ method: 'GET', url: '/api/chapters' })).json()
        const raw = (await app2.inject({ method: 'GET', url: `/api/chapters/${list[0].id}/raw` })).json()
        expect(raw.content).toContain('第#12章')
        expect(raw.content).toContain('第#34节')
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace 零宽匹配(a*)不死循环,返回有限计数', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-replace-zw-'))
    try {
      await writeFile(path.join(dir, '甲.md'), '# 甲\naaa bbb')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json') })
      try {
        // a* 可匹配空串;lastIndex===0 break 防死循环 → 请求必须返回(不挂起)。
        const res = await app2.inject({
          method: 'POST', url: '/api/replace',
          payload: { find: 'a*', replace: 'X', useRegex: true, dryRun: true },
        })
        expect(res.statusCode).toBe(200)
        const body = res.json()
        expect(Number.isFinite(body.total)).toBe(true)
        expect(body.total).toBeGreaterThanOrEqual(1) // 至少计到一次(aaa)
      } finally {
        await app2.close()
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
  it('POST /api/replace find 为空返回 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/replace', payload: { find: '', replace: 'x' } })
    expect(res.statusCode).toBe(400)
  })
  it('POST /api/replace 非法正则返回 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/replace', payload: { find: '(', replace: 'x', useRegex: true } })
    expect(res.statusCode).toBe(400)
  })
  it('GET /api/export?format=md 返回 markdown 含章节正文', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=md' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/markdown')
    expect(res.body).toContain('正文内容')
    expect(res.headers['content-disposition']).toContain('attachment')
  })
  it('GET /api/export?format=txt 返回纯文本(去标记)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=txt' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/plain')
    expect(res.body).toContain('正文内容')
    // 标题行的 # 标记被去除
    expect(res.body).toContain('第1章')
  })
  it('GET /api/export?format=html 返回自包含 HTML 文档', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=html' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('text/html')
    expect(res.body).toContain('<!doctype html>')
    expect(res.body).toContain('正文内容')
    expect(res.body).toContain('目录')
  })
  it('GET /api/export?format=epub 返回 epub 二进制', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=epub' })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/epub+zip')
    // EPUB 是 zip,以 PK 魔数开头
    expect(res.rawPayload.slice(0, 2).toString('latin1')).toBe('PK')
  })
  it('GET /api/export?format=bad 返回 400', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=bad' })
    expect(res.statusCode).toBe(400)
  })
  it('GET /api/export?scope=vol:不存在 无章节返回 404', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/export?format=md&scope=vol:不存在卷' })
    expect(res.statusCode).toBe(404)
  })
  it('POST /api/chapters 在目录模式新建章节(返回 200,列表新增)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chapters', payload: { title: '崭新一章' } })
    expect(res.statusCode).toBe(200)
    const chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    expect(chapters.some((c: { title: string }) => c.title === '崭新一章')).toBe(true)
  })
  it('POST /api/chapters 标题为空返回 400', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/chapters', payload: { title: '   ' } })
    expect(res.statusCode).toBe(400)
  })
  it('PUT /api/chapters/:id/rename 重命名(目录模式,改写标题行)', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const res = await app.inject({ method: 'PUT', url: `/api/chapters/${list[0].id}/rename`, payload: { title: '换个名字' } })
    expect(res.statusCode).toBe(200)
    const after = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    // 含 # 标题的文件:改写标题行(可见标题变更),文件名不变
    expect(after.some((c: { title: string }) => c.title === '换个名字')).toBe(true)
    expect(after.some((c: { path: string }) => c.path === '第1章.md')).toBe(true)
  })
  it('PUT /api/chapters/:id/rename 标题为空返回 400', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const res = await app.inject({ method: 'PUT', url: `/api/chapters/${list[0].id}/rename`, payload: { title: '' } })
    expect(res.statusCode).toBe(400)
  })
  it('DELETE /api/chapters/:id 删除章节(目录模式)', async () => {
    const list = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    const id = list[0].id
    const res = await app.inject({ method: 'DELETE', url: `/api/chapters/${id}` })
    expect(res.statusCode).toBe(200)
    const after = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
    expect(after.some((c: { id: string }) => c.id === id)).toBe(false)
  })
  it('DELETE /api/chapters/:id 未知 id 返回 404', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/chapters/bm90LWEtcmVhbC1pZA' })
    expect(res.statusCode).toBe(404)
  })
  it('单文件模式:POST 追加 section / PUT rename 改标题 / DELETE 删 section', async () => {
    const dir2 = await mkdtemp(path.join(os.tmpdir(), 'cv-sf-mgmt-'))
    const file = path.join(dir2, 'whole.md')
    try {
      await writeFile(file, '## 第一章\n\n甲\n\n## 第二章\n\n乙\n')
      await app.inject({ method: 'PUT', url: '/api/config', payload: { root: file } })
      // 新建
      const post = await app.inject({ method: 'POST', url: '/api/chapters', payload: { title: '第三章' } })
      expect(post.statusCode).toBe(200)
      let chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      expect(chapters.map((c: { title: string }) => c.title)).toEqual(['第一章', '第二章', '第三章'])
      // 重命名第二章
      const second = chapters[1]
      const ren = await app.inject({ method: 'PUT', url: `/api/chapters/${second.id}/rename`, payload: { title: '贰' } })
      expect(ren.statusCode).toBe(200)
      chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      expect(chapters.map((c: { title: string }) => c.title)).toEqual(['第一章', '贰', '第三章'])
      // 删除第一章
      const del = await app.inject({ method: 'DELETE', url: `/api/chapters/${chapters[0].id}` })
      expect(del.statusCode).toBe(200)
      chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      expect(chapters.map((c: { title: string }) => c.title)).toEqual(['贰', '第三章'])
    } finally {
      await rm(dir2, { recursive: true, force: true })
    }
  })
  it('PUT /api/config 用有效目录切换 root,章节随之更新', async () => {
    const root2 = await mkdtemp(path.join(os.tmpdir(), 'cv-routes2-'))
    try {
      await writeFile(path.join(root2, '第9章.md'), '# 第9章\n新目录正文')
      const res = await app.inject({ method: 'PUT', url: '/api/config', payload: { root: root2 } })
      expect(res.statusCode).toBe(200)
      const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
      expect(cfg.root).toBe(root2)
      const chapters = (await app.inject({ method: 'GET', url: '/api/chapters' })).json()
      expect(chapters).toHaveLength(1)
      expect(chapters[0].title).toBe('第9章')
    } finally {
      await rm(root2, { recursive: true, force: true })
    }
  })

  it('PUT /api/config 不在磁盘写配置文件(服务端不持久化配置)', async () => {
    const cfgPath = path.join(root, '.cv.json')
    await app.inject({ method: 'PUT', url: '/api/config', payload: { sortMode: 'global' } })
    // 服务端只在内存里改;不应写出配置文件。
    await expect(stat(cfgPath)).rejects.toBeDefined()
    const cfg = (await app.inject({ method: 'GET', url: '/api/config' })).json()
    expect(cfg.sortMode).toBe('global') // 内存生效
  })
})

describe('routes 安全(opt-in token / sandbox)', () => {
  it('设了 token:无令牌 401,带令牌放行', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-auth-'))
    try {
      await writeFile(path.join(dir, 'a.md'), '# A\n正文')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json'), token: 'secret' })
      try {
        expect((await app2.inject({ method: 'GET', url: '/api/chapters' })).statusCode).toBe(401)
        expect((await app2.inject({ method: 'GET', url: '/api/chapters', headers: { 'x-cv-token': 'secret' } })).statusCode).toBe(200)
        expect((await app2.inject({ method: 'GET', url: '/api/chapters?token=secret' })).statusCode).toBe(200)
        expect((await app2.inject({ method: 'GET', url: '/api/chapters', headers: { authorization: 'Bearer secret' } })).statusCode).toBe(200)
      } finally { await app2.close() }
    } finally { await rm(dir, { recursive: true, force: true }) }
  })

  it('设了 baseDir:浏览 / 设置根目录越界被拒(403),界内放行', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cv-base-'))
    try {
      await mkdir(path.join(dir, 'sub'))
      await writeFile(path.join(dir, 'a.md'), '# A\n正文')
      const app2 = await buildApp({ explicitRoot: dir, configFile: path.join(dir, '.cv.json'), baseDir: dir })
      try {
        const inside = '/api/browse?path=' + encodeURIComponent(path.join(dir, 'sub'))
        expect((await app2.inject({ method: 'GET', url: inside })).statusCode).toBe(200)
        const outside = path.dirname(dir)
        expect((await app2.inject({ method: 'GET', url: '/api/browse?path=' + encodeURIComponent(outside) })).statusCode).toBe(403)
        expect((await app2.inject({ method: 'PUT', url: '/api/config', payload: { root: outside } })).statusCode).toBe(403)
      } finally { await app2.close() }
    } finally { await rm(dir, { recursive: true, force: true }) }
  })
})
