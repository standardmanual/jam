/**
 * 항목 서랍이 읽는 순수 함수 (티켓 20261026_2024 2회차)
 *
 * 지키는 것: 핵심 값은 종류마다 읽는 칸이 다르고 없는 칸은 줄이 없다(공개 기간은 같은 날이면 끝 시각만 쓴다),
 * 검수 결과는 윈터(통과·확인 필요·기록 없음)와 혜린(통과·확인 필요·기록 없음) 두 줄이고 시각은 해당 단계 기록에서만 읽는다,
 * 다음 항목은 `position` 순으로 돌아가며 자기밖에 없으면 null이다, 「빼기」·「이대로 두기」가 쓰는 체크 변경과 합쳐도 건수가 맞는다.
 */
import { describe, expect, it } from 'vitest'
import type { Json } from '@/types/database.generated'
import type { BalanceLine } from '@/lib/admin/opsInbox/balance/view'
import { splitByChecked, withCheck } from '@/lib/admin/opsInbox/selection'
import { keyValuesOf, nextDecidableItemId, periodText, reviewResultsOf } from '../drawerView'
import { makeStage } from './fixtures'

interface Item {
  kind: string | null
  startsAt: string | null
  endsAt: string | null
  original: Json
  edited: Json | null
}

function item(over: Partial<Item> = {}): Item {
  return { kind: 'home_feed_card', startsAt: null, endsAt: null, original: {}, edited: null, ...over }
}

const rowsOf = (over: Partial<Item>) => Object.fromEntries(keyValuesOf(item(over)).map((row) => [row.label, row.value]))

describe('periodText', () => {
  it('같은 날이면 끝 시각만, 다른 날이면 날짜까지 쓴다', () => {
    expect(periodText('2026-12-30T09:00:00+09:00', '2026-12-30T10:00:00+09:00')).toBe('12/30(수) 09:00 ~ 10:00')
    expect(periodText('2026-12-30T09:00:00+09:00', '2026-12-31T10:00:00+09:00')).toBe('12/30(수) 09:00 ~ 12/31(목) 10:00')
  })

  it('한쪽만 있으면 「부터」·「까지」이고 둘 다 없거나 틀리면 null이다', () => {
    expect(periodText('2026-12-30T09:00:00+09:00', null)).toBe('12/30(수) 09:00부터')
    expect(periodText(null, '2026-12-30T10:00:00+09:00')).toBe('12/30(수) 10:00까지')
    expect(periodText(null, null)).toBeNull()
    expect(periodText('not-a-date', null)).toBeNull()
  })
})

describe('keyValuesOf', () => {
  it('홈피드 카드: 공개 기간·대상(노출 태그)·모양만 읽고 조건·보상 줄은 없다', () => {
    const rows = keyValuesOf(
      item({
        startsAt: '2026-12-30T09:00:00+09:00',
        endsAt: '2026-12-30T10:00:00+09:00',
        original: { exposure_tags: ['all', 'new_user'], shape: 'hero', resource: { reward_points: 50 } },
      })
    )
    expect(rows).toEqual([
      { label: '공개 기간', value: '12/30(수) 09:00 ~ 10:00' },
      { label: '대상', value: 'all · new_user' },
      { label: '모양', value: 'hero' },
    ])
  })

  it('미션·레시피·컬렉션: 보상은 포인트와 보상 배지 수', () => {
    expect(rowsOf({ kind: 'mission', original: { resource: { reward_points: 50, reward_badge_ids: ['a', 'b'] } } })['보상']).toBe('50포인트 · 보상 배지 2개')
    expect(rowsOf({ kind: 'recipe', original: { resource: { reward_points: 30 } } })['보상']).toBe('30포인트')
    expect(rowsOf({ kind: 'collection_launch', original: { resource: { reward_points: 20, reward_badge_id: 'x' } } })['보상']).toBe('20포인트 · 보상 배지 1개')
  })

  it('JAM! 배지: 조건(condition_json)과 보상(point_reward)', () => {
    const rows = rowsOf({ kind: 'jam_badge', original: { resource: { condition_json: { run_count: 3 }, point_reward: 10 } } })
    expect(rows['조건']).toBe('{"run_count":3}')
    expect(rows['보상']).toBe('10포인트')
  })

  it('긴 조건은 줄여서 한 줄로 보인다', () => {
    const long = { note: 'x'.repeat(200) }
    expect(rowsOf({ kind: 'jam_badge', original: { resource: { condition_json: long } } })['조건']).toMatch(/…$/)
  })

  it('노출 태그가 없으면 옛 칸 segment를 읽고, 수정본이 있으면 수정본이 앞선다', () => {
    expect(rowsOf({ original: { segment: { tribe: '러너' } } })['대상']).toBe('tribe: 러너')
    expect(rowsOf({ original: { exposure_tags: ['all'] }, edited: { exposure_tags: ['new_user'] } })['대상']).toBe('new_user')
  })

  it('없는 칸은 줄을 그리지 않고, 모양이 틀린 값에도 죽지 않는다', () => {
    expect(keyValuesOf(item())).toEqual([])
    expect(keyValuesOf(item({ kind: null, original: 5 }))).toEqual([])
    expect(rowsOf({ original: { shape: 'unknown-shape', exposure_tags: 'all', resource: 7 } })).toEqual({})
    expect(rowsOf({ kind: 'mission', original: { resource: { reward_points: '50' } } })).toEqual({})
  })
})

const winterOk = { world_review: { world_related: true, winter_reviewed: true, reason: '이야기가 맞아요' } }
const warnLine = { kind: 'warn', warning: { message: '포인트가 기준을 넘어요' } } as unknown as BalanceLine
const infoLine = { kind: 'info', warning: { message: '참고예요' } } as unknown as BalanceLine

describe('reviewResultsOf', () => {
  const stages = [
    makeStage('world_review', { endedAt: '2026-10-20T09:40:00+09:00' }),
    makeStage('balance_check', { endedAt: '2026-10-20T09:55:00+09:00' }),
  ]

  it('윈터는 검수를 마쳤거나 세계관과 닿지 않으면 통과, 아니면 확인 필요, 칸이 없으면 기록 없음이다', () => {
    const state = (original: Json) => reviewResultsOf({ item: { original, edited: null }, stages: [], balanceLines: [] })[0]
    expect(state(winterOk)).toMatchObject({ state: 'pass', stateText: '통과', reason: '이야기가 맞아요' })
    expect(state({ world_review: { world_related: false, winter_reviewed: false, reason: '' } })).toMatchObject({ state: 'pass', reason: null })
    expect(state({ world_review: { world_related: true, winter_reviewed: false, reason: '아직이에요' } })).toMatchObject({
      state: 'check',
      stateText: '확인 필요',
      reason: '아직이에요',
    })
    expect(state({})).toMatchObject({ state: 'none', stateText: '검수 기록 없음', at: null })
  })

  it('혜린은 주의 줄이 없으면 통과, 있으면 확인 필요(첫 주의 줄이 근거), 평가 결과가 없으면 점검 기록 없음이다', () => {
    const run = (balanceLines: readonly BalanceLine[] | undefined) =>
      reviewResultsOf({ item: { original: winterOk, edited: null }, stages: [], balanceLines })[1]
    expect(run([])).toMatchObject({ state: 'pass', stateText: '통과', reason: null })
    expect(run([infoLine])).toMatchObject({ state: 'pass' })
    expect(run([infoLine, warnLine])).toMatchObject({ state: 'check', stateText: '확인 필요', reason: '포인트가 기준을 넘어요' })
    expect(run(undefined)).toMatchObject({ state: 'none', stateText: '점검 기록 없음', at: null })
  })

  it('시각은 해당 단계 기록의 endedAt(KST)이고, 단계 기록이 없으면 쓰지 않는다', () => {
    const [winter, hyerin] = reviewResultsOf({ item: { original: winterOk, edited: null }, stages, balanceLines: [] })
    expect(winter.at).toBe('10/20(화) 09:40')
    expect(hyerin.at).toBe('10/20(화) 09:55')
    const none = reviewResultsOf({ item: { original: winterOk, edited: null }, stages: [makeStage('plan', { endedAt: '2026-10-20T09:00:00+09:00' })], balanceLines: [] })
    expect(none[0].at).toBeNull()
    expect(none[1].at).toBeNull()
  })

  it('같은 단계가 여러 번 적혀 있으면 가장 늦게 끝난 기록의 시각을 쓴다', () => {
    const [winter] = reviewResultsOf({
      item: { original: winterOk, edited: null },
      stages: [
        makeStage('world_review', { endedAt: '2026-10-20T09:40:00+09:00' }),
        makeStage('world_review', { endedAt: '2026-10-20T11:10:00+09:00' }),
        makeStage('world_review', { endedAt: null }),
      ],
      balanceLines: [],
    })
    expect(winter.at).toBe('10/20(화) 11:10')
  })

  it('이름과 역할이 윈터·혜린 순으로 나온다', () => {
    const results = reviewResultsOf({ item: { original: {}, edited: null }, stages: [], balanceLines: undefined })
    expect(results.map((result) => result.title)).toEqual(['윈터 · 세계관 검수', '혜린 · 밸런스 점검'])
  })
})

describe('nextDecidableItemId', () => {
  const make = (id: string, position: number, status = 'reviewing') => ({ id, position, status })
  // 배열 순서와 position이 달라도 position 순으로 본다.
  const items = [make('c', 2), make('a', 0), make('b', 1, 'approved'), make('d', 3)]

  it('position 순으로 현재 다음의 결정할 항목(검토중)을 돌려주고, 결정할 수 없는 항목은 건너뛴다', () => {
    expect(nextDecidableItemId(items, 'a')).toBe('c')
    expect(nextDecidableItemId(items, 'c')).toBe('d')
  })

  it('끝이면 처음부터 찾는다', () => {
    expect(nextDecidableItemId(items, 'd')).toBe('a')
  })

  it('결정할 항목이 자기밖에 없으면 null이다', () => {
    expect(nextDecidableItemId([make('a', 0), make('b', 1, 'approved')], 'a')).toBeNull()
    expect(nextDecidableItemId([make('a', 0)], 'a')).toBeNull()
    expect(nextDecidableItemId([], 'a')).toBeNull()
  })

  it('현재 항목이 목록에 없어도 처음부터 찾는다', () => {
    expect(nextDecidableItemId(items, 'ghost')).toBe('a')
  })
})

describe('빼기·이대로 두기가 쓰는 체크 변경', () => {
  const rows = [
    { id: 'a', position: 0, startsAt: null, status: 'reviewing', formatErrors: [] as string[], updatedAt: 't1' },
    { id: 'b', position: 1, startsAt: null, status: 'reviewing', formatErrors: ['x'], updatedAt: 't1' },
  ]

  it('빼기는 체크를 해제해 승인 대상에서 빠지고, 이대로 두기는 꺼져 있던 체크를 켠다', () => {
    const excluded = withCheck({}, rows[0], false)
    expect(splitByChecked(rows, excluded).checked.map((row) => row.id)).toEqual([])
    const kept = withCheck(excluded, rows[1], true)
    expect(splitByChecked(rows, kept).checked.map((row) => row.id)).toEqual(['b'])
    // 이미 켜져 있던 항목을 이대로 두어도 체크는 유지된다
    expect(splitByChecked(rows, withCheck({}, rows[0], true)).checked.map((row) => row.id)).toEqual(['a'])
  })
})
