/**
 * 인벤토리 최대 슬롯 수(inventory.max_slots) 전역 정책 — service_role 클라이언트 전용.
 * 싱글톤 id=1, 실패 시 기본값 폴백.
 * 티켓 20260904_1623.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { InventoryPolicyRow } from '@/types/database'

export type InventoryPolicy = Pick<InventoryPolicyRow, 'max_slots'>

/**
 * DB를 못 읽을 때 쓰는 폴백값이다. 운영 중인 값(10칸, 사용자 결정 2026-10-31)과 맞춘다.
 * 컬럼 DEFAULT(001_initial_schema.sql:137)는 50이지만 운영 행(id=1)이 10이라, 폴백이 50이면
 * DB를 못 읽을 때만 칸 수가 갑자기 늘어난다. src/lib/abusing/policy.ts DEFAULT_POLICY 주석 참고.
 */
export const DEFAULT_INVENTORY_POLICY: InventoryPolicy = { max_slots: 10 }

export async function getInventoryPolicy(): Promise<InventoryPolicy> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('inventory_policy')
      .select('max_slots')
      .eq('id', 1)
      .single()
    if (error) {
      console.error('[inventory-policy] 조회 실패 — 기본 정책으로 폴백:', error)
      return DEFAULT_INVENTORY_POLICY
    }
    if (!data) return DEFAULT_INVENTORY_POLICY
    const maxSlots = typeof data.max_slots === 'string' ? parseInt(data.max_slots, 10) : data.max_slots
    if (!Number.isFinite(maxSlots)) return DEFAULT_INVENTORY_POLICY
    return { max_slots: maxSlots }
  } catch (e) {
    console.error('[inventory-policy] 조회 예외 — 기본 정책으로 폴백:', e)
    return DEFAULT_INVENTORY_POLICY
  }
}

/** 정책 영향을 받는 유저 수 = inventory 테이블 전체 row 수 (전체 유저 일괄 적용이므로). */
export async function getInventoryUserCount(): Promise<number> {
  const supabase = createServiceClient()
  const { count, error } = await supabase.from('inventory').select('*', { count: 'exact', head: true })
  if (error) {
    console.error('[inventory-policy] 유저 수 조회 실패:', error)
    throw new Error(`inventory count 조회 실패 (${error.code}): ${error.message}`)
  }
  return count ?? 0
}

/** set_inventory_max_slots RPC가 던지는 예외 메시지에 붙는 식별 접두어. */
export const INVENTORY_MAX_SLOTS_OVER_LIMIT_PREFIX = 'INVENTORY_MAX_SLOTS_OVER_LIMIT:'
export const INVENTORY_MAX_SLOTS_INVALID_PREFIX = 'INVENTORY_MAX_SLOTS_INVALID:'

/**
 * 인벤토리 최대 슬롯 수를 전체 유저 일괄로 저장한다.
 * - 기존 유저: inventory 테이블 전체 row의 max_slots를 새 값으로 UPDATE
 * - 신규 유저: inventory_policy 행을 갱신해 handle_new_user() 트리거가 반영하게 함
 * 두 작업은 set_inventory_max_slots() DB 함수 안에서 원자적으로 처리된다
 * (129_inventory_policy_max_slots.sql).
 *
 * 실패하면 호출부가 인지하도록 예외를 던진다. 이미 새 최대치보다 많은 아이템을 보유한
 * 유저가 있으면 메시지가 `INVENTORY_MAX_SLOTS_OVER_LIMIT:`로 시작한다 — 호출부(밸런스 설정의
 * 인벤토리 구역, `lib/admin/balance/inventory.ts`)가 이를 구분해 [현상]-[원인]-[해결책] 구조의
 * 사용자용 메시지로 변환한다.
 *
 * `supabase`는 호출부가 이미 만든 서비스 클라이언트를 넘길 때만 쓴다(밸런스 설정의 시험이 가짜
 * 클라이언트를 넘긴다). 생략하면 지금까지처럼 새로 만든다.
 */
export async function updateInventoryMaxSlots(
  maxSlots: number,
  supabase: ReturnType<typeof createServiceClient> = createServiceClient()
): Promise<number> {
  const { data, error } = await supabase.rpc('set_inventory_max_slots', { p_max_slots: maxSlots })
  if (error) {
    console.error('[inventory-policy] 저장 실패:', error)
    throw new Error(error.message)
  }
  return typeof data === 'number' ? data : 0
}
