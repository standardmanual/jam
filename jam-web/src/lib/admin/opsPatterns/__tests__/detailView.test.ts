/**
 * 패턴 상세 화면의 보기 계산 (티켓 20261008_1435, 상위 20260930_1503 ⑨b)
 *
 * - 머리: 출처 글자(모르는 값은 「출처 확인 필요」), 쉬는 이유, KST 서식
 * - JSONB 깨짐: 샘플·카드 모양·손잡이를 칸 단위로 읽어 칸마다 「적지 않았어요」·「역할 모름」·「목록에 없는 모양」, 배열이 아니면 `null`
 * - 취향 신호: 이 패턴 것만, 확정일(KST), 근거 결정 표시
 * - 사용 이력: 시험·반려·취소·실패·승인 전·`pattern_proposal`·다른 패턴·시각 없음 제외, 최신순, 10건/쪽, 틀린 `usagePage`는 1쪽,
 *   **같은 입력에서 이력 중 최근 28일 건수 = `countOpsPatternUsage`의 `uses`, 이력 첫 줄 시각 = `lastUsedAt`**
 */
import { describe, it, expect } from 'vitest'
import {
  CARD_SHAPE_UNKNOWN_TEXT,
  PATTERN_FIELD_MISSING_TEXT,
  SAMPLE_ROLE_UNKNOWN_TEXT,
  USAGE_PAGE_SIZE,
  formatKstDate,
  formatKstDateTime,
  originText,
  pageOfUsage,
  parseUsagePage,
  pauseReasonLine,
  readCardShapeLines,
  readKnobLines,
  readSampleLines,
  selectPatternUsage,
  tasteSignalLines,
  usagePageCount,
  usageSummaryText,
} from '../detailView'
import { countOpsPatternUsage, type OpsPatternUsageRow } from '../draw'
import { PATTERN_NEW_HREF, patternDetailHref, patternEditHref } from '../listView'
import type { OpsTasteSignalRecord } from '../read'

const NOW = new Date('2026-10-08T03:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}

interface RowOptions {
  patternNo?: unknown
  status?: string
  kind?: string | null
  startsAt?: string | null
  receivedAt?: string
  sample?: boolean
  title?: string
  itemKey?: string | null
}

function row(n: number, options: RowOptions = {}): OpsPatternUsageRow {
  const original: Record<string, unknown> = { pattern_no: options.patternNo === undefined ? 'P03' : options.patternNo }
  if (options.title !== undefined) original.copy = { title: options.title }
  return {
    id: uuid(n),
    bundle_id: uuid(1000 + n),
    item_key: options.itemKey === undefined ? `item-${n}` : options.itemKey,
    kind: options.kind === undefined ? 'home_feed_card' : options.kind,
    status: options.status ?? 'approved',
    starts_at: options.startsAt === undefined ? '2026-10-01T00:00:00.000Z' : options.startsAt,
    original: original as OpsPatternUsageRow['original'],
    edited: null,
    ops_bundles: { is_sample: options.sample ?? false, received_at: options.receivedAt ?? '2026-09-30T00:00:00.000Z' },
  }
}

describe('머리·서식', () => {
  it('출처는 「출처: …」 글자이고, 모르는 값은 「출처 확인 필요」다', () => {
    expect(originText('seed')).toBe('출처: 원고 입력')
    expect(originText('manual')).toBe('출처: 직접 만듦')
    expect(originText('proposal')).toBe('출처: 제안 승인')
    expect(originText('import')).toBe('출처 확인 필요')
    expect(originText('toString')).toBe('출처 확인 필요')
  })

  it('쉬는 이유는 쉬는 중일 때만, 비었으면 「적지 않았어요」다', () => {
    expect(pauseReasonLine('paused', '기능 대기')).toBe('쉬는 이유: 기능 대기')
    expect(pauseReasonLine('paused', null)).toBe('쉬는 이유: 적지 않았어요')
    expect(pauseReasonLine('paused', '  ')).toBe('쉬는 이유: 적지 않았어요')
    expect(pauseReasonLine('active', '무시')).toBeNull()
    expect(pauseReasonLine('archived', '무시')).toBeNull()
  })

  it('시각은 KST로 서식한다(UTC 15시 이후는 다음 날)', () => {
    expect(formatKstDateTime('2026-10-07T15:05:00.000Z')).toBe('2026-10-08 00:05')
    expect(formatKstDate('2026-10-07T15:05:00.000Z')).toBe('2026-10-08')
    expect(formatKstDateTime('이상한 값')).toBe('–')
    expect(formatKstDate(null)).toBe('–')
  })

  it('상세 링크: 1쪽은 쿼리가 없고 2쪽부터 usagePage가 붙는다', () => {
    expect(patternDetailHref('P03')).toBe('/admin/ops-patterns/P03')
    expect(patternDetailHref('P03', { usagePage: 1 })).toBe('/admin/ops-patterns/P03')
    expect(patternDetailHref('P03', { usagePage: 3 })).toBe('/admin/ops-patterns/P03?usagePage=3')
  })

  it('만들기·고치기 링크(⑩a-2): 만들기는 /new, 고치기는 상세 주소 뒤 /edit', () => {
    expect(PATTERN_NEW_HREF).toBe('/admin/ops-patterns/new')
    expect(patternEditHref('P03')).toBe('/admin/ops-patterns/P03/edit')
  })
})

describe('샘플', () => {
  it('번호 순으로 정렬하고 역할 이름을 붙인다', () => {
    const lines = readSampleLines([
      { no: 2, name: '둘째', role: 'aux', impl: '장치' },
      { no: 1, name: '첫째', role: 'main', impl: '본체' },
      { no: 3, name: '셋째', role: 'related', impl: '걸침' },
    ])
    expect(lines?.map((line) => [line.noText, line.name, line.role, line.impl])).toEqual([
      ['1', '첫째', '주', '본체'],
      ['2', '둘째', '보조', '장치'],
      ['3', '셋째', '관련', '걸침'],
    ])
  })

  it('모르는 역할은 「역할 모름」, 빈 칸·형식 틀린 칸은 「적지 않았어요」다', () => {
    const lines = readSampleLines([{ no: 1, name: 5, role: 'boss', impl: '  ' }, 'text', null])
    expect(lines).toHaveLength(3)
    expect(lines?.[0]).toMatchObject({ name: PATTERN_FIELD_MISSING_TEXT, role: SAMPLE_ROLE_UNKNOWN_TEXT, impl: PATTERN_FIELD_MISSING_TEXT })
    expect(lines?.[1]).toMatchObject({ noText: '–', name: PATTERN_FIELD_MISSING_TEXT, role: SAMPLE_ROLE_UNKNOWN_TEXT })
  })

  it('번호를 읽을 수 없는 줄은 맨 뒤로 가고, 같은 조건끼리는 읽은 순서를 지킨다', () => {
    const lines = readSampleLines([{ name: 'a' }, { no: 2, name: 'b' }, { no: '1', name: 'c' }, { no: 1, name: 'd' }])
    expect(lines?.map((line) => line.name)).toEqual(['d', 'b', 'a', 'c'])
  })

  it('배열이 아니면 null(구역 전체가 「적지 않았어요」), 빈 배열은 빈 목록이다', () => {
    expect(readSampleLines(null)).toBeNull()
    expect(readSampleLines({ no: 1 })).toBeNull()
    expect(readSampleLines('x')).toBeNull()
    expect(readSampleLines([])).toEqual([])
  })
})

describe('카드 모양', () => {
  it('목록의 모양은 그대로, 밖의 모양은 「목록에 없는 모양」, 비었으면 「적지 않았어요」다', () => {
    const lines = readCardShapeLines([{ shape: 'hero', note: ' 큰 사진 ' }, { shape: 'banner', note: '' }, { note: '메모' }, 7])
    expect(lines).toEqual([
      { shape: 'hero', note: '큰 사진' },
      { shape: CARD_SHAPE_UNKNOWN_TEXT, note: PATTERN_FIELD_MISSING_TEXT },
      { shape: PATTERN_FIELD_MISSING_TEXT, note: '메모' },
      { shape: PATTERN_FIELD_MISSING_TEXT, note: PATTERN_FIELD_MISSING_TEXT },
    ])
  })

  it('배열이 아니면 null이다', () => {
    expect(readCardShapeLines({})).toBeNull()
    expect(readCardShapeLines(undefined)).toBeNull()
  })
})

describe('손잡이', () => {
  const KNOBS = {
    condition: { open: '비 오는 날', closed: '평일 낮' },
    place: { open: '카페', closed: '병원' },
    time: { open: '저녁', closed: '새벽' },
    reward: { open: '배지', closed: '현금' },
    tribe: { rule: '한 트라이브', example: '야행성' },
  }

  it('5줄이 늘 조건·장소·시간·보상·트라이브 순서이고, 트라이브만 규칙·예시다', () => {
    const lines = readKnobLines(KNOBS)
    expect(lines.map((line) => line.label)).toEqual(['조건', '장소', '시간', '보상', '트라이브'])
    expect(lines[0].cells.map((cell) => [cell.label, cell.text])).toEqual([
      ['열 수 있는 값', '비 오는 날'],
      ['닫은 값', '평일 낮'],
    ])
    expect(lines[4].cells.map((cell) => [cell.label, cell.text])).toEqual([
      ['규칙', '한 트라이브'],
      ['예시', '야행성'],
    ])
  })

  it('knobs가 객체가 아니면 10칸 모두 「적지 않았어요」지만 5줄은 유지한다', () => {
    for (const broken of [null, [], 'x', 3]) {
      const lines = readKnobLines(broken)
      expect(lines).toHaveLength(5)
      expect(lines.flatMap((line) => line.cells.map((cell) => cell.text))).toEqual(Array(10).fill(PATTERN_FIELD_MISSING_TEXT))
    }
  })

  it('틀린 칸만 「적지 않았어요」가 되고 나머지는 그대로 읽는다', () => {
    const lines = readKnobLines({ ...KNOBS, place: { open: 3 }, time: 'x', tribe: { rule: '규칙' } })
    expect(lines[1].cells.map((cell) => cell.text)).toEqual([PATTERN_FIELD_MISSING_TEXT, PATTERN_FIELD_MISSING_TEXT])
    expect(lines[2].cells[0].text).toBe(PATTERN_FIELD_MISSING_TEXT)
    expect(lines[4].cells.map((cell) => cell.text)).toEqual(['규칙', PATTERN_FIELD_MISSING_TEXT])
    expect(lines[0].cells[0].text).toBe('비 오는 날')
  })
})

describe('취향 신호', () => {
  function signal(id: string, patternNo: string | null, overrides: Partial<OpsTasteSignalRecord> = {}): OpsTasteSignalRecord {
    return {
      id,
      patternNo,
      name: `${id} 이름`,
      reason: `${id} 이유`,
      basis: 'estimate',
      evidenceDecisionId: null,
      confirmedAt: null,
      sortOrder: 1,
      ...overrides,
    }
  }

  it('이 패턴 것만 입력 순서대로 고른다(공통·다른 패턴 제외)', () => {
    const lines = tasteSignalLines([signal('a', 'P03'), signal('b', null), signal('c', 'P04'), signal('d', 'P03')], 'P03')
    expect(lines.map((line) => line.id)).toEqual(['a', 'd'])
  })

  it('확정이면 확정일(KST), 추정이면 날짜가 없다. 근거 결정이 있으면 표시한다', () => {
    const [estimate, confirmed] = tasteSignalLines(
      [
        signal('a', 'P03'),
        signal('b', 'P03', { basis: 'confirmed', confirmedAt: '2026-10-07T16:00:00.000Z', evidenceDecisionId: uuid(9) }),
      ],
      'P03'
    )
    expect(estimate).toMatchObject({ basis: 'estimate', confirmedDay: null, hasEvidence: false })
    expect(confirmed).toMatchObject({ basis: 'confirmed', confirmedDay: '2026-10-08', hasEvidence: true })
  })

  it('0건이면 빈 목록이다', () => {
    expect(tasteSignalLines([], 'P03')).toEqual([])
  })
})

describe('사용 이력 — 무엇이 줄이 되는가', () => {
  it('시험·승인 전·반려·취소·실패·pattern_proposal·시각 없음·다른 패턴·번호 없음은 줄이 아니다', () => {
    const rows = [
      row(1),
      row(2, { sample: true }),
      row(3, { status: 'arrived' }),
      row(4, { status: 'reviewing' }),
      row(5, { status: 'rejected' }),
      row(6, { status: 'cancelled' }),
      row(7, { status: 'failed' }),
      row(8, { kind: 'pattern_proposal' }),
      row(9, { startsAt: null, receivedAt: '망가진 시각' }),
      row(10, { patternNo: 'P04' }),
      row(11, { patternNo: null }),
      row(12, { patternNo: 'P-07' }),
      row(13, { status: 'live' }),
    ]
    expect(selectPatternUsage(rows, 'P03').map((line) => line.itemId)).toEqual([uuid(1), uuid(13)].sort())
  })

  it('기간 제한이 없다(4주보다 오래된 사용도 줄이다)', () => {
    const rows = [row(1, { startsAt: '2026-01-01T00:00:00.000Z' }), row(2)]
    expect(selectPatternUsage(rows, 'P03')).toHaveLength(2)
  })

  it('사용 시각이 최신순이다(같은 시각이면 항목 ID 순). 앞날 예약도 줄이다', () => {
    const rows = [
      row(1, { startsAt: '2026-09-01T00:00:00.000Z' }),
      row(2, { startsAt: '2026-10-20T00:00:00.000Z' }),
      row(4, { startsAt: '2026-10-01T00:00:00.000Z' }),
      row(3, { startsAt: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(selectPatternUsage(rows, 'P03').map((line) => line.itemId)).toEqual([uuid(2), uuid(3), uuid(4), uuid(1)])
  })

  it('공개 시각이 없으면 묶음의 받은 시각이 사용 시각이다', () => {
    const [line] = selectPatternUsage([row(1, { startsAt: null, receivedAt: '2026-09-30T15:30:00.000Z' })], 'P03')
    expect(line.usedAtText).toBe('2026-10-01 00:30')
  })

  it('줄에는 종류 이름·항목 이름·항목 상태·이동에 쓸 ID가 있다. 이름은 제목 → 항목 키 → 종류 이름 순이다', () => {
    const lines = selectPatternUsage(
      [
        row(1, { title: ' 비 오는 날 카드 ', startsAt: '2026-10-03T00:00:00.000Z' }),
        row(2, { itemKey: 'rain-2', startsAt: '2026-10-02T00:00:00.000Z' }),
        row(3, { itemKey: null, kind: 'mission', status: 'live', startsAt: '2026-10-01T00:00:00.000Z' }),
      ],
      'P03'
    )
    expect(lines[0]).toMatchObject({ name: '비 오는 날 카드', kindText: '홈피드 카드', status: 'approved', itemId: uuid(1), bundleId: uuid(1001) })
    expect(lines[1].name).toBe('rain-2')
    expect(lines[2]).toMatchObject({ name: '미션', kindText: '미션', status: 'live' })
  })

  it('수정본의 패턴 번호가 원본보다 우선한다', () => {
    const edited = { ...row(1, { patternNo: 'P04' }), edited: { pattern_no: 'P03' } as OpsPatternUsageRow['edited'] }
    expect(selectPatternUsage([edited], 'P03')).toHaveLength(1)
    expect(selectPatternUsage([edited], 'P04')).toHaveLength(0)
  })
})

describe('사용 이력 — 요약과 같은 기준', () => {
  /** 4주 안·밖·시험·승인 전 등이 섞인 입력. */
  function mixedRows(): OpsPatternUsageRow[] {
    return [
      row(1, { startsAt: new Date(NOW.getTime() - 2 * DAY_MS).toISOString() }),
      row(2, { startsAt: new Date(NOW.getTime() - 28 * DAY_MS).toISOString() }), // 경계(포함)
      row(3, { startsAt: new Date(NOW.getTime() - 28 * DAY_MS - 1).toISOString() }), // 경계 밖
      row(4, { startsAt: new Date(NOW.getTime() - 90 * DAY_MS).toISOString() }),
      row(5, { startsAt: new Date(NOW.getTime() + 3 * DAY_MS).toISOString() }), // 앞날 예약
      row(6, { sample: true }),
      row(7, { status: 'rejected' }),
      row(8, { kind: 'pattern_proposal' }),
      row(9, { patternNo: 'P04' }),
      row(10, { status: 'arrived' }),
    ]
  }

  it('이력 중 최근 28일 건수 = countOpsPatternUsage의 uses, 이력 첫 줄 시각 = lastUsedAt', () => {
    const rows = mixedRows()
    const usage = countOpsPatternUsage(rows, ['P03'], NOW).get('P03')!
    const lines = selectPatternUsage(rows, 'P03')
    const since = NOW.getTime() - 28 * DAY_MS
    expect(lines.filter((line) => line.usedAtMs >= since)).toHaveLength(usage.uses)
    expect(usage.uses).toBe(3)
    expect(new Date(lines[0].usedAtMs).toISOString()).toBe(usage.lastUsedAt)
    expect(lines).toHaveLength(5)
  })

  it('한 번도 안 쓴 패턴은 uses 0·lastUsedAt null이고 이력도 비어 있다', () => {
    const rows = mixedRows()
    expect(countOpsPatternUsage(rows, ['P09'], NOW).get('P09')).toEqual({ uses: 0, lastUsedAt: null })
    expect(selectPatternUsage(rows, 'P09')).toEqual([])
  })

  it('요약 글자: 썼으면 횟수와 마지막 사용(KST), 안 썼으면 「쓴 적 없어요」, 못 읽었으면 「–」다', () => {
    expect(usageSummaryText({ uses: 2, lastUsedAt: '2026-10-07T15:05:00.000Z' })).toBe('최근 4주 2회 · 마지막 사용 2026-10-08 00:05')
    expect(usageSummaryText({ uses: 0, lastUsedAt: null })).toBe('최근 4주 0회 · 쓴 적 없어요')
    expect(usageSummaryText({ uses: 0, lastUsedAt: '2026-01-01T00:00:00.000Z' })).toBe('최근 4주 0회 · 마지막 사용 2026-01-01 09:00')
    expect(usageSummaryText(null)).toBe('최근 4주 – · 마지막 사용 –')
  })
})

describe('사용 이력 — 쪽 나누기', () => {
  const lines = selectPatternUsage(
    Array.from({ length: 23 }, (_, i) => row(i + 1, { startsAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString() })),
    'P03'
  )

  it('10건씩 나눠 3쪽이고 마지막 쪽은 3건이다', () => {
    expect(USAGE_PAGE_SIZE).toBe(10)
    expect(usagePageCount(lines.length)).toBe(3)
    expect(pageOfUsage(lines, 1)).toHaveLength(10)
    expect(pageOfUsage(lines, 2)).toHaveLength(10)
    expect(pageOfUsage(lines, 3)).toHaveLength(3)
    expect(pageOfUsage(lines, 1)[0]).toBe(lines[0])
    expect(pageOfUsage(lines, 3)[0]).toBe(lines[20])
  })

  it('0건이어도 쪽 수는 1이다', () => {
    expect(usagePageCount(0)).toBe(1)
    expect(pageOfUsage([], 1)).toEqual([])
  })

  it('usagePage: 1부터의 정수만 받고, 틀린 값·범위 밖은 1쪽이다', () => {
    expect(parseUsagePage('2', 23)).toBe(2)
    expect(parseUsagePage('3', 23)).toBe(3)
    for (const bad of ['0', '4', '-1', '1.5', 'abc', '', ' 2', '2x', '99999999999999999999']) expect(parseUsagePage(bad, 23)).toBe(1)
    expect(parseUsagePage(undefined, 23)).toBe(1)
    expect(parseUsagePage('2', 0)).toBe(1)
  })
})
