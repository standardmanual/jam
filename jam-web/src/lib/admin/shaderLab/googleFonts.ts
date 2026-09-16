/**
 * 쉐이더 랩 — 구글 폰트 검색·동적 로드 (티켓 20260916_2001)
 *
 * `googleFontsCatalog.json`은 구글 폰트 공개 메타데이터 엔드포인트
 * (`https://fonts.google.com/metadata/fonts`, API 키 불필요)에서 2026-09-16에 받은 전체
 * 목록(1,946종)을 `{ family, category }`만 남겨 정적으로 번들한 것이다 — 런타임에 이 엔드포인트를
 * 다시 호출하지 않는다(비용·안정성 관점에서 정적 스냅샷을 택함, 완료 기록 참고). 폰트 실제
 * 로드는 API 키가 필요 없는 공개 스타일시트 엔드포인트(`fonts.googleapis.com/css2`)를 그대로
 * 쓴다 — 이 라우트(`/admin/shader-lab`)에서만 동적으로 `<link>`를 주입하고, 전역 타이포그래피
 * 에는 영향을 주지 않는다.
 */
import googleFontsCatalogData from './googleFontsCatalog.json'

export interface GoogleFontCatalogEntry {
  family: string
  category: string
}

export const GOOGLE_FONT_CATALOG: readonly GoogleFontCatalogEntry[] = googleFontsCatalogData

/**
 * 대소문자 무시 부분일치 검색. 접두 일치를 우선 정렬해(`family.startsWith`) 흔한 검색
 * 패턴(폰트 이름 앞부분 입력)에서 원하는 폰트가 상단에 오도록 한다. 카탈로그 자체가 이미
 * 구글 인기도 순으로 정렬돼 있어(빌드 시점 스냅샷), 같은 우선순위 그룹 안에서는 그 순서를
 * 그대로 유지한다(안정 정렬).
 */
export function searchGoogleFonts(query: string, limit = 50): GoogleFontCatalogEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return GOOGLE_FONT_CATALOG.slice(0, limit)

  const startsWith: GoogleFontCatalogEntry[] = []
  const includes: GoogleFontCatalogEntry[] = []
  for (const entry of GOOGLE_FONT_CATALOG) {
    const name = entry.family.toLowerCase()
    if (name.startsWith(q)) startsWith.push(entry)
    else if (name.includes(q)) includes.push(entry)
    if (startsWith.length >= limit) break
  }
  return [...startsWith, ...includes].slice(0, limit)
}

/** 구글 폰트 `css2` 공개 스타일시트 URL을 만든다(고정 굵기 400 — `GOOGLE_FONT_SLOT_WEIGHT`,
 *  `textFontOptions.ts` 참고). API 키가 필요 없는 공개 엔드포인트다. */
export function buildGoogleFontCssUrl(family: string): string {
  const familyParam = family.trim().replace(/\s+/g, '+')
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(familyParam).replace(/%2B/g, '+')}:wght@400&display=swap`
}

const LOADED_FONT_LINK_ATTR = 'data-shader-lab-google-font'

/**
 * 이 구글 폰트의 `<link rel="stylesheet">`가 이미 `document.head`에 있으면 그대로 두고,
 * 없으면 새로 추가한다(중복 로드 방지). `/admin/shader-lab` 클라이언트 컴포넌트에서만
 * 호출된다 — 서버에서 호출돼도 `document`가 없으면 조용히 넘어간다.
 */
export function ensureGoogleFontLoaded(family: string): void {
  if (typeof document === 'undefined') return
  const attrValue = family.replace(/"/g, '\\"')
  const existing = document.head.querySelector(`link[${LOADED_FONT_LINK_ATTR}="${attrValue}"]`)
  if (existing) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = buildGoogleFontCssUrl(family)
  link.setAttribute(LOADED_FONT_LINK_ATTR, family)
  document.head.appendChild(link)
}

/**
 * 슬롯의 CSS 커스텀 프로퍼티를 이 구글 폰트로 런타임에 덮어쓴다 — `layout.tsx`가 Pretendard
 * Variable에 쓰는 정적 하이재킹과 같은 원리의 동적 버전(`textFontOptions.ts` 상단 주석의
 * "왜 이렇게 우회하는가" 참고).
 */
export function applyGoogleFontToSlot(cssVariable: string, family: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(cssVariable, `"${family}"`)
}
