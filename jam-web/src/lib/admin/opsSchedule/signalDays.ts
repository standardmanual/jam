/**
 * 날짜별 신호 (티켓 20261006_1536 ③-a, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 칸 머리 신호 칩·날짜 서랍, 카리나 가정 5, 순수 함수 — DB 접근 없음).
 *
 * 신호 13종의 결과(`OpsSignalResult`) 가운데 날짜가 있는 것을 날짜별로 모은다. 칸 머리는 그날 **가장 높은 수준 한 칩 + 건수**만 보이고(칩을 쌓지 않는다),
 * 줄 목록은 날짜 서랍(③-b)이 `OpsSignalRow`로 그린다. 반환값은 일반 객체라 서버 컴포넌트에서 클라이언트 컴포넌트로 그대로 넘길 수 있다.
 *
 * 규칙:
 * - 뜬 신호(`raised`)의 결과만 센다. 안 뜬 것·확인 안 함은 날짜에 줄이 없다(확인 안 함은 S1이 알린다).
 * - 줄 순서는 중단 → 주의 → 참고, 같은 수준은 신호 목록(카탈로그) 순서, 한 신호 안에서는 들어온 순서다.
 * - `checked`는 그 날짜가 신호를 확인하는 기간(검사 범위: 오늘~일요일, 다음 주를 보는 날이면 다음 주 포함)인지다. 범위 밖 날짜에는 「이상 없음」을 말하지 않는다
 *   — 서랍이 「이 날짜는 신호를 확인하는 기간이 아니에요」라고 알린다(확인하지 않은 것을 안전하다고 오해하지 않게).
 * - 범위 밖이어도 **날짜가 있는 결과는 지우지 않는다**(예: 며칠 전에 실패한 항목의 「실행 실패」). 그 날짜 칸에도 칩이 있어야 S1의 「그날 보기」 링크와 맞는다.
 */
import type { OpsSignalLevel, OpsSignalKey, OpsSignalOutcome, OpsSignalResult } from '@/lib/admin/opsSignals/catalog'

/** 칸 머리 칩과 서랍이 쓰는 줄 하나. */
export interface DaySignalLine {
  signalKey: OpsSignalKey
  /** 신호 이름(`OpsSignalOutcome.name`). */
  name: string
  level: OpsSignalLevel
  result: OpsSignalResult
}

export interface DaySignals {
  /** 그 날짜가 신호를 확인하는 기간 안인가. */
  checked: boolean
  /** 그날 가장 높은 수준. 줄이 없으면 null이다. */
  topLevel: OpsSignalLevel | null
  /** 그날 신호 결과 건수(= `lines.length`). */
  count: number
  lines: DaySignalLine[]
}

const LEVEL_ORDER: Record<OpsSignalLevel, number> = { stop: 0, warn: 1, info: 2 }

/**
 * `dates`의 날짜마다 신호를 모은다. `scanDates`는 신호를 검사한 날짜(`OpsSignalsComputation.scanDates`)다.
 * 결과의 키는 `dates`의 날짜 전부이고 줄이 없는 날짜도 `count: 0`으로 들어 있다.
 */
export function signalsByDate(
  signals: readonly OpsSignalOutcome[],
  scanDates: readonly string[],
  dates: readonly string[]
): Record<string, DaySignals> {
  const scanned = new Set(scanDates)
  const linesByDate = new Map<string, DaySignalLine[]>()
  for (const signal of signals) {
    if (signal.state !== 'raised') continue
    for (const result of signal.results) {
      if (result.date === null) continue
      const line: DaySignalLine = { signalKey: signal.key, name: signal.name, level: signal.level, result }
      const list = linesByDate.get(result.date)
      if (list) list.push(line)
      else linesByDate.set(result.date, [line])
    }
  }

  const byDate: Record<string, DaySignals> = {}
  for (const date of dates) {
    // 정렬은 안정적이다(같은 수준은 신호 목록 순서와 들어온 순서를 지킨다).
    const lines = [...(linesByDate.get(date) ?? [])].sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
    byDate[date] = {
      checked: scanned.has(date),
      topLevel: lines.length > 0 ? lines[0].level : null,
      count: lines.length,
      lines,
    }
  }
  return byDate
}
