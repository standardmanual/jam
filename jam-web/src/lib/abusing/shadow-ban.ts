/**
 * 섀도우밴 체크 + 드랍률 조정
 * service_role 클라이언트 전용
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AbusingPolicy } from './policy'
import type { BadgeRarity } from '@/types/database'

export type BanLevel = 'none' | 'soft' | 'hard'

export interface ShadowBanRow {
  id: string
  user_id: string
  ban_level: BanLevel
  reason: string
  expires_at: string | null
  created_at: string
  created_by: string
}

/** 유저의 현재 밴 레벨 반환 (만료된 밴은 none) */
export async function getUserBanLevel(userId: string): Promise<BanLevel> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('user_shadow_bans')
    .upsert({
      user_id: userId,
      ban_level: level,
      reason,
      created_by: createdBy,
      expires_at: expiresAt?.toISOString() ?? null,
    }, { onConflict: 'user_id' })

  await logAbusingEvent(userId, `${level}_ban_applied`, { reason, created_by: createdBy })
}

/** 섀도우밴 해제 */
export async function removeBan(userId: string): Promise<void> {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('user_shadow_bans').delete().eq('user_id', userId)
}

/** 어뷰징 이벤트 로그 기록 */
export async function logAbusingEvent(
  userId: string,
  eventType: string,
  detail?: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = createServiceClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('abusing_logs').insert({
      user_id: userId,
      event_type: eventType,
      detail: detail ?? null,
    })
  } catch {
    // 로그 실패는 무시
  }
}
