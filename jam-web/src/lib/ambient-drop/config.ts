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
  rarity_legend: 0,
  rarity_mythic: 0,
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
  'rarity_legend',
  'rarity_mythic',
  'batch_size',
  'max_active_per_poi',
] as const

export async function getAmbientDropConfig(): Promise<AmbientDropConfig> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.from('ambient_drop_config').select('*').eq('id', 1).single()
    if (error) {
      // 폴백은 유지하되(배치가 죽으면 안 됨) 실패 신호는 서버 로그에 남긴다
      console.error('[ambient-drop-config] 조회 실패 — 기본 설정으로 폴백:', error)
      return DEFAULT_AMBIENT_DROP_CONFIG
    }
    if (!data) return DEFAULT_AMBIENT_DROP_CONFIG

    const row = data as unknown as Record<string, unknown>
    const config = { ...DEFAULT_AMBIENT_DROP_CONFIG } as Record<string, unknown>
    for (const key of Object.keys(DEFAULT_AMBIENT_DROP_CONFIG)) {
      // 키 누락은 컬럼명 불일치 신호다 — 조용히 기본값으로 덮으면 저장 고장이 읽기에서 감춰진다
      // (티켓 20260831_1118: drop_policy가 이 경로로 41일간 무성 실패했다)
      if (!(key in row)) {
        console.error(`[ambient-drop-config] 컬럼 누락 — 기본값 사용: ${key}`)
        continue
      }
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
  } catch (e) {
    console.error('[ambient-drop-config] 조회 예외 — 기본 설정으로 폴백:', e)
    return DEFAULT_AMBIENT_DROP_CONFIG
  }
}

/**
 * @throws DB 제약 위반(category_slug의 poi_categories.slug FK 등) 시 에러 메시지를 던진다.
 *   조용히 실패하면 어드민이 저장 성공으로 오인한다.
 *
 *   과거 이 주석은 "drop_policy 필드들은 전부 순수 숫자라 이 실패 경로가 없었다"고 적고
 *   있었으나 티켓 20260831_1118이 이를 반증했다 — 값이 순수 숫자여도 **컬럼명이 어긋나면
 *   PostgREST가 PGRST204로 400을 반환한다.** 쓰기 error 확인에 예외 대상은 없다.
 *   (drop_policy의 동명 함수도 20260831_1118에서 같은 형태로 정리됐다)
 */
export async function updateAmbientDropConfig(patch: Partial<AmbientDropConfig>): Promise<void> {
  const supabase = createServiceClient()
  const table = supabase.from('ambient_drop_config')
  // @ts-expect-error Supabase upsert() 페이로드 타입 추론 제한(never) 우회 — 실제 필드는 AmbientDropConfigRow와 일치
  const { error } = await table.upsert({ id: 1, ...patch, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
}
