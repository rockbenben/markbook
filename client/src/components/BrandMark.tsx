/**
 * 品牌书标:线装书封面(磁青书衣 + 题签「文集」+ 右缘四眼订线),与 public/icon.svg 同一造型。
 * 内联渲染:不发请求、不受部署 base 影响,可按需缩放(顶栏 20px 只求剪影,首屏 72px 见细节)。
 */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="MarkBook · 文集" style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="mb-cover" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2d5078" />
          <stop offset="1" stopColor="#1e3b59" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#mb-cover)" />
      <g stroke="#f2ead6" strokeWidth="11" opacity="0.92">
        <line x1="428" y1="64" x2="428" y2="448" strokeLinecap="round" />
        {/* 每眼一道绕缘横线:直抵右缘(装订线绕过书缘) */}
        <line x1="428" y1="96" x2="512" y2="96" />
        <line x1="428" y1="203" x2="512" y2="203" />
        <line x1="428" y1="309" x2="512" y2="309" />
        <line x1="428" y1="416" x2="512" y2="416" />
      </g>
      <g fill="#f2ead6">
        <circle cx="428" cy="96" r="15" />
        <circle cx="428" cy="203" r="15" />
        <circle cx="428" cy="309" r="15" />
        <circle cx="428" cy="416" r="15" />
      </g>
      <rect x="78" y="58" width="136" height="322" rx="10" fill="#f5eedc" />
      <rect x="86" y="66" width="120" height="306" rx="6" fill="none" stroke="#26221c" strokeOpacity="0.22" strokeWidth="4" />
      <text x="146" y="196" fontSize="104" textAnchor="middle" fill="#26221c" fontFamily="Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif">文</text>
      <text x="146" y="330" fontSize="104" textAnchor="middle" fill="#26221c" fontFamily="Noto Serif SC, Source Han Serif SC, Songti SC, SimSun, serif">集</text>
    </svg>
  )
}
