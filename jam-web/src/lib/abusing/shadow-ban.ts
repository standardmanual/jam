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
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 UserShadowBanRow와 일치
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
    const payload = { user_id: userId, event_type: eventType, detail: detail ?? null }
    // @ts-expect-error Supabase insert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AbusingLogRow와 일치
    await logsTable.insert(payload)
  } catch {
    // 로그 실패는 무시
  }
}
