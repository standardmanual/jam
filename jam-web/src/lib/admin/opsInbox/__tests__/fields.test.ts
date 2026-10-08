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
 * - 패턴 제안 내용 칸(티켓 20261007_1746): 다른 종류는 null, 형식이 틀리면 「모름」, 맞으면 객체(공백 제거·기본값·모르는 키 버림)
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
  readOpsPatternProposal,
} from '../fields'
import { OPS_ITEM_KINDS } from '../constants'
import {
  validateExcludedItems,
  validateExposureTags,
  validateOpsBundle,
  validateOpsPatternProposal,
  validateOpsPlaceCategory,
} from '../validate'

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

describe('readOpsPatternProposal (티켓 20261007_1746)', () => {
  const KNOBS = {
    condition: { open: '오늘 체크인 1회', closed: '상위 기록자만 통과하는 거리' },
    place: { open: '산·역·공원', closed: '공통 규칙뿐이다' },
    time: { open: '당일 활동', closed: '심야 시간대' },
    reward: { open: '믹스 결과 배지', closed: '재료를 빼앗는 방식' },
    tribe: { rule: '열쇠 행동과 장소의 성격에 맞춘다', example: '아날로그 수집가' },
  }
  const PATTERN = {
    name: '오늘의 열쇠',
    principle: '오늘 한 일로 자물쇠를 연다',
    user_experience: '오늘 한 운동이 내일 배지의 열쇠가 돼요',
    knobs: KNOBS,
  }
  const proposal = (pattern: unknown, kind = 'pattern_proposal') => item({ kind, resource: { pattern } })

  it('종류가 pattern_proposal이 아니면 null이다(resource가 틀려도 읽지 않는다)', () => {
    for (const kind of OPS_ITEM_KINDS.filter((k) => k !== 'pattern_proposal')) {
      expect(readOpsPatternProposal(proposal(PATTERN, kind))).toBeNull()
      expect(readOpsPatternProposal(proposal('text', kind))).toBeNull()
    }
    expect(readOpsPatternProposal(item({ resource: { pattern: PATTERN } }))).toBeNull()
    expect(readOpsPatternProposal(item({ kind: 'nope', resource: { pattern: PATTERN } }))).toBeNull()
  })

  it('형식이 틀리거나 칸이 없으면 「모름」이다', () => {
    expect(readOpsPatternProposal(item({ kind: 'pattern_proposal' }))).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsPatternProposal(proposal(undefined))).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsPatternProposal(proposal('text'))).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsPatternProposal(proposal({ ...PATTERN, name: '' }))).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsPatternProposal(proposal({ ...PATTERN, knobs: { ...KNOBS, tribe: { rule: 'x' } } }))).toBe(OPS_FIELD_UNKNOWN)
    expect(
      readOpsPatternProposal(proposal({ ...PATTERN, samples: [{ no: 0, name: '샘플', role: 'main', impl: '' }] }))
    ).toBe(OPS_FIELD_UNKNOWN)
    expect(readOpsPatternProposal(proposal({ ...PATTERN, card_shapes: [{ shape: 'banner', note: '' }] }))).toBe(OPS_FIELD_UNKNOWN)
  })

  it('필수 칸만 있으면 선택 칸은 사전 기본값으로 읽는다', () => {
    expect(readOpsPatternProposal(proposal(PATTERN))).toEqual({
      name: '오늘의 열쇠',
      principle: '오늘 한 일로 자물쇠를 연다',
      userExperience: '오늘 한 운동이 내일 배지의 열쇠가 돼요',
      menus: [],
      samples: [],
      cardShapes: [],
      knobs: KNOBS,
      pitfalls: '',
    })
  })

  it('문자열은 앞뒤 공백을 떼고, 모르는 키는 버린다', () => {
    const padded = {
      name: '  오늘의 열쇠 ',
      principle: '\n원리\t',
      user_experience: ' 경험 ',
      menus: [' 레시피 ', '드랍'],
      samples: [
        { no: 3, name: ' 도장 ', role: 'main', impl: ' 구현 ', extra: 1 },
        { no: 9, name: '새벽', role: 'related' },
      ],
      card_shapes: [{ shape: 'hero', note: ' 큰 카드 ', extra: 1 }, { shape: 'list' }],
      pitfalls: ' 주의 ',
      knobs: {
        condition: { open: ' a ', closed: ' b ', extra: 1 },
        place: { open: 'c', closed: 'd' },
        time: { open: 'e', closed: 'f' },
        reward: { open: 'g', closed: 'h' },
        tribe: { rule: ' i ', example: ' j ', open: 'k' },
        extra: { open: 'x' },
      },
      unknown_top: 'x',
    }
    expect(readOpsPatternProposal(proposal(padded))).toEqual({
      name: '오늘의 열쇠',
      principle: '원리',
      userExperience: '경험',
      menus: ['레시피', '드랍'],
      samples: [
        { no: 3, name: '도장', role: 'main', impl: '구현' },
        { no: 9, name: '새벽', role: 'related', impl: '' },
      ],
      cardShapes: [
        { shape: 'hero', note: '큰 카드' },
        { shape: 'list', note: '' },
      ],
      knobs: {
        condition: { open: 'a', closed: 'b' },
        place: { open: 'c', closed: 'd' },
        time: { open: 'e', closed: 'f' },
        reward: { open: 'g', closed: 'h' },
        tribe: { rule: 'i', example: 'j' },
      },
      pitfalls: '주의',
    })
  })

  it('수정본에 종류와 resource가 없으면(직접 수정은 둘을 못 고친다) 제출 원본을 읽는다', () => {
    expect(readOpsPatternProposal(item({ kind: 'pattern_proposal', resource: { pattern: PATTERN } }, { user_experience: '고친 문장' }))).not.toBe(
      OPS_FIELD_UNKNOWN
    )
  })

  it('읽은 객체는 원본과 이어지지 않는다(읽은 뒤 원본을 바꿔도 그대로)', () => {
    const original = JSON.parse(JSON.stringify({ ...PATTERN, menus: ['레시피'] })) as { menus: string[] }
    const read = readOpsPatternProposal(proposal(original))
    if (read === null || read === OPS_FIELD_UNKNOWN) throw new Error('읽혀야 해요')
    original.menus.push('드랍')
    expect(read.menus).toEqual(['레시피'])
  })

  // 계약: 검증 오류 0 ⇔ 「모름」이 아님. 온전한 값에서 한 곳씩 바꾼 변형을 모두 견준다.
  const variants: Array<[string, unknown]> = [
    ['온전한 필수 칸', PATTERN],
    ['name 빈 값', { ...PATTERN, name: '' }],
    ['name 공백뿐', { ...PATTERN, name: '  ' }],
    ['name 숫자', { ...PATTERN, name: 7 }],
    ['principle 없음', { ...PATTERN, principle: undefined }],
    ['user_experience null', { ...PATTERN, user_experience: null }],
    ['knobs 없음', { ...PATTERN, knobs: undefined }],
    ['knobs 배열', { ...PATTERN, knobs: [] }],
    ['손잡이 하나 없음', { ...PATTERN, knobs: { ...KNOBS, time: undefined } }],
    ['손잡이 값 하나 없음', { ...PATTERN, knobs: { ...KNOBS, reward: { open: 'x' } } }],
    ['트라이브 open·closed 모양', { ...PATTERN, knobs: { ...KNOBS, tribe: { open: 'a', closed: 'b' } } }],
    ['손잡이 값 빈 문자열', { ...PATTERN, knobs: { ...KNOBS, place: { open: '', closed: 'x' } } }],
    ['menus 정상', { ...PATTERN, menus: ['a', 'b'] }],
    ['menus 빈 배열', { ...PATTERN, menus: [] }],
    ['menus 문자열', { ...PATTERN, menus: 'a' }],
    ['menus 빈 원소', { ...PATTERN, menus: ['a', ''] }],
    ['samples 정상', { ...PATTERN, samples: [{ no: 1, name: 'a', role: 'aux', impl: '' }] }],
    ['samples no 소수', { ...PATTERN, samples: [{ no: 1.5, name: 'a', role: 'aux', impl: '' }] }],
    ['samples no 문자열', { ...PATTERN, samples: [{ no: '1', name: 'a', role: 'aux', impl: '' }] }],
    ['samples role 틀림', { ...PATTERN, samples: [{ no: 1, name: 'a', role: 'sub', impl: '' }] }],
    ['samples impl 숫자', { ...PATTERN, samples: [{ no: 1, name: 'a', role: 'main', impl: 3 }] }],
    ['samples 객체', { ...PATTERN, samples: {} }],
    ['card_shapes 정상', { ...PATTERN, card_shapes: [{ shape: 'square', note: '' }] }],
    ['card_shapes shape 틀림', { ...PATTERN, card_shapes: [{ shape: 'Square', note: '' }] }],
    ['card_shapes note 숫자', { ...PATTERN, card_shapes: [{ shape: 'list', note: 1 }] }],
    ['card_shapes 문자열 원소', { ...PATTERN, card_shapes: ['list'] }],
    ['pitfalls 빈 문자열', { ...PATTERN, pitfalls: '' }],
    ['pitfalls 배열', { ...PATTERN, pitfalls: ['a'] }],
    ['pattern 없음', undefined],
    ['pattern 문자열', 'text'],
    ['pattern 배열', []],
    ['pattern 빈 객체', {}],
  ]
  it.each(variants)('계약: %s', (_label, pattern) => {
    const errors = validateOpsPatternProposal({ pattern }, 'items[0]')
    const read = readOpsPatternProposal(proposal(pattern))
    expect(read !== OPS_FIELD_UNKNOWN).toBe(errors.length === 0)
    expect(read).not.toBeNull()
    // 항목 전체 검증(validateOpsBundle)도 같은 판정을 낸다.
    const bundle = validateOpsBundle({
      bundle_id: 'contract',
      author: '윤진',
      items: [{ item_key: 'p-1', kind: 'pattern_proposal', user_experience: '제안을 봐요', world_review: REVIEW, resource: { pattern } }],
    })
    expect(bundle.items[0].format_errors.filter((e) => e.includes('.resource.pattern')).length === 0).toBe(errors.length === 0)
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
