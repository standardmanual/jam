/**
 * 섀도우밴 체크 + 드랍률 조정
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Database, Json } from '@/types/database.generated'
import { DEFAULT_POLICY, type AbusingPolicy } from './policy'
import { BAN_RATE_KEY } from './rate-keys'
import { chunkIds } from './chunk-ids'
import type { BadgeRarity } from '@/types/database'

export type BanLevel = 'none' | 'soft' | 'hard'

// 밴 레벨 × 등급 → 정책 배율 키 맵(`BAN_RATE_KEY`)은 `rate-keys.ts`가 소유한다.
// `policy.ts`의 `RATE_KEYS`(어드민 검증 대상 키 집합)도 같은 맵에서 파생돼, 두 곳이 8개 키를
// 각각 하드코딩하던 중복(티켓 20260831_1329)이 사라졌다. 배선이 맞는지(자기 키를 읽는지)를
// 고정하는 sentinel 테스트는 `__tests__/shadow-ban.test.ts`에 있다.
//
// 이전에는 `${banLevel}_${rarity}_rate`를 런타임 문자열로 조합했다. 그래서 2026-08-13
// 등급명 rename(티켓 20260813_003) 누락이 타입 검사에 걸리지 않았고, 조합한 키가 정책에
// 없다는 사실이 `?? 1.0` 폴백을 타 **Epic 차단이 18일간 무음으로 꺼졌다**
// (티켓 20260831_1149·1259).

/** 유저의 현재 밴 레벨 반환 (만료된 밴은 none) */
export async function getUserBanLevel(userId: string): Promise<BanLevel> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase
      .from('user_shadow_bans')
      .select('ban_level, expires_at')
      .eq('user_id', userId)
      .maybeSingle()

    if (!data) return 'none'
    if (data.expires_at && new Date(data.expires_at) < new Date()) return 'none'

    // 마이그레이션 010의 `CHECK (ban_level IN ('soft','hard'))` 제약이 막고 있어 현재는
    // 도달 불가하지만, 제약이 완화되면 검증 없는 `as BanLevel` 캐스팅이 임의 문자열을
    // 그대로 통과시킨다. 그 값이 `BAN_RATE_KEY`에 없으면 `shouldAllowDrop`에서
    // `BAN_RATE_KEY[banLevel]`가 undefined가 되어 TypeError가 드랍 경로로 전파된다
    // (티켓 20260831_1259 미분리 기록 → 20260901_1843에서 방어).
    // 밴 레코드 자체는 존재하므로(=이 유저는 이미 제재 대상으로 확인됨) fail-closed 원칙에
    // 따라 알 수 없는 레벨은 가장 강한 제재(hard)로 취급한다 — `getUserBanLevel` 자체가
    // 통째로 실패했을 때의 fail-open('none', 아래 catch)과는 다른 상황이다: 그쪽은 "밴 여부를
    // 아예 모르는" DB 전체 장애이고, 여기는 "밴은 확인됐는데 레벨 값만 이상한" 경우다.
    if (data.ban_level !== 'soft' && data.ban_level !== 'hard') {
      console.error(
        `[shadow-ban] 알 수 없는 ban_level 값이라 hard로 취급합니다 — userId: ${userId}, value: ${String(data.ban_level)}`
      )
      return 'hard'
    }
    return data.ban_level
  } catch {
    return 'none'
  }
}

/**
 * 밴 레벨과 정책에 따라 해당 rarity 드랍을 허용할지 결정
 *
 * **폴백 방향 (fail-open이 아니다 — 티켓 20260831_1259)**
 * - 맵에 없는 등급: `false`(fail-closed). 이 분기는 `banLevel !== 'none'`, 즉 **이미 밴이 확인된
 *   유저**에게만 닿으므로 정상 유저에게 영향이 없다. DB enum이 TS 타입보다 앞서가는 구간에서
 *   밴 유저의 미지 등급을 막는 쪽이 안전하다. 실효 결과는 "드랍 취소"가 아니라 **"common 강등"**
 *   이다 — 호출부 `applyShadowBanCap()`이 차단된 등급을 common으로 낮춰 재판정한다.
 * - 키는 있으나 값이 없거나 숫자가 아님: `DEFAULT_POLICY[rateKey]`. 폴백 소스를
 *   `getAbusingPolicy()`와 일치시켜 **어느 폴백을 타든 결과가 같게** 만든다. 전면 허용(`?? 1.0`)은
 *   차단을 통째로 끄고, 전면 차단(`?? 0`)은 common까지 막아 장애를 서비스 정지로 키운다.
 * - 두 분기 모두 `console.error`를 남긴다. 18일 무음의 직접 원인이 "폴백에 신호가 없었다"였다.
 *
 * @returns 드랍 허용 여부 (false면 이 rarity 드랍 취소)
 */
export function shouldAllowDrop(
  rarity: BadgeRarity,
  banLevel: BanLevel,
  policy: AbusingPolicy
): boolean {
  if (banLevel === 'none') return true

  // DB의 rarity enum이 TS 타입보다 앞서갈 수 있어(마이그레이션 선행·롤백 구간) 맵 조회 결과를
  // undefined 가능으로 받는다. 타입상으로는 항상 존재하지만 런타임 방어가 필요한 지점이다.
  const rateKey = BAN_RATE_KEY[banLevel][rarity] as keyof AbusingPolicy | undefined
  if (!rateKey) {
    console.error(
      `[shadow-ban] 알 수 없는 등급이라 드랍을 차단합니다 — rarity: ${rarity}, banLevel: ${banLevel}`
    )
    return false
  }

  const raw = policy[rateKey]
  let rate = typeof raw === 'number' ? raw : NaN
  if (Number.isNaN(rate)) {
    rate = DEFAULT_POLICY[rateKey]
    console.error(
      `[shadow-ban] 정책 값이 없거나 숫자가 아니라 기본 정책으로 대체합니다 — ${rateKey}: ${String(raw)} → ${rate}`
    )
  }

  if (rate <= 0) return false
  if (rate >= 1) return true
  // 부분 확률 — 추가 확률 롤
  return Math.random() < rate
}

/**
 * 섀도우밴 적용 (admin 또는 자동 감지). 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 upsert 반환 error를 확인하지 않아 밴 부여 실패가 "적용됨"으로 처리됐다 — 티켓 20260901_1843)
 */
export async function applyBan(
  userId: string,
  level: BanLevel,
  reason: string,
  createdBy: string = 'system',
  expiresAt?: Date
): Promise<void> {
  if (level === 'none') return
  const supabase = createServiceClient()
  const table = supabase.from('user_shadow_bans')
  const payload = {
    user_id: userId,
    ban_level: level,
    reason,
    created_by: createdBy,
    expires_at: expiresAt?.toISOString() ?? null,
  }
  const { error } = await table.upsert(payload, { onConflict: 'user_id' })
  if (error) {
    console.error(`[shadow-ban] 밴 부여 실패 (userId: ${userId}, level: ${level}):`, error)
    throw new Error(`user_shadow_bans upsert 실패 (${error.code}): ${error.message}`)
  }

  // 로그 기록 실패는 밴 적용 자체를 실패로 만들지 않는다(logAbusingEvent가 내부에서 흡수·로깅한다).
  await logAbusingEvent(userId, `${level}_ban_applied`, { reason, created_by: createdBy })
}

/**
 * 섀도우밴 해제. 실패하면 호출부가 인지하도록 예외를 던진다.
 * (이전에는 delete 반환 error를 확인하지 않아 해제 실패가 "해제됨"으로 처리됐다 — 티켓 20260901_1843)
 */
export async function removeBan(userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('user_shadow_bans').delete().eq('user_id', userId)
  if (error) {
    console.error(`[shadow-ban] 밴 해제 실패 (userId: ${userId}):`, error)
    throw new Error(`user_shadow_bans delete 실패 (${error.code}): ${error.message}`)
  }
}

/**
 * 어뷰징 이벤트 로그 기록. 로그는 부가 정보이므로 실패해도 호출부(밴 적용·GPS 감지 등 핵심
 * 동작)를 막지 않도록 예외를 던지지 않는다 — 다만 실패 자체는 반드시 서버 로그에 남긴다
 * (이전에는 `catch {}`로 완전히 무음이었다 — 티켓 20260901_1843).
 */
export async function logAbusingEvent(
  userId: string,
  eventType: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const logsTable = supabase.from('abusing_logs')
    // abusing_logs.detail은 jsonb 컬럼이라 생성 타입이 Json이다. 호출부 편의를 위해 파라미터는
    // Record<string, unknown>으로 받고 있어(값 타입이 unknown이라 Json에 직접 대입 불가) 이
    // 한 필드만 Json으로 단언한다 — 나머지 컬럼은 이름·타입 검사를 그대로 받는다.
    const payload = { user_id: userId, event_type: eventType, detail: (detail ?? null) as Json }
    const { error } = await logsTable.insert(payload)
    if (error) {
      console.error(`[shadow-ban] 어뷰징 이벤트 로그 기록 실패 (userId: ${userId}, eventType: ${eventType}):`, error)
    }
  } catch (e) {
    console.error(`[shadow-ban] 어뷰징 이벤트 로그 기록 예외 (userId: ${userId}, eventType: ${eventType}):`, e)
  }
}

export type ShadowBanRecord = Database['public']['Tables']['user_shadow_bans']['Row']

/**
 * 제재 등급만 바꾼다(티켓 20260924_0952). `applyBan`은 upsert라 `expires_at`을 null로 덮어
 * 임시 제재가 영구 제재로 바뀌므로 등급 전환에 쓸 수 없다 — 여기서는 `ban_level` 한 칸만 갱신한다.
 * 그 행이 없으면 `false`. 실패하면 예외를 던진다.
 */
export async function changeBanLevel(id: string, level: 'soft' | 'hard'): Promise<boolean> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_shadow_bans')
    .update({ ban_level: level })
    .eq('id', id)
    .select('id')
  if (error) {
    console.error(`[shadow-ban] 등급 전환 실패 (id: ${id}, level: ${level}):`, error)
    throw new Error(`user_shadow_bans update 실패 (${error.code}): ${error.message}`)
  }
  return (data ?? []).length > 0
}

export interface AbusingLogEntry {
  user_id: string
  event_type: string
  detail: Record<string, Json | undefined>
}

/**
 * 여러 건의 어뷰징 로그를 한 문장으로 기록한다. 지운 행의 유일한 기록이라 실패하면 지운 내용을
 * 서버 로그에 통째로 남기고 `false`를 돌려준다(호출부는 이미 지운 뒤라 되돌릴 수 없다).
 */
export async function logAbusingEvents(entries: AbusingLogEntry[]): Promise<boolean> {
  if (entries.length === 0) return true
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from('abusing_logs').insert(entries)
    if (error) {
      console.error('[shadow-ban] 어뷰징 로그 일괄 기록 실패 — 기록하지 못한 내용:', JSON.stringify(entries), error)
      return false
    }
    return true
  } catch (e) {
    console.error('[shadow-ban] 어뷰징 로그 일괄 기록 예외 — 기록하지 못한 내용:', JSON.stringify(entries), e)
    return false
  }
}

export interface ReleaseBansResult {
  /** 실제로 지워진 행 — 이미 없던 id는 들어 있지 않다 */
  released: ShadowBanRecord[]
  /** 지운 행을 `abusing_logs`에 모두 남겼는지 */
  logged: boolean
  /** 묶음 하나가 실패하면 그 뒤 묶음은 시도하지 않고 메시지를 담는다 */
  error: string | null
}

/**
 * 제재 일괄 해제(티켓 20260924_0952). 예전 해제는 행 삭제만 해서 누가 언제 풀었는지 남지
 * 않았다 — 200건 묶음마다 `delete().in('id', ids).select('*')` 한 문장으로 지운 뒤, 지운 행을
 * 실행 어드민과 함께 `abusing_logs`에 기록한다(스키마 변경 없음, 기존 칸만 사용).
 */
export async function releaseBans(ids: string[], releasedBy: string): Promise<ReleaseBansResult> {
  const supabase = createServiceClient()
  const released: ShadowBanRecord[] = []
  let logged = true

  for (const idsChunk of chunkIds(ids)) {
    const { data, error } = await supabase.from('user_shadow_bans').delete().in('id', idsChunk).select('*')
    if (error) {
      console.error('[shadow-ban] 일괄 해제 실패:', error)
      return { released, logged, error: `user_shadow_bans delete 실패 (${error.code}): ${error.message}` }
    }
    const rows = data ?? []
    released.push(...rows)
    const ok = await logAbusingEvents(
      rows.map((row) => ({
        user_id: row.user_id,
        event_type: 'ban_released',
        detail: {
          ban_level: row.ban_level,
          reason: row.reason,
          expires_at: row.expires_at,
          created_at: row.created_at,
          created_by: row.created_by,
          released_by: releasedBy,
        },
      }))
    )
    if (!ok) logged = false
  }

  return { released, logged, error: null }
}

export interface ExtendResult {
  /** 실제로 만료가 늦춰진 행 */
  updatedIds: string[]
  error: string | null
}

/**
 * 제재 만료 연장(티켓 20260924_0952). `expires_at < until` 조건을 문장에 함께 걸어, 영구
 * 제재(`expires_at`이 null이면 비교가 거짓)와 이미 더 오래 가는 제재는 갱신에서 자연히 빠진다.
 */
export async function extendBans(ids: string[], until: Date): Promise<ExtendResult> {
  const supabase = createServiceClient()
  const untilIso = until.toISOString()
  const updatedIds: string[] = []

  for (const idsChunk of chunkIds(ids)) {
    const { data, error } = await supabase
      .from('user_shadow_bans')
      .update({ expires_at: untilIso })
      .in('id', idsChunk)
      .lt('expires_at', untilIso)
      .select('id')
    if (error) {
      console.error('[shadow-ban] 만료 연장 실패:', error)
      return { updatedIds, error: `user_shadow_bans update 실패 (${error.code}): ${error.message}` }
    }
    updatedIds.push(...(data ?? []).map((row) => row.id))
  }

  return { updatedIds, error: null }
}
