/**
 * 客户端测试的全局准备。
 *
 * 界面语言默认跟随 navigator.language，而 jsdom 里那是 en-US，
 * 于是组件会渲染英文，靠中文文案查询元素的断言就会失败。
 * 测试需要确定性，所以在这里把语言钉死为中文——现有断言写的就是中文渲染。
 * 想测英文渲染时，在该用例里自行 localStorage.setItem('cv-lang', 'en') 并重新 import。
 */
localStorage.setItem("cv-lang", "zh");
