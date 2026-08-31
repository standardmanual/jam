/**
 * 앰비언트(시스템) POI 드랍 설정(ambient_drop_config) 로딩 — service_role 클라이언트 전용
 * 패턴: src/lib/drop-engine/policy.ts (싱글톤 id=1, 실패 시 기본값 폴백)
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { AmbientDropConfigRow } from '@/types/database'

export type AmbientDropConfig = Omit<AmbientDropConfigRow, 'id' | 'updated_at'>

export const DEFAULT_AMBIENT_DROP_CONFIG: AmbientDropConfig = {
  auto_enabled: false,
  exclusion_window_minutes: 15,
  all_random: false,
  category_mode: 'random',
  category_slug: null,
  rarity_mode: 'explicit',
  // 운영값 — 티켓 20260826_009 §5: 현재 아이템배지 카탈로그는 common만 존재해 100% common으로 시작
  rarity_common: 1,
  rarity_rare: 0,
  rarity_epic: 0,
  rarity_mystic: 0,
  collection_mode: 'random',
  collection_ids: [],
  // 구 ambient_drop_policy(마이그레이션 044) 마지막 운영값(POI당 1개, 배치당 30개)을 초기값으로만 참고
  batch_size: 30,
  max_active_per_poi: 1,
}

const NUMERIC_KEYS = [
  'exclusion_window_minutes',
  'rarity_common',
  'rarity_rare',
  'rarity_epic',
  'rarity_mystic',
  'batch_size',
  'max_active_per_poi',
] as const

export async function getAmbientDropConfig(): Promise<AmbientDropConfig> {
  try {
    const supabase = createServiceClient()
    const { data } = await supabase.from('ambient_drop_config').select('*').eq('id', 1).single()
    if (!data) return DEFAULT_AMBIENT_DROP_CONFIG

    const row = data as unknown as Record<string, unknown>
    const config = { ...DEFAULT_AMBIENT_DROP_CONFIG } as Record<string, unknown>
    for (const key of Object.keys(DEFAULT_AMBIENT_DROP_CONFIG)) {
      const v = row[key]
      if (v === undefined) continue
      // NUMERIC 컬럼이 문자열로 내려올 수 있어 숫자로 정규화
      if ((NUMERIC_KEYS as readonly string[]).includes(key)) {
        const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
        if (!Number.isNaN(n)) config[key] = n
        continue
      }
      config[key] = v
    }
    return config as unknown as AmbientDropConfig
  } catch {
    return DEFAULT_AMBIENT_DROP_CONFIG
  }
}

/**
 * @throws category_slug가 poi_categories.slug FK를 위반하는 등 DB 제약에 걸리면 에러 메시지를 던진다.
 *   drop_policy의 동명 함수와 달리 명시적으로 검사한다 — category_slug에 실재 FK 제약이 있어
 *   (drop_policy 필드들은 전부 순수 숫자라 이 실패 경로가 없었다) 조용히 실패하면 어드민이
 *   저장 성공으로 오인할 수 있다.
 */
export async function updateAmbientDropConfig(patch: Partial<AmbientDropConfig>): Promise<void> {
  const supabase = createServiceClient()
  const table = supabase.from('ambient_drop_config')
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AmbientDropConfigRow와 일치
  const { error } = await table.upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
