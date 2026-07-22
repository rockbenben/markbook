import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * 语言检测/持久化。
 *
 * loadLang 会读 navigator 与 localStorage，两者都是模块外部状态，
 * 所以每个用例都 resetModules + 重新 import，拿到干净的模块实例。
 */
async function loadWith(languages: string[]): Promise<string> {
  vi.resetModules()
  vi.stubGlobal('navigator', { languages, language: languages[0] })
  const { loadLang } = await import('../../client/src/i18n')
  return loadLang()
}

describe('detectLang(通过 loadLang)', () => {
  beforeEach(() => { localStorage.removeItem('cv-lang') })
  // test-setup.ts 把语言钉死为 zh，本文件清掉后要还原，免得影响后续测试文件。
  afterEach(() => { vi.unstubAllGlobals(); localStorage.setItem('cv-lang', 'zh') })

  it('港澳台与显式 Hant 走繁体', async () => {
    for (const l of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-HK', 'zh-CHT']) {
      expect(await loadWith([l]), l).toBe('zh-TW')
    }
  })

  it('大陆/新马、显式 Hans 与裸 zh 走简体', async () => {
    for (const l of ['zh', 'zh-CN', 'zh-SG', 'zh-MY', 'zh-Hans', 'zh-Hans-CN', 'zh-CHS']) {
      expect(await loadWith([l]), l).toBe('zh')
    }
  })

  it('大小写与下划线写法同样识别', async () => {
    expect(await loadWith(['ZH-tw'])).toBe('zh-TW')
    expect(await loadWith(['zh_TW'])).toBe('zh-TW')
    expect(await loadWith(['zh_CN'])).toBe('zh')
  })

  it('未列出的中文变体兜底到简体', async () => {
    expect(await loadWith(['zh-yue'])).toBe('zh')
  })

  it('英文与其他语言走 en', async () => {
    expect(await loadWith(['en-US'])).toBe('en')
    expect(await loadWith(['ja-JP'])).toBe('en')
  })

  it('按 languages 顺序取第一个支持的语言', async () => {
    expect(await loadWith(['ja-JP', 'zh-TW', 'en-US'])).toBe('zh-TW')
    expect(await loadWith(['fr-FR', 'en-GB'])).toBe('en')
  })

  it('已保存的选择优先于浏览器语言', async () => {
    localStorage.setItem('cv-lang', 'zh-TW')
    expect(await loadWith(['en-US'])).toBe('zh-TW')
  })

  it('保存值非法时忽略，回落到浏览器语言', async () => {
    localStorage.setItem('cv-lang', 'klingon')
    expect(await loadWith(['zh-TW'])).toBe('zh-TW')
  })
})

describe('文案表', () => {
  it('三种语言的键完全一致(没有漏译)', async () => {
    const { TABLES, LANGS } = await import('../../client/src/i18n')
    const base = Object.keys(TABLES.zh).sort()
    for (const l of LANGS) expect(Object.keys(TABLES[l]).sort(), l).toEqual(base)
  })

  it('繁体表没有残留简体常见字', async () => {
    const { TABLES } = await import('../../client/src/i18n')
    const all = Object.values(TABLES['zh-TW']).join('\n')
    // 抽查几个高频简体字:出现即说明某条漏转。
    for (const ch of ['门', '录', '设', '导', '书', '选', '开', '闭', '换', '览']) {
      expect(all.includes(ch), `繁体表含简体字「${ch}」`).toBe(false)
    }
  })
})
