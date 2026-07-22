import type { Lang } from "./index";

/**
 * 内置示例书。
 *
 * 既让用户「先看看」立刻体验阅读，本身又是一份简短使用说明（按 # 标题分章）。
 * 不放进 UIStrings —— 那里只收界面固定文案，这是书稿内容。
 */
const zh = `# 欢迎使用 MarkBook
MarkBook 把一堆 .md / .txt 文本聚合成一本可连续阅读、可搜索、可编辑的「书」。全部在你的浏览器里完成,文件不会上传到任何服务器。

# 怎么打开你自己的书
点上方「打开文件夹」,选一个装着 .md / .txt 的文件夹——每个文件就是一章;或「打开单个文件」,打开一个大文件,会按其中的标题自动分章。

# 阅读
左侧目录可点击跳转、可在上方过滤;顶部「搜索全文」找内容,选中后会跳到该处并高亮。右侧「排版 / 原文」切换显示方式。

# 编辑(需 Chrome / Edge)
点右下角铅笔修改当前章,Ctrl/Cmd+S 保存回原文件;目录里还能新建 / 重命名 / 删除章节,以及全书查找替换。

# 个性化
顶部「Aa」可调字号、行距、字体、页宽与背景(护眼 / 羊皮纸 / 夜间);全屏按钮进入沉浸阅读。所有偏好都记在本机浏览器里。
`;

const zhTW = `# 歡迎使用 MarkBook
MarkBook 把一堆 .md / .txt 文字檔聚合成一本可連續閱讀、可搜尋、可編輯的「書」。全部在你的瀏覽器裡完成，檔案不會上傳到任何伺服器。

# 怎麼開啟你自己的書
點上方「開啟資料夾」，選一個裝著 .md / .txt 的資料夾——每個檔案就是一章；或「開啟單一檔案」，開啟一個大檔案，會依其中的標題自動分章。

# 閱讀
左側目錄可點擊跳轉、可在上方篩選；頂部「搜尋全文」找內容，選取後會跳到該處並標示。右側「排版 / 原文」切換顯示方式。

# 編輯（需 Chrome / Edge）
點右下角鉛筆修改目前章節，Ctrl/Cmd+S 存回原檔案；目錄裡還能新增 / 重新命名 / 刪除章節，以及全書尋找取代。

# 個人化
頂部「Aa」可調字級、行距、字型、頁寬與背景（護眼 / 羊皮紙 / 夜間）；全螢幕按鈕進入沉浸閱讀。所有偏好都記在本機瀏覽器裡。
`;

const en = `# Welcome to MarkBook
MarkBook gathers a pile of .md / .txt files into one continuous, searchable, editable "book". Everything happens inside your browser — no file is ever uploaded to a server.

# Opening your own book
Click "Open folder" above and pick a folder of .md / .txt files — each file becomes a chapter. Or use "Open a single file" on one large file, and it is split into chapters by the headings inside it.

# Reading
The table of contents on the left jumps to a chapter and can be filtered from the box above it. "Search the full text" at the top finds content, jumps to it and highlights the hit. "Rendered / Source" on the right switches how text is displayed.

# Editing (needs Chrome / Edge)
The pencil at the bottom right edits the current chapter; Ctrl/Cmd+S writes it back to the original file. The table of contents can also create, rename and delete chapters, and there is find-and-replace across the whole book.

# Making it yours
"Aa" at the top adjusts type size, line height, typeface, page width and background (sepia / paper / night); the fullscreen button enters immersive reading. Every preference is kept on this machine.
`;

export const SAMPLE_BOOK: Record<Lang, string> = { zh, "zh-TW": zhTW, en };
