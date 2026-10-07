/**
 * 운영 묶음 항목의 칸 읽기 (티켓 20261001_1152)
 *
 * 지키는 것:
 * - 칸마다 정상·없음·형식 틀림 값(`shape`·`exposure_tags`: 없어도 틀려도 「모름」, `tribe_id`: 없으면 null, `color_pending`: 없으면 false,
 *   `excluded_items`: 없으면 [])
 * - 수정본이 있으면 수정본을 먼저 읽는다(`color_pending: false` 덮어쓰기 포함)
 * - 칸이 없는 기존 시험 묶음(항목 3개, `segment`만 있음)은 모양·대상 「모름」, 트라이브 null, 색 대기 false, 뺀 항목 [],
 *   패턴 번호 `P-07`은 「모름」(티켓 20261007_1745), 지점 카테고리 null
 * - 패턴 번호(없으면 null, 형식이 틀리면 「모름」)·지점 카테고리(`knobs`나 키가 없으면 null, 문자열 배열이 아니면 「모름」, 티켓 20261007_1745)
 * - 계약: 검증(`validate.ts`)이 오류를 내지 않는 값과 읽기 함수가 「모름」이 아닌 값이 일치한다
 */
import { describe, it, expect } from 'vitest'
import type { Json } from '@/types/database.generated'
import {
  OPS_FIELD_UNKNOWN,
  isOpsHomeFeedCard,
  readBundleExcludedItems,
  readExcludedItems,
  readOpsItemColorPending,
  readOpsItemExposureTags,
  readOpsItemPatternNo,
  readOpsItemPlaceCategories,
  readOpsItemShape,
  readOpsItemTribeId,
} from '../fields'
import { OPS_ITEM_KINDS } from '../constants'
import { validateExcludedItems, validateExposureTags, validateOpsBundle, validateOpsPlaceCategory } from '../validate'

const TRIBE = '3f2c9a10-5b7e-4d21-8a64-0c1e7b9d2f55'
const REVIEW = { world_related: false, winter_reviewed: false, reason: '운영성 카드예요' }

function item(original: Record<string, unknown>, edited: Record<string, unknown> | null = null) {
  return { original: original as Json, edited: edited as Json | null }
}

describe('readOpsItemShape', () => {
  it.each(['hero', 'poster', 'square', 'brief', 'list'])('허용값 %s는 그대로 읽는다', (shape) => {
    expect(readOpsItemShape(item({ shape }))).toBe(shape)
  })

  it.each([
    ['없음', {}],
    ['null', { shape: null }],
    ['허용값 밖', { shape: 'banner' }],
    ['대문자', { shape: 'Hero' }],
    ['옛 layout 값', { shape: 'large_thumbnail' }],
    ['숫자', { shape: 1 }],
    ['배열', { shape: ['hero'] }],
  ])('%s이면 「모름」이다', (_label, original) => {
    expect(readOpsItemShape(item(original))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('수정본이 있으면 수정본을 먼저 읽고, 수정본이 null이면 원본을 따른다', () => {
    expect(readOpsItemShape(item({ shape: 'hero' }, { shape: 'list' }))).toBe('list')
    expect(readOpsItemShape(item({ shape: 'hero' }, { shape: null }))).toBe('hero')
    expect(readOpsItemShape(item({}, { shape: 'poster' }))).toBe('poster')
  })

  it('원본이 객체가 아니어도(감싼 값) 죽지 않고 「모름」이다', () => {
    expect(readOpsItemShape({ original: { value: 5 }, edited: null })).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsItemShape({ original: [] as Json, edited: null })).toBe(OPS_FIELD_UNKNOWN)
  })
})

describe('readOpsItemExposureTags', () => {
  it('형식이 맞으면 태그 배열을 돌려준다(원본 배열을 그대로 내주지 않는다)', () => {
    const tags = ['time_morning', 'new_user']
    const read = readOpsItemExposureTags(item({ exposure_tags: tags }))
    expect(read).toEqual(['time_morning', 'new_user'])
    expect(read).not.toBe(tags)
  })

  it.each([
    ['없음', {}],
    ['null', { exposure_tags: null }],
    ['문자열', { exposure_tags: 'all' }],
    ['빈 배열', { exposure_tags: [] }],
    ['허용값 밖', { exposure_tags: ['all', 'segment_vip'] }],
    ['문자열이 아닌 원소', { exposure_tags: ['all', 3] }],
    ['중복', { exposure_tags: ['all', 'all'] }],
    ['옛 segment만', { segment: 'new_user' }],
  ])('%s이면 「모름」이다', (_label, original) => {
    expect(readOpsItemExposureTags(item(original))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('수정본이 있으면 수정본을 먼저 읽는다', () => {
    expect(readOpsItemExposureTags(item({ exposure_tags: ['all'] }, { exposure_tags: ['new_user'] }))).toEqual(['new_user'])
  })
})

describe('readOpsItemTribeId', () => {
  it('UUID 문자열이면 그 값이다', () => {
    expect(readOpsItemTribeId(item({ tribe_id: TRIBE }))).toBe(TRIBE)
  })

  it('없거나 null이면 null이다', () => {
    expect(readOpsItemTribeId(item({}))).toBeNull()
    expect(readOpsItemTribeId(item({ tribe_id: null }))).toBeNull()
  })

  it.each([
    ['UUID가 아닌 문자열', 'ranger'],
    ['빈 문자열', ''],
    ['숫자', 5],
    ['불리언', true],
    ['배열', [TRIBE]],
  ])('%s이면 「모름」이다', (_label, tribe_id) => {
    expect(readOpsItemTribeId(item({ tribe_id }))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('수정본이 있으면 수정본을 먼저 읽는다', () => {
    const other = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'
    expect(readOpsItemTribeId(item({ tribe_id: TRIBE }, { tribe_id: other }))).toBe(other)
  })
})

describe('readOpsItemColorPending', () => {
  it('불리언이면 그 값이다', () => {
    expect(readOpsItemColorPending(item({ color_pending: true }))).toBe(true)
    expect(readOpsItemColorPending(item({ color_pending: false }))).toBe(false)
  })

  it('없거나 null이면 false다(색 대기가 아니다)', () => {
    expect(readOpsItemColorPending(item({}))).toBe(false)
    expect(readOpsItemColorPending(item({ color_pending: null }))).toBe(false)
  })

  it.each([
    ['문자열', 'yes'],
    ['숫자', 1],
    ['배열', [true]],
  ])('%s이면 「모름」이다', (_label, color_pending) => {
    expect(readOpsItemColorPending(item({ color_pending }))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('수정본의 false가 원본의 true를 덮어쓴다(false도 값이다)', () => {
    expect(readOpsItemColorPending(item({ color_pending: true }, { color_pending: false }))).toBe(false)
    expect(readOpsItemColorPending(item({ color_pending: false }, { color_pending: true }))).toBe(true)
  })
})

describe('readOpsItemPatternNo (티켓 20261007_1745)', () => {
  it('P01 형식이면 번호를 읽고 앞뒤 공백은 뗀다', () => {
    expect(readOpsItemPatternNo(item({ pattern_no: 'P07' }))).toBe('P07')
    expect(readOpsItemPatternNo(item({ pattern_no: ' P107 ' }))).toBe('P107')
  })

  it.each([
    ['없음', {}],
    ['null', { pattern_no: null }],
  ])('%s이면 null이다', (_label, original) => {
    expect(readOpsItemPatternNo(item(original))).toBeNull()
  })

  it.each([
    ['하이픈', { pattern_no: 'P-07' }],
    ['소문자', { pattern_no: 'p07' }],
    ['한 자리', { pattern_no: 'P7' }],
    ['숫자', { pattern_no: 7 }],
    ['빈 문자열', { pattern_no: '' }],
    ['배열', { pattern_no: ['P07'] }],
  ])('%s이면 「모름」이다', (_label, original) => {
    expect(readOpsItemPatternNo(item(original))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('수정본이 있으면 수정본을 먼저 읽는다', () => {
    expect(readOpsItemPatternNo(item({ pattern_no: 'P-07' }, { pattern_no: 'P07' }))).toBe('P07')
    expect(readOpsItemPatternNo(item({ pattern_no: 'P07' }, { pattern_no: null }))).toBe('P07')
  })
})

describe('readOpsItemPlaceCategories (티켓 20261007_1745)', () => {
  it('문자열 배열이면 그대로(빈 배열 포함) 읽는다', () => {
    expect(readOpsItemPlaceCategories(item({ knobs: { place_category: ['cafe', 'park'] } }))).toEqual(['cafe', 'park'])
    expect(readOpsItemPlaceCategories(item({ knobs: { place_category: [] } }))).toEqual([])
  })

  it.each([
    ['knobs 없음', {}],
    ['knobs null', { knobs: null }],
    ['knobs가 객체가 아님', { knobs: 'text' }],
    ['knobs가 배열', { knobs: ['cafe'] }],
    ['키 없음', { knobs: { time: 5 } }],
    ['키가 null', { knobs: { place_category: null } }],
  ])('%s이면 null이다', (_label, original) => {
    expect(readOpsItemPlaceCategories(item(original))).toBeNull()
  })

  it.each([
    ['문자열', { knobs: { place_category: 'cafe' } }],
    ['숫자', { knobs: { place_category: 3 } }],
    ['원소가 숫자', { knobs: { place_category: ['cafe', 3] } }],
    ['빈 문자열 원소', { knobs: { place_category: [''] } }],
  ])('%s이면 「모름」이다', (_label, original) => {
    expect(readOpsItemPlaceCategories(item(original))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('실제 카테고리가 있는지는 보지 않는다(없는 slug도 읽는다)', () => {
    expect(readOpsItemPlaceCategories(item({ knobs: { place_category: ['no-such-category'] } }))).toEqual(['no-such-category'])
  })

  it('수정본의 knobs가 있으면 수정본을 먼저 읽는다', () => {
    expect(
      readOpsItemPlaceCategories(item({ knobs: { place_category: ['cafe'] } }, { knobs: { place_category: ['park'] } }))
    ).toEqual(['park'])
  })
})

describe('readExcludedItems · readBundleExcludedItems', () => {
  it('정상 원소는 사유의 앞뒤 공백을 떼고 선택 칸은 null로 채운다', () => {
    expect(
      readExcludedItems([
        { reason: ' 세계관 검수에서 빠졌어요 ', item_key: 'mission-9', kind: 'mission', stage: 'world_review' },
        { reason: '이유만 있어요' },
      ])
    ).toEqual([
      { reason: '세계관 검수에서 빠졌어요', itemKey: 'mission-9', kind: 'mission', stage: 'world_review' },
      { reason: '이유만 있어요', itemKey: null, kind: null, stage: null },
    ])
  })

  it('없거나 null이면 빈 배열이다', () => {
    expect(readExcludedItems(undefined)).toEqual([])
    expect(readExcludedItems(null)).toEqual([])
    expect(readExcludedItems([])).toEqual([])
  })

  it.each([
    ['배열이 아님', 'x'],
    ['객체', { reason: 'x' }],
    ['원소가 객체가 아님', ['x']],
    ['사유 없음', [{ item_key: 'a' }]],
    ['사유에 줄바꿈', [{ reason: '가\n나' }]],
    ['kind 허용값 밖', [{ reason: '사유', kind: 'banner' }]],
    ['stage 허용값 밖', [{ reason: '사유', stage: 'review' }]],
  ])('%s이면 목록 전체가 「모름」이다', (_label, value) => {
    expect(readExcludedItems(value)).toBe(OPS_FIELD_UNKNOWN)
  })

  it('원소 하나만 틀려도 정상 원소까지 목록 전체가 「모름」이다', () => {
    expect(readExcludedItems([{ reason: '정상' }, { item_key: 'a' }])).toBe(OPS_FIELD_UNKNOWN)
  })

  it('묶음 제출 원본(raw)의 excluded_items를 읽는다', () => {
    expect(readBundleExcludedItems({ bundle_id: 'b', excluded_items: [{ reason: '사유' }] })).toEqual([
      { reason: '사유', itemKey: null, kind: null, stage: null },
    ])
    expect(readBundleExcludedItems({ bundle_id: 'b' })).toEqual([])
    expect(readBundleExcludedItems({ excluded_items: 'x' })).toBe(OPS_FIELD_UNKNOWN)
  })

  it('원본이 객체가 아니거나 없으면 빈 배열이다', () => {
    expect(readBundleExcludedItems(null)).toEqual([])
    expect(readBundleExcludedItems(undefined)).toEqual([])
    expect(readBundleExcludedItems([] as Json)).toEqual([])
    expect(readBundleExcludedItems('text' as Json)).toEqual([])
  })
})

describe('기존 시험 묶음 고정 사례 (항목 3개, segment만 있음)', () => {
  // 2026-10-01 DB 조회로 확인한 기존 시험 묶음의 모양: 새 칸이 없고 옛 대상 칸 `segment`만 있다. 다시 검사하지 않고 읽을 때 「모름」이다.
  const legacyItems = [
    item({ item_key: 'card-1', kind: 'home_feed_card', pattern_no: 'P-07', segment: 'new_user', user_experience: '첫 카드', world_review: REVIEW }),
    item({ item_key: 'card-2', kind: 'home_feed_card', pattern_no: 'P-07', segment: 'all', user_experience: '둘째 카드', world_review: REVIEW }),
    item({ item_key: 'mission-1', kind: 'mission', pattern_no: 'P-07', segment: { tier: 'vip' }, user_experience: '미션', world_review: REVIEW }),
  ]
  const legacyBundleRaw: Json = { bundle_id: 'sample-legacy', author: '윤진', items: legacyItems.map((i) => i.original) }

  it('모양·대상·패턴 번호(P-07)는 「모름」, 트라이브·지점 카테고리는 없음, 색 대기는 아님이다', () => {
    for (const legacy of legacyItems) {
      expect(readOpsItemShape(legacy)).toBe(OPS_FIELD_UNKNOWN)
      expect(readOpsItemExposureTags(legacy)).toBe(OPS_FIELD_UNKNOWN)
      expect(readOpsItemPatternNo(legacy)).toBe(OPS_FIELD_UNKNOWN)
      expect(readOpsItemTribeId(legacy)).toBeNull()
      expect(readOpsItemPlaceCategories(legacy)).toBeNull()
      expect(readOpsItemColorPending(legacy)).toBe(false)
    }
  })

  it('묶음의 뺀 항목은 빈 목록이다', () => {
    expect(readBundleExcludedItems(legacyBundleRaw)).toEqual([])
  })
})

describe('isOpsHomeFeedCard', () => {
  it('home_feed_card만 카드다', () => {
    for (const kind of OPS_ITEM_KINDS) expect(isOpsHomeFeedCard(kind)).toBe(kind === 'home_feed_card')
    expect(isOpsHomeFeedCard(null)).toBe(false)
    expect(isOpsHomeFeedCard(undefined)).toBe(false)
    expect(isOpsHomeFeedCard('HOME_FEED_CARD')).toBe(false)
  })
})

describe('계약: 검증이 오류를 내지 않는 값 = 읽기 함수가 「모름」이 아닌 값 (값이 있는 경우)', () => {
  function validationErrors(field: string, value: unknown): string[] {
    const bundle = {
      bundle_id: 'contract',
      author: '윤진',
      items: [
        {
          item_key: 'card-1',
          kind: 'home_feed_card',
          shape: 'hero',
          exposure_tags: ['all'],
          user_experience: '카드를 봐요',
          world_review: REVIEW,
          [field]: value,
        },
      ],
    }
    return validateOpsBundle(bundle).items[0].format_errors
  }

  const shapeValues: unknown[] = ['hero', 'poster', 'square', 'brief', 'list', 'banner', 'Hero', 'large_thumbnail', '', 3, ['hero'], {}]
  it.each(shapeValues.map((value) => [JSON.stringify(value), value]))('shape %s', (_label, value) => {
    const valid = validationErrors('shape', value).length === 0
    expect(readOpsItemShape(item({ shape: value })) !== OPS_FIELD_UNKNOWN).toBe(valid)
  })

  const tagValues: unknown[] = [['all'], ['new_user'], ['all', 'new_user'], [], 'all', ['bogus'], ['all', 'all'], ['all', 5], {}, 5]
  it.each(tagValues.map((value) => [JSON.stringify(value), value]))('exposure_tags %s', (_label, value) => {
    const valid = validationErrors('exposure_tags', value).length === 0
    expect(readOpsItemExposureTags(item({ exposure_tags: value })) !== OPS_FIELD_UNKNOWN).toBe(valid)
    expect(validateExposureTags(value, 'x').length === 0).toBe(valid)
  })

  const tribeValues: unknown[] = [TRIBE, TRIBE.toUpperCase(), 'ranger', '', 5, true, [TRIBE], {}]
  it.each(tribeValues.map((value) => [JSON.stringify(value), value]))('tribe_id %s', (_label, value) => {
    const valid = validationErrors('tribe_id', value).length === 0
    expect(readOpsItemTribeId(item({ tribe_id: value })) !== OPS_FIELD_UNKNOWN).toBe(valid)
  })

  const patternValues: unknown[] = ['P01', 'P07', 'P100', ' P07 ', 'P-07', 'p07', 'P7', 'T01', '7', 7, '', ['P07'], {}, true]
  it.each(patternValues.map((value) => [JSON.stringify(value), value]))('pattern_no %s', (_label, value) => {
    // 사전 실재는 읽기 함수가 보지 않으므로 ctx 없이 낸 검증과 견준다
    const valid = validationErrors('pattern_no', value).length === 0
    expect(readOpsItemPatternNo(item({ pattern_no: value })) !== OPS_FIELD_UNKNOWN).toBe(valid)
  })

  const placeValues: unknown[] = [['cafe'], ['cafe', 'park'], [], 'cafe', 3, ['cafe', 3], [''], [null], {}, true]
  it.each(placeValues.map((value) => [JSON.stringify(value), value]))('knobs.place_category %s', (_label, value) => {
    const valid = validationErrors('knobs', { place_category: value }).length === 0
    expect(readOpsItemPlaceCategories(item({ knobs: { place_category: value } })) !== OPS_FIELD_UNKNOWN).toBe(valid)
    expect(validateOpsPlaceCategory({ place_category: value }, 'x').length === 0).toBe(valid)
  })

  const pendingValues: unknown[] = [true, false, 'yes', 1, 0, [true], {}]
  it.each(pendingValues.map((value) => [JSON.stringify(value), value]))('color_pending %s', (_label, value) => {
    const valid = validationErrors('color_pending', value).length === 0
    expect(readOpsItemColorPending(item({ color_pending: value })) !== OPS_FIELD_UNKNOWN).toBe(valid)
  })

  const excludedValues: unknown[] = [
    [],
    [{ reason: '사유' }],
    [{ reason: '사유', item_key: 'a', kind: 'mission', stage: 'balance_check' }],
    'x',
    {},
    ['x'],
    [{ item_key: 'a' }],
    [{ reason: '가\n나' }],
    [{ reason: '사유', kind: 'banner' }],
    [{ reason: '사유', stage: 'review' }],
    [{ reason: '사유', item_key: 5 }],
  ]
  it.each(excludedValues.map((value) => [JSON.stringify(value), value]))('excluded_items %s', (_label, value) => {
    const valid = validateExcludedItems(value).length === 0
    expect(readExcludedItems(value) !== OPS_FIELD_UNKNOWN).toBe(valid)
  })
})
