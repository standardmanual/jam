/**
 * 운영 홈(S1)의 신호 구역 계산 (티켓 20261006_1340 ②-b, 상위 20260930_1502 「채원 S1·S4 사전 판정 (2026-10-06 승인)」, 순수 함수 — DB 접근 없음).
 *
 * 화면 부품(`OpsSignalPanel`)이 그리기만 하도록 구역 나누기를 여기서 한다. 서버·클라이언트 모두 불러온다.
 * 「이번 주 상태」(`computeWeekStatus`)와 「다음 주 줄」(`showsNextWeekRow`)은 운영 상황판(티켓 20261026_2023 2회차, `lib/admin/opsBoard/`)이 대신해 지웠다.
 *
 * ## 신호 구역 (`zoneSignals`)
 * 신호 13종은 뜸·이상 없음·확인 안 함 가운데 **한 구역에만** 들어간다. 뜬 신호는 중단 → 주의 → 참고 순서이고 같은 수준은 카탈로그 순서다.
 * 머리 숫자는 「종」 단위다(상위 가정 5). 뜬 신호가 0이어도 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않는다.
 */
import type { OpsSignalLevel, OpsSignalOutcome } from '@/lib/admin/opsSignals/catalog'

// ── 신호 구역 ────────────────────────────────────────────────────────────────────────────────────

/** 수준 순서: 중단 → 주의 → 참고. */
const LEVEL_ORDER: Record<OpsSignalLevel, number> = { stop: 0, warn: 1, info: 2 }

export interface SignalZones {
  /** 뜬 신호. 중단 → 주의 → 참고 순서, 같은 수준은 카탈로그 순서다. */
  raised: OpsSignalOutcome[]
  /** 이상 없는 신호(계산했고 걸린 것이 없다). 카탈로그 순서다. */
  clear: OpsSignalOutcome[]
  /** 확인 안 함(`not_built`·`not_started`·`load_failed`). 카탈로그 순서다. */
  unchecked: OpsSignalOutcome[]
}

/** 신호를 세 구역으로 나눈다. 한 신호는 정확히 한 구역에만 들어간다. */
export function zoneSignals(signals: readonly OpsSignalOutcome[]): SignalZones {
  const raised = signals.filter((signal) => signal.state === 'raised').sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
  return {
    raised,
    clear: signals.filter((signal) => signal.state === 'clear'),
    unchecked: signals.filter((signal) => signal.state === 'unchecked'),
  }
}

/** 신호 머리 숫자: 수준마다 뜬 신호의 「종」 수(결과 건수가 아니다). */
export function signalLevelCounts(signals: readonly OpsSignalOutcome[]): Record<OpsSignalLevel, number> {
  const counts: Record<OpsSignalLevel, number> = { stop: 0, warn: 0, info: 0 }
  for (const signal of signals) {
    if (signal.state === 'raised') counts[signal.level] += 1
  }
  return counts
}

/** 뜬 신호가 0일 때의 문장. 확인 안 함이 있으면 「이상 없어요」라고 쓰지 않는다(확인하지 않은 신호를 안전하다고 오해하지 않게). */
export function noRaisedSignalsText(uncheckedCount: number): string {
  return uncheckedCount > 0 ? `뜬 신호가 없어요. 아직 확인하지 않은 신호가 ${uncheckedCount}종 있어요` : '뜬 신호가 없어요'
}
