/**
 * 배지 등록 전 DB 검사(티켓 20261002_0827) — `scripts/asset-generator/registerFlow.mjs`의 `runDbChecks`를 옮겼다.
 * 동작·라벨·오류 문장·질의 순서는 그대로다. 스크립트는 `runDbChecks`라는 얇은 JS 래퍼로 이 함수를 부른다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { findCheckinBadgeNamesNotFoundError } from '@/lib/admin/badge-validation'
import type { BadgeCondition } from '@/types/database'
import { createCheckCollector } from './shared'
import type { RegisterChecksClient, RegisterDbCheckResult } from './shared'

/** 검사가 읽는 배지 필드(`validateBundle`이 돌려준 정규화된 묶음의 `badge`). */
export interface BadgeDbCheckInput {
  name: string
  tribe_id?: string | null
  item_book_id?: string | null
  condition_json?: BadgeCondition | null
}

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 */
export async function runBadgeDbChecks({
  supabase,
  badge,
}: {
  supabase: RegisterChecksClient | null | undefined
  badge: BadgeDbCheckInput
}): Promise<RegisterDbCheckResult> {
  const { checks, errors, add } = createCheckCollector(supabase)

  await add('이름 중복', true, async (client) => {
    const { data, error } = await client.from('badges').select('id').eq('name', badge.name).is('deleted_at', null).limit(1)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (data && data.length > 0) {
      return `같은 이름의 배지가 이미 있어요(id: ${data[0].id}). 기존 배지 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.`
    }
    return null
  })

  await add('트라이브 존재', Boolean(badge.tribe_id), async (client) => {
    const { data, error } = await client.from('tribes').select('id').eq('id', badge.tribe_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `tribe_id에 해당하는 트라이브가 없어요: ${badge.tribe_id}`
  })

  await add('컬렉션 존재', Boolean(badge.item_book_id), async (client) => {
    const { data, error } = await client.from('item_books').select('id').eq('id', badge.item_book_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `item_book_id에 해당하는 컬렉션이 없어요: ${badge.item_book_id}`
  })

  const checkinNames = badge.condition_json?.checkin_badge_count?.checkin_badge_names
  await add('체크인 배지 이름 목록', Array.isArray(checkinNames) && checkinNames.length > 0, async (client) => {
    // 어드민 API와 같은 함수를 그대로 쓴다(조회 자체가 실패하면 함수가 통과로 본다 — 발급 시점이 안전망이다).
    // 그 함수는 `SupabaseClient`를 요구하는데 이 모듈의 클라이언트는 스텁도 받는 최소 인터페이스라, 타입을 맞추는 곳은 여기 한 곳뿐이다.
    // 함수가 쓰는 건 `from('badges').select().eq().in()`뿐이라 두 쪽 모두 런타임에서 들어맞는다.
    return findCheckinBadgeNamesNotFoundError(badge.condition_json ?? null, client as unknown as SupabaseClient)
  })

  return { checks, errors }
}
