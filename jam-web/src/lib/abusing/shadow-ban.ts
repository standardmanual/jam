/**
 * 섀도우밴 체크 + 드랍률 조정
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AbusingPolicy } from './policy'
import type { BadgeRarity } from '@/types/database'

export type BanLevel = 'none' | 'soft' | 'hard'

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
    // @ts-expect-error try/catch + 명시적 Promise 반환 타입 조합에서 supabase-js 추론이 무너지는 TS 특이 케이스(jam-web/src/lib/abusing/poi-block.ts와 동일 패턴) — data는 UserShadowBanRow의 ban_level/expires_at 컬럼을 가짐
    if (data.expires_at && new Date(data.expires_at) < new Date()) return 'none'
    // @ts-expect-error 위와 동일한 TS 추론 특이 케이스
    return data.ban_level as BanLevel
  } catch {
    return 'none'
  }
}

/**
 * 밴 레벨과 정책에 따라 해당 rarity 드랍을 허용할지 결정
 * @returns 드랍 허용 여부 (false면 이 rarity 드랍 취소)
 */
export function shouldAllowDrop(
  rarity: BadgeRarity,
  banLevel: BanLevel,
  policy: AbusingPolicy
): boolean {
  if (banLevel === 'none') return true

  const rateKey = `${banLevel}_${rarity}_rate` as keyof AbusingPolicy
  const rate = policy[rateKey] as number ?? 1.0

  if (rate <= 0) return false
  if (rate >= 1) return true
  // 부분 확률 — 추가 확률 롤
  return Math.random() < rate
}

/**
 * 섀도우밴 적용 (admin 또는 자동 감지)
 *
 * 실패하면 예외를 던진다 — 흡수는 호출부에서 한다. 어드민(`api/admin/abusing/bans`)은
 * 그대로 500으로 전파하고, GPS 조작 자동 감지 경로(`api/drops/[dropId]/pickup`)는
 * `Promise.allSettled`로 흡수해 403 응답을 유지한다 (티켓 20260831_1149).
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
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserShadowBanRow와 일치
  const { error } = await table.upsert(payload, { onConflict: 'user_id' })
  if (error) {
    console.error('[shadow-ban] 밴 적용 실패:', error)
    throw new Error(`user_shadow_bans upsert 실패 (${error.code}): ${error.message}`)
  }

  await logAbusingEvent(userId, `${level}_ban_applied`, { reason, created_by: createdBy })
}

/** 섀도우밴 해제. 실패하면 운영자가 알 수 있게 예외를 던진다. */
export async function removeBan(userId: string): Promise<void> {
  const supabase = createServiceClient()
  const { error } = await supabase.from('user_shadow_bans').delete().eq('user_id', userId)
  if (error) {
    console.error('[shadow-ban] 밴 해제 실패:', error)
    throw new Error(`user_shadow_bans delete 실패 (${error.code}): ${error.message}`)
  }
}

/**
 * 어뷰징 이벤트 로그 기록
 *
 * 로그 실패가 본 흐름(밴 적용·픽업 차단)을 깨뜨리면 안 되므로 예외를 던지지 않는다.
 * 다만 조용히 사라지지도 않게 한다 — `supabase-js`는 실패해도 throw하지 않으므로
 * 아래 try/catch만으로는 insert 실패가 전혀 잡히지 않았다 (티켓 20260831_1149).
 */
export async function logAbusingEvent(
  userId: string,
  eventType: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    const logsTable = supabase.from('abusing_logs')
    const payload = { user_id: userId, event_type: eventType, detail: detail ?? null }
    // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AbusingLogRow와 일치
    const { error } = await logsTable.insert(payload)
    if (error) {
      console.error(`[abusing-log] 기록 실패 — userId: ${userId}, event: ${eventType}:`, error)
    }
  } catch (e) {
    // 네트워크 예외 등 throw 경로 (본 흐름을 끌고 들어가지 않는다)
    console.error(`[abusing-log] 기록 중 예외 — userId: ${userId}, event: ${eventType}:`, e)
  }
}
