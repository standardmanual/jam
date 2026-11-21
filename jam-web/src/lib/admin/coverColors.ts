import { isVideoUrl } from '@/lib/today/cardMedia'

/**
 * 어드민 카드 커버 이미지 쓰기 경로가 `today_cards.cover_colors`를 같은 쓰기에 담는 공용 헬퍼 (티켓 20261121_1724, 상위 20261120_2026)
 *
 * `badgeBgColors.ts`와 같은 모양이다. 반환값은 update/insert 페이로드에 펼쳐 넣는 조각이다.
 * - 추출 성공(색 없음 `[]` 포함) → `{ cover_colors }`
 * - 추출 실패(`null`)·주소 없음·동영상·저장소 밖 주소 → `{}`. 저장을 실패시키지 않는다. 주소가 바뀐 경우라면 마이그레이션 351의
 *   트리거(`today_cards_cover_colors_stale_guard`)가 `cover_colors`를 NULL로 비워 낡은 색이 남지 않는다.
 *
 * 추출기(`extractBadgeColors`)는 http(s) 주소를 가리지 않고 fetch하므로 이 헬퍼가 «우리 저장소 공개 주소(Supabase Storage)와
 * `/`로 시작하는 정적 주소»만 통과시킨다. 서버 전용이다 — 번들 경계가 있는 파일(`homeFeedCard.ts`)은 이 함수를 직접 가져오지 않고
 * 실행 뼈대(`run.ts`)가 `create`의 context로 넘겨 준다.
 *
 * 추출기는 추출할 때만 동적으로 가져온다. 이 파일은 운영툴 쪽 모듈(`opsInbox/image.ts` → `run.ts`)이 값으로 가져오는데, 추출기는
 * `server-only`·`sharp`에 의존해서 정적으로 가져오면 추출과 무관한 시험까지 이 모듈을 못 읽는다.
 */
export type CoverColorsFields = { cover_colors?: string[] }

const STORAGE_PUBLIC_PATH_PREFIX = '/storage/v1/object/public/'

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** 추출해도 되는 주소인가: `/`로 시작하는 정적 주소(`//`는 제외) 또는 우리 Supabase 저장소의 공개 주소. */
function isExtractableUrl(url: string): boolean {
  if (url.startsWith('//')) return false
  if (url.startsWith('/')) return true
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return false
  try {
    const parsed = new URL(url)
    return parsed.origin === new URL(base).origin && parsed.pathname.startsWith(STORAGE_PUBLIC_PATH_PREFIX)
  } catch {
    return false
  }
}

/** 커버 이미지 주소에서 대표 색을 뽑아 저장할 필드 조각을 만든다. 추출이 던져도 `{}`다. */
export async function coverColorsFields(imageUrl: string | null | undefined): Promise<CoverColorsFields> {
  const url = normalize(imageUrl)
  if (!url || isVideoUrl(url) || !isExtractableUrl(url)) return {}
  try {
    const { extractBadgeColors } = await import('@/lib/badgeColorExtract')
    const colors = await extractBadgeColors(url)
    return colors === null ? {} : { cover_colors: colors }
  } catch {
    return {}
  }
}

/**
 * 폼 저장(PATCH)용 — 커버 주소가 실제로 바뀐 경우에만 새로 뽑는다. 본문에 주소가 없거나(undefined)
 * 기존과 같으면 `{}`라서 기존 색을 건드리지 않는다.
 */
export async function coverColorsFieldsIfChanged(
  existing: string | null | undefined,
  next: string | null | undefined
): Promise<CoverColorsFields> {
  if (next === undefined) return {}
  if (normalize(existing) === normalize(next)) return {}
  return coverColorsFields(next)
}
