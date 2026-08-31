/**
 * 섀도우밴 체크 + 드랍률 조정
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.generated'
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
    if (data.expires_at && new Date(data.expires_at) < new Date()) return 'none'
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

/** 섀도우밴 적용 (admin 또는 자동 감지) */
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
  await table.upsert(payload, { onConflict: 'user_id' })

  await logAbusingEvent(userId, `${level}_ban_applied`, { reason, created_by: createdBy })
}

/** 섀도우밴 해제 */
export async function removeBan(userId: string): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('user_shadow_bans').delete().eq('user_id', userId)
}

/** 어뷰징 이벤트 로그 기록 */
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
    await logsTable.insert(payload)
  } catch {
    // 로그 실패는 무시
  }
}
