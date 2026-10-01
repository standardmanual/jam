/**
 * 운영 설정(S7) 「신호 기준값」 구역 본문 (티켓 20260930_1459 조각 C) — 서버 컴포넌트.
 *
 * 기준값 25개의 현재 상태(기본값과 바꾼 값)를 읽어 `OpsSignalSettings`(클라이언트)에 넘긴다. 읽기만 한다.
 * 읽지 못하면 던지지 않고 `thresholds: null`로 넘겨 이 구역만 오류 카드가 되게 한다(밸런스 구역은 그대로 보인다. 서비스 클라이언트를 만들지 못한 경우도 같다).
 * 기본값을 현재 값처럼 보여 주지 않는다.
 */
import { createServiceClient } from '@/lib/supabase/server'
import type { SignalThresholdRecord } from '@/lib/admin/opsSignals/thresholdSettings'
import { listSignalThresholds } from '@/lib/admin/opsSignals/saveThresholds'
import { OpsSignalSettings } from '@/components/admin/ops/OpsSignalSettings'

async function readSignalSection(): Promise<SignalThresholdRecord[] | null> {
  try {
    return await listSignalThresholds(createServiceClient())
  } catch (error) {
    console.error('[admin/ops-settings] 신호 기준값 조회 실패:', error)
    return null
  }
}

export async function SignalSection() {
  return <OpsSignalSettings thresholds={await readSignalSection()} />
}
