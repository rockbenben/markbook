import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { api } from '../../client/src/api'
import { saveBrowserConfig, loadBrowserConfig } from '../../client/src/backend/browserConfig'

function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
}

// 非静态构建下 api === serverApi(__CV_STATIC__ 未定义)。验证服务端版「最近」入口的三个方法。
describe('serverApi 最近来源(顶栏「最近」入口)', () => {
  beforeEach(() => { localStorage.clear() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('当前后端为 server', () => {
    expect(api.mode).toBe('server')
  })

  it('listRecents 把 recentRoots 路径映射为 {id,name,kind}', async () => {
    saveBrowserConfig({ recentRoots: ['D:/小说/全本', 'D:/手册/guide.md', '/home/u/notes'] })
    const r = await api.listRecents!()
    expect(r).toEqual([
      { id: 0, name: '全本', kind: 'directory' },
      { id: 1, name: 'guide.md', kind: 'file' },
      { id: 2, name: 'notes', kind: 'directory' },
    ])
  })

  it('removeRecent 按下标移除并写回 localStorage', async () => {
    saveBrowserConfig({ recentRoots: ['D:/a', 'D:/b', 'D:/c'] })
    await api.removeRecent!(1)
    expect(loadBrowserConfig().recentRoots).toEqual(['D:/a', 'D:/c'])
  })

  it('openRecent 用对应路径 PUT /api/config,并把该 root 置顶', async () => {
    saveBrowserConfig({ recentRoots: ['D:/a', 'D:/b'] })
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ root: 'D:/b', ignore: [], sortMode: 'path', titleSource: 'heading' }))
    vi.stubGlobal('fetch', fetchMock)

    const ok = await api.openRecent!(1)
    expect(ok).toBe(true)
    const cfgCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/config'))
    expect(cfgCall).toBeTruthy()
    const init = cfgCall![1] as RequestInit
    expect(JSON.parse(init.body as string).root).toBe('D:/b')
    // 置顶:刚打开的 root 现排在最近列表首位(供顶栏「当前」标记)。
    expect((loadBrowserConfig().recentRoots ?? [])[0]).toBe('D:/b')
  })

  it('openRecent 下标越界返回 false 且不发请求', async () => {
    saveBrowserConfig({ recentRoots: ['D:/a'] })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const ok = await api.openRecent!(5)
    expect(ok).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
