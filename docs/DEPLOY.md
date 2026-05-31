# 部署 Deploy

MarkBook 有两种运行模式,同一套代码:

## 1. 本地服务端模式(全功能)

Node/Fastify 后端读写本机文件、实时监听、服务端全文索引、导出。

```bash
npm install
npm run build      # 产出 dist/client(前端)+ dist/server/index.js(单文件服务)
CV_ROOT=/路径/到/书库 npm start
```

适合在自己机器上当本地阅读 / 编辑器用。详见 [CONFIGURATION](CONFIGURATION.md)。

## 2. 纯静态模式(放到网页上,人人可用)

不需要任何后端,整包就是静态文件,可托管到 GitHub Pages / Netlify / Vercel(静态)/ 任意静态服务器。每个访客在**自己的浏览器里**打开**自己的**文件夹,文件不上传、不离开本机;所有设置(阅读偏好、书签、上次位置、排序 / 标题来源)都存在浏览器 **localStorage**。

```bash
npm run build:static   # 产出 dist/static/(相对路径,可放任意子路径)
# 把 dist/static/ 的内容部署到任意静态托管即可
```

本地预览:

```bash
python -m http.server 8080 --directory dist/static
# 打开 http://127.0.0.1:8080
```

### 用 GitHub Actions 自动部署到 gh-pages

仓库内置 `.github/workflows/ci.yml`:推送到默认分支(`main`)或手动触发(`workflow_dispatch`)时,自动跑类型检查 + 测试 + `npm run build:static`,再用 [`JamesIves/github-pages-deploy-action`](https://github.com/JamesIves/github-pages-deploy-action) 把 `dist/static` 发布到 **`gh-pages`** 分支(首次会自动创建该分支)。要换部署分支,改工作流里 `branch:` 一行即可。

一次性设置:

1. 把仓库推到 GitHub(工作流随代码一起)。
2. 第一次推送后会自动创建 `gh-pages` 分支;到 **Settings → Pages → Build and deployment → Source** 选 **Deploy from a branch**,分支选 `gh-pages`、目录 `/ (root)`。
3. 之后每次推送默认分支即自动重新构建并更新,访问 `https://<用户名>.github.io/<仓库名>/`。

> 静态构建用相对 `base`(`./`),即便托管在 `…/<仓库名>/` 子路径下,资源与 Service Worker 也能正确加载,无需改配置。工作流用内置的 `GITHUB_TOKEN`(`permissions: contents: write`),不需要额外密钥。

### 浏览器支持与能力

- **来源**:可选**文件夹**(每文件一章)或**单个大文件**(按标题拆章),两者皆可编辑。**「打开文件夹 / 打开单个文件」**在 **Chrome / Edge** 等 Chromium 上走 File System Access API(`showDirectoryPicker` / `showOpenFilePicker`),可就地编辑;**Firefox / Safari** 上同名按钮自动降级为只读(本地选取,仍可阅读 / 搜索 / 导出)。界面不出现「上传」字样,避免与「零上传」混淆。
- 静态模式支持:**阅读 + 全文搜索 + 命中高亮 + 阅读设置 + 编辑**(保存 / 新建 / 重命名 / 删除 / 全局查找替换,目录模式写回各文件,单文件模式按节切片写回整文件)+ **导出**(TXT / Markdown / HTML 在浏览器内生成下载,PDF 经浏览器打印;EPUB 仅服务端模式)。编辑需 Chromium 的 FS Access 写权限(首次写入会请求授权);上传降级为只读。
- **首屏一步打开 + 隐私说明**:空状态首屏直接给出「打开文件夹 / 打开单个文件」入口与醒目的「纯本地 · 零上传」说明,不必先进设置;选一个含 `.md` / `.txt` 的文件夹 / 文件即可阅读 / 编辑。
- **记住多个最近来源**:打开过的目录 / 文件句柄存入 IndexedDB(MRU,最多 8 个)。刷新后自动恢复最近一次(权限仍在时);首屏「最近打开」列出全部来源,点任一即一键切换(必要时弹一次重新授权),× 可移除。
- **先看看示例**:首屏有「先看看示例」可一键载入内置说明书(只读),无需任何文件即可立即体验阅读 / 搜索。
- **刷新重读**:工具栏「刷新」在静态模式会重新读取当前文件夹 / 文件(反映外部改动),不只是重渲染。
- **上传也能记住**:Firefox / Safari 等「打开(只读)」的内容会缓存进 IndexedDB,刷新 / 重开后自动恢复(只读快照,需更新时重新打开)。
- **PWA(可安装 / 离线)**:静态版自带 Service Worker 与 manifest——浏览器可「安装到桌面/主屏」,断网也能打开应用外壳阅读,重复访问秒开;发布新版本自动更新(autoUpdate),不会卡旧版。

> 隐私:静态模式不发任何网络请求读你的文件(可在开发者工具 Network 里验证:打开后对 `/api/` 的请求数为 0)。
