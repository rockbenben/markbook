/**
 * 界面文案表的类型定义。
 *
 * 只放**界面固定文案**，不放你的书稿内容。
 * 加一种语言 = 新建一份实现了 UIStrings 的文件，TypeScript 会替你检查有没有漏译。
 */
export interface UIStrings {
  /* 品牌 */
  appName: string;
  appNameShort: string;

  /* 顶栏 · 导航 */
  toc: string;
  showToc: string;
  hideToc: string;
  prevChapter: string;
  nextChapter: string;
  search: string;
  searchPlaceholder: string;

  /* 顶栏 · 显示 */
  viewRender: string;
  viewSource: string;
  immersive: string;
  exitImmersive: string;
  toggleTheme: string;
  toDark: string;
  toLight: string;
  themeLockedHint: string;

  /* 顶栏 · 书库 */
  bookmarks: string;
  noBookmarks: string;
  removeBookmark: string;
  addBookmark: string;
  recentSources: string;
  refresh: string;
  more: string;
  settings: string;
  repo: string;

  /* 通用动作 */
  ok: string;
  cancel: string;
  close: string;
  save: string;
  saving: string;
  saved: string;
  edit: string;
  delete: string;
  rename: string;
  create: string;
  preview: string;
  copy: string;
  copied: string;
  retry: string;
  loading: string;
  prevPage: string;
  nextPage: string;

  /* 来源选择 */
  chooseFolder: string;
  chooseFile: string;
  sourceHint: string;
  openFolder: string;
  openFile: string;
  reselect: string;

  /* 章节 */
  chapter: string;
  chapters: string;
  volume: string;
  untitled: string;
  newChapter: string;
  deleteChapterConfirm: string;
  renameChapter: string;
  chapterOutline: string;

  /* 编辑器 */
  editorPlaceholder: string;
  unsavedChanges: string;
  conflictWarning: string;
  writeFailed: string;
  saveConflict: string;
  saveFailed: string;
  discardTitle: string;
  discardBody: string;
  discardAndLoad: string;
  overwriteTitle: string;
  overwriteBody: string;
  forceOverwrite: string;
  autoSaving: string;
  unsaved: string;
  twoPane: string;
  onePane: string;
  autoSave: string;
  externallyModified: string;
  closeDiscarding: string;
  keepEditing: string;
  discardAndReload: string;

  /* 整理（TidyModal 的规则项） */
  tidyTitle: string;
  tidyTooltip: string;
  tidyGarbled: string;
  tidyWatermark: string;
  tidyDupLines: string;
  tidyRules: string;
  tidyBlankLines: string;
  tidyFullWidth: string;
  tidyPageNumbers: string;
  tidyDoneChapter: string;
  tidyFailed: string;
  tidyWholeConfirmTitle: string;
  tidyWholeConfirmBody: string;
  tidyWholeBook: string;
  tidyWholeBookEllipsis: string;
  tidyDoneFiles: string;
  tidyApplyChapter: string;
  tidyPreviewTitle: string;
  tidyPreviewEmpty: string;
  tidyNothingInChapter: string;

  /* 查找替换 */
  findReplace: string;
  findLabel: string;
  replaceLabel: string;
  matchCase: string;
  wholeWord: string;
  useRegex: string;
  replaceAll: string;
  replaceScopeAll: string;
  replaceScopeCurrent: string;
  matchesFound: string;
  noMatches: string;
  replaceDone: string;

  /* 整理 */
  tidy: string;
  tidyDesc: string;
  tidyRemoveGarbled: string;
  tidyDedupeLines: string;
  tidyStripRules: string;
  tidyFullToHalf: string;
  tidyTrimSpaces: string;
  tidyPreview: string;
  tidyApply: string;
  tidyNoChange: string;
  tidyChangedLines: string;

  /* 导出 */
  export: string;
  exportFormat: string;
  exportScope: string;
  exportWhole: string;
  exportByVolume: string;
  exportCurrent: string;
  exporting: string;
  exportFailed: string;

  /* 设置 */
  reading: string;
  fontSize: string;
  lineHeight: string;
  fontFamily: string;
  fontSystem: string;
  fontSerif: string;
  fontMono: string;
  pageWidth: string;
  pageWidthFull: string;
  paper: string;
  paperDefault: string;
  paperSepia: string;
  paperPaper: string;
  paperNight: string;
  indent: string;
  language: string;
  sortOrder: string;
  autoScan: string;

  /* 设置弹窗 */
  apply: string;
  applyFailed: string;
  librarySource: string;
  rootDir: string;
  rootDirRequired: string;
  rootDirPlaceholder: string;
  browseDirs: string;
  parentDir: string;
  browseFailed: string;
  cannotBrowseHere: string;
  chapterOrder: string;
  chapterOrderHint: string;
  orderByFilename: string;
  orderByTitle: string;
  orderByVolume: string;
  orderManual: string;
  titleSource: string;
  titleSourceHint: string;
  titleFromHeading: string;
  titleFromFilename: string;

  /* 状态栏 */
  progress: string;
  readingTime: string;
  wordCount: string;
  connected: string;
  disconnected: string;
  reconnecting: string;

  /* 错误 / 空态 */
  empty: string;
  noResults: string;
  loadFailed: string;
  notSupported: string;

  /* 查找替换（补充） */
  findEmpty: string;
  previewFailed: string;
  replaceConfirmTitle: string;
  replaceConfirmBody: string;
  replaceFailed: string;
  findReplaceWhole: string;
  findReplaceTitle: string;
  regexShort: string;
  replacedSummary: string;
  matchSummary: string;

  /* 目录面板 */
  actionFailed: string;
  filterChapters: string;
  chapterTitle: string;
  newTitle: string;
  deleteChapter: string;

  /* 阅读设置 */
  readingSettings: string;
  widthNarrow: string;
  widthMedium: string;
  widthWide: string;
  fontSizeLabel: string;
  lineHeightLabel: string;

  /* 来源选择（补充） */
  readFolderFailed: string;
  readFileFailed: string;
  cannotOpenReauth: string;
  openFailed: string;
  loadSampleFailed: string;
  sourceIntro: string;
  readOnlyHint: string;
  localOnlyBadge: string;
  openSingleFile: string;

  /* 导出 / 状态栏 / App 补充 */
  exportBook: string;
  noChaptersToExport: string;
  volumeLabel: string;
  volumePos: string;
  currentChapter: string;
  progressPercent: string;
  wsDisconnected: string;
  editChapter: string;
  loadingEditor: string;
  unbookmark: string;
  bookmarkCurrent: string;
  editCurrentChapter: string;

  /* 最后一批 */
  noRecent: string;
  remove: string;
  current: string;
  noSearchResults: string;
  searchFailed: string;
  searchFullText: string;
  noChaptersToShow: string;
  aggregateTagline: string;
  aggregateIntro: string;
  chapterActions: string;
  tokenPrompt: string;
  diskChangedRejected: string;
  noFolderChosen: string;
  readOnlyMode: string;
  sameVolumeOnly: string;
  titleRequired: string;
  textLabel: string;
  uploadedSuffix: string;
  sampleFileName: string;
  sampleTitle: string;
  readTimeMin: string;
  readTimeHour: string;
  readTimeHourMin: string;
  occurrenceCount: string;

  /* 早前遗留在组件里的硬编码文案 */
  bookSummary: string;
  pagePos: string;
  lineLabel: string;
  outline: string;
  closeLoseChanges: string;
  deleteChapterBody: string;
  pdfHint: string;
  trustNote: string;
  trySample: string;
  emptyServerHint: string;
  openSettings: string;
  regexInvalid: string;
  browseUnavailable: string;
}
