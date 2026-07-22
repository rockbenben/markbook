/**
 * 界面语言。
 *
 * 默认跟随浏览器语言，用户在「设置」或顶栏语言按钮里改后存进 localStorage。
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

/** 语言按钮上的短标记，图标旁只放两三个字符。 */
export const LANG_SHORT: Record<Lang, string> = {
  zh: "简",
  "zh-TW": "繁",
  en: "EN",
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

/** 港澳台以及显式 Hant 脚本走繁体；zh-CHT 是旧版 Windows/IE 的写法。 */
const HANT = /^zh([-_](hant|tw|hk|mo|cht))/;
/** 大陆/新马 + 显式 Hans。裸 zh 也当简体（zh 的默认脚本是 Hans）。 */
const HANS = /^zh([-_](hans|cn|sg|my|chs))?$/;

/** 浏览器语言 → 支持的语言。中文按脚本/地区分简繁，其余一律 en。 */
function detectLang(): Lang {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of list) {
    if (!raw) continue;
    const l = raw.toLowerCase();
    if (HANT.test(l)) return "zh-TW";
    if (HANS.test(l)) return "zh";
    // zh-Hant-TW 之外还有 zh-yue 等未列出的中文变体：不落在上面两条时按简体兜底。
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("en")) return "en";
  }
  return "en";
}

export function loadLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* 隐私模式等：忽略 */
  }
  return detectLang();
}

export function saveLang(lang: Lang): void {
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
