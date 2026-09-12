/**
 * 쉐이더 텍스트 생성기 — 배지 검색 요청 해석·페이징 (티켓 20260912_1532)
 *
 * `20260902_1613`(액티비티 배지 이미지 생성기)의 `activityBadgeImageSearch.ts`와 같은 이유로
 * 라우트 밖 순수 함수로 뺐다 — DOM·Supabase에 의존하지 않아 라우트와 테스트가 같은 함수를 쓴다.
 *
 * 이 검색은 **대상 배지 타입 제한이 없다**(activity/item/checkin 전체, 티켓 명시) — `type`
 * 필터는 선택 사항으로만 제공한다.
 */
import type { BadgeType } from '@/types/database'

export const SHADER_TEXT_SEARCH_PAGE_SIZE = 50

const BADGE_TYPES: BadgeType[] = ['activity', 'item', 'checkin']

export interface ShaderTextBadgeSearchParams {
  q: string
  type: BadgeType | null
  page: number
}

export function parseShaderTextBadgeSearchParams(body: unknown): ShaderTextBadgeSearchParams {
  const raw = (body ?? {}) as Record<string, unknown>

  const rawQuery = typeof raw.q === 'string' ? raw.q : ''
  // PostgREST 필터 문법(쉼표/괄호)과 LIKE 와일드카드를 깨뜨리는 문자는 제거 (기존 검색과 동일 패턴)
  const q = rawQuery.replace(/[,()%_*\\]/g, ' ').trim()

  const type =
    typeof raw.type === 'string' && (BADGE_TYPES as string[]).includes(raw.type) ? (raw.type as BadgeType) : null

  const rawPage = Number(raw.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1

  return { q, type, page }
}

/** 페이지 번호 → PostgREST `range` 경계(0-based, 양 끝 포함) */
export function shaderTextBadgeSearchRange(page: number): { from: number; to: number } {
  const from = (page - 1) * SHADER_TEXT_SEARCH_PAGE_SIZE
  return { from, to: from + SHADER_TEXT_SEARCH_PAGE_SIZE - 1 }
}

/** 전체 건수 → 페이지 수(최소 1) */
export function shaderTextBadgeSearchTotalPages(total: number): number {
  return Math.max(1, Math.ceil(total / SHADER_TEXT_SEARCH_PAGE_SIZE))
}
