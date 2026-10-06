/**
 * 홈피드 카드 등록 전 DB 검사(티켓 20261002_0827) — `scripts/asset-generator/registerHomeFeedFlow.mjs`의
 * `runHomeFeedDbChecks`를 옮겼다. 동작·라벨·오류 문장·질의 순서는 그대로다. 스크립트는 같은 이름의 얇은 JS 래퍼로 이 함수를 부른다.
 */
import { createCheckCollector } from './shared'
import type { RegisterChecksClient, RegisterDbCheckResult } from './shared'

/** 검사가 읽는 카드 페이로드 필드(`buildTodayCardInsertPayload`가 만든 페이로드). */
export interface HomeFeedDbCheckInput {
  title: string
  starts_at: string
  mission_id?: string | null
  item_book_id?: string | null
  badge_ids: string[]
  ranking_mode_id?: string | null
  recipe_id?: string | null
}

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * `payload`는 `buildTodayCardInsertPayload`가 만든 페이로드(제목은 다듬어졌고 시작 일시는 UTC ISO 문자열이다).
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 */
export async function runHomeFeedDbChecks({
  supabase,
  payload,
}: {
  supabase: RegisterChecksClient | null | undefined
  payload: HomeFeedDbCheckInput
}): Promise<RegisterDbCheckResult> {
  const { checks, errors, add } = createCheckCollector(supabase)

  // 카드는 날짜만 다르게 같은 제목을 다시 쓸 수 있어 제목만 보면 정상 카드를 막는다 — 제목과 시작 일시를 함께 본다.
  // 동시에 두 번 등록하는 경합은 막지 못한다(단일 메인 세션 실행이 전제, 티켓 20260925_2106).
  await add('제목·시작 일시 중복', true, async (client) => {
    const { data, error } = await client.from('today_cards').select('id').eq('title', payload.title).eq('starts_at', payload.starts_at).limit(1)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (data && data.length > 0) {
      return `같은 제목·같은 시작 일시의 카드가 이미 있어요(id: ${data[0].id}). 기존 카드 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.`
    }
    return null
  })

  await add('미션 존재', typeof payload.mission_id === 'string', async (client) => {
    const { data, error } = await client.from('missions').select('id').eq('id', payload.mission_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `mission_id에 해당하는 미션이 없어요: ${payload.mission_id}`
  })

  await add('컬렉션 존재', typeof payload.item_book_id === 'string', async (client) => {
    const { data, error } = await client.from('item_books').select('id').eq('id', payload.item_book_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `item_book_id에 해당하는 컬렉션이 없어요: ${payload.item_book_id}`
  })

  await add('배지 존재', payload.badge_ids.length > 0, async (client) => {
    const { data, error } = await client.from('badges').select('id').in('id', payload.badge_ids).is('deleted_at', null)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    const found = new Set((data ?? []).map((row) => String(row.id).toLowerCase()))
    const missing = payload.badge_ids.filter((id) => !found.has(id.toLowerCase()))
    return missing.length === 0 ? null : `badge_ids에 해당하는 배지가 없거나 삭제됐어요: ${missing.join(', ')}`
  })

  await add('랭킹 모드 존재', typeof payload.ranking_mode_id === 'string', async (client) => {
    const { data, error } = await client.from('ranking_modes').select('id').eq('id', payload.ranking_mode_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `ranking_mode_id에 해당하는 랭킹 모드가 없어요: ${payload.ranking_mode_id}`
  })

  // 레시피는 공개 전이어도 가리킬 수 있다(카드가 레시피보다 먼저 공개돼도 막지 않는다, 티켓 20261006_1218) — 있는지만 본다.
  await add('레시피 존재', typeof payload.recipe_id === 'string', async (client) => {
    const { data, error } = await client.from('combination_recipes').select('id').eq('id', payload.recipe_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `recipe_id에 해당하는 레시피가 없어요: ${payload.recipe_id}`
  })

  return { checks, errors }
}
