import { extractBadgeColors } from '@/lib/badgeColorExtract'

/**
 * 어드민 배지 이미지 쓰기 경로가 `bg_colors`를 같은 쓰기에 담는 공용 헬퍼 (티켓 20261119_1652, 상위 20261119_1650)
 *
 * `badges.image_url`을 바꾸는 경로마다 추출 호출을 복사하지 않도록 한 곳에 둔다. 반환값은 update/insert
 * 페이로드에 펼쳐 넣는 조각이다.
 * - 추출 성공(색 없음 `[]` 포함) → `{ bg_colors }`
 * - 추출 실패(`null`)·이미지 주소 없음 → `{}`. 저장을 실패시키지 않는다. 이미지가 바뀐 경우라면 마이그레이션 347의
 *   트리거(`badges_bg_colors_stale_guard`)가 `bg_colors`를 NULL로 비워 낡은 색이 남지 않는다.
 */
export type BadgeBgColorsFields = { bg_colors?: string[] }

function normalize(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** 이미지 주소에서 대표색을 뽑아 저장할 필드 조각을 만든다. 추출이 던져도 `{}`다. */
export async function badgeBgColorsFields(imageUrl: string | null | undefined): Promise<BadgeBgColorsFields> {
  const url = normalize(imageUrl)
  if (!url) return {}
  try {
    const colors = await extractBadgeColors(url)
    return colors === null ? {} : { bg_colors: colors }
  } catch {
    return {}
  }
}

/**
 * 폼 저장(PUT)용 — 이미지가 실제로 바뀐 경우에만 새로 뽑는다. 본문에 이미지가 없거나(undefined)
 * 기존과 같으면 `{}`라서 기존 색을 건드리지 않는다.
 */
export async function badgeBgColorsFieldsIfChanged(
  existing: string | null | undefined,
  next: string | null | undefined
): Promise<BadgeBgColorsFields> {
  if (next === undefined) return {}
  if (normalize(existing) === normalize(next)) return {}
  return badgeBgColorsFields(next)
}
