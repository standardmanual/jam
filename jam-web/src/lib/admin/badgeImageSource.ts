/**
 * 배지 대표 이미지 제작 경로(`badges.image_source`) 라벨·필터 단일 출처 (티켓 20260924_2200)
 *
 * 목록(`BadgesTable`·`BadgeCard`)·상세(`BadgeDetail`·`BadgeForm`)·필터(`BadgesFilterBar`)가
 * 모두 이 파일의 라벨·필터 옵션을 공유한다 — 한 곳만 고치면 화면 전체가 맞는다
 * (`badge-labels.ts`의 라벨 맵과 같은 원칙, 그 파일에 합치지 않은 이유는 이 컬럼이 배지
 * 전용이 아니라 "제작 도구 구분"이라는 별개 주제이기 때문).
 *
 * 값 3종은 마이그레이션 `186_badges_image_source.sql`의 CHECK 제약과 같다. 기존 배지(값
 * 없음)는 "미상"으로 표시한다 — 소급 채우기는 PRD asset-generator/PRD.md §10에 열린 질문으로
 * 남아 있다.
 */
export type BadgeImageSource = 'admin-generator' | 'agent-generator' | 'jam-img'

/** CHECK 제약과 같은 순서 — 필터 드롭다운 옵션 순서로도 그대로 쓴다 */
export const BADGE_IMAGE_SOURCES: BadgeImageSource[] = ['admin-generator', 'agent-generator', 'jam-img']

export const BADGE_IMAGE_SOURCE_LABEL: Record<BadgeImageSource, string> = {
  'admin-generator': '수동 제작',
  'agent-generator': '윤진 자동',
  'jam-img': '아이콘 파이프라인',
}

/** 값이 없는 기존 배지(소급 채우기 전)의 표시 라벨 */
export const UNKNOWN_IMAGE_SOURCE_LABEL = '미상'

/**
 * 배지 목록 "제작 경로" 필터의 sentinel 값 — 실제 컬럼 값이 아니라 "값 없음(NULL)"을 뜻한다
 * (`UNASSIGNED_POI_CATEGORY`와 같은 관례, `badge-labels.ts`). 실제 `image_source` 값과
 * 충돌하지 않도록 서버(`badge-list-query.ts`)와 클라이언트(`BadgesFilterBar.tsx`)가 공유한다.
 */
export const UNKNOWN_IMAGE_SOURCE_FILTER = '__unknown__'

/** 모르는 값이 들어와도 화면이 비지 않도록 원시값을 그대로 돌려준다(`badgeTypeLabel`과 같은 관례) */
export function badgeImageSourceLabel(source: string | null | undefined): string {
  if (!source) return UNKNOWN_IMAGE_SOURCE_LABEL
  return BADGE_IMAGE_SOURCE_LABEL[source as BadgeImageSource] ?? source
}

/** 필터 드롭다운 옵션 — 값 3종 + "미상" */
export const IMAGE_SOURCE_FILTER_OPTIONS: { value: string; label: string }[] = [
  ...BADGE_IMAGE_SOURCES.map((source) => ({ value: source, label: BADGE_IMAGE_SOURCE_LABEL[source] })),
  { value: UNKNOWN_IMAGE_SOURCE_FILTER, label: UNKNOWN_IMAGE_SOURCE_LABEL },
]
