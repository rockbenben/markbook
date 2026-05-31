// 把最近打开过的目录 / 文件句柄(FileSystemHandle,可结构化克隆)存进 IndexedDB,
// 维护一个 MRU 列表(最多 N 条),以便快速切回。全程防御式:IndexedDB 不可用 / 出错时
// 静默降级(返回 [] / 不抛),绝不影响正常选择流程。jsdom 无 IndexedDB,故此模块不单测。
const DB_NAME = 'markbook'
const STORE = 'handles'
const KEY = 'recents'
const CAP = 8

export interface RecentEntry { name: string; kind: string; handle: unknown }

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const idb = (globalThis as { indexedDB?: IDBFactory }).indexedDB
    if (!idb) { reject(new Error('no indexedDB')); return }
    const req = idb.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    tx.oncomplete = () => db.close()
  }))
}

/** 读取最近来源列表(MRU,队首最新);无 / 出错返回 []。 */
export async function loadRecents(): Promise<RecentEntry[]> {
  try {
    const list = (await withStore('readonly', (s) => s.get(KEY))) as RecentEntry[] | undefined
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

/** 两个句柄是否指向同一条目(用 FileSystemHandle.isSameEntry;不可用时退化为名字+类型相同)。 */
async function isSame(a: unknown, b: unknown, name: string, kind: string, eName: string, eKind: string): Promise<boolean> {
  try {
    const f = (a as { isSameEntry?: (o: unknown) => Promise<boolean> }).isSameEntry
    if (f) return await f.call(a, b)
  } catch { /* fall through */ }
  return eName === name && eKind === kind
}

/** 把一个句柄置于 MRU 队首(去重、截断到 CAP)。失败静默。 */
export async function saveRecent(handle: unknown, name: string, kind: string): Promise<void> {
  try {
    const cur = await loadRecents()
    const kept: RecentEntry[] = []
    for (const e of cur) {
      if (!(await isSame(e.handle, handle, name, kind, e.name, e.kind))) kept.push(e)
    }
    const next = [{ name, kind, handle }, ...kept].slice(0, CAP)
    await withStore('readwrite', (s) => s.put(next, KEY))
  } catch { /* ignore */ }
}

/** 从 MRU 列表移除第 index 项。失败静默。 */
export async function removeRecent(index: number): Promise<void> {
  try {
    const cur = await loadRecents()
    if (index < 0 || index >= cur.length) return
    cur.splice(index, 1)
    await withStore('readwrite', (s) => s.put(cur, KEY))
  } catch { /* ignore */ }
}

// ── 上传(只读)快照:Firefox/Safari 无可持久化句柄,改把上传内容缓存进 IndexedDB,
//    刷新后自动重开(只读)。FS Access 选目录/文件时会清掉它(改用句柄)。 ──
const SNAP_KEY = 'upload-snapshot'
export type UploadSnapshot =
  | { kind: 'folder'; name: string; entries: { path: string; content: string; mtime: number }[] }
  | { kind: 'file'; name: string; content: string; mtime: number }

export async function saveUploadSnapshot(snap: UploadSnapshot): Promise<void> {
  try { await withStore('readwrite', (s) => s.put(snap, SNAP_KEY)) } catch { /* ignore */ }
}
export async function loadUploadSnapshot(): Promise<UploadSnapshot | null> {
  try { return ((await withStore('readonly', (s) => s.get(SNAP_KEY))) as UploadSnapshot | undefined) ?? null } catch { return null }
}
export async function clearUploadSnapshot(): Promise<void> {
  try { await withStore('readwrite', (s) => s.delete(SNAP_KEY)) } catch { /* ignore */ }
}
