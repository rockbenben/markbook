/**
 * 客户端测试的全局准备。
 *
 * 界面语言默认跟随 navigator.language，而 jsdom 里那是 en-US，
 * 于是组件会渲染英文，靠中文文案查询元素的断言就会失败。
 * 测试需要确定性，所以在这里把语言钉死为中文——现有断言写的就是中文渲染。
 *
 * 想在某个用例里换语言：loadLang() 有本页缓存（见 i18n/index.ts 的说明），
 * 只 setItem 是不够的，必须让缓存失效：
 *   localStorage.setItem('cv-lang', 'en')
 *   resetLangCache()                       // 从 '../client/src/i18n' 引入
 * 或者 vi.resetModules() 后重新 import，拿一个全新的模块实例。
 * 组件已挂载时改语言，用 useStore.getState().setLang('en')——它会同步更新缓存。
 */
localStorage.setItem("cv-lang", "zh");
