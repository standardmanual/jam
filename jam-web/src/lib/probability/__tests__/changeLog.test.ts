/**
 * lib/probability/changeLog — 확률 안내 «바뀐 날짜» 표를 변경 이력에서 읽기 (티켓 20261022_1700, 채원 사전 판정 2026-10-23)
 *
 * 고정하는 것:
 * - 칸 이름 표가 `JAM_COLUMNS`·`CAPSULE_COLUMNS` 20칸과 빠짐없이 맞물린다(칸이 늘면 이 시험이 먼저 깨진다).
 * - 20칸 모두의 문장(이름, 단위, 조사 «을/를»·«로/으로»)을 칸마다 기대 문장으로 고정한다. 값 서식은 표 위쪽 숫자와 같다(84%, 20%, 0%).
 * - 한 번의 저장은 칸이 여럿이어도 한 줄이고, 쉼표로 잇고 «바꿨어요»는 끝에 한 번이다. 칸 순서는 칸 목록 순서다.
 * - 표에 없는 칸은 내부 이름을 보이지 않는다: 전부 모르면 일반 문장, 일부만 모르면 끝에 «그 밖의 값도».
 * - 구역을 함께 본다: 시스템 드랍처럼 칸 이름이 겹치는 다른 구역의 칸을 캡슐 칸으로 읽지 않는다.
 * - 날짜는 한국 표준시(경계: 15:00 UTC), 연도를 포함한다. 방향어와 화살표가 없다.
 * - 읽기: `affects_disclosure = true`만, 최신이 위, 읽는 칸은 `section_key, changes, created_at`뿐이다(메모·바꾼 사람 없음). 실패는 `{ ok: false }`이고
 *   이력이 없는 것(`ok: true`, 빈 배열)과 구분된다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/probability/__tests__/changeLog.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createServiceClientMock } = vi.hoisted(() => ({ createServiceClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createServiceClient: createServiceClientMock }))

import { CAPSULE_SECTION_ID } from '@/lib/admin/balance/capsule'
import { SYNC_SECTION_ID } from '@/lib/admin/balance/sync'
import { CAPSULE_COLUMNS, JAM_COLUMNS } from '../disclosure'
import {
  CAPSULE_COLUMN_LABELS,
  JAM_COLUMN_LABELS,
  UNKNOWN_ONLY_SENTENCE,
  buildChangeLogRows,
  describeChanges,
  directionParticle,
  formatKstDate,
  loadProbabilityChangeLog,
  objectParticle,
} from '../changeLog'
import { CHANGES_TABLE, fakeClient, failed, ok } from './fixtures'

beforeEach(() => {
  vi.restoreAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  createServiceClientMock.mockReset()
})

const change = (field: string, from: number, to: number) => ({ field, from, to })

describe('칸 이름 표 — 20칸과 맞물린다', () => {
  it('동기화 구역 표는 JAM_COLUMNS 11칸과, 캡슐 구역 표는 CAPSULE_COLUMNS 9칸과 정확히 같다', () => {
    expect(Object.keys(JAM_COLUMN_LABELS).sort()).toEqual([...JAM_COLUMNS].sort())
    expect(Object.keys(CAPSULE_COLUMN_LABELS).sort()).toEqual([...CAPSULE_COLUMNS].sort())
    expect(JAM_COLUMNS).toHaveLength(11)
    expect(CAPSULE_COLUMNS).toHaveLength(9)
  })

  it('이름은 칸마다 달라서 두 줄이 같은 문장으로 읽히지 않고, 내부 이름이나 운영 이름이 아니다', () => {
    const names = [...Object.values(JAM_COLUMN_LABELS), ...Object.values(CAPSULE_COLUMN_LABELS)].map((label) => label.name)
    expect(new Set(names).size).toBe(20)
    for (const name of names) {
      expect(name, name).not.toMatch(/[_:]/)
      expect(name, name).not.toMatch(/보정 [12]/)
      // 조사를 받침으로 가르므로 이름은 한글 음절로 끝나야 한다
      expect(name, name).toMatch(/[가-힣]$/)
    }
    // «Common 확률»이 동기화와 캡슐에 모두 있으므로 구역을 앞에 붙인다
    expect(JAM_COLUMN_LABELS.sync_rarity_common.name).toBe('동기화 Common 확률')
    expect(CAPSULE_COLUMN_LABELS.rarity_common.name).toBe('캡슐 Common 확률')
  })

  it('구역 키는 어드민 밸런스 설정의 구역 키와 같다', () => {
    expect(SYNC_SECTION_ID).toBe('sync')
    expect(CAPSULE_SECTION_ID).toBe('capsule')
  })
})

describe('문장 — 20칸을 칸마다 고정한다(이름, 단위, 조사)', () => {
  const cases: Array<[section: string, field: string, from: number, to: number, expected: string]> = [
    [SYNC_SECTION_ID, 'sync_item_guaranteed', 1, 2, '동기화 확정 개수를 1개에서 2개로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_item_guaranteed_hiking', 2, 3, '동기화 등산 확정 개수를 2개에서 3개로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_item_bonus_rolls', 2, 3, '동기화 보너스 기회를 2번에서 3번으로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_item_bonus_jam_divisor', 600, 500, '동기화 보너스 확률을 나누는 값을 600잼에서 500잼으로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_item_bonus_max_probability', 0.25, 0.3, '동기화 보너스 확률 상한을 25%에서 30%로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_rarity_common', 84, 83, '동기화 Common 확률을 84%에서 83%로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_rarity_rare', 13, 14, '동기화 Rare 확률을 13%에서 14%로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_rarity_epic', 2.5, 3, '동기화 Epic 확률을 2.5%에서 3%로 바꿨어요'],
    [SYNC_SECTION_ID, 'sync_rarity_mystic', 0.5, 0, '동기화 Mystic 확률을 0.5%에서 0%로 바꿨어요'],
    [SYNC_SECTION_ID, 'common_streak_threshold', 10, 8, '동기화와 캡슐의 Common 연속 보정 횟수를 10번에서 8번으로 바꿨어요'],
    [SYNC_SECTION_ID, 'locked_roll_probability', 0.25, 0.3, '동기화와 캡슐의 잠긴 채 나올 확률을 25%에서 30%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'guaranteed_count', 1, 2, '캡슐 확정 개수를 1개에서 2개로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'bonus_count', 1, 2, '캡슐 보너스 개수를 1개에서 2개로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'bonus_probability', 0.2, 0.35, '캡슐 보너스 확률을 20%에서 35%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'other_tribe_probability', 0.2, 0.1, '캡슐 다른 트라이브 확률을 20%에서 10%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'rarity_common', 70, 69, '캡슐 Common 확률을 70%에서 69%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'rarity_rare', 22, 23, '캡슐 Rare 확률을 22%에서 23%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'rarity_epic', 6, 5, '캡슐 Epic 확률을 6%에서 5%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'rarity_mystic', 2, 3, '캡슐 Mystic 확률을 2%에서 3%로 바꿨어요'],
    [CAPSULE_SECTION_ID, 'pity_epic_threshold', 15, 12, '캡슐 Epic 보정 횟수를 15번에서 12번으로 바꿨어요'],
  ]

  it('시험 사례가 20칸을 한 번씩 모두 덮는다', () => {
    expect(cases).toHaveLength(20)
    expect(cases.filter(([section]) => section === SYNC_SECTION_ID).map(([, field]) => field)).toEqual([...JAM_COLUMNS])
    expect(cases.filter(([section]) => section === CAPSULE_SECTION_ID).map(([, field]) => field)).toEqual([...CAPSULE_COLUMNS])
  })

  it.each(cases)('%s 구역 %s: %s → %s', (section, field, from, to, expected) => {
    expect(describeChanges(section, [change(field, from, to)])).toBe(expected)
  })

  it('0%인 값을 지우지 않는다(전 값이든 후 값이든)', () => {
    expect(describeChanges(CAPSULE_SECTION_ID, [change('bonus_probability', 0.2, 0)])).toBe('캡슐 보너스 확률을 20%에서 0%로 바꿨어요')
    expect(describeChanges(CAPSULE_SECTION_ID, [change('bonus_count', 0, 1)])).toBe('캡슐 보너스 개수를 0개에서 1개로 바꿨어요')
  })

  it('부동소수 오차를 정리한다(표 위쪽 숫자와 같은 모양)', () => {
    expect(describeChanges(CAPSULE_SECTION_ID, [change('bonus_probability', 0.07, 0.29)])).toBe('캡슐 보너스 확률을 7%에서 29%로 바꿨어요')
  })

  it('조사는 이름 끝 글자와 값 끝 글자의 받침으로 가른다', () => {
    expect(objectParticle('동기화 보너스 확률')).toBe('을') // 률(ㄹ)
    expect(objectParticle('동기화 확정 개수')).toBe('를') // 수
    expect(objectParticle('동기화 보너스 확률을 나누는 값')).toBe('을') // 값(ㅂㅅ)
    expect(objectParticle('동기화 보너스 확률 상한')).toBe('을') // 한(ㄴ)
    expect(objectParticle('동기화 보너스 기회')).toBe('를') // 회
    expect(directionParticle('84%')).toBe('로') // 퍼센트
    expect(directionParticle('3개')).toBe('로')
    expect(directionParticle('3번')).toBe('으로') // 번(ㄴ)
    expect(directionParticle('500잼')).toBe('으로') // 잼(ㅁ)
    expect(directionParticle('3달')).toBe('로') // ㄹ 받침은 «로»
  })
})

describe('한 번의 저장 — 칸이 여럿이어도 한 문장', () => {
  it('쉼표로 잇고 «바꿨어요»는 마지막에 한 번만 쓴다', () => {
    const sentence = describeChanges(SYNC_SECTION_ID, [change('sync_rarity_common', 84, 83), change('sync_rarity_rare', 12, 13)])
    expect(sentence).toBe('동기화 Common 확률을 84%에서 83%로, 동기화 Rare 확률을 12%에서 13%로 바꿨어요')
    expect(sentence.split('바꿨어요')).toHaveLength(2)
  })

  it('칸 순서는 칸 목록 순서이고, 들어온 순서를 따르지 않는다', () => {
    const sentence = describeChanges(CAPSULE_SECTION_ID, [
      change('pity_epic_threshold', 15, 12),
      change('rarity_mystic', 2, 3),
      change('rarity_common', 70, 69),
      change('guaranteed_count', 1, 2),
    ])
    expect(sentence).toBe(
      '캡슐 확정 개수를 1개에서 2개로, 캡슐 Common 확률을 70%에서 69%로, 캡슐 Mystic 확률을 2%에서 3%로, 캡슐 Epic 보정 횟수를 15번에서 12번으로 바꿨어요'
    )
  })

  it('여러 칸을 «외 N개»로 줄이지 않는다', () => {
    const all = JAM_COLUMNS.map((field) => change(field, 1, 2))
    const sentence = describeChanges(SYNC_SECTION_ID, all)
    expect(sentence).not.toMatch(/외 \d+개/)
    for (const field of JAM_COLUMNS) expect(sentence).toContain(JAM_COLUMN_LABELS[field].name)
  })
})

describe('표에 없는 칸 — 내부 이름을 보이지 않는다', () => {
  it('전부 모르는 칸이면 일반 문장 한 줄이다', () => {
    expect(describeChanges(CAPSULE_SECTION_ID, [change('pre_quest_fill_amount', 3, 4)])).toBe('확률 안내의 값을 바꿨어요')
    expect(UNKNOWN_ONLY_SENTENCE).toBe('확률 안내의 값을 바꿨어요')
  })

  it('일부만 모르면 아는 칸 뒤에 «그 밖의 값도»를 붙인다', () => {
    expect(describeChanges(CAPSULE_SECTION_ID, [change('rarity_common', 70, 69), change('chapter:3', 100, 120)])).toBe(
      '캡슐 Common 확률을 70%에서 69%로, 그 밖의 값도 바꿨어요'
    )
    // 모르는 칸이 여럿이어도 «그 밖의 값도»는 한 번이다
    const twoUnknown = describeChanges(CAPSULE_SECTION_ID, [
      change('rarity_common', 70, 69),
      change('chapter:3', 100, 120),
      change('pre_quest_fill_amount', 3, 4),
    ])
    expect(twoUnknown.split('그 밖의 값도')).toHaveLength(2)
  })

  it('내부 칸 이름과 행 이름이 문장에 새지 않는다', () => {
    const sentence = describeChanges(CAPSULE_SECTION_ID, [change('rarity_common', 70, 69), change('chapter:3', 100, 120)])
    expect(sentence).not.toMatch(/[a-z]+_[a-z_]+|chapter|pre_quest/)
  })

  it('칸이 비어 있거나 모르는 구역이면 일반 문장이다(구역을 함께 본다)', () => {
    expect(describeChanges(SYNC_SECTION_ID, [])).toBe(UNKNOWN_ONLY_SENTENCE)
    // 시스템 드랍에도 rarity_common이 있다 — 구역이 다르면 캡슐 칸으로 읽지 않는다
    expect(describeChanges('ambient', [change('rarity_common', 1, 0.5)])).toBe(UNKNOWN_ONLY_SENTENCE)
    // 칸 이름만 맞고 구역이 어긋난 경우도 아는 칸이 아니다
    expect(describeChanges(CAPSULE_SECTION_ID, [change('sync_rarity_common', 84, 83)])).toBe(UNKNOWN_ONLY_SENTENCE)
    expect(describeChanges('jam', [change('sync_rarity_common', 84, 83)])).toBe(UNKNOWN_ONLY_SENTENCE)
    // 객체 기본 속성 이름이 구역 키로 와도 던지지 않는다
    expect(describeChanges('constructor', [change('rarity_common', 1, 2)])).toBe(UNKNOWN_ONLY_SENTENCE)
    expect(describeChanges('__proto__', [change('rarity_common', 1, 2)])).toBe(UNKNOWN_ONLY_SENTENCE)
  })
})

describe('문구 규칙 — 방향어·화살표·마침표가 없다', () => {
  it('20칸 문장 어디에도 올렸어요·낮췄어요·UP·화살표·엠대시·마침표가 없고 동사는 «바꿨어요»뿐이다', () => {
    const sentences = [
      ...JAM_COLUMNS.map((field) => describeChanges(SYNC_SECTION_ID, [change(field, 5, 7)])),
      ...CAPSULE_COLUMNS.map((field) => describeChanges(CAPSULE_SECTION_ID, [change(field, 5, 7)])),
      UNKNOWN_ONLY_SENTENCE,
    ]
    for (const sentence of sentences) {
      expect(sentence, sentence).toMatch(/바꿨어요$/)
      expect(sentence, sentence).not.toMatch(/올렸|낮췄|높였|높아|낮아|늘렸|줄였|UP|→|—|\.$/)
    }
  })
})

describe('날짜 — 한국 표준시, 연도 포함', () => {
  it('UTC 15:00이 KST 자정이다(하루 경계)', () => {
    expect(formatKstDate('2026-10-22T14:59:59Z')).toBe('2026년 10월 22일')
    expect(formatKstDate('2026-10-22T15:00:00Z')).toBe('2026년 10월 23일')
  })

  it('해가 바뀌는 경계도 맞다', () => {
    expect(formatKstDate('2026-12-31T14:59:59Z')).toBe('2026년 12월 31일')
    expect(formatKstDate('2026-12-31T15:00:00Z')).toBe('2027년 1월 1일')
  })

  it('DB가 돌려주는 시각 문자열(오프셋 포함)을 읽는다', () => {
    expect(formatKstDate('2026-10-23T03:12:45.123456+00:00')).toBe('2026년 10월 23일')
    expect(formatKstDate('2026-10-23T00:30:00+09:00')).toBe('2026년 10월 23일')
  })

  it('읽을 수 없으면 null이다', () => {
    expect(formatKstDate('어제')).toBeNull()
  })
})

describe('buildChangeLogRows — 이력 행 → 표 한 줄', () => {
  const row = (createdAt: string, changes: unknown, section = SYNC_SECTION_ID) => ({ section_key: section, changes, created_at: createdAt })

  it('받은 순서 그대로 한 행에 한 줄이고, 같은 날 저장은 날짜가 반복된다', () => {
    const rows = buildChangeLogRows([
      row('2026-10-23T05:00:00Z', [change('sync_rarity_common', 84, 83)]),
      row('2026-10-23T01:00:00Z', [change('sync_rarity_common', 85, 84)]),
      row('2026-10-22T05:00:00Z', [change('pity_epic_threshold', 15, 12)], CAPSULE_SECTION_ID),
    ])
    expect(rows).toEqual([
      { label: '2026년 10월 23일', value: '동기화 Common 확률을 84%에서 83%로 바꿨어요' },
      { label: '2026년 10월 23일', value: '동기화 Common 확률을 85%에서 84%로 바꿨어요' },
      { label: '2026년 10월 22일', value: '캡슐 Epic 보정 횟수를 15번에서 12번으로 바꿨어요' },
    ])
  })

  it('날짜나 구역 키를 읽을 수 없는 행은 건너뛰고 로그만 남긴다', () => {
    const rows = buildChangeLogRows([
      row('어제', [change('sync_rarity_common', 84, 83)]),
      { section_key: 7, changes: [], created_at: '2026-10-23T05:00:00Z' },
      null,
      row('2026-10-23T05:00:00Z', [change('sync_rarity_common', 84, 83)]),
    ])
    expect(rows).toHaveLength(1)
    expect(console.error).toHaveBeenCalledTimes(3)
  })

  it('모양이 틀린 changes도 던지지 않고 일반 문장이다', () => {
    const rows = buildChangeLogRows([row('2026-10-23T05:00:00Z', 'garbage'), row('2026-10-22T05:00:00Z', [{ field: 'x', from: 'a', to: 1 }])])
    expect(rows.map((r) => r.value)).toEqual([UNKNOWN_ONLY_SENTENCE, UNKNOWN_ONLY_SENTENCE])
  })
})

describe('loadProbabilityChangeLog — 읽기', () => {
  const dbRow = (createdAt: string, changes: unknown, extra: Record<string, unknown> = {}) => ({
    section_key: SYNC_SECTION_ID,
    changes,
    created_at: createdAt,
    affects_disclosure: true,
    ...extra,
  })

  it('affects_disclosure = true인 행만, 최신이 위로 읽는다', async () => {
    const fake = fakeClient({
      [CHANGES_TABLE]: ok([
        dbRow('2026-10-22T05:00:00Z', [change('pity_epic_threshold', 15, 12)], { section_key: CAPSULE_SECTION_ID }),
        dbRow('2026-10-22T06:00:00Z', [change('sync_rarity_common', 84, 83)], { affects_disclosure: false }),
        dbRow('2026-10-23T05:00:00Z', [change('sync_rarity_common', 84, 83), change('sync_rarity_rare', 12, 13)]),
      ]),
    })
    const result = await loadProbabilityChangeLog(fake.client)
    expect(fake.changesQuery.filters).toEqual([['affects_disclosure', true]])
    expect(fake.changesQuery.order).toEqual(['created_at', false])
    expect(result).toEqual({
      ok: true,
      data: [
        { label: '2026년 10월 23일', value: '동기화 Common 확률을 84%에서 83%로, 동기화 Rare 확률을 12%에서 13%로 바꿨어요' },
        { label: '2026년 10월 22일', value: '캡슐 Epic 보정 횟수를 15번에서 12번으로 바꿨어요' },
      ],
    })
    // 확률 안내에 반영되지 않는 칸의 변경(false 행)은 어디에도 나오지 않는다
    expect(JSON.stringify(result)).not.toContain('2026년 10월 22일동기화')
  })

  it('저장 한 번은 칸이 여럿이어도 한 줄이다', async () => {
    const fake = fakeClient({ [CHANGES_TABLE]: ok([dbRow('2026-10-23T05:00:00Z', JAM_COLUMNS.map((field) => change(field, 1, 2)))]) })
    const result = await loadProbabilityChangeLog(fake.client)
    expect(result.ok && result.data).toHaveLength(1)
  })

  it('읽는 칸은 section_key, changes, created_at뿐이고, 메모와 바꾼 사람은 결과에 실리지 않는다', async () => {
    const fake = fakeClient({
      [CHANGES_TABLE]: ok([
        dbRow('2026-10-23T05:00:00Z', [change('sync_rarity_common', 84, 83)], {
          note: '내부 메모: 공지는 슬랙으로 했음',
          changed_by: '0b8a3f2e-aaaa-bbbb-cccc-111122223333',
        }),
      ]),
    })
    const result = await loadProbabilityChangeLog(fake.client)
    expect(fake.selects[CHANGES_TABLE]).toBe('section_key, changes, created_at')
    expect(fake.selects[CHANGES_TABLE]).not.toMatch(/note|changed_by|\*/)
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('내부 메모')
    expect(serialized).not.toContain('0b8a3f2e')
    expect(serialized).not.toContain('note')
    expect(serialized).not.toContain('changed_by')
  })

  it('이력이 없으면 ok: true와 빈 배열이다(읽기 실패와 구분된다)', async () => {
    expect(await loadProbabilityChangeLog(fakeClient({ [CHANGES_TABLE]: ok([]) }).client)).toEqual({ ok: true, data: [] })
    expect(await loadProbabilityChangeLog(fakeClient({}).client)).toEqual({ ok: true, data: [] })
  })

  it('조회 오류·예외·목록이 아닌 결과는 { ok: false }다', async () => {
    expect(await loadProbabilityChangeLog(fakeClient({ [CHANGES_TABLE]: failed }).client)).toEqual({ ok: false })
    expect(await loadProbabilityChangeLog(fakeClient({ [CHANGES_TABLE]: 'throw' }).client)).toEqual({ ok: false })
    expect(await loadProbabilityChangeLog(fakeClient({ [CHANGES_TABLE]: ok({ not: 'a list' }) }).client)).toEqual({ ok: false })
    expect(await loadProbabilityChangeLog(fakeClient({ [CHANGES_TABLE]: ok(null) }).client)).toEqual({ ok: false })
  })

  it('클라이언트를 만들지 못해도 던지지 않고 { ok: false }다. 인자로 받으면 새로 만들지 않는다', async () => {
    createServiceClientMock.mockImplementation(() => {
      throw new Error('env 없음')
    })
    expect(await loadProbabilityChangeLog()).toEqual({ ok: false })

    createServiceClientMock.mockReset()
    await loadProbabilityChangeLog(fakeClient({}).client)
    expect(createServiceClientMock).not.toHaveBeenCalled()
  })
})
