/**
 * 신호 기준값 덮어쓰기 읽기 (티켓 20260930_1459 조각 C).
 *
 * 기준값의 기본값은 `thresholds.ts`(와 운영툴 PRD §5.1 표) 한 곳에만 있다. S7(운영 설정)에서 바꾼 값만 `ops_rules`에 `rule_group = 'signal'` 행으로 남고
 * (행 키 = 기준값 키, 값 모양 `{"value": <값>}`), 이 파일이 그 행을 읽어 `Partial<OpsSignalThresholdValues>`로 바꾼다. 신호 계산(`compute.ts`의
 * `options.thresholds`)과 데이터 읽는 범위(`load.ts`)가 이 값을 얹어 쓴다.
 *
 * - **읽기만 한다**(`select`). 읽지 못하면 던지지 않고 기본값으로 계산하게 빈 객체를 돌려주며 서버 로그만 남긴다.
 * - 모양이 틀렸거나 칸의 범위를 벗어난 행(예: 0장)은 **그 키만 버리고** 기본값을 쓴다 — 잘못 저장된 값 하나가 계산을 망가뜨리지 않는다.
 * - `routineCheckStartsAt` 행은 1504가 첫 주간 루틴을 돌릴 때 쓰는 값이라 그대로 읽는다(S7에서는 바꿀 수 없다).
 */
import type { createServiceClient } from '@/lib/supabase/server'
import type { OpsSignalThresholdValues } from '@/lib/admin/opsSignals/thresholds'
import { isThresholdKey, readStoredThresholdValue } from '@/lib/admin/opsSignals/thresholdSettings'

type ServiceClient = ReturnType<typeof createServiceClient>

export interface SignalOverrideRow {
  rule_key: string
  value: unknown
}

/** 신호 행을 덮어쓸 값으로 바꾼다(순수 함수). 기준값 25개 밖의 키와 읽을 수 없는 행은 버린다. */
export function parseSignalOverrideRows(rows: readonly SignalOverrideRow[]): Partial<OpsSignalThresholdValues> {
  const overrides: Record<string, number | string> = {}
  for (const row of rows) {
    if (!isThresholdKey(row.rule_key)) continue
    const stored = readStoredThresholdValue(row.rule_key, row.value)
    if (stored.ok) overrides[row.rule_key] = stored.value
  }
  return overrides as Partial<OpsSignalThresholdValues>
}

/**
 * `ops_rules`의 신호 행을 읽어 덮어쓸 기준값을 돌려준다. 읽기에 실패하면 던지지 않고 빈 객체(= 모두 기본값)를 돌려준다.
 * 서비스 클라이언트는 인자로 받는다(`load.ts`가 신호 조회에 쓰는 것과 같은 클라이언트).
 */
export async function loadSignalOverrides(supabase: ServiceClient): Promise<Partial<OpsSignalThresholdValues>> {
  try {
    const { data, error } = await supabase.from('ops_rules').select('rule_key, value').eq('rule_group', 'signal')
    if (error) throw new Error(error.message)
    return parseSignalOverrideRows(data ?? [])
  } catch (error) {
    console.error('[admin/ops-signals] 신호 기준값 조회 오류(기본값으로 계산):', error)
    return {}
  }
}
