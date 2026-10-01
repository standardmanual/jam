/**
 * 운영 신호 기준값 (티켓 20261001_1155)
 *
 * 기준값은 `thresholds.ts` 한 파일에만 있고, 운영툴 PRD §5.1의 값 표와 같아야 한다. 이 시험은 문서 파일을 읽어 표의 줄과 코드의 값을
 * 하나씩 대조한다(값을 바꾸고 문서를 안 바꾸면 여기서 깨진다).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  OPS_SIGNAL_CATALOG,
  OPS_SIGNAL_KEYS,
  getOpsSignalDefinition,
  type OpsSignalKey,
} from '@/lib/admin/opsSignals/catalog'
import {
  DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES,
  OPS_SIGNAL_THRESHOLDS,
  OPS_SIGNAL_THRESHOLD_KEYS,
  formatThresholdValue,
  resolveThresholdValues,
} from '@/lib/admin/opsSignals/thresholds'

const PRD_PATH = join(process.cwd(), '..', 'docs', 'specs', 'prd', 'ops-tool', 'PRD.md')
const TABLE_MARKER = '**신호 기준값 표'

interface PrdRow {
  key: string
  value: string
  unit: string
  measured: string
  signal: string
  meaning: string
  source: string
}

/** PRD에서 기준값 표를 읽는다. 표 머리 줄 아래 `|`로 시작하는 줄만 모은다. */
function readPrdThresholdRows(): PrdRow[] {
  const lines = readFileSync(PRD_PATH, 'utf8').split('\n')
  const marker = lines.findIndex((line) => line.startsWith(TABLE_MARKER))
  expect(marker, 'PRD에 「신호 기준값 표」 안내 줄이 있어야 한다').toBeGreaterThanOrEqual(0)

  const rows: PrdRow[] = []
  let inTable = false
  for (const line of lines.slice(marker + 1)) {
    if (line.startsWith('|')) {
      inTable = true
      const cells = line
        .slice(1, line.lastIndexOf('|'))
        .split('|')
        .map((cell) => cell.trim())
      const key = /^`(\w+)`$/.exec(cells[0])?.[1]
      if (!key) continue // 머리 줄과 구분 줄
      rows.push({
        key,
        value: cells[1],
        unit: cells[2],
        measured: cells[3],
        signal: cells[4],
        meaning: cells[5],
        source: cells[6],
      })
    } else if (inTable) {
      break
    }
  }
  return rows
}

describe('신호 13종 이름표', () => {
  it('13종이 PRD §5 표의 순서로 있다', () => {
    expect(OPS_SIGNAL_KEYS).toHaveLength(13)
    expect(OPS_SIGNAL_CATALOG.map((definition) => definition.key)).toEqual([...OPS_SIGNAL_KEYS])
    expect(OPS_SIGNAL_CATALOG.map((definition) => definition.name)).toEqual([
      '실행 실패',
      '예약 누락',
      '루틴 실패',
      '형식 오류',
      '비어 있는 컨텐츠',
      '새 컨텐츠가 없는 날',
      '승인 마감 임박',
      '밸런스 경고',
      '에이전트가 뺀 항목',
      '겹침',
      '단조로운 흐름',
      '획득 경로가 막힌 컬렉션',
      '행동 횟수 급증',
    ])
  })

  it('수준은 중단 3종·주의 5종·참고 5종이다', () => {
    const count = (level: string) => OPS_SIGNAL_CATALOG.filter((definition) => definition.level === level).length
    expect(count('stop')).toBe(3)
    expect(count('warn')).toBe(5)
    expect(count('info')).toBe(5)
    expect(OPS_SIGNAL_CATALOG.filter((d) => d.level === 'stop').map((d) => d.key)).toEqual([
      'execution_failed',
      'missed_schedule',
      'routine_failed',
    ])
  })
})

describe('기준값 (코드)', () => {
  it('티켓이 적은 값이 들어 있다', () => {
    const values = DEFAULT_OPS_SIGNAL_THRESHOLD_VALUES
    expect(values.approvalDeadlineHours).toBe(48)
    expect(values.missedScheduleMinutes).toBe(30)
    expect(values.failureLookbackDays).toBe(7)
    expect([values.weeklyRoutineWeekday, values.weeklyRoutineDeadlineHour]).toEqual([2, 12])
    expect([values.monthlyRoutineDay, values.monthlyRoutineDeadlineHour]).toEqual([1, 12])
    expect(values.routineCheckStartsAt).toBeNull()
    expect([values.minLiveCards, values.maxLiveCards]).toEqual([3, 5])
    expect(values.minNewContentCards).toBe(1)
    expect([values.overlapImageShapeCards, values.minNonImageShapeCards, values.maxNewUserCards]).toEqual([3, 1, 3])
    expect([values.monotonyWindowDays, values.monotonySamePatternCount, values.monotonySameShapeDays]).toEqual([7, 3, 3])
    expect([values.actionSpikeMultiplier, values.actionSpikeBaselineWeeks]).toEqual([2, 4])
    expect([
      values.actionSpikeMinMixAttempt,
      values.actionSpikeMinUserDrop,
      values.actionSpikeMinPickup,
      values.actionSpikeMinMissionComplete,
      values.actionSpikeMinCollectionComplete,
    ]).toEqual([5, 15, 23, 2, 2])
  })

  it('「실측 아님」은 승인 마감 임박·예약 누락·루틴 실패·행동 횟수 급증 네 신호의 값에만 붙는다', () => {
    const signals = new Set<OpsSignalKey>(
      OPS_SIGNAL_THRESHOLD_KEYS.filter((key) => OPS_SIGNAL_THRESHOLDS[key].notMeasured).map(
        (key) => OPS_SIGNAL_THRESHOLDS[key].signal
      )
    )
    expect([...signals].sort()).toEqual(['action_spike', 'approval_deadline', 'missed_schedule', 'routine_failed'])
    // 행동 횟수 급증의 값은 전부 실측 아님이다(최소 건수 포함).
    for (const key of OPS_SIGNAL_THRESHOLD_KEYS) {
      if (OPS_SIGNAL_THRESHOLDS[key].signal === 'action_spike') expect(OPS_SIGNAL_THRESHOLDS[key].notMeasured).toBe(true)
    }
  })

  it('기준값을 쓰는 신호는 13종 안에 있다', () => {
    for (const key of OPS_SIGNAL_THRESHOLD_KEYS) {
      expect(OPS_SIGNAL_KEYS).toContain(OPS_SIGNAL_THRESHOLDS[key].signal)
    }
  })

  it('덮어쓴 값만 바뀌고 나머지는 그대로다', () => {
    const resolved = resolveThresholdValues({ approvalDeadlineHours: 24, routineCheckStartsAt: '2026-10-13T00:00:00+09:00' })
    expect(resolved.approvalDeadlineHours).toBe(24)
    expect(resolved.routineCheckStartsAt).toBe('2026-10-13T00:00:00+09:00')
    expect(resolved.missedScheduleMinutes).toBe(30)
  })
})

describe('기준값 표 — 운영툴 PRD §5.1과 코드가 같다', () => {
  const rows = readPrdThresholdRows()

  it('표의 키와 코드의 키가 같은 순서로 같은 개수다', () => {
    expect(rows.map((row) => row.key)).toEqual([...OPS_SIGNAL_THRESHOLD_KEYS])
  })

  it('값·단위·실측 여부·신호·뜻·출처가 한 줄씩 같다', () => {
    for (const row of rows) {
      const entry = OPS_SIGNAL_THRESHOLDS[row.key as keyof typeof OPS_SIGNAL_THRESHOLDS]
      expect(entry, `${row.key}가 코드에 있어야 한다`).toBeDefined()
      expect(row.value, `${row.key} 값`).toBe(formatThresholdValue(entry.value))
      expect(row.unit, `${row.key} 단위`).toBe(entry.unit)
      expect(row.measured, `${row.key} 실측`).toBe(entry.notMeasured ? '실측 아님' : '정한 값')
      expect(row.signal, `${row.key} 신호`).toBe(getOpsSignalDefinition(entry.signal).name)
      expect(row.meaning, `${row.key} 뜻`).toBe(entry.label)
      expect(row.source, `${row.key} 출처`).toBe(entry.source)
    }
  })
})
