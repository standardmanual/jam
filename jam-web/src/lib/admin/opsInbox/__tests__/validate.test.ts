/**
 * 운영 묶음 제출 검증 (티켓 20260930_1816)
 *
 * - fatal(400): 객체가 아님, bundle_id·author 없음이나 길이 초과, is_sample이 불리언이 아님, items가 배열이 아님, 항목 60개 초과
 * - 저장되는 형식 오류: 종류 허용값, 시각(형식·순서), 연결 키 실재, item_key 중복, user_experience 유무, week 표기, world_review
 * - world_review 규칙은 registerHomeFeedBundle.mjs와 같은 입력에 같은 문장을 낸다(대조)
 * - 카드 칸(티켓 20261001_1152): shape·exposure_tags(홈피드 카드는 필수)·tribe_id·color_pending, 묶음의 excluded_items,
 *   옛 형식 항목(segment만)은 fatal 없이 받고 새 칸 오류만 붙는다. exposure_tags는 등록 스크립트와 같은 입력에 같은 문장이다.
 * - 패턴 번호·지점 카테고리(티켓 20261007_1745): pattern_no 형식(P01)과 사전 실재, knobs.place_category(문자열 배열·실재), 형식이 틀린 번호는 열 NULL
 */
import { describe, it, expect } from 'vitest'
// 지금의 등록 스크립트(.mjs)를 대조용으로 불러온다. 스크립트는 고치지 않는다.
import { validateHomeFeedBundle } from '../../../../../scripts/asset-generator/registerHomeFeedBundle.mjs'
import { MAX_ITEMS, OPS_ITEM_KINDS } from '../constants'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import {
  EDIT_HEX_COLOR_PATTERN,
  revalidateOpsItem,
  validateEditedColor,
  validateExcludedItems,
  normalizeOpsPatternNo,
  validateExposureTags,
  validateOpsBundle,
  validateOpsPlaceCategory,
  validateWorldReview,
} from '../validate'

const REVIEW = { world_related: false, winter_reviewed: false, reason: '운영성 카드라 세계관과 무관해요' }
const TRIBE_A = '3f2c9a10-5b7e-4d21-8a64-0c1e7b9d2f55'
const TRIBE_MISSING = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

function makeItem(overrides: Record<string, unknown> = {}) {
  return {
    item_key: 'card-1',
    kind: 'home_feed_card',
    shape: 'hero',
    exposure_tags: ['all'],
    pattern_no: 'P07',
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
      pattern_no: 'P07',
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

  it('pattern_no는 P01 형식의 문자열만 받고 그 밖은 형식 오류이며 열은 NULL이다(제출 원본에는 그대로 남는다)', () => {
    expect(errorsOf({ pattern_no: 'P07' }).items[0].pattern_no).toBe('P07')
    expect(errorsOf({ pattern_no: ' P107 ' }).items[0].pattern_no).toBe('P107')
    for (const bad of ['P-07', 'p07', 'P7', 'P', '7', 7, '', '  ', { a: 1 }, ['P07'], true]) {
      const result = errorsOf({ pattern_no: bad })
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0]).toMatch(/^items\[0\]\.pattern_no: 패턴 번호는 P01처럼 P 뒤에 숫자 두 자리 이상이어야 해요\(받은 값: /)
      expect(result.items[0].pattern_no).toBeNull()
      expect(result.items[0].original).toMatchObject({ pattern_no: bad })
    }
    expect(errorsOf({ pattern_no: 'P-07' }).errors[0]).toBe(
      'items[0].pattern_no: 패턴 번호는 P01처럼 P 뒤에 숫자 두 자리 이상이어야 해요(받은 값: "P-07").'
    )
  })

  it('pattern_no가 없거나 null이면 오류가 없다(필수 아님)', () => {
    expect(errorsOf({ pattern_no: undefined }).errors).toEqual([])
    expect(errorsOf({ pattern_no: null }).errors).toEqual([])
    expect(errorsOf({ pattern_no: null }).items[0].pattern_no).toBeNull()
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

describe('revalidateOpsItem — 수정 뒤 다시 검사 (티켓 20260930_1818)', () => {
  const keys = [
    { position: 0, itemKey: 'card-1' },
    { position: 1, itemKey: 'mission-1' },
  ]

  it('제출 때와 같은 규칙·같은 문장으로 한 항목을 다시 검사한다', () => {
    const again = revalidateOpsItem(makeItem({ links: ['mission-1'] }), 0, keys)
    expect(again.format_errors).toEqual([])
    expect(again.item_key).toBe('card-1')
    expect(again.starts_at).toBe('2026-10-05T00:00:00.000Z')

    // 제출 검증(validateOpsBundle)이 같은 항목에 내는 문장과 같다
    const submitted = validateOpsBundle(
      makeBundle({ items: [makeItem({ ends_at: '2026-10-04T09:00:00+09:00' }), makeItem({ item_key: 'mission-1' })] })
    )
    const revalidated = revalidateOpsItem(makeItem({ ends_at: '2026-10-04T09:00:00+09:00' }), 0, keys)
    expect(revalidated.format_errors).toEqual(submitted.items[0].format_errors)
    expect(revalidated.format_errors).toEqual(['items[0].ends_at: 공개 시각(starts_at)보다 늦어야 해요.'])
  })

  it('묶음 전체 항목 키로 연결 실재와 item_key 중복을 판정한다', () => {
    expect(revalidateOpsItem(makeItem({ links: ['nope'] }), 0, keys).format_errors).toEqual([
      'items[0].links[0]: 이 묶음에 그런 item_key가 없어요(받은 값: "nope").',
    ])
    const dup = revalidateOpsItem(makeItem({ item_key: 'card-1' }), 1, [
      { position: 0, itemKey: 'card-1' },
      { position: 1, itemKey: 'card-1' },
    ])
    expect(dup.format_errors[0]).toContain('items[0]와 같은 값이에요')
  })

  it('고친 값이 비어 있으면 「유저가 겪는 것」 오류가 다시 난다', () => {
    const again = revalidateOpsItem(makeItem({ user_experience: '   ' }), 0, keys)
    expect(again.format_errors).toEqual(['items[0].user_experience: 비어 있지 않은 문자열이어야 해요.'])
  })
})

describe('카드 칸 — shape (티켓 20261001_1152)', () => {
  function shapeResult(itemOverrides: Record<string, unknown>, removeKeys: string[] = []) {
    const item: Record<string, unknown> = makeItem(itemOverrides)
    for (const key of removeKeys) delete item[key]
    const result = validateOpsBundle(makeBundle({ items: [item] }))
    expect(result.fatal).toEqual([])
    return result
  }

  it('홈피드 카드에 shape가 없으면 필수 오류이고 항목은 저장 대상으로 남는다(fatal이 아니다)', () => {
    const result = shapeResult({}, ['shape'])
    expect(result.bundle).not.toBeNull()
    expect(result.items).toHaveLength(1)
    expect(result.errors).toEqual([
      'items[0].shape: 필수 항목이 없어요(카드 모양을 hero, poster, square, brief, list 중 하나로 적어 주세요).',
    ])
    expect(result.items[0].format_errors).toEqual(result.errors)
  })

  it('shape가 null이어도 없는 것으로 본다', () => {
    expect(shapeResult({ shape: null }).errors[0]).toMatch(/^items\[0\]\.shape: 필수 항목이 없어요/)
  })

  it.each(['hero', 'poster', 'square', 'brief', 'list'])('모양 %s는 통과한다', (shape) => {
    expect(shapeResult({ shape }).errors).toEqual([])
  })

  it.each([
    ['허용값 밖', 'banner', '"banner"'],
    ['대문자', 'Hero', '"Hero"'],
    ['옛 layout 값', 'large_thumbnail', '"large_thumbnail"'],
    ['숫자', 3, '3'],
    ['빈 문자열', '', '""'],
  ])('shape가 %s이면 허용값을 안내한다', (_label, shape, shown) => {
    expect(shapeResult({ shape }).errors).toEqual([
      `items[0].shape: 허용되지 않는 카드 모양이에요(받은 값: ${shown}). 허용값: hero, poster, square, brief, list`,
    ])
  })

  it('카드가 아닌 종류는 shape가 없어도 오류가 없고, 있으면 형식을 본다', () => {
    expect(shapeResult({ kind: 'mission' }, ['shape']).errors).toEqual([])
    expect(shapeResult({ kind: 'mission', shape: 'list' }).errors).toEqual([])
    expect(shapeResult({ kind: 'mission', shape: 'banner' }).errors[0]).toMatch(
      /^items\[0\]\.shape: 허용되지 않는 카드 모양이에요/
    )
  })
})

describe('카드 칸 — exposure_tags (티켓 20261001_1152)', () => {
  function tagErrors(itemOverrides: Record<string, unknown>, removeKeys: string[] = []) {
    const item: Record<string, unknown> = makeItem(itemOverrides)
    for (const key of removeKeys) delete item[key]
    const result = validateOpsBundle(makeBundle({ items: [item] }))
    expect(result.fatal).toEqual([])
    return result.errors
  }

  it('홈피드 카드에 exposure_tags가 없으면 필수 오류다', () => {
    expect(tagErrors({}, ['exposure_tags'])).toEqual([
      'items[0].exposure_tags: 필수 항목이 없어요(노출 대상을 태그 배열로 적어 주세요. 전원이면 ["all"]).',
    ])
    expect(tagErrors({ exposure_tags: null })[0]).toMatch(/^items\[0\]\.exposure_tags: 필수 항목이 없어요/)
  })

  it('전원(all)과 신규(new_user)는 통과한다', () => {
    expect(tagErrors({ exposure_tags: ['all'] })).toEqual([])
    expect(tagErrors({ exposure_tags: ['new_user'] })).toEqual([])
    expect(tagErrors({ exposure_tags: ['time_morning', 'new_user'] })).toEqual([])
  })

  it('문자열·빈 배열·허용값 밖·중복은 각각 다른 문장이다', () => {
    const asString = tagErrors({ exposure_tags: 'all' })
    const empty = tagErrors({ exposure_tags: [] })
    const unknownTag = tagErrors({ exposure_tags: ['all', 'segment_vip'] })
    const duplicated = tagErrors({ exposure_tags: ['all', 'all'] })

    expect(asString).toEqual([
      'items[0].exposure_tags: 노출 조건 태그를 1개 이상 넣은 배열이어야 해요(항상 노출하려면 ["all"]).',
    ])
    expect(empty).toEqual(asString)
    expect(unknownTag).toHaveLength(1)
    expect(unknownTag[0]).toMatch(/^items\[0\]\.exposure_tags: 허용하지 않는 태그예요 — "segment_vip"\. 허용 태그: all, /)
    expect(duplicated).toEqual(['items[0].exposure_tags: 같은 태그를 두 번 넣을 수 없어요.'])
    expect(new Set([asString[0], unknownTag[0], duplicated[0]]).size).toBe(3)
  })

  it('카드가 아닌 종류는 없어도 오류가 없고, 있으면 형식을 본다', () => {
    expect(tagErrors({ kind: 'recipe' }, ['exposure_tags'])).toEqual([])
    expect(tagErrors({ kind: 'recipe', exposure_tags: ['all'] })).toEqual([])
    expect(tagErrors({ kind: 'recipe', exposure_tags: 'all' })).toHaveLength(1)
  })

  // 등록 스크립트(registerHomeFeedBundle.mjs)의 card.exposure_tags 검사와 같은 입력에 같은 문장이다(앞의 경로만 다르다).
  const inputs: Array<[string, unknown]> = [
    ['정상(전원)', ['all']],
    ['정상(여러 태그)', ['time_morning', 'new_user']],
    ['문자열', 'all'],
    ['숫자', 5],
    ['빈 배열', []],
    ['객체', { 0: 'all' }],
    ['허용값 밖 하나', ['bogus']],
    ['허용값 밖 여럿', ['all', 'bogus', 'other']],
    ['문자열이 아닌 원소', ['all', 5]],
    ['중복', ['all', 'all']],
    ['중복 + 허용값 밖', ['all', 'all', 'bogus']],
  ]

  it.each(inputs)('등록 스크립트와 같은 문장: %s', (_label, value) => {
    const scriptErrors = (
      validateHomeFeedBundle({ card: { exposure_tags: value } }, { bundleFile: '/tmp/bundle.json' }).errors as string[]
    ).filter((message) => message.startsWith('card.exposure_tags'))
    expect(validateExposureTags(value, 'card.exposure_tags')).toEqual(scriptErrors)
  })
})

describe('카드 칸 — tribe_id·color_pending (티켓 20261001_1152)', () => {
  const ctx = { tribeIds: new Set([TRIBE_A]) }

  function errorsOf(itemOverrides: Record<string, unknown>, withCtx: boolean, removeKeys: string[] = []) {
    const item: Record<string, unknown> = makeItem(itemOverrides)
    for (const key of removeKeys) delete item[key]
    const result = validateOpsBundle(makeBundle({ items: [item] }), withCtx ? ctx : undefined)
    expect(result.fatal).toEqual([])
    return result.errors
  }

  it('tribe_id가 없거나 null이면 통과한다(선택 칸)', () => {
    expect(errorsOf({}, true)).toEqual([])
    expect(errorsOf({ tribe_id: null }, true)).toEqual([])
  })

  it('목록에 있는 UUID는 통과하고(대소문자 무관) 목록에 없는 UUID는 「없는 트라이브」 오류다', () => {
    expect(errorsOf({ tribe_id: TRIBE_A }, true)).toEqual([])
    expect(errorsOf({ tribe_id: TRIBE_A.toUpperCase() }, true)).toEqual([])
    expect(errorsOf({ tribe_id: TRIBE_MISSING }, true)).toEqual([
      `items[0].tribe_id: 없는 트라이브예요(받은 값: "${TRIBE_MISSING}"). 트라이브 ID를 확인해 주세요.`,
    ])
  })

  it("'ranger'·숫자 같은 UUID가 아닌 값은 UUID 형식 오류다(목록이 있어도 없어도 같다)", () => {
    for (const withCtx of [true, false]) {
      expect(errorsOf({ tribe_id: 'ranger' }, withCtx)).toEqual([
        'items[0].tribe_id: 트라이브 ID(UUID) 형식이어야 해요(받은 값: "ranger").',
      ])
      expect(errorsOf({ tribe_id: 7 }, withCtx)).toEqual([
        'items[0].tribe_id: 트라이브 ID(UUID) 형식이어야 해요(받은 값: 7).',
      ])
    }
  })

  it('ctx 없이 부르면 형식만 본다(목록에 없는 UUID도 통과)', () => {
    expect(errorsOf({ tribe_id: TRIBE_MISSING }, false)).toEqual([])
    expect(validateOpsBundle(makeBundle({ items: [makeItem({ tribe_id: TRIBE_MISSING })] })).errors).toEqual([])
  })

  it('color_pending은 불리언만 통과한다', () => {
    expect(errorsOf({ color_pending: true }, true)).toEqual([])
    expect(errorsOf({ color_pending: false }, true)).toEqual([])
    expect(errorsOf({ color_pending: null }, true)).toEqual([])
    expect(errorsOf({ color_pending: 'yes' }, true)).toEqual([
      'items[0].color_pending: true 또는 false여야 해요(받은 값: "yes").',
    ])
    expect(errorsOf({ color_pending: 1 }, true)).toEqual(['items[0].color_pending: true 또는 false여야 해요(받은 값: 1).'])
  })

  it('카드가 아닌 종류도 이 두 칸이 있으면 형식을 본다', () => {
    expect(errorsOf({ kind: 'mission', tribe_id: 'ranger' }, true, ['shape', 'exposure_tags'])).toHaveLength(1)
    expect(errorsOf({ kind: 'mission', color_pending: 'yes' }, true, ['shape', 'exposure_tags'])).toHaveLength(1)
  })
})

describe('묶음의 excluded_items (티켓 20261001_1152)', () => {
  const GOOD = { item_key: 'mission-9', kind: 'mission', stage: 'world_review', reason: '세계관 검수에서 빠졌어요' }

  function bundleResult(excluded: unknown) {
    const result = validateOpsBundle(makeBundle({ excluded_items: excluded }))
    expect(result.fatal).toEqual([])
    return result
  }

  it('없거나 null, 빈 배열, 정상 항목은 오류가 없다', () => {
    expect(validateOpsBundle(makeBundle()).errors).toEqual([])
    expect(bundleResult(null).errors).toEqual([])
    expect(bundleResult([]).errors).toEqual([])
    expect(bundleResult([GOOD]).errors).toEqual([])
    expect(bundleResult([{ reason: '이유만 있어요' }]).errors).toEqual([])
    expect(bundleResult([{ reason: '밸런스 점검', stage: 'balance_check' }]).errors).toEqual([])
  })

  it.each([
    ['배열이 아님(문자열)', 'x', ['excluded_items: 배열이어야 해요(받은 값: "x").']],
    ['배열이 아님(객체)', { reason: 'x' }, ['excluded_items: 배열이어야 해요(받은 값: {"reason":"x"}).']],
    ['원소가 객체가 아님', ['x'], ['excluded_items[0]: 객체여야 해요(받은 값: "x").']],
    ['reason 없음', [{ item_key: 'a' }], ['excluded_items[0].reason: 필수 항목이 없어요(뺀 이유를 한 줄로 적어 주세요).']],
    ['reason 빈 값', [{ reason: '  ' }], ['excluded_items[0].reason: 비어 있지 않은 문자열이어야 해요.']],
    [
      'reason 줄바꿈',
      [{ reason: '첫 줄\n둘째 줄' }],
      ['excluded_items[0].reason: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).'],
    ],
    ['reason 숫자', [{ reason: 5 }], ['excluded_items[0].reason: 비어 있지 않은 문자열이어야 해요.']],
    ['item_key 숫자', [{ reason: '사유', item_key: 5 }], ['excluded_items[0].item_key: 문자열이어야 해요(받은 값: 5).']],
  ])('%s이면 묶음 오류다', (_label, excluded, expected) => {
    expect(bundleResult(excluded).errors).toEqual(expected)
  })

  it('kind·stage가 허용값 밖이면 묶음 오류다', () => {
    const kindErrors = bundleResult([{ reason: '사유', kind: 'banner' }]).errors
    expect(kindErrors).toHaveLength(1)
    expect(kindErrors[0]).toMatch(
      /^excluded_items\[0\]\.kind: 허용되지 않는 종류예요\(받은 값: "banner"\)\. 허용값: home_feed_card,/
    )
    expect(bundleResult([{ reason: '사유', stage: 'review' }]).errors).toEqual([
      'excluded_items[0].stage: 허용되지 않는 단계예요(받은 값: "review"). 허용값: world_review, balance_check',
    ])
  })

  it('여러 원소의 오류를 모두 모으고 원소 번호를 붙인다', () => {
    expect(bundleResult([{ reason: '가' }, { item_key: 'b' }, 'x']).errors).toEqual([
      'excluded_items[1].reason: 필수 항목이 없어요(뺀 이유를 한 줄로 적어 주세요).',
      'excluded_items[2]: 객체여야 해요(받은 값: "x").',
    ])
  })

  it('이 오류는 묶음 오류에만 있고 어느 항목의 format_errors에도 들어가지 않는다', () => {
    const result = bundleResult([{ item_key: 'card-1' }])
    expect(result.errors).toHaveLength(1)
    expect(result.items[0].format_errors).toEqual([])
  })

  it('묶음 오류는 항목 오류보다 앞에 놓인다', () => {
    const result = validateOpsBundle(
      makeBundle({ excluded_items: [{ item_key: 'x' }], items: [makeItem({ shape: 'banner' })] })
    )
    expect(result.errors[0]).toMatch(/^excluded_items\[0\]\.reason/)
    expect(result.errors[1]).toMatch(/^items\[0\]\.shape/)
  })

  it('validateExcludedItems는 경로를 바꿔 부를 수 있다', () => {
    expect(validateExcludedItems([{ item_key: 'a' }], 'raw.excluded_items')[0]).toMatch(/^raw\.excluded_items\[0\]\.reason/)
  })
})

describe('옛 형식 항목(segment만) 받기 (티켓 20261001_1152)', () => {
  it('fatal 없이 받고 shape·exposure_tags 오류만 붙는다(segment는 검사하지 않고 원본에 남는다)', () => {
    const legacy = makeItem({ segment: 'new_user' }) as Record<string, unknown>
    delete legacy.shape
    delete legacy.exposure_tags
    const result = validateOpsBundle(makeBundle({ items: [legacy] }))

    expect(result.fatal).toEqual([])
    expect(result.items).toHaveLength(1)
    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toMatch(/^items\[0\]\.shape: /)
    expect(result.errors[1]).toMatch(/^items\[0\]\.exposure_tags: /)
    expect(result.items[0].original).toEqual(legacy)
  })

  it('segment 값이 어떤 모양이어도 오류를 내지 않는다', () => {
    for (const segment of ['new_user', 5, ['a'], { any: 1 }, null]) {
      expect(validateOpsBundle(makeBundle({ items: [makeItem({ segment })] })).errors).toEqual([])
    }
  })
})

describe('revalidateOpsItem — 카드 칸 (티켓 20261001_1152)', () => {
  const keys = [{ position: 0, itemKey: 'card-1' }]
  const ctx = { tribeIds: new Set([TRIBE_A]) }

  it('제출 때와 같은 문장을 낸다(shape·exposure_tags·tribe_id)', () => {
    const raw = makeItem({ shape: 'banner', exposure_tags: [], tribe_id: TRIBE_MISSING })
    const submitted = validateOpsBundle(makeBundle({ items: [raw] }), ctx)
    const revalidated = revalidateOpsItem(raw, 0, keys, ctx)

    expect(revalidated.format_errors).toHaveLength(3)
    expect(revalidated.format_errors).toEqual(submitted.items[0].format_errors)
  })

  it('ctx를 넘기지 않으면 형식만 본다', () => {
    expect(revalidateOpsItem(makeItem({ tribe_id: TRIBE_MISSING }), 0, keys).format_errors).toEqual([])
    expect(revalidateOpsItem(makeItem({ tribe_id: TRIBE_MISSING }), 0, keys, ctx).format_errors).toHaveLength(1)
  })
})

describe('패턴 번호 — 사전 실재 (티켓 20261007_1745)', () => {
  const ctx = { patternNos: new Set(['P07', 'P20']) }

  function resultOf(itemOverrides: Record<string, unknown>, withCtx = true) {
    const result = validateOpsBundle(makeBundle({ items: [makeItem(itemOverrides)] }), withCtx ? ctx : undefined)
    expect(result.fatal).toEqual([])
    return result
  }

  it('사전에 있는 번호는 오류가 없다', () => {
    expect(resultOf({ pattern_no: 'P07' }).errors).toEqual([])
    expect(resultOf({ pattern_no: ' P20 ' }).items[0].pattern_no).toBe('P20')
  })

  it('형식은 맞지만 사전에 없는 번호(P99)는 오류이고 열에는 값이 그대로 남는다', () => {
    const result = resultOf({ pattern_no: 'P99' })
    expect(result.errors).toEqual(['items[0].pattern_no: 패턴 사전에 없는 번호예요(받은 값: "P99"). 패턴 번호를 확인해 주세요.'])
    expect(result.items[0].pattern_no).toBe('P99')
    expect(result.items[0].format_errors).toEqual(result.errors)
  })

  it('형식이 틀린 번호는 사전을 보지 않고 형식 오류 한 줄만 낸다(열은 NULL)', () => {
    const result = resultOf({ pattern_no: 'P-07' })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/패턴 번호는 P01처럼/)
    expect(result.items[0].pattern_no).toBeNull()
  })

  it('ctx 없이 부르면 형식만 본다(사전에 없는 번호도 통과)', () => {
    expect(resultOf({ pattern_no: 'P99' }, false).errors).toEqual([])
    expect(resultOf({ pattern_no: 'P99' }, false).items[0].pattern_no).toBe('P99')
    expect(resultOf({ pattern_no: 'P-07' }, false).errors).toHaveLength(1)
  })

  it('pattern_no가 없으면 사전이 있어도 오류가 없다', () => {
    expect(resultOf({ pattern_no: undefined }).errors).toEqual([])
  })

  it('제출 검증과 다시 검사가 같은 문장을 낸다', () => {
    const raw = makeItem({ pattern_no: 'P99' })
    const submitted = validateOpsBundle(makeBundle({ items: [raw] }), ctx)
    const revalidated = revalidateOpsItem(raw, 0, [{ position: 0, itemKey: 'card-1' }], ctx)
    expect(revalidated.format_errors).toHaveLength(1)
    expect(revalidated.format_errors).toEqual(submitted.items[0].format_errors)
    expect(revalidated.pattern_no).toBe('P99')
  })
})

describe('normalizeOpsPatternNo (티켓 20261007_1745)', () => {
  it('P 뒤에 숫자 두 자리 이상인 문자열만 앞뒤 공백을 떼어 돌려준다', () => {
    expect(normalizeOpsPatternNo('P01')).toBe('P01')
    expect(normalizeOpsPatternNo(' P100\n')).toBe('P100')
    for (const bad of ['P1', 'p01', 'P-01', 'T01', 'P01a', '01', '', null, undefined, 1, {}, []]) {
      expect(normalizeOpsPatternNo(bad)).toBeNull()
    }
  })
})

describe('지점 카테고리 — knobs.place_category (티켓 20261007_1745)', () => {
  const SLUGS = new Set(['cafe', 'park', 'library'])

  function errorsOf(knobs: unknown, withSlugs = true, removeKnobs = false) {
    const item: Record<string, unknown> = makeItem({ knobs })
    if (removeKnobs) delete item.knobs
    const result = validateOpsBundle(makeBundle({ items: [item] }), withSlugs ? { poiCategorySlugs: SLUGS } : undefined)
    expect(result.fatal).toEqual([])
    return result.errors
  }

  it('있는 slug 배열과 빈 배열은 오류가 없다', () => {
    expect(errorsOf({ place_category: ['cafe', 'park'] })).toEqual([])
    expect(errorsOf({ place_category: [] })).toEqual([])
  })

  it('knobs나 place_category가 없거나 null이면 검사하지 않는다(나머지 knobs도 검사하지 않는다)', () => {
    expect(errorsOf(undefined, true, true)).toEqual([])
    expect(errorsOf(null)).toEqual([])
    expect(errorsOf('text')).toEqual([])
    expect(errorsOf([1, 2])).toEqual([])
    expect(errorsOf({})).toEqual([])
    expect(errorsOf({ place_category: null })).toEqual([])
    expect(errorsOf({ time: 5, anything: { a: 1 } })).toEqual([])
  })

  it('문자열 배열이 아니면 형식 오류 한 줄이다(받은 값 표시)', () => {
    for (const bad of ['cafe', 7, { a: 1 }, ['cafe', 3], [null], [''], ['  ']]) {
      const errors = errorsOf({ place_category: bad })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatch(/^items\[0\]\.knobs\.place_category: 지점 카테고리 slug를 문자열로 넣은 배열이어야 해요\(받은 값: /)
    }
    expect(errorsOf({ place_category: 'cafe' })).toEqual([
      'items[0].knobs.place_category: 지점 카테고리 slug를 문자열로 넣은 배열이어야 해요(받은 값: "cafe").',
    ])
  })

  it('없는 slug는 모아서 한 줄로 알린다', () => {
    expect(errorsOf({ place_category: ['cafe', 'zoo', 'mall'] })).toEqual([
      'items[0].knobs.place_category: 없는 지점 카테고리예요 — "zoo", "mall". 카테고리 slug를 확인해 주세요.',
    ])
  })

  it('없는 slug가 많으면 앞의 5개만 늘어놓고 나머지는 개수로 적는다', () => {
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    expect(errorsOf({ place_category: many })).toEqual([
      'items[0].knobs.place_category: 없는 지점 카테고리예요 — "a", "b", "c", "d", "e" 외 2개. 카테고리 slug를 확인해 주세요.',
    ])
  })

  it('slug 목록 없이 부르면 형식만 본다(없는 slug도 통과)', () => {
    expect(errorsOf({ place_category: ['zoo'] }, false)).toEqual([])
    expect(errorsOf({ place_category: 'zoo' }, false)).toHaveLength(1)
  })

  it('항목 위치가 오류 경로에 들어가고 다시 검사도 같은 문장을 낸다', () => {
    const raw = makeItem({ knobs: { place_category: ['zoo'] } })
    const ctx = { poiCategorySlugs: SLUGS }
    const submitted = validateOpsBundle(makeBundle({ items: [raw] }), ctx)
    const revalidated = revalidateOpsItem(raw, 0, [{ position: 0, itemKey: 'card-1' }], ctx)
    expect(revalidated.format_errors).toHaveLength(1)
    expect(revalidated.format_errors).toEqual(submitted.items[0].format_errors)
    expect(validateOpsPlaceCategory({ place_category: ['zoo'] }, 'items[3]', SLUGS)[0]).toMatch(/^items\[3\]\.knobs\.place_category:/)
  })
})

describe('image_spec 경고 (티켓 20261007_1030)', () => {
  const SPEC = { preset_id: 'p1', bg: '#111111', end: '#222222', values: { title: '제목' } }

  it('모양이 맞는 image_spec은 오류도 경고도 없다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ image_spec: SPEC })] }))
    expect(result.errors).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.items[0].warnings).toEqual([])
  })

  it('image_spec이 없는 기존 형태는 오류 없이 경고만 낸다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem()] }))
    expect(result.errors).toEqual([])
    expect(result.fatal).toEqual([])
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]).toMatch(/^items\[0\]\.image_spec: 비어 있어요/)
  })

  it('이미지 칸이 없는 종류에서 image_spec이 없으면 경고도 없다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ kind: 'recipe' })] }))
    expect(result.warnings).toEqual([])
  })

  it('프리셋만 있고 bg·end가 없으면 오류 없이 경고만 낸다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ image_spec: { preset_id: 'p1' } })] }))
    expect(result.errors).toEqual([])
    expect(result.items[0].format_errors).toEqual([])
    expect(result.warnings).toEqual([expect.stringContaining('image_spec.bg·end: 없어요')])
  })

  it('모양이 틀린 image_spec은 오류가 아니라 경고다', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ image_spec: { preset_id: 1, values: 'x' } })] }))
    expect(result.errors).toEqual([])
    expect(result.items[0].format_errors).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('수정 때만 하는 색 검사', () => {
  it('배경색 필드의 HEX_COLOR_PATTERN과 같은 식이다', () => {
    expect(EDIT_HEX_COLOR_PATTERN.source).toBe(HEX_COLOR_PATTERN.source)
    expect(EDIT_HEX_COLOR_PATTERN.flags).toBe(HEX_COLOR_PATTERN.flags)
  })

  it('#rrggbb만 통과한다', () => {
    expect(validateEditedColor('#1a2b3c')).toBeNull()
    expect(validateEditedColor('#ABCDEF')).toBeNull()
    for (const bad of ['', 'red', '#123', '#12345g', '1a2b3c', '#1a2b3cff']) {
      expect(validateEditedColor(bad), bad).toContain('#rrggbb')
    }
  })

  it('제출 검증은 색을 보지 않는다(바뀌지 않았다)', () => {
    const result = validateOpsBundle(makeBundle({ items: [makeItem({ colors: { background: 'not-a-color' } })] }))
    expect(result.errors).toEqual([])
  })
})
