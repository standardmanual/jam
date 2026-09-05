/**
 * 액티비티 배지 이미지 생성기 — 검색 요청 해석·페이징 (티켓 20260905_0032 C-1)
 *
 * ## 왜 분리했나
 * 예전 검색은 «상한 50건 + `truncated` 플래그»였고, 그 근거는 「액티비티 배지는 전체 207건
 * 규모라 필터 없이도 목록을 훑을 수 있다」는 주석이었다. **v5는 164계열 550종이라 그 전제가
 * 깨진다** — 상위 50건에 들지 못한 배지는 이름을 정확히 맞히지 못하면 도달할 수 없다.
 * 페이징 산술과 요청 검증을 라우트 밖 순수 함수로 빼서, 「550종에서 잘리지 않는다」를
 * DB 없이 회귀로 고정한다.
 *
 * DOM·Supabase에 의존하지 않는다 — 라우트와 테스트가 같은 함수를 쓴다.
 */
import type { BadgeRarity } from '@/types/database'

/** 한 페이지에 보여줄 배지 수. 화면은 서버가 돌려준 `pageSize`를 그대로 쓴다 */
export const ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE = 50

const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 배지 종류 필터. 판정 기준은 `badgeKind.ts`의 `isLeveledBadge`(= `rarity IS NULL`)이며
 * 여기서는 그 판정을 «요청 값»으로 받을 뿐 다시 선언하지 않는다.
 */
export const ACTIVITY_BADGE_IMAGE_SEARCH_KINDS = ['graded', 'leveled'] as const
export type ActivityBadgeImageSearchKind = (typeof ACTIVITY_BADGE_IMAGE_SEARCH_KINDS)[number]

export interface ActivityBadgeImageSearchParams {
  q: string
  /** 레벨형에는 등급이 없다 — `kind === 'leveled'`이면 항상 null이다 */
  rarity: BadgeRarity | null
  activityType: string | null
  kind: ActivityBadgeImageSearchKind | null
  /** 1 이상의 정수 */
  page: number
}

/**
 * 요청 본문을 검색 조건으로 좁힌다. 모르는 값은 «필터 없음»으로 떨어뜨린다.
 *
 * **등급 필터는 레벨형과 함께 설 수 없다** — 레벨형은 `rarity IS NULL`이라 등급 조건을
 * 함께 걸면 결과가 언제나 0건이고, 운영자에게는 「검색이 안 된다」로 보인다.
 */
export function parseActivityBadgeImageSearchParams(body: unknown): ActivityBadgeImageSearchParams {
  const raw = (body ?? {}) as Record<string, unknown>

  const rawQuery = typeof raw.q === 'string' ? raw.q : ''
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거 (기존 검색과 동일 패턴)
  const q = rawQuery.replace(/[,()%_*\\]/g, ' ').trim()

  const kind =
    typeof raw.kind === 'string' && (ACTIVITY_BADGE_IMAGE_SEARCH_KINDS as readonly string[]).includes(raw.kind)
      ? (raw.kind as ActivityBadgeImageSearchKind)
      : null

  const rarity =
    kind !== 'leveled' && typeof raw.rarity === 'string' && (RARITIES as string[]).includes(raw.rarity)
      ? (raw.rarity as BadgeRarity)
      : null

  const activityType = typeof raw.activityType === 'string' && raw.activityType ? raw.activityType : null

  const rawPage = Number(raw.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  return { q, rarity, activityType, kind, page }
}

/** 페이지 번호 → PostgREST `range` 경계(0-based, 양 끝 포함) */
export function activityBadgeImageSearchRange(page: number): { from: number; to: number } {
  const from = (page - 1) * ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE
  return { from, to: from + ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE - 1 }
}

/** 전체 건수 → 페이지 수(최소 1) */
export function activityBadgeImageSearchTotalPages(total: number): number {
  return Math.max(1, Math.ceil(total / ACTIVITY_BADGE_IMAGE_SEARCH_PAGE_SIZE))
}
