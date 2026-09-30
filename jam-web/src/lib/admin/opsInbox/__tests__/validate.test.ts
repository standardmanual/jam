/**
 * 운영 묶음 제출 검증 (티켓 20260930_1816)
 *
 * - fatal(400): 객체가 아님, bundle_id·author 없음이나 길이 초과, is_sample이 불리언이 아님, items가 배열이 아님, 항목 60개 초과
 * - 저장되는 형식 오류: 종류 허용값, 시각(형식·순서), 연결 키 실재, item_key 중복, user_experience 유무, week 표기, world_review
 * - world_review 규칙은 registerHomeFeedBundle.mjs와 같은 입력에 같은 문장을 낸다(대조)
 */
import { describe, it, expect } from 'vitest'
// 지금의 등록 스크립트(.mjs)를 대조용으로 불러온다. 스크립트는 고치지 않는다.
import { validateHomeFeedBundle } from '../../../../../scripts/asset-generator/registerHomeFeedBundle.mjs'
import { MAX_ITEMS, OPS_ITEM_KINDS } from '../constants'
import { validateOpsBundle, validateWorldReview } from '../validate'

const REVIEW = { world_related: false, winter_reviewed: false, reason: '운영성 카드라 세계관과 무관해요' }

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'card-1',
    kind: 'home_feed_card',
    pattern_no: 'P-07',
    starts_at: '2026-10-05T09:00:00+09:00',
    ends_at: '2026-10-06T09:00:00+09:00',
    user_experience: '월요일 아침에 이번 주 미션을 한눈에 볼 수 있어요',
    world_review: REVIEW,
    ...overrides,
  }
}

function makeBundle(overrides: Record<string, unknown> = {}) {
  return {
    bundle_id: '2026-w41-weekly',
    author: '윤진',
    week: '2026-W41',
    hypothesis: '월요일 카드가 미션 참여를 늘린다',
    is_sample: false,
    items: [makeItem()],
    ...overrides,
  }
}

describe('validateOpsBundle — 정상 묶음', () => {
  it('오류 없이 묶음과 항목을 돌려준다', () => {
    const result = validateOpsBundle(makeBundle())
    expect(result.fatal).toEqual([])
    expect(result.errors).toEqual([])
    expect(result.bundle).toMatchObject({
      bundle_id: '2026-w41-weekly',
      author: '윤진',
      week: '2026-W41',
      hypothesis: '월요일 카드가 미션 참여를 늘린다',
      is_sample: false,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      position: 0,
      item_key: 'card-1',
      kind: 'home_feed_card',
      pattern_no: 'P-07',
      starts_at: '2026-10-05T00:00:00.000Z',
      ends_at: '2026-10-06T00:00:00.000Z',
      format_errors: [],
    })
  })

  it('제출 항목 원본을 그대로 담는다(바꾸지 않는다)', () => {
    const item = makeItem({ copy: { title: '이번 주 미션' }, extra: 1 })
    const result = validateOpsBundle(makeBundle({ items: [item] }))
    expect(result.items[0].original).toEqual(item)
  })

  it('is_sample: true는 시험 묶음이다', () => {
    expect(validateOpsBundle(makeBundle({ is_sample: true })).bundle?.is_sample).toBe(true)
  })

  it('items가 빈 배열이어도 받는다', () => {
    const result = validateOpsBundle(makeBundle({ items: [] }))
    expect(result.fatal).toEqual([])
    expect(result.items).toEqual([])
  })

  it('bundle_id·author 앞뒤 공백은 저장 값에서 뗀다', () => {
    const result = validateOpsBundle(makeBundle({ bundle_id: '  abc  ', author: ' 윤진 ' }))
    expect(result.bundle).toMatchObject({ bundle_id: 'abc', author: '윤진' })
  })

  it('종류 7개를 모두 받는다', () => {
    expect(OPS_ITEM_KINDS).toHaveLength(7)
    for (const kind of OPS_ITEM_KINDS) {
      const result = validateOpsBundle(makeBundle({ items: [makeItem({ kind })] }))
      expect(result.errors).toEqual([])
    }
  })
})

describe('validateOpsBundle — fatal(400)', () => {
  it('객체가 아니면 fatal이다', () => {
    for (const raw of [null, undefined, 'text', 5, [], [makeBundle()]]) {
      const result = validateOpsBundle(raw)
      expect(result.fatal).toEqual(['본문의 최상위는 객체여야 해요.'])
      expect(result.bundle).toBeNull()
      expect(result.items).toEqual([])
    }
  })

  it('bundle_id가 없거나 비어 있으면 fatal이다', () => {
    expect(validateOpsBundle(makeBundle({ bundle_id: undefined })).fatal).toContain('bundle_id: 필수 항목이 없어요.')
    expect(validateOpsBundle(makeBundle({ bundle_id: '   ' })).fatal).toContain(
      'bundle_id: 비어 있지 않은 문자열이어야 해요.'
    )
    expect(validateOpsBundle(makeBundle({ bundle_id: 123 })).fatal).toContain(
      'bundle_id: 비어 있지 않은 문자열이어야 해요.'
    )
  })

  it('author가 없거나 비어 있으면 fatal이다', () => {
    expect(validateOpsBundle(makeBundle({ author: undefined })).fatal).toContain('author: 필수 항목이 없어요.')
    expect(validateOpsBundle(makeBundle({ author: '' })).fatal).toContain('author: 비어 있지 않은 문자열이어야 해요.')
  })

  it('bundle_id가 200자, author가 100자를 넘으면 fatal이다(티켓 20260930_2100)', () => {
    expect(validateOpsBundle(makeBundle({ bundle_id: 'b'.repeat(200) })).fatal).toEqual([])
    expect(validateOpsBundle(makeBundle({ bundle_id: 'b'.repeat(201) })).fatal).toEqual(['bundle_id: 200자까지 받아요(받은 길이: 201자).'])
    expect(validateOpsBundle(makeBundle({ author: 'a'.repeat(100) })).fatal).toEqual([])
    expect(validateOpsBundle(makeBundle({ author: 'a'.repeat(101) })).fatal).toEqual(['author: 100자까지 받아요(받은 길이: 101자).'])
  })

  it('is_sample이 불리언이 아니면 fatal이고, 없으면 시험 묶음이 아니다(티켓 20260930_2100)', () => {
    const result = validateOpsBundle(makeBundle({ is_sample: 'true' }))
    expect(result.fatal).toEqual(['is_sample: true 또는 false여야 해요(받은 값: "true").'])
    expect(result.bundle).toBeNull()
    expect(validateOpsBundle(makeBundle({ is_sample: undefined })).bundle?.is_sample).toBe(false)
  })

  it('bundle_id와 author가 둘 다 없으면 사유를 한 번에 모두 돌려준다', () => {
    const result = validateOpsBundle({ items: [] })
    expect(result.fatal).toEqual(['bundle_id: 필수 항목이 없어요.', 'author: 필수 항목이 없어요.'])
  })

  it('items가 배열이 아니면 fatal이다', () => {
    for (const items of [undefined, null, {}, 'x', 3]) {
      const result = validateOpsBundle(makeBundle({ items }))
      expect(result.fatal).toHaveLength(1)
      expect(result.fatal[0]).toMatch(/^items: 배열이어야 해요/)
      expect(result.bundle).toBeNull()
    }
  })

  it(`항목이 ${MAX_ITEMS}개를 넘으면 fatal이다(딱 ${MAX_ITEMS}개는 받는다)`, () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => makeItem({ item_key: `k${i}` }))
    const over = validateOpsBundle(makeBundle({ items: make(MAX_ITEMS + 1) }))
    expect(over.fatal).toEqual([`items: 항목은 한 묶음에 ${MAX_ITEMS}개까지 받아요(받은 개수: ${MAX_ITEMS + 1}).`])
    const exact = validateOpsBundle(makeBundle({ items: make(MAX_ITEMS) }))
    expect(exact.fatal).toEqual([])
    expect(exact.items).toHaveLength(MAX_ITEMS)
  })
})

describe('validateOpsBundle — 저장되는 형식 오류(공통 필드)', () => {
  function errorsOf(itemOverrides: Record<string, unknown>) {
    const result = validateOpsBundle(makeBundle({ items: [makeItem(itemOverrides)] }))
    expect(result.fatal).toEqual([])
    return result
  }

  it('종류가 허용값 밖이면 오류로 돌려주고 항목은 저장 대상으로 남긴다', () => {
    const result = errorsOf({ kind: 'banner' })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/^items\[0\]\.kind: 허용되지 않는 종류예요\(받은 값: "banner"\)\. 허용값: home_feed_card,/)
    expect(result.items[0].kind).toBe('banner')
    expect(result.items[0].format_errors).toEqual(result.errors)
  })

  it('종류가 없으면 필수 오류다', () => {
    expect(errorsOf({ kind: undefined }).errors).toEqual(['items[0].kind: 필수 항목이 없어요.'])
  })

  it('시각이 시간대 없는 값이나 날짜만이면 오류이고 열 값은 null이다', () => {
    const result = errorsOf({ starts_at: '2026-10-05T09:00:00', ends_at: '2026-10-06' })
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toMatch(/^items\[0\]\.starts_at: 시간대가 붙은 ISO 8601 형식이어야 해요/)
    expect(result.errors[1]).toMatch(/^items\[0\]\.ends_at: 시간대가 붙은 ISO 8601 형식이어야 해요/)
    expect(result.items[0].starts_at).toBeNull()
    expect(result.items[0].ends_at).toBeNull()
  })

  it('존재하지 않는 날짜는 오류다', () => {
    const result = errorsOf({ starts_at: '2026-13-45T09:00:00+09:00', ends_at: undefined })
    expect(result.errors[0]).toMatch(/^items\[0\]\.starts_at:/)
  })

  it('종료가 공개보다 이르거나 같으면 순서 오류다', () => {
    const before = errorsOf({ starts_at: '2026-10-06T09:00:00+09:00', ends_at: '2026-10-05T09:00:00+09:00' })
    expect(before.errors).toEqual(['items[0].ends_at: 공개 시각(starts_at)보다 늦어야 해요.'])
    const same = errorsOf({ starts_at: '2026-10-05T09:00:00+09:00', ends_at: '2026-10-05T00:00:00Z' })
    expect(same.errors).toEqual(['items[0].ends_at: 공개 시각(starts_at)보다 늦어야 해요.'])
  })

  it('시각이 없으면 오류가 아니다(종료 없는 항목, 일정 없는 패턴 제안)', () => {
    const result = errorsOf({ starts_at: undefined, ends_at: undefined })
    expect(result.errors).toEqual([])
    expect(result.items[0].starts_at).toBeNull()
  })

  it('user_experience가 없거나 비었으면 오류다', () => {
    expect(errorsOf({ user_experience: undefined }).errors[0]).toMatch(/^items\[0\]\.user_experience: 필수 항목이 없어요/)
    expect(errorsOf({ user_experience: '  ' }).errors).toEqual([
      'items[0].user_experience: 비어 있지 않은 문자열이어야 해요.',
    ])
  })

  it('links가 묶음 안에 없는 item_key를 가리키면 오류다', () => {
    const result = validateOpsBundle(
      makeBundle({
        items: [makeItem({ item_key: 'card-1', links: ['mission-1', 'ghost'] }), makeItem({ item_key: 'mission-1', kind: 'mission' })],
      })
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toBe('items[0].links[1]: 이 묶음에 그런 item_key가 없어요(받은 값: "ghost").')
  })

  it('links가 자기 자신을 가리키거나 배열이 아니면 오류다', () => {
    expect(errorsOf({ links: ['card-1'] }).errors[0]).toMatch(/^items\[0\]\.links\[0\]: 자기 자신을 가리킬 수 없어요/)
    expect(errorsOf({ links: 'mission-1' }).errors[0]).toMatch(/^items\[0\]\.links: 배열이어야 해요/)
    expect(errorsOf({ links: [7] }).errors[0]).toBe('items[0].links[0]: 비어 있지 않은 문자열이어야 해요.')
  })

  it('item_key가 겹치면 뒤에 나온 항목에 오류를 남기고 두 항목 모두 저장 대상으로 둔다', () => {
    const result = validateOpsBundle(
      makeBundle({ items: [makeItem({ item_key: 'dup' }), makeItem({ item_key: 'other' }), makeItem({ item_key: 'dup' })] })
    )
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/^items\[2\]\.item_key: items\[0\]와 같은 값이에요/)
    expect(result.items[0].format_errors).toEqual([])
    expect(result.items[2].format_errors).toEqual(result.errors)
    expect(result.items.map((i) => i.item_key)).toEqual(['dup', 'other', 'dup'])
  })

  it('item_key가 없으면 필수 오류이고 열 값은 null이다', () => {
    const result = errorsOf({ item_key: undefined })
    expect(result.errors).toEqual(['items[0].item_key: 필수 항목이 없어요.'])
    expect(result.items[0].item_key).toBeNull()
  })

  it('항목이 객체가 아니면 오류이고 원본은 { value }로 감싸 저장 대상으로 남긴다', () => {
    const result = validateOpsBundle(makeBundle({ items: [null, 'x', makeItem()] }))
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toBe('items[0]: 객체여야 해요(받은 값: null).')
    expect(result.items[0].original).toEqual({ value: null })
    expect(result.items[1].original).toEqual({ value: 'x' })
    expect(result.items).toHaveLength(3)
  })

  it('pattern_no는 문자열이나 숫자를 받고 그 밖은 오류다', () => {
    expect(errorsOf({ pattern_no: 7 }).items[0].pattern_no).toBe('7')
    expect(errorsOf({ pattern_no: { a: 1 } }).errors[0]).toMatch(/^items\[0\]\.pattern_no: 문자열이나 숫자여야 해요/)
  })

  it('week 표기가 YYYY-Www가 아니면 묶음 오류이고 열 값은 null이다', () => {
    for (const week of ['2026-41', '2026-W4', '2026W41', '26-W41', '2026-W00', '2026-W54', 41]) {
      const result = validateOpsBundle(makeBundle({ week }))
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatch(/^week: YYYY-Www 형식이어야 해요/)
      expect(result.bundle?.week).toBeNull()
    }
    expect(validateOpsBundle(makeBundle({ week: '2026-W53' })).errors).toEqual([])
  })

  it('week가 없으면 오류가 아니다(형식만 본다)', () => {
    const result = validateOpsBundle(makeBundle({ week: undefined }))
    expect(result.errors).toEqual([])
    expect(result.bundle?.week).toBeNull()
  })

  it('묶음 오류와 항목 오류를 errors에 모두 모은다(묶음 → 항목 순서)', () => {
    const result = validateOpsBundle(makeBundle({ week: 'bad', items: [makeItem({ kind: 'x' }), makeItem({ item_key: 'b', user_experience: '' })] }))
    expect(result.errors.map((e) => e.split(':')[0])).toEqual(['week', 'items[0].kind', 'items[1].user_experience'])
  })

  it('항목 오류 문장 안의 긴 값은 잘라서 넣는다', () => {
    const long = 'x'.repeat(5000)
    const result = errorsOf({ kind: long })
    expect(result.errors[0].length).toBeLessThan(400)
  })
})

describe('world_review — 항목 검증', () => {
  it('항목의 world_review가 없으면 필수 오류다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ world_review: undefined })] }))
    expect(result.errors).toEqual(['items[0].world_review: 필수 항목이 없어요.'])
  })

  it('세계관과 닿는데 윈터 검수를 거치지 않았으면 오류다', () => {
    const result = validateOpsBundle(
      makeBundle({ items: [makeItem({ world_review: { world_related: true, winter_reviewed: false, reason: '윈터 이야기' } })] })
    )
    expect(result.errors).toEqual([
      'items[0].world_review.winter_reviewed: 세계관과 닿는 카드(world_related=true)는 윈터 검수를 거쳐야 해서 true여야 해요.',
    ])
  })
})

describe('world_review 규칙 — registerHomeFeedBundle.mjs와 같은 입력에 같은 문장', () => {
  const inputs: Array<[string, unknown]> = [
    ['없음(undefined)', undefined],
    ['null', null],
    ['문자열', 'text'],
    ['숫자', 5],
    ['배열', []],
    ['빈 객체', {}],
    ['정상(무관)', { world_related: false, winter_reviewed: false, reason: '운영성 카드예요' }],
    ['정상(세계관, 윈터 검수 완료)', { world_related: true, winter_reviewed: true, reason: '윈터가 봤어요' }],
    ['세계관인데 윈터 미검수', { world_related: true, winter_reviewed: false, reason: '아직이에요' }],
    ['불리언이 아님', { world_related: 'yes', winter_reviewed: 1, reason: '사유' }],
    ['사유가 빈 문자열', { world_related: false, winter_reviewed: false, reason: '' }],
    ['사유에 줄바꿈', { world_related: false, winter_reviewed: false, reason: '첫 줄\n둘째 줄' }],
    ['사유가 문자열이 아님', { world_related: false, winter_reviewed: false, reason: 123 }],
    ['알 수 없는 필드', { world_related: false, winter_reviewed: false, reason: '사유', extra: 1 }],
    ['필드 일부 누락', { world_related: false }],
    ['여러 오류', { world_related: 'x', foo: 1, reason: '\t' }],
  ]

  it.each(inputs)('%s', (_label, review) => {
    const raw: Record<string, unknown> = review === undefined ? {} : { world_review: review }
    const scriptErrors = (validateHomeFeedBundle(raw, { bundleFile: '/tmp/bundle.json' }).errors as string[]).filter((e) =>
      e.startsWith('world_review')
    )
    expect(validateWorldReview(review, 'world_review')).toEqual(scriptErrors)
  })
})
