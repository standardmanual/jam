/**
 * 밸런스 규칙 평가 (티켓 20260930_1459 조각 A, 순수 함수)
 *
 * 규칙별 경계값(값과 같으면 통과, 넘으면 경고) · 점검 못 함 3종(시각·숫자·서비스 상태) · 수정본 우선 · 반려 제외 · 꺼진 규칙 ·
 * R5 종류 판정(횟수형·달성형) · R1 공개 시각 기준 노출 판정 · 확인한 규칙 수를 지킨다.
 * 조각 B(티켓 20260930_1459): R1은 DB 컬렉션 + 자원이 아직 없는 개방 항목을, R2·R3은 자원이 만들어졌든 아니든 모든 개방 항목을 센다.
 * 시각은 KST로 적는다(2026-10-01은 목요일, 10/12는 월요일이다). 문장은 채원 확정 설계의 문구와 글자 그대로 견준다.
 */
import { describe, it, expect } from 'vitest'
import { collectBalanceReferences, evaluateBundleBalance, type BalanceItemInput } from '../evaluate'
import type { BalanceState } from '../state'
import { NOW, launch, makeItem, makeRules, makeState, openBooks, rulesOnly } from './fixtures'

const DAY = 24 * 60 * 60 * 1000

function run(items: BalanceItemInput[], rules = makeRules(), state: BalanceState = makeState(), now = NOW) {
  return evaluateBundleBalance(items, rules, state, now)
}

const messagesOf = (list: Array<{ message: string }>) => list.map((entry) => entry.message)

type OriginalJson = BalanceItemInput['original']

function mission(points: unknown, extra: Record<string, unknown> = {}, overrides: Partial<BalanceItemInput> = {}) {
  return makeItem({ kind: 'mission', original: { resource: { reward_points: points, ...extra } } as OriginalJson, ...overrides })
}

function badge(points: unknown, condition: unknown, extra: Record<string, unknown> = {}, overrides: Partial<BalanceItemInput> = {}) {
  return makeItem({
    kind: 'jam_badge',
    original: { resource: { point_reward: points, condition_json: condition, ...extra } } as OriginalJson,
    ...overrides,
  })
}

const COUNT = { combine_attempt_count: 5 }
const ACHIEVEMENT = { recipe_first_success: { recipe_id: 'r1' } }

describe('R1 동시 개방 컬렉션 수', () => {
  const rules = rulesOnly(['open_collections_max'])
  const T = '2026-10-12T09:00:00+09:00'

  it('채원 확정 문구: 지금 30개 + 새 컬렉션 1개 = 31개이면 주의 한 줄이다', () => {
    const item = launch(T)
    const result = run([item], rules, makeState({ books: { ok: true, data: openBooks(30) } }))
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'open_collections_max',
      level: 'warn',
      itemId: item.id,
      measured: 31,
      limit: 6,
      provisional: true,
      message: '이 컬렉션이 열리는 10/12(월) 09:00에 열려 있을 컬렉션이 31개예요. 동시에 6개까지가 기준이에요.',
    })
    expect(result.unreadable).toEqual([])
  })

  it('경계: 연 뒤 6개이면 통과, 7개이면 경고', () => {
    const at = (books: number) => run([launch(T)], rules, makeState({ books: { ok: true, data: openBooks(books) } }))
    expect(at(5).warnings).toEqual([]) // 5 + 새 1 = 6 = 기준
    expect(at(6).warnings).toHaveLength(1) // 6 + 새 1 = 7 > 6
  })

  it('노출 판정은 공개 시각 기준이다: 그 시각 이후에 열리는 컬렉션·이미 닫힌 컬렉션·비활성은 세지 않는다', () => {
    const books = [
      ...openBooks(4),
      { is_active: true, valid_from: '2026-10-12T00:00:01.000Z', valid_until: null }, // 공개 시각(10/12 00:00Z) 1초 뒤에 열림
      { is_active: true, valid_from: null, valid_until: '2026-10-11T23:59:59.000Z' }, // 공개 시각 1초 전에 닫힘
      { is_active: false, valid_from: null, valid_until: null },
    ]
    const result = run([launch(T)], rules, makeState({ books: { ok: true, data: books } }))
    expect(result.warnings).toEqual([]) // 4 + 새 1 = 5
    const boundary = [
      ...openBooks(4),
      { is_active: true, valid_from: '2026-10-12T00:00:00.000Z', valid_until: null }, // 시작 시각이 공개 시각과 같으면 열린 것
      { is_active: true, valid_from: null, valid_until: '2026-10-12T00:00:00.000Z' }, // 종료 시각이 같으면 아직 열린 것
    ]
    expect(run([launch(T)], rules, makeState({ books: { ok: true, data: boundary } })).warnings).toHaveLength(1) // 6 + 새 1 = 7
  })

  it('다른 묶음의 신규 개방은 그 시각에 열려 있을 때만 센다', () => {
    const others = [
      { itemId: 'o1', startsAt: '2026-10-05T00:00:00.000Z', endsAt: '2026-12-01T00:00:00.000Z', resourceCreated: false }, // 열려 있음
      { itemId: 'o2', startsAt: '2026-10-05T00:00:00.000Z', endsAt: null, resourceCreated: false }, // 끝이 없음 = 계속 열림
      { itemId: 'o3', startsAt: '2026-10-20T00:00:00.000Z', endsAt: null, resourceCreated: false }, // 아직 안 열림
      { itemId: 'o4', startsAt: '2026-09-01T00:00:00.000Z', endsAt: '2026-10-01T00:00:00.000Z', resourceCreated: false }, // 이미 닫힘
      { itemId: 'o5', startsAt: null, endsAt: null, resourceCreated: false }, // 시각을 못 읽어 자리를 못 잡음
    ]
    const state = makeState({ books: { ok: true, data: openBooks(3) }, otherLaunches: { ok: true, data: others } })
    // 3(DB) + 2(다른 묶음) + 1(새) = 6 → 통과
    expect(run([launch(T)], rules, state).warnings).toEqual([])
    const more = makeState({ books: { ok: true, data: openBooks(4) }, otherLaunches: { ok: true, data: others } })
    expect(run([launch(T)], rules, more).warnings[0]?.measured).toBe(7)
  })

  it('이미 만들어진 다른 묶음의 개방은 DB 컬렉션에서만 센다(항목에서 한 번 더 더하지 않는다)', () => {
    const others = [
      { itemId: 'made', startsAt: '2026-10-05T00:00:00.000Z', endsAt: null, resourceCreated: true }, // DB의 열린 컬렉션 3개 중 하나
      { itemId: 'todo', startsAt: '2026-10-05T00:00:00.000Z', endsAt: null, resourceCreated: false },
    ]
    const state = makeState({ books: { ok: true, data: openBooks(3) }, otherLaunches: { ok: true, data: others } })
    // 3(DB, 만들어진 개방 포함) + 1(아직 안 만든 개방) + 1(새) = 5 → 통과. 이중으로 세면 6이 된다.
    const result = run([launch(T)], rules, state)
    expect(result.warnings).toEqual([])
    const tight = makeState({ books: { ok: true, data: openBooks(5) }, otherLaunches: { ok: true, data: others } })
    expect(run([launch(T)], rules, tight).warnings[0]?.measured).toBe(7) // 5 + 1 + 1
  })

  it('이 묶음의 개방 항목이 이미 컬렉션을 만들었으면(created_resource.item_book_id) DB 컬렉션에서만 센다(항목에서 한 번 더 더하지 않는다. 티켓 20261004_2039 가정 9)', () => {
    const made = launch(T, '2026-12-31T09:00:00+09:00', {}, { createdResource: { item_book_id: 'book-1' }, status: 'scheduled' })
    // DB의 열린 컬렉션 6개에 방금 만든 컬렉션이 이미 들어 있다. 이중으로 세면 7이 되어 경고가 난다.
    const result = run([made], rules, makeState({ books: { ok: true, data: openBooks(6) } }))
    expect(result.warnings).toEqual([])
    expect(result.unreadable).toEqual([])
    // 만들어지지 않은 같은 항목은 DB 6 + 새 1 = 7로 경고다.
    expect(run([launch(T)], rules, makeState({ books: { ok: true, data: openBooks(6) } })).warnings[0]?.measured).toBe(7)
    // DB가 7개이면 만들어진 항목도 7로 경고한다(DB 값을 그대로 쓴다).
    expect(run([made], rules, makeState({ books: { ok: true, data: openBooks(7) } })).warnings[0]?.measured).toBe(7)
  })

  it('만들어진 항목과 아직 만들지 않은 항목이 섞이면 만들지 않은 항목만 항목에서 더한다', () => {
    const made = launch(T, '2026-12-31T09:00:00+09:00', {}, { createdResource: { item_book_id: 'book-1' }, status: 'scheduled' })
    const todo = launch(T)
    const result = run([made, todo], rules, makeState({ books: { ok: true, data: openBooks(5) } }))
    // 각 항목의 시점: DB 5(만든 컬렉션 포함) + 아직 안 만든 1 = 6 → 통과. 이중으로 세면 7이 된다.
    expect(result.warnings).toEqual([])
  })

  it('created_resource에 item_book_id가 없거나 형식이 아니면(null·빈 객체·sample·빈 문자열·숫자) 아직 만들지 않은 것으로 센다', () => {
    for (const createdResource of [null, {}, { sample: true }, { item_book_id: '' }, { item_book_id: 5 }, { badge_id: 'b1' }]) {
      const item = launch(T, '2026-12-31T09:00:00+09:00', {}, { createdResource, status: 'scheduled' })
      const result = run([item], rules, makeState({ books: { ok: true, data: openBooks(6) } }))
      expect(result.warnings[0], JSON.stringify(createdResource)).toMatchObject({ measured: 7, limit: 6 })
    }
  })

  it('같은 묶음의 다른 신규 개방도 그 시각에 열려 있으면 센다', () => {
    const a = launch('2026-10-12T09:00:00+09:00')
    const b = launch('2026-10-13T09:00:00+09:00')
    const result = run([a, b], rules, makeState({ books: { ok: true, data: openBooks(5) } }))
    // a 시점: 5 + a = 6 통과, b 시점: 5 + a + b = 7 경고
    expect(result.warnings.map((w) => w.itemId)).toEqual([b.id])
  })

  it('새 컬렉션을 여는 항목이 없으면 계산하지 않는다(경고도 점검 못 함도 없다)', () => {
    const result = run([mission(10)], rules, makeState({ books: { ok: true, data: openBooks(30) } }))
    expect(result.warnings).toEqual([])
    expect(result.unreadable).toEqual([])
  })

  it('종료 시각이 없으면 점검 못 함이다(채원 확정 문구)', () => {
    const item = launch(T, null)
    const result = run([item], rules, makeState({ books: { ok: true, data: openBooks(30) } }))
    expect(result.warnings).toEqual([])
    expect(result.unreadable).toHaveLength(1)
    expect(result.unreadable[0]).toMatchObject({
      ruleKey: 'open_collections_max',
      level: 'info',
      itemId: item.id,
      measured: null,
      limit: null,
      message: '종료 시각이 없어서 동시 개방 컬렉션 수를 확인하지 못했어요. 시각을 적으면 다시 확인해요.',
    })
  })

  it('공개 시각이 없거나 형식이 틀려도 점검 못 함이다', () => {
    const missing = launch(null)
    const invalid = launch(null, '2026-12-31T09:00:00+09:00', { starts_at: '내일 아침' })
    const result = run([missing, invalid], rules)
    expect(messagesOf(result.unreadable)).toEqual([
      '공개 시각이 없어서 동시 개방 컬렉션 수를 확인하지 못했어요. 시각을 적으면 다시 확인해요.',
      '공개 시각 형식이 맞지 않아서 동시 개방 컬렉션 수를 확인하지 못했어요. 시각을 고치면 다시 확인해요.',
    ])
  })

  it('컬렉션이나 다른 묶음 상태를 읽지 못하면 그 규칙만 점검 못 함이다', () => {
    const item = launch(T)
    const booksDown = run([item], rules, makeState({ books: { ok: false } }))
    expect(booksDown.warnings).toEqual([])
    expect(messagesOf(booksDown.unreadable)).toEqual([
      '서비스 상태를 읽지 못해서 동시 개방 컬렉션 수를 확인하지 못했어요. 새로 고치면 다시 확인해요.',
    ])
    const othersDown = run([item], rules, makeState({ otherLaunches: { ok: false } }))
    expect(othersDown.unreadable).toHaveLength(1)
  })

  it('수정본의 공개 시각이 우선이다: 고쳐서 경고가 풀린다', () => {
    const item = launch(T, '2026-12-31T09:00:00+09:00', {}, {
      edited: { starts_at: '2026-10-12T09:00:00+09:00' },
    })
    // 원본은 10/12에 열려 1개가 겹치지만, 수정본으로 겹치는 컬렉션(valid_until 10/13)이 끝난 뒤인 10/14로 옮기면 통과한다
    const books = [...openBooks(5), { is_active: true, valid_from: null, valid_until: '2026-10-13T00:00:00.000Z' }]
    const state = makeState({ books: { ok: true, data: books } })
    expect(run([item], rules, state).warnings).toHaveLength(1) // 6 + 새 1 = 7
    const moved = launch(T, '2026-12-31T09:00:00+09:00', {}, { edited: { starts_at: '2026-10-14T09:00:00+09:00' } })
    expect(run([moved], rules, state).warnings).toEqual([]) // 5 + 새 1 = 6
  })
})

describe('R2 한 주 신규 개방 수', () => {
  const rules = rulesOnly(['weekly_new_collections_max'])

  it('채원 확정 문구: 같은 주(10/12~10/18)에 2개이면 묶음 경고(항목 키 없음)다', () => {
    const a = launch('2026-10-12T09:00:00+09:00')
    const b = launch('2026-10-15T09:00:00+09:00')
    const result = run([a, b], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'weekly_new_collections_max',
      itemId: null,
      measured: 2,
      limit: 1,
      provisional: true,
      message: '이번 주(10/12~10/18)에 새 컬렉션을 2개 열어요(10/12, 10/15). 한 주에 1개까지가 기준이에요.',
    })
  })

  it('경계: 한 주에 1개이면 통과, 2개이면 경고', () => {
    expect(run([launch('2026-10-12T09:00:00+09:00')], rules).warnings).toEqual([])
    expect(run([launch('2026-10-12T09:00:00+09:00'), launch('2026-10-18T09:00:00+09:00')], rules).warnings).toHaveLength(1)
  })

  it('주는 월~일 KST다: 일요일 밤과 월요일 새벽은 다른 주다(UTC로는 같은 날)', () => {
    const sunday = launch('2026-10-18T23:30:00+09:00') // 10/18 14:30Z
    const monday = launch('2026-10-19T00:30:00+09:00') // 10/18 15:30Z
    expect(run([sunday, monday], rules).warnings).toEqual([])
  })

  it('다른 묶음의 신규 개방도 같은 주면 센다(주 경고는 이 묶음이 연 주에서만 뜬다)', () => {
    const state = makeState({
      otherLaunches: {
        ok: true,
        data: [
          { itemId: 'o1', startsAt: '2026-10-14T00:00:00.000Z', endsAt: null, resourceCreated: false }, // 같은 주
          { itemId: 'o2', startsAt: '2026-10-28T00:00:00.000Z', endsAt: null, resourceCreated: false }, // 다른 주
        ],
      },
    })
    const result = run([launch('2026-10-12T09:00:00+09:00')], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].measured).toBe(2)
    // 이 묶음이 열지 않는 주(10/26 주)는 다른 묶음이 이미 넘겨도 이 묶음의 경고가 아니다
    const quiet = makeState({
      otherLaunches: { ok: true, data: [{ itemId: 'o', startsAt: '2026-10-28T00:00:00.000Z', endsAt: null, resourceCreated: false }, { itemId: 'p', startsAt: '2026-10-29T00:00:00.000Z', endsAt: null, resourceCreated: false }] },
    })
    expect(run([launch('2026-10-12T09:00:00+09:00')], rules, quiet).warnings).toEqual([])
  })

  it('이미 만들어진 다른 묶음의 개방도 같은 주 개수에 센다(자원 ID가 있어도 빠지지 않는다)', () => {
    const state = makeState({
      otherLaunches: { ok: true, data: [{ itemId: 'made', startsAt: '2026-10-14T00:00:00.000Z', endsAt: null, resourceCreated: true }] },
    })
    const result = run([launch('2026-10-12T09:00:00+09:00')], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].measured).toBe(2)
  })

  it('이 묶음의 개방 항목은 컬렉션을 이미 만들었어도(created_resource.item_book_id) 한 번만 센다(R1은 DB에서, R2는 항목에서 센다. 티켓 20261004_2039 가정 9)', () => {
    const made = launch('2026-10-12T09:00:00+09:00', '2026-12-31T09:00:00+09:00', {}, { createdResource: { item_book_id: 'book-1' }, status: 'scheduled' })
    expect(run([made], rules).warnings).toEqual([]) // 1개 = 기준
    const second = launch('2026-10-15T09:00:00+09:00')
    const result = run([made, second], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ measured: 2, limit: 1 }) // 만들어진 항목도 세고 두 번 세지 않는다
  })

  it('다른 묶음 상태를 읽지 못하면 점검 못 함이고, 공개 시각이 없으면 그 항목이 점검 못 함이다', () => {
    const down = run([launch('2026-10-12T09:00:00+09:00')], rules, makeState({ otherLaunches: { ok: false } }))
    expect(down.warnings).toEqual([])
    expect(messagesOf(down.unreadable)).toEqual([
      '서비스 상태를 읽지 못해서 한 주 신규 개방 수를 확인하지 못했어요. 새로 고치면 다시 확인해요.',
    ])
    const noStart = run([launch(null)], rules)
    expect(messagesOf(noStart.unreadable)).toEqual([
      '공개 시각이 없어서 한 주 신규 개방 수를 확인하지 못했어요. 시각을 적으면 다시 확인해요.',
    ])
  })
})

describe('R3 28일 신규 개방 수', () => {
  const rules = rulesOnly(['rolling_new_collections_max'])

  it('채원 확정 문구: 10/26부터 28일 안에 3개(다른 기획 2개 포함)', () => {
    const state = makeState({
      otherLaunches: {
        ok: true,
        data: [
          { itemId: 'o1', startsAt: '2026-10-12T00:00:00.000Z', endsAt: null, resourceCreated: false },
          { itemId: 'o2', startsAt: '2026-10-19T00:00:00.000Z', endsAt: null, resourceCreated: false },
        ],
      },
    })
    const result = run([launch('2026-10-26T09:00:00+09:00')], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'rolling_new_collections_max',
      itemId: null,
      measured: 3,
      limit: 2,
      provisional: true,
      message: '공개 시각(10/26)부터 거슬러 28일 안에 새 컬렉션이 3개예요(다른 기획의 2개 포함). 28일에 2개까지가 기준이에요.',
    })
  })

  it('이 묶음의 개방만으로 넘으면 「다른 기획」 문구가 없다', () => {
    const items = [launch('2026-10-12T09:00:00+09:00'), launch('2026-10-19T09:00:00+09:00'), launch('2026-10-26T09:00:00+09:00')]
    const result = run(items, rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toBe('공개 시각(10/26)부터 거슬러 28일 안에 새 컬렉션이 3개예요. 28일에 2개까지가 기준이에요.')
  })

  it('이 묶음의 개방 항목은 컬렉션을 이미 만들었어도(created_resource.item_book_id) 한 번만 센다(티켓 20261004_2039 가정 9)', () => {
    const made = (startsAt: string) => launch(startsAt, '2026-12-31T09:00:00+09:00', {}, { createdResource: { item_book_id: `book-${startsAt}` }, status: 'scheduled' })
    const items = [made('2026-10-12T09:00:00+09:00'), made('2026-10-19T09:00:00+09:00'), launch('2026-10-26T09:00:00+09:00')]
    const result = run(items, rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ measured: 3, limit: 2 })
    expect(run(items.slice(0, 2), rules).warnings).toEqual([]) // 만들어진 둘만 = 2개 = 기준
  })

  it('경계: 2개이면 통과, 28일(정확히)을 거슬러 포함하고 1분 더 앞이면 빠진다', () => {
    const anchor = Date.parse('2026-10-26T09:00:00+09:00')
    const exactly28 = new Date(anchor - 28 * DAY).toISOString()
    const justOutside = new Date(anchor - 28 * DAY - 60_000).toISOString()
    const make = (earlier: string) =>
      run(
        [launch('2026-10-26T09:00:00+09:00')],
        rules,
        makeState({
          otherLaunches: {
            ok: true,
            data: [
              { itemId: 'o1', startsAt: earlier, endsAt: null, resourceCreated: false },
              { itemId: 'o2', startsAt: '2026-10-20T00:00:00.000Z', endsAt: null, resourceCreated: false },
            ],
          },
        })
      )
    expect(make(exactly28).warnings).toHaveLength(1) // 28일 경계 = 안 (3개)
    expect(make(justOutside).warnings).toEqual([]) // 1분 밖 = 2개
  })

  it('이미 만들어진 다른 묶음의 개방도 28일 개수에 센다(자원 ID가 있어도 빠지지 않는다)', () => {
    const state = makeState({
      otherLaunches: {
        ok: true,
        data: [
          { itemId: 'made1', startsAt: '2026-10-12T00:00:00.000Z', endsAt: null, resourceCreated: true },
          { itemId: 'made2', startsAt: '2026-10-19T00:00:00.000Z', endsAt: null, resourceCreated: true },
        ],
      },
    })
    const result = run([launch('2026-10-26T09:00:00+09:00')], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].measured).toBe(3)
  })

  it('앞선 개방이 아니라 뒤의 개방만 있으면 그 시점부터 거슬러 센다(미래 개방은 세지 않는다)', () => {
    const state = makeState({
      otherLaunches: { ok: true, data: [{ itemId: 'o1', startsAt: '2026-11-30T00:00:00.000Z', endsAt: null, resourceCreated: false }, { itemId: 'o2', startsAt: '2026-12-01T00:00:00.000Z', endsAt: null, resourceCreated: false }] },
    })
    expect(run([launch('2026-10-26T09:00:00+09:00')], rules, state).warnings).toEqual([])
  })
})

describe('R4 개방 리드타임', () => {
  const rules = rulesOnly(['launch_lead_days_min'])
  const startIn = (days: number, extraMs = 0) => new Date(Date.parse(NOW) + days * DAY + extraMs).toISOString()

  it('채원 확정 문구: 공개까지 20일이면 경고', () => {
    const item = launch(startIn(20))
    const result = run([item], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'launch_lead_days_min',
      itemId: item.id,
      measured: 20,
      limit: 28,
      provisional: false,
      message: '공개까지 20일 남았어요. 최소 28일은 필요해요.',
    })
  })

  it('경계: 28일이면 통과, 1분 모자라면 경고(27일)', () => {
    expect(run([launch(startIn(28))], rules).warnings).toEqual([])
    expect(run([launch(startIn(29))], rules).warnings).toEqual([])
    const short = run([launch(startIn(28, -60_000))], rules)
    expect(short.warnings).toHaveLength(1)
    expect(short.warnings[0].message).toBe('공개까지 27일 남았어요. 최소 28일은 필요해요.')
  })

  it('승인 전이면 기준 시각이 지금이고, 승인 뒤면 승인 시각이다', () => {
    const start = startIn(3) // 지금부터 3일 뒤
    // 33일 전에 승인했으면 승인 당시 리드타임은 36일이라 통과
    const early = launch(start, '2026-12-31T09:00:00+09:00', {}, { status: 'scheduled', approvedAt: new Date(Date.parse(NOW) - 33 * DAY).toISOString() })
    expect(run([early], rules).warnings).toEqual([])
    // 승인이 공개 10일 전이었으면 경고, 문장은 「승인할 때」다
    const late = launch(start, '2026-12-31T09:00:00+09:00', {}, { status: 'approved', approvedAt: new Date(Date.parse(NOW) - 7 * DAY).toISOString() })
    const result = run([late], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toBe('승인할 때 공개까지 10일이 남아 있었어요. 최소 28일은 필요해요.')
  })

  it('공개 시각이 이미 지났으면 남은 일수 대신 그 사실을 알린다', () => {
    const result = run([launch(startIn(-2))], rules)
    expect(result.warnings[0].message).toBe('공개 시각이 이미 지났어요. 최소 28일은 필요해요.')
  })

  it('공개 시각이 없으면 점검 못 함이다', () => {
    expect(messagesOf(run([launch(null)], rules).unreadable)).toEqual([
      '공개 시각이 없어서 개방 리드타임을 확인하지 못했어요. 시각을 적으면 다시 확인해요.',
    ])
  })
})

describe('R5 항목별 포인트', () => {
  const rules = rulesOnly(['point_reward_max'])

  it('채원 확정 문구: 미션 80 포인트는 50 포인트 기준 초과', () => {
    const item = mission(80)
    const result = run([item], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'point_reward_max',
      itemId: item.id,
      measured: 80,
      limit: 50,
      provisional: true,
      message: '이 미션이 주는 포인트가 80 포인트예요. 미션은 50 포인트까지가 기준이에요.',
    })
  })

  const cases: Array<[string, (points: number) => BalanceItemInput, number, boolean]> = [
    ['미션', (p) => mission(p), 50, true],
    ['컬렉션 완성', (p) => launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: p } }), 20, false],
    ['레시피', (p) => makeItem({ kind: 'recipe', original: { resource: { reward_points: p } } }), 30, false],
    ['횟수형 JAM! 배지', (p) => badge(p, COUNT), 10, true],
    ['달성형 JAM! 배지', (p) => badge(p, ACHIEVEMENT), 100, false],
  ]

  for (const [label, build, max, provisional] of cases) {
    it(`경계: ${label}은 ${max}이면 통과, ${max + 1}이면 경고(임시값 표시 ${provisional})`, () => {
      expect(run([build(max)], rules).warnings).toEqual([])
      const over = run([build(max + 1)], rules)
      expect(over.warnings).toHaveLength(1)
      expect(over.warnings[0]).toMatchObject({ measured: max + 1, limit: max, provisional })
    })
  }

  it('JAM! 배지 종류 판정: 지표 키가 있으면 횟수형(10), recipe_first_success만이면 달성형(100)', () => {
    expect(run([badge(50, COUNT)], rules).warnings).toHaveLength(1)
    expect(run([badge(50, ACHIEVEMENT)], rules).warnings).toEqual([])
    expect(run([badge(50, { ...ACHIEVEMENT, mission_complete_count: 1 })], rules).warnings).toHaveLength(1)
    expect(run([badge(50, { distance_km: 3 })], rules).warnings).toEqual([])
  })

  it('조건을 읽을 수 없는 JAM! 배지는 점검 못 함이다', () => {
    const result = run([badge(5, undefined)], rules)
    expect(messagesOf(result.unreadable)).toEqual([
      '배지 조건을 읽을 수 없어서 항목별 포인트를 확인하지 못했어요. 조건을 고치면 다시 확인해요.',
    ])
  })

  it('점검 못 함: 포인트가 숫자가 아니다(채원 확정 문구)', () => {
    const result = run([mission('많이')], rules)
    expect(result.warnings).toEqual([])
    expect(messagesOf(result.unreadable)).toEqual([
      '포인트가 숫자가 아니어서 항목별 포인트를 확인하지 못했어요. 숫자로 고치면 다시 확인해요.',
    ])
    expect(run([mission(Number.NaN)], rules).unreadable).toHaveLength(1)
  })

  it('점검 못 함: 자원이나 포인트 칸이 없다. 다만 포인트를 null로 적으면 포인트 없음(0)으로 읽는다', () => {
    const noResource = makeItem({ kind: 'mission', original: {} })
    const noKey = makeItem({ kind: 'mission', original: { resource: { title: 'x' } } })
    expect(messagesOf(run([noResource, noKey], rules).unreadable)).toEqual([
      '포인트가 없어서 항목별 포인트를 확인하지 못했어요. 숫자로 적으면 다시 확인해요.',
      '포인트가 없어서 항목별 포인트를 확인하지 못했어요. 숫자로 적으면 다시 확인해요.',
    ])
    expect(run([mission(null)], rules)).toMatchObject({ warnings: [], unreadable: [] })
  })

  it('수정본이 있으면 수정본을 읽는다(고쳐서 경고가 풀린다)', () => {
    const original = mission(80)
    expect(run([original], rules).warnings).toHaveLength(1)
    const edited = mission(80, {}, { edited: { resource: { reward_points: 40 } } })
    expect(run([edited], rules).warnings).toEqual([])
  })

  it('홈피드 카드·드랍 일정·패턴 제안은 보지 않는다', () => {
    const items = ['home_feed_card', 'drop_schedule', 'pattern_proposal'].map((kind) =>
      makeItem({ kind, original: { resource: { reward_points: 9999 } } })
    )
    expect(run(items, rules)).toMatchObject({ warnings: [], unreadable: [] })
  })

  it('R5 값의 종류 하나가 틀리면 그 종류의 항목만 점검 못 함이다', () => {
    const broken = rulesOnly(['point_reward_max'], {
      point_reward_max: {
        value: {
          kinds: {
            count_badge: { max: 10 },
            achievement_badge: { max: 100 },
            mission: { max: '오십' },
            collection_completion: { max: 20 },
            recipe: { max: 30 },
          },
        },
      },
    })
    const result = run([mission(80), makeItem({ kind: 'recipe', original: { resource: { reward_points: 31 } } })], broken)
    expect(messagesOf(result.unreadable)).toEqual([
      '규칙 값을 읽을 수 없어서 항목별 포인트를 확인하지 못했어요. 값을 고치면 다시 확인해요.',
    ])
    expect(result.warnings).toHaveLength(1) // 레시피는 그대로 계산
  })
})

describe('R6 한 번의 행동으로 받는 포인트 합', () => {
  const rules = rulesOnly(['single_action_points'])

  it('채원 확정 문구: 미션 40 + 보상 배지 30 = 70 포인트', () => {
    const item = mission(40, { reward_badge_ids: ['11111111-1111-4111-8111-111111111111'] })
    const state = makeState({ badgePoints: { ok: true, data: { '11111111-1111-4111-8111-111111111111': 30 } } })
    const result = run([item], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'single_action_points',
      itemId: item.id,
      measured: 70,
      limit: 50,
      provisional: true,
      message: '미션 포인트 40과 보상 배지 포인트 30을 합쳐 70 포인트를 한 번에 받아요. 미션은 50 포인트까지가 기준이에요.',
    })
  })

  it('경계: 합이 미션 한도(50)와 같으면 통과, 넘으면 경고', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const state = makeState({ badgePoints: { ok: true, data: { [id]: 30 } } })
    expect(run([mission(20, { reward_badge_ids: [id] })], rules, state).warnings).toEqual([])
    expect(run([mission(21, { reward_badge_ids: [id] })], rules, state).warnings).toHaveLength(1)
  })

  it('컬렉션 완성은 컬렉션 한도(20)를 따르고 보상 배지는 reward_badge_id 하나다', () => {
    const id = '22222222-2222-4222-8222-222222222222'
    const state = makeState({ badgePoints: { ok: true, data: { [id]: 10 } } })
    const item = launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 11, reward_badge_id: id } })
    const result = run([item], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toBe(
      '컬렉션 완성 포인트 11과 보상 배지 포인트 10을 합쳐 21 포인트를 한 번에 받아요. 컬렉션 완성은 20 포인트까지가 기준이에요.'
    )
    const ok = launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 10, reward_badge_id: id } })
    expect(run([ok], rules, state).warnings).toEqual([])
  })

  it('links로 이어진 같은 묶음의 jam_badge 항목의 포인트도 보상 배지로 센다', () => {
    const linkedBadge = badge(30, COUNT, {}, { itemKey: 'badge-a' })
    const item = mission(40, {}, { original: { resource: { reward_points: 40 }, links: ['badge-a'] } })
    const result = run([item, linkedBadge], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].measured).toBe(70)
    // 반려된 보상 배지는 세지 않는다
    const rejected = badge(30, COUNT, {}, { itemKey: 'badge-a', status: 'rejected' })
    expect(run([item, rejected], rules).warnings).toEqual([])
  })

  it('보상 배지가 없으면 R5가 이미 보므로 R6은 따로 경고하지 않는다', () => {
    expect(run([mission(80)], rules).warnings).toEqual([])
  })

  it('점검 못 함: 보상 배지를 찾지 못했거나 서비스 상태를 읽지 못했다', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const item = mission(40, { reward_badge_ids: [id] })
    expect(messagesOf(run([item], rules, makeState({ badgePoints: { ok: true, data: {} } })).unreadable)).toEqual([
      '보상 배지의 포인트를 읽을 수 없어서 한 번의 행동으로 받는 포인트 합을 확인하지 못했어요. 배지를 고치면 다시 확인해요.',
    ])
    expect(messagesOf(run([item], rules, makeState({ badgePoints: { ok: false } })).unreadable)).toEqual([
      '서비스 상태를 읽지 못해서 한 번의 행동으로 받는 포인트 합을 확인하지 못했어요. 새로 고치면 다시 확인해요.',
    ])
  })

  it('점검 못 함: 자신의 포인트가 숫자가 아니다', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const item = mission('x', { reward_badge_ids: [id] })
    const state = makeState({ badgePoints: { ok: true, data: { [id]: 5 } } })
    expect(messagesOf(run([item], rules, state).unreadable)).toEqual([
      '포인트가 숫자가 아니어서 한 번의 행동으로 받는 포인트 합을 확인하지 못했어요. 숫자로 고치면 다시 확인해요.',
    ])
  })

  it('R5가 꺼져 있어도 R6은 R5의 값을 따른다', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const state = makeState({ badgePoints: { ok: true, data: { [id]: 30 } } })
    const result = run([mission(40, { reward_badge_ids: [id] })], rules, state)
    expect(result.warnings).toHaveLength(1) // rulesOnly로 R5는 꺼져 있다
  })
})

describe('R7 파밍 방지(횟수형 사다리 합)', () => {
  const rules = rulesOnly(['count_ladder_points'])
  const step = (points: number, family = 'run_count', condition: unknown = COUNT) => badge(points, condition, { family_key: family })

  it('채원 확정 문구: 같은 계열 단계 포인트 합 130(기존 30 포함)은 100 기준 초과', () => {
    const state = makeState({
      familyBadges: { ok: true, data: { run_count: [{ id: 'b0', pointReward: 30, countType: true }] } },
    })
    const result = run([step(50), step(50)], rules, state)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'count_ladder_points',
      itemId: null,
      measured: 130,
      limit: 100,
      provisional: false,
      message: '같은 계열(run_count)의 횟수형 배지 단계 포인트를 모두 더하면 130 포인트예요. 100 포인트까지가 기준이에요.',
    })
  })

  it('경계: 합이 100이면 통과, 101이면 경고', () => {
    expect(run([step(50), step(50)], rules).warnings).toEqual([])
    expect(run([step(50), step(51)], rules).warnings).toHaveLength(1)
  })

  it('다른 계열은 따로 센다. 달성형 배지와 기존 달성형 배지는 세지 않는다', () => {
    const state = makeState({
      familyBadges: {
        ok: true,
        data: { run_count: [{ id: 'b1', pointReward: 100, countType: false }, { id: 'b2', pointReward: 100, countType: null }] },
      },
    })
    expect(run([step(60, 'run_count'), step(60, 'ride_count')], rules, state).warnings).toEqual([])
    expect(run([step(60), step(60, 'run_count', ACHIEVEMENT)], rules, state).warnings).toEqual([])
  })

  it('계열 이름이 없는 배지는 사다리가 아니라 보지 않는다', () => {
    expect(run([badge(500, COUNT)], rules)).toMatchObject({ warnings: [], unreadable: [] })
  })

  it('점검 못 함: 단계 포인트가 숫자가 아니거나 계열 상태를 읽지 못했다', () => {
    const bad = run([step(50), badge('x', COUNT, { family_key: 'run_count' })], rules)
    expect(bad.warnings).toEqual([])
    expect(messagesOf(bad.unreadable)).toEqual([
      '포인트가 숫자가 아니어서 파밍 방지를 확인하지 못했어요. 숫자로 고치면 다시 확인해요.',
    ])
    const down = run([step(50)], rules, makeState({ familyBadges: { ok: false } }))
    expect(messagesOf(down.unreadable)).toEqual([
      '서비스 상태를 읽지 못해서 파밍 방지를 확인하지 못했어요. 새로 고치면 다시 확인해요.',
    ])
  })
})

describe('R7 이미 만든 배지는 DB에서 세고 항목에서 다시 세지 않는다 (티켓 20261004_1756 가정 8, PRD §8.5)', () => {
  const rules = rulesOnly(['count_ladder_points'])
  const BADGE_ID = '11111111-1111-4111-8111-111111111111'
  const step = (points: unknown, overrides: Partial<BalanceItemInput> = {}) => badge(points, COUNT, { family_key: 'run_count' }, overrides)
  const created = { createdResource: { badge_id: BADGE_ID }, status: 'scheduled' }
  const inDb = (extra: Array<{ id: string; pointReward: number; countType: boolean | null }> = []) =>
    makeState({ familyBadges: { ok: true, data: { run_count: [{ id: BADGE_ID, pointReward: 60, countType: true }, ...extra] } } })

  it('만든 배지(DB 60)와 새 단계(50)의 합은 110이다. 만든 배지의 항목 값 60을 다시 더하지 않는다', () => {
    const result = run([step(60, created), step(50)], rules, inDb())
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ ruleKey: 'count_ladder_points', itemId: null, measured: 110, limit: 100 })
  })

  it('만든 배지만 있으면 DB 값 하나만 센다: 항목 60 + DB 60 = 120으로 경고하지 않는다', () => {
    const result = run([step(60, created)], rules, inDb())
    expect(result).toMatchObject({ warnings: [], unreadable: [] })
  })

  it('만든 배지만 있어도 DB의 같은 계열 합이 기준을 넘으면 묶음 줄로 알린다', () => {
    const result = run([step(60, created)], rules, inDb([{ id: 'b2', pointReward: 50, countType: true }]))
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({ itemId: null, measured: 110, limit: 100 })
  })

  it('만든 배지는 항목의 포인트·조건을 읽지 못해도 「점검 못 함」이 아니다(DB 값을 쓴다)', () => {
    const result = run([badge('x', 'not-an-object', { family_key: 'run_count' }, created), step(30)], rules, inDb())
    expect(result.unreadable).toEqual([])
    expect(result.warnings).toEqual([])
  })

  it('created_resource에 badge_id가 없으면(비었거나 다른 키) 아직 만들지 않은 것이라 항목 값을 센다', () => {
    for (const createdResource of [null, {}, { sample: true }, { badge_id: '' }, { badge_id: 5 }]) {
      const result = run([step(60, { createdResource, status: 'scheduled' }), step(50)], rules)
      expect(result.warnings[0], JSON.stringify(createdResource)).toMatchObject({ measured: 110, limit: 100 })
    }
  })
})

describe('R8 경제 수치 불변', () => {
  const rules = rulesOnly(['economy_keys'])

  it('채원 확정 문구: resource에 드랍 확률 값이 있으면 경고', () => {
    const item = makeItem({ kind: 'collection_launch', original: { resource: { name: '여름', rarity_common: 0.7 } } })
    const result = run([item], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatchObject({
      ruleKey: 'economy_keys',
      itemId: item.id,
      measured: 'rarity_common',
      limit: null,
      provisional: false,
      message: '드랍 확률 값(rarity_common)이 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.',
    })
  })

  it('knobs와 안쪽 객체·배열의 키도 찾고, 모든 종류의 항목을 본다', () => {
    const card = makeItem({ kind: 'home_feed_card', original: { knobs: { policy: { completion_decay: 0.5 } } } })
    const drop = makeItem({ kind: 'drop_schedule', original: { resource: { rows: [{ fail_reward_points: 3 }] } } })
    const result = run([card, drop], rules)
    expect(messagesOf(result.warnings)).toEqual([
      '경제 정책 값(completion_decay)이 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.',
      '믹스 실패 보상 값(fail_reward_points)이 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.',
    ])
  })

  it('키가 여러 개면 한 줄로 모으고 3개까지만 이름을 보인다', () => {
    const item = makeItem({
      kind: 'recipe',
      original: { resource: { rarity_common: 1, rarity_rare: 1, bonus_drop_rate: 1, fail_reward_points: 1 } },
    })
    const result = run([item], rules)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].message).toBe(
      '경제 정책 값 4개(rarity_common, rarity_rare, bonus_drop_rate 외 1개)가 이 항목에 들어 있어요. 경제 수치는 기획에서 바꾸지 않는 게 기준이에요.'
    )
    expect(result.warnings[0].measured).toBe('rarity_common, rarity_rare, bonus_drop_rate, fail_reward_points')
  })

  it('경제 정책 키가 아니면 통과다', () => {
    const item = makeItem({ kind: 'recipe', original: { resource: { name: '믹스', reward_points: 10 }, knobs: { pace: 3 } } })
    expect(run([item], rules)).toMatchObject({ warnings: [], unreadable: [] })
  })
})

describe('점검 못 함 3종과 규칙 값 오류', () => {
  it('시각 · 숫자 · 서비스 상태가 각각 점검 못 함(참고, 잰 값 없음)이다', () => {
    const rules = rulesOnly(['open_collections_max', 'point_reward_max'])
    const result = run([launch('2026-10-12T09:00:00+09:00', null, { resource: { reward_points: 'x' } })], rules, makeState({ otherLaunches: { ok: false } }))
    const byRule = Object.fromEntries(result.unreadable.map((u) => [u.ruleKey, u]))
    expect(byRule.open_collections_max.message).toContain('종료 시각이 없어서')
    expect(byRule.point_reward_max.message).toContain('숫자가 아니어서')
    const state = run([launch('2026-10-12T09:00:00+09:00')], rules, makeState({ books: { ok: false } }))
    expect(state.unreadable.some((u) => u.message.includes('서비스 상태를 읽지 못해서'))).toBe(true)
    for (const u of [...result.unreadable, ...state.unreadable]) {
      expect(u).toMatchObject({ level: 'info', measured: null, limit: null })
    }
  })

  it('값 모양이 틀린 규칙은 묶음 줄 하나로 알리고 다른 규칙은 그대로 계산한다', () => {
    const rules = rulesOnly(['open_collections_max', 'point_reward_max'], { open_collections_max: { value: { max: 'x' } } })
    const result = run([launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 21 } })], rules)
    expect(result.unreadable).toHaveLength(1)
    expect(result.unreadable[0]).toMatchObject({
      ruleKey: 'open_collections_max',
      itemId: null,
      message: '규칙 값을 읽을 수 없어서 동시 개방 컬렉션 수를 확인하지 못했어요. 값을 고치면 다시 확인해요.',
    })
    expect(result.warnings.map((w) => w.ruleKey)).toEqual(['point_reward_max'])
  })

  it('끈 규칙은 값이 틀려도 아무 줄이 없다', () => {
    const off = makeRules({ open_collections_max: { enabled: false, value: { max: 'x' } } })
    const result = run([launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 1 } })], off)
    expect(result.unreadable.some((u) => u.ruleKey === 'open_collections_max')).toBe(false)
  })
})

describe('반려·취소·실패 항목, 꺼진 규칙, 확인한 규칙 수', () => {
  it('반려·취소·실패한 항목은 세지도 점검하지도 않는다', () => {
    const rules = rulesOnly(['weekly_new_collections_max', 'point_reward_max', 'economy_keys'])
    const items = ['rejected', 'cancelled', 'failed'].map((status) =>
      launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 999, rarity_common: 1 } }, { status })
    )
    const live = launch('2026-10-13T09:00:00+09:00', undefined, { resource: { reward_points: 1 } })
    const result = run([...items, live], rules)
    expect(result.warnings).toEqual([]) // 주 한도 1개: 살아 있는 것은 하나뿐
    expect(result.unreadable).toEqual([])
    for (const item of items) expect(result.checkedRuleCountByItem[item.id]).toBe(0)
    expect(result.checkedRuleCountByItem[live.id]).toBe(3)
  })

  it('꺼진 규칙은 계산하지 않고 확인한 규칙 수에서도 빠진다', () => {
    const item = launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 999 } })
    const books = makeState({ books: { ok: true, data: openBooks(30) } })
    const on = run([item], makeRules(), books)
    expect(on.checkedRuleCountByItem[item.id]).toBe(7)
    expect(on.warnings.some((w) => w.ruleKey === 'open_collections_max')).toBe(true)
    const off = run([item], makeRules({ open_collections_max: { enabled: false } }), books)
    expect(off.warnings.some((w) => w.ruleKey === 'open_collections_max')).toBe(false)
    expect(off.checkedRuleCountByItem[item.id]).toBe(6)
  })

  it('행이 없는 규칙은 세지 않는다', () => {
    const rules = makeRules()
    delete rules.economy_keys
    const item = makeItem({ kind: 'home_feed_card' })
    expect(run([item], rules).checkedRuleCountByItem[item.id]).toBe(0)
  })

  it('종류마다 적용되는 규칙 수: 컬렉션 런칭 7 · 미션 3 · 레시피 2 · 횟수형 배지 3 · 달성형 배지 2 · 그 밖 1', () => {
    const items = {
      launch: launch('2026-10-12T09:00:00+09:00'),
      mission: mission(1),
      recipe: makeItem({ kind: 'recipe', original: { resource: { reward_points: 1 } } }),
      count: badge(1, COUNT),
      achievement: badge(1, ACHIEVEMENT),
      card: makeItem({ kind: 'home_feed_card' }),
      unknownKind: makeItem({ kind: null }),
    }
    const result = run(Object.values(items))
    const counts = Object.fromEntries(Object.entries(items).map(([name, item]) => [name, result.checkedRuleCountByItem[item.id]]))
    expect(counts).toEqual({ launch: 7, mission: 3, recipe: 2, count: 3, achievement: 2, card: 1, unknownKind: 1 })
  })

  it('규칙을 모두 끄면 줄이 없고 확인한 규칙 수는 0이다', () => {
    const rules = rulesOnly([])
    const item = launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_points: 999 } })
    const result = run([item], rules, makeState({ books: { ok: true, data: openBooks(30) } }))
    expect(result).toMatchObject({ warnings: [], unreadable: [] })
    expect(result.checkedRuleCountByItem[item.id]).toBe(0)
  })
})

describe('규칙 경고 수준과 결과 형식', () => {
  it('경고 수준은 규칙의 level을 따른다(참고로 낮출 수 있다)', () => {
    const rules = rulesOnly(['point_reward_max'], { point_reward_max: { level: 'info' } })
    const result = run([mission(80)], rules)
    expect(result.warnings[0].level).toBe('info')
  })

  it('점검 못 함은 규칙 level과 무관하게 참고다', () => {
    const rules = rulesOnly(['point_reward_max'], { point_reward_max: { level: 'warn' } })
    expect(run([mission('x')], rules).unreadable[0].level).toBe('info')
  })

  it('입력을 바꾸지 않는다', () => {
    const items = [launch('2026-10-12T09:00:00+09:00'), mission(80)]
    const snapshot = JSON.stringify(items)
    run(items, makeRules(), makeState({ books: { ok: true, data: openBooks(30) } }))
    expect(JSON.stringify(items)).toBe(snapshot)
  })
})

describe('collectBalanceReferences', () => {
  it('보상 배지 ID와 계열 이름을 모은다(반려한 항목은 뺀다)', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const items = [
      mission(1, { reward_badge_ids: [id, id] }),
      launch('2026-10-12T09:00:00+09:00', undefined, { resource: { reward_badge_id: '22222222-2222-4222-8222-222222222222' } }),
      badge(1, COUNT, { family_key: 'run_count' }),
      badge(1, COUNT, { family_key: 'rejected_family' }, { status: 'rejected' }),
      badge(1, COUNT),
    ]
    expect(collectBalanceReferences(items)).toEqual({
      rewardBadgeIds: [id, '22222222-2222-4222-8222-222222222222'],
      familyKeys: ['run_count'],
      hasLaunches: true,
    })
  })

  it('평가할 collection_launch 항목이 없으면 hasLaunches가 거짓이다(반려한 개방만 있어도 같다)', () => {
    expect(collectBalanceReferences([mission(10), badge(1, COUNT, { family_key: 'run_count' })]).hasLaunches).toBe(false)
    expect(collectBalanceReferences([launch('2026-10-12T09:00:00+09:00', undefined, {}, { status: 'rejected' })]).hasLaunches).toBe(false)
    expect(collectBalanceReferences([]).hasLaunches).toBe(false)
    expect(collectBalanceReferences([launch('2026-10-12T09:00:00+09:00')]).hasLaunches).toBe(true)
  })
})
