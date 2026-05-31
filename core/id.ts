// 章节稳定 id 编码。浏览器与 Node 双端可用:用 TextEncoder + btoa 实现 base64url,
// 不依赖 Node 的 Buffer。输出与 `Buffer.from(rel,'utf8').toString('base64url')` 一致
// (base64url 字符集、无 `=` 填充),以保证两种运行模式下同一相对路径得到同一 id。

/** 相对路径 → URL 安全、不含分隔符的 id(base64url,无填充)。 */
export function encodeId(rel: string): string {
  const bytes = new TextEncoder().encode(rel)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** id → 相对路径(encodeId 的逆运算)。 */
export function decodeId(id: string): string {
  const b64 = id.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}
