/**
 * 계열 화면·계열 API가 공유하는 활동 배지 조회 (티켓 20260905_0032 B-1)
 *
 * ⚠️ **PostgREST 기본 페이지 상한(1000행)** — `.limit()`을 아무리 크게 줘도 서버 설정이
 * 우선해 **에러 없이 잘린 목록**이 돌아온다. 지금은 활동 배지가 207건이지만 v5 카탈로그
 * 시딩(티켓 20260905_0035)이 550종을 넣으면 750건대가 되고, 레벨을 더 늘리면 상한에 닿는다.
 * 잘린 목록으로 계열을 묶으면 **계열이 통째로 사라지거나 레벨이 빠진 채 표시된다** —
 * 그 상태에서 일괄 재계산을 돌리면 빠진 레벨만 옛 값으로 남는다. 그래서 이 함수는 경고에
 * 그치지 않고 `range`로 페이지를 끝까지 넘겨 **전량**을 가져온다
 * (`app/admin/badges/page.tsx`의 `fetchAllRows`와 같은 패턴).
 *
 * 서버 전용이다 — `createServiceClient`가 `next/headers`를 물어 클라이언트 컴포넌트에서
 * import할 수 없다. 순수 판정은 `badge-families.ts`에 있다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import {
  filterFamilies,
  groupBadgesIntoFamilies,
  sortFamilies,
  type BadgeFamily,
  type FamilyBadge,
  type FamilyListParams,
} from './badge-families'
import { ADMIN_LIST_PAGE_SIZE, pageRange } from './list-params'

const PAGE_SIZE = 1000

export const FAMILY_BADGE_COLUMNS =
  'id, name, description, rarity, level, family_key, sort_order, image_url, condition_json, activity_types, deleted_at, admin_category'

export interface FamilyBadgeFetchResult {
  badges: FamilyBadge[]
  /** 조회 중 오류가 났으면 그 메시지 — 부분 목록으로 계열을 그리지 않도록 화면이 알린다 */
  error: string | null
}

/**
 * 활동 배지 전량(소프트 삭제 제외)을 계열 그룹핑에 필요한 컬럼만 가져온다.
 *
 * 소프트 삭제를 빼는 이유: 계열 화면의 모든 동작(레벨 추가·일괄 재계산·키 발급)이 «살아
 * 있는 계열»을 대상으로 한다. 삭제된 배지를 섞으면 「Lv.3까지 있는 계열」로 보이는데
 * 실제 발급 대상은 Lv.2까지인 상태가 된다(`sync.ts`도 같은 이유로 제외한다).
 */
export async function fetchActivityFamilyBadges(): Promise<FamilyBadgeFetchResult> {
  const supabase = createServiceClient()
  const badges: FamilyBadge[] = []

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('badges')
      .select(FAMILY_BADGE_COLUMNS)
      .eq('type', 'activity')
      .is('deleted_at', null)
      .order('id')
      .range(from, from + PAGE_SIZE - 1)

    if (error) return { badges, error: error.message }
    const page = (data ?? []) as unknown as FamilyBadge[]
    badges.push(...page)
    if (page.length < PAGE_SIZE) break
  }

  return { badges, error: null }
}

export interface FamilyListResult {
  /** 조건을 걸기 전 전체 계열 — 필터 선택지와 "전체 N개 중" 표시에 쓴다 */
  all: BadgeFamily[]
  /** 조건에 맞는 계열 전체(정렬 적용, 쪽 나누기 전) — 전체 선택 ID 조회·내보내기가 쓴다 */
  matched: BadgeFamily[]
  /** 현재 쪽에 보일 계열 */
  items: BadgeFamily[]
  /** 실제로 적용한 쪽 번호 — 요청한 쪽이 마지막 쪽을 넘으면 마지막 쪽으로 맞춘다 */
  page: number
  /** 계열로 묶기 전 활동 배지 수 */
  badgeCount: number
  /** 배지 조회 중 오류 메시지(부분 목록으로 그리지 않도록 화면이 알린다) */
  error: string | null
}

/**
 * 계열 목록 한 함수(티켓 20260924_0949) — 조회 → 계열로 묶기 → 필터 → 정렬 → 쪽 나누기를
 * 한 번에 한다. 목록 페이지와 전체 선택 ID 조회(`api/admin/badge-families/ids`)·내보내기가
 * 함께 써서 화면의 "총 N개"와 선택 건수가 갈라지지 않는다. 계열은 그룹핑이 끝난 뒤에야
 * 필터 축(사용 조건 지표)을 알 수 있어 DB가 아닌 메모리에서 거르고, 쪽 나누기도 메모리에서
 * 50건씩 한다(계열은 100여 건 규모).
 */
export async function listFamilies(params: FamilyListParams): Promise<FamilyListResult> {
  const { badges, error } = await fetchActivityFamilyBadges()
  const all = groupBadgesIntoFamilies(badges)
  const filtered = filterFamilies(all, {
    q: params.q,
    activityType: params.activityType,
    conditionKey: params.conditionKey,
  })
  const matched = sortFamilies(filtered, params.sort)

  const totalPages = Math.max(1, Math.ceil(matched.length / ADMIN_LIST_PAGE_SIZE))
  const page = Math.min(params.page, totalPages)
  const [from, to] = pageRange(page, ADMIN_LIST_PAGE_SIZE)

  return { all, matched, items: matched.slice(from, to + 1), page, badgeCount: badges.length, error }
}
