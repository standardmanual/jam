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
import type { FamilyBadge } from './badge-families'

const PAGE_SIZE = 1000

export const FAMILY_BADGE_COLUMNS =
  'id, name, description, rarity, level, family_key, sort_order, image_url, condition_json, activity_types, deleted_at'

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
