/**
 * 界面语言。
 *
 * 默认跟随浏览器语言，用户在「设置 → 界面」里改后存进 localStorage。
 * 与 store 里的阅读偏好分开存 —— 语言不是阅读偏好，换书不该重置。
 */
import type { UIStrings } from "./types";
import { zh } from "./zh";
import { zhTW } from "./zhTW";
import { en } from "./en";

export type Lang = "zh" | "zh-TW" | "en";

export const TABLES: Record<Lang, UIStrings> = { zh, "zh-TW": zhTW, en };

/** 下拉/菜单里的显示名，一律用该语言自己的写法（不翻译）。 */
export const LANG_LABELS: Record<Lang, string> = {
  zh: "简体中文",
  "zh-TW": "繁體中文",
  en: "English",
};

/**
 * 标准 BCP-47 标签。两处用：写进 `<html lang>`（屏幕阅读器、CJK 断行、简繁字体回退），
 * 以及喂给 Intl / toLocaleString（数字千分位等）。
 */
export const LOCALE_TAG: Record<Lang, string> = {
  zh: "zh-Hans",
  "zh-TW": "zh-Hant",
  en: "en",
};

/**
 * 品牌锁定是否显示中文字标「文集」。
 *
 * 英文界面下这两个字对读者没有信息量，却占着 16px/600 的主标位置，
 * 把读得懂的 MarkBook 挤成灰色小字。去掉的只是**重复的文字字标**——
 * 标志图形 BrandMark 内部本就刻着「文」「集」二字，品牌识别不受影响。
 */
export const CJK_WORDMARK: Record<Lang, boolean> = { zh: true, "zh-TW": true, en: false }

export const LANGS = Object.keys(TABLES) as Lang[];

export function isLang(v: unknown): v is Lang {
  return typeof v === "string" && (LANGS as string[]).includes(v);
}

const LANG_KEY = "cv-lang";

/**
 * 中文的语言子标签。
 *
 * 不能只认 `zh` —— 粤语、闽南语、客家话在 BCP-47 里是**独立的语言子标签**，
 * 不以 zh 开头：香港用户把系统语言设成粤语时，浏览器发的是 `yue-Hant-HK`。
 * 只匹配 zh 前缀会让这些人拿到全英文界面。
 */
// zho 是 ISO 639-3/639-2T 的写法，少数平台会发它；漏了会让中文用户拿到英文界面。
const CHINESE = new Set(["zh", "zho", "cmn", "yue", "nan", "hak", "wuu", "hsn", "gan", "czh", "cjy"]);
/** 繁体地区。cht 是旧版 Windows/IE 的写法，仍会出现在老机器上。 */
const HANT_REGION = new Set(["tw", "hk", "mo"]);
/** 简体地区。有它才能让「粤语默认繁体」在 yue-CN 这种明确写了大陆的标签上让步。 */
const HANS_REGION = new Set(["cn", "sg", "my"]);

/** 浏览器语言 → 支持的语言。中文按脚本/地区分简繁，其余一律 en。 */
function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of list) {
    if (!raw) continue;
    // 按 BCP-47 拆子标签再判断，而不是对整串做前缀匹配：
    // 语言在第 1 段，脚本(Hans/Hant)与地区(TW/HK…)可能出现在第 2 或第 3 段。
    // 顺带切掉 POSIX 写法的编码后缀（zh_TW.UTF-8 / zh_HK.Big5），
    // 否则地区段会变成 "tw.utf-8" 而匹配不上——Electron 与部分 Linux 构建会发这种串。
    const parts = raw.toLowerCase().split(/[-_]/).map((p) => p.split(".")[0]);
    const [lang, ...rest] = parts;
    if (CHINESE.has(lang)) {
      if (rest.includes("hant") || rest.includes("cht")) return "zh-TW";
      if (rest.includes("hans") || rest.includes("chs")) return "zh";
      if (rest.some((p) => HANT_REGION.has(p))) return "zh-TW";
      if (rest.some((p) => HANS_REGION.has(p))) return "zh";
      // 粤语默认写繁体（主要使用地是港澳）；上面已排除明确写了大陆地区的情形。
      return lang === "yue" ? "zh-TW" : "zh";
    }
    if (lang === "en") return "en";
  }
  return "en";
}

/**
 * 本页当前语言的缓存。
 *
 * store 之外的层(api.ts / backend、以及不接受 t 参数的纯函数)靠 `TABLES[loadLang()]`
 * 取文案。若每次都现读 localStorage,同一页面里就有了两个真相源:另一个标签页改了语言,
 * 这一页的 React 界面不会更新(没有 storage 监听),但这些非 React 调用点会立刻读到新值,
 * 于是渲染出中英混排的句子(「共 12 章 / 总字数 34,000 字 · ~85 min」)。
 * 缓存后本页语言只随 setLang 变化,与 store 始终一致。
 */
let current: Lang | null = null;

export function loadLang(): Lang {
  if (current) return current;
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return (current = saved);
  } catch {
    /* 隐私模式等：忽略 */
  }
  return (current = detectLang());
}

/**
 * 丢弃缓存，让下一次 loadLang 重新读 localStorage / navigator。
 *
 * 仅供测试。因为有缓存，「setItem('cv-lang', …) 之后再取文案」不再自动生效 ——
 * 要么调用本函数，要么 vi.resetModules() 拿一个全新的模块实例。
 */
export function resetLangCache(): void {
  current = null;
}

export function saveLang(lang: Lang): void {
  current = lang;
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* 配额满等：忽略 */
  }
}

/** 填充 {count} / {min} 这类占位符 */
export function fmt(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export type { UIStrings };
