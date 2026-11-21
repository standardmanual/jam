/**
 * feedCardFields.ts — 폼 값 ↔ 저장 칸 변환과 값 검증 (티켓 20261121_1315)
 *
 *  - 값 의미: 빈 값은 NULL, 칩은 자동·없음·직접, 도장은 자동·사용 안 함·사용, 설명 노출은 자동·보임·숨김
 *  - errors(저장을 막는다)는 항목마다 경계 하나씩, warnings(막지 않는다)는 항목마다 하나씩
 *  - 같은 입력은 같은 결과
 */
import { describe, expect, it } from 'vitest'
import {
  buildFeedCardColumns,
  EMPTY_FEED_CARD_FORM_VALUES,
  FEED_CARD_COLUMN_KEYS,
  feedCardFormValuesFromRow,
  hasFeedCardColumns,
  pickFeedCardColumns,
  validateFeedCardColumns,
  type FeedCardColumnsInput,
  type FeedCardFormValues,
} from '../feedCardFields'

const TITLE = '문경새재에서 걷는 주말'

function check(columns: FeedCardColumnsInput, title = TITLE, itemBookId?: string | null) {
  return validateFeedCardColumns(columns, { title, itemBookId })
}
const hasError = (columns: FeedCardColumnsInput, part: string, title = TITLE) =>
  check(columns, title).errors.some((error) => error.includes(part))
const hasWarning = (columns: FeedCardColumnsInput, part: string, title = TITLE, itemBookId?: string | null) =>
  check(columns, title, itemBookId).warnings.some((warning) => warning.includes(part))

describe('buildFeedCardColumns — 값 의미', () => {
  it('빈 폼은 15개 칸이 모두 있고 전부 NULL이다(제목 칩·목록·모션 포함)', () => {
    const columns = buildFeedCardColumns(EMPTY_FEED_CARD_FORM_VALUES)
    expect(Object.keys(columns).sort()).toEqual([...FEED_CARD_COLUMN_KEYS].sort())
    for (const key of FEED_CARD_COLUMN_KEYS) expect(columns[key], key).toBeNull()
  })

  it('칩: 자동은 NULL, 칩 없음은 [], 직접은 입력한 칩(빈 칸은 저장하지 않는다)', () => {
    const base = EMPTY_FEED_CARD_FORM_VALUES
    expect(buildFeedCardColumns({ ...base, chipsMode: 'auto' }).chips).toBeNull()
    expect(buildFeedCardColumns({ ...base, chipsMode: 'none' }).chips).toEqual([])
    const custom = buildFeedCardColumns({
      ...base,
      chipsMode: 'custom',
      chips: [
        { kind: 'phrase', source: '무시되는 출처', text: ' 이번 주 ', slot: 'image-top-left', tilt: '-8' },
        { kind: 'value', source: 'mission.reward_points', text: '', slot: '', tilt: '' },
        { kind: 'label', source: '', text: '', slot: '', tilt: '' },
      ],
    }).chips
    expect(custom).toEqual([
      { kind: 'phrase', text: '이번 주', slot: 'image-top-left', tilt: -8 },
      { kind: 'value', source: 'mission.reward_points' },
      { kind: 'label' },
    ])
  })

  it('도장: 자동은 NULL, 사용 안 함은 false+자리 없음, 사용은 true+자리(비우면 NULL)', () => {
    const base = EMPTY_FEED_CARD_FORM_VALUES
    expect(buildFeedCardColumns({ ...base, stampMode: 'auto', stampSlot: 'image-top-left' })).toMatchObject({ stamp_enabled: null, stamp_slot: null })
    expect(buildFeedCardColumns({ ...base, stampMode: 'off', stampSlot: 'image-top-left' })).toMatchObject({ stamp_enabled: false, stamp_slot: null })
    expect(buildFeedCardColumns({ ...base, stampMode: 'on', stampSlot: ' image-top-left ' })).toMatchObject({ stamp_enabled: true, stamp_slot: 'image-top-left' })
    expect(buildFeedCardColumns({ ...base, stampMode: 'on', stampSlot: '' })).toMatchObject({ stamp_enabled: true, stamp_slot: null })
  })

  it('설명 노출: 자동은 NULL, 보임은 true, 숨김은 false', () => {
    const base = EMPTY_FEED_CARD_FORM_VALUES
    expect(buildFeedCardColumns({ ...base, descriptionMode: 'auto' }).show_description).toBeNull()
    expect(buildFeedCardColumns({ ...base, descriptionMode: 'show' }).show_description).toBe(true)
    expect(buildFeedCardColumns({ ...base, descriptionMode: 'hide' }).show_description).toBe(false)
  })

  it('목록 항목·모션·제목 칩 낱말은 빈 줄을 떨어뜨리고, 하나도 안 남으면 NULL이다', () => {
    const base = EMPTY_FEED_CARD_FORM_VALUES
    const columns = buildFeedCardColumns({
      ...base,
      titleChipWords: [' 문경새재 ', ''],
      listItems: [
        { name: ' 첫 항목 ', href: ' /drops ', imageUrl: '' },
        { name: '', href: '', imageUrl: '' },
        { name: '둘째', href: 'https://j-a-m.app/a', imageUrl: ' https://img/a.webp ' },
      ],
      listMoreHref: ' /drops ',
      collectionBurst: [
        { x: '-0.5', y: '0.25', tilt: '', size: '72', delayMs: '' },
        { x: '', y: '', tilt: '', size: '', delayMs: '' },
      ],
      feedSeed: ' 12345 ',
    })
    expect(columns.title_chip_words).toEqual(['문경새재'])
    expect(columns.list_items).toEqual([
      { name: '첫 항목', href: '/drops' },
      { name: '둘째', href: 'https://j-a-m.app/a', image_url: 'https://img/a.webp' },
    ])
    expect(columns.list_more_href).toBe('/drops')
    expect(columns.collection_burst).toEqual([{ x: -0.5, y: 0.25, size: 72 }])
    expect(columns.feed_seed).toBe(12345)
    expect(buildFeedCardColumns({ ...base, titleChipWords: ['', ' '] }).title_chip_words).toBeNull()
  })
})

describe('feedCardFormValuesFromRow — 저장 행에서 폼 값 되살리기', () => {
  const FULL_FORM: FeedCardFormValues = {
    feedType: 'gallery_list',
    boxShape: 'wave',
    boxKind: 'image_mask',
    bgColorKey: 'red-soft',
    chipColorKey: 'red',
    boxColorKey: 'ref-lime',
    chipsMode: 'custom',
    chips: [{ kind: 'phrase', source: '', text: '이번 주', slot: 'card-top-right', tilt: '6' }],
    titleChipWords: ['문경새재'],
    descriptionMode: 'hide',
    stampMode: 'on',
    stampSlot: 'card-top-right',
    listItems: [{ name: '항목', href: '/drops', imageUrl: 'https://img/a.webp' }],
    listMoreHref: '/drops',
    collectionBurst: [{ x: '0.5', y: '-0.5', tilt: '10', size: '80', delayMs: '100' }],
    feedSeed: '4000000000',
  }

  it('폼 → 칸 → 폼이 같은 값으로 돌아온다', () => {
    const columns = buildFeedCardColumns(FULL_FORM)
    expect(feedCardFormValuesFromRow(columns)).toEqual(FULL_FORM)
    expect(buildFeedCardColumns(feedCardFormValuesFromRow(columns))).toEqual(columns)
  })

  it('옛 행(개편 칸 없음)은 빈 폼 값이 되고, 저장 칸은 전부 NULL이다', () => {
    expect(feedCardFormValuesFromRow({})).toEqual(EMPTY_FEED_CARD_FORM_VALUES)
    expect(feedCardFormValuesFromRow({ chips: [], stamp_enabled: false })).toMatchObject({ chipsMode: 'none', stampMode: 'off' })
  })
})

describe('hasFeedCardColumns·pickFeedCardColumns', () => {
  it('개편 칸이 하나라도 있으면 참이고, 옛 본문은 거짓이다', () => {
    expect(hasFeedCardColumns({ title: '제목' })).toBe(false)
    expect(hasFeedCardColumns({ title: '제목', feed_seed: null })).toBe(true)
  })

  it('본문에서 개편 칸만 뽑고 본문에 없는 칸은 만들지 않는다', () => {
    expect(pickFeedCardColumns({ title: '제목', feed_type: 'hero_box', chips: [] })).toEqual({ feed_type: 'hero_box', chips: [] })
  })
})

describe('validateFeedCardColumns — errors(저장을 막는다)', () => {
  it('아무 칸도 없거나 전부 NULL이면 오류도 경고도 없다', () => {
    expect(check({})).toEqual({ errors: [], warnings: [] })
    expect(check(buildFeedCardColumns(EMPTY_FEED_CARD_FORM_VALUES))).toEqual({ errors: [], warnings: [] })
  })

  it('유형·박스 모양·박스 용도·색 키 3개가 허용 값 밖이면 막는다', () => {
    expect(hasError({ feed_type: 'banner' }, '카드 유형')).toBe(true)
    expect(hasError({ box_shape: 'circle' }, '박스 모양')).toBe(true)
    expect(hasError({ box_kind: 'photo' }, '박스 용도')).toBe(true)
    expect(hasError({ bg_color_key: 'white' }, '배경색')).toBe(true)
    expect(hasError({ chip_color_key: '#ff0000' }, '칩 색')).toBe(true)
    expect(hasError({ box_color_key: 'pink' }, '박스 색')).toBe(true)
    expect(check({ feed_type: 'hero_box', box_shape: 'wave', box_kind: 'image_mask', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime' }).errors).toEqual([])
  })

  it('칩은 2개까지이고 3개부터 막는다', () => {
    const chip = { kind: 'label' }
    expect(check({ feed_type: 'hero_box', chips: [chip, chip] }).errors).toEqual([])
    expect(hasError({ feed_type: 'hero_box', chips: [chip, chip, chip] }, '2개까지')).toBe(true)
  })

  it('칩 종류 밖, 값 칩의 출처 없음, 문구 칩의 문구 없음, 기울기 밖을 막는다', () => {
    expect(hasError({ chips: [{ kind: 'badge' }] }, '종류가 올바르지')).toBe(true)
    expect(hasError({ chips: ['label'] }, '종류가 올바르지')).toBe(true)
    expect(hasError({ chips: [{ kind: 'value' }] }, '출처가 비어')).toBe(true)
    expect(hasError({ chips: [{ kind: 'value', source: '  ' }] }, '출처가 비어')).toBe(true)
    expect(hasError({ chips: [{ kind: 'phrase' }] }, '문구가 비어')).toBe(true)
    expect(check({ chips: [{ kind: 'value', source: 'mission.reward_points' }, { kind: 'phrase', text: '이번 주' }] }).errors).toEqual([])
    for (const tilt of [-8, -6, -4, 4, 6, 8]) expect(check({ chips: [{ kind: 'label', tilt }] }).errors, String(tilt)).toEqual([])
    for (const tilt of [0, 5, 9, -10, '6']) expect(hasError({ chips: [{ kind: 'label', tilt }] }, '기울기'), String(tilt)).toBe(true)
  })

  it('칩 자리는 그 유형의 허용 자리여야 하고, 유형을 모르면 이름 형식만 본다', () => {
    expect(check({ feed_type: 'hero_box', chips: [{ kind: 'label', slot: 'image-top-left' }] }).errors).toEqual([])
    expect(hasError({ feed_type: 'hero_box', chips: [{ kind: 'label', slot: 'badge-top-left' }] }, '쓸 수 없는 자리')).toBe(true)
    // 전체 배경 이미지는 제목이 얹히는 왼쪽 아래를 쓰지 않는다
    expect(hasError({ feed_type: 'full_image', chips: [{ kind: 'label', slot: 'image-bottom-left' }] }, '쓸 수 없는 자리')).toBe(true)
    expect(hasError({ feed_type: 'badge_only', chips: [{ kind: 'label', slot: 'badge-top-left' }] }, '쓸 수 없는 자리')).toBe(true)
    expect(check({ chips: [{ kind: 'label', slot: 'any-slot' }] }).errors).toEqual([])
    expect(hasError({ chips: [{ kind: 'label', slot: 'Bad Slot' }] }, '쓸 수 없는 자리')).toBe(true)
  })

  it('칩 두 개의 자리가 대각선이 아니면 막는다(한쪽만 정했거나 자리를 안 정했으면 통과)', () => {
    const type = 'hero_box' as const
    expect(check({ feed_type: type, chips: [{ kind: 'label', slot: 'image-top-left' }, { kind: 'label', slot: 'image-bottom-right' }] }).errors).toEqual([])
    expect(check({ feed_type: type, chips: [{ kind: 'label', slot: 'image-top-right' }, { kind: 'label', slot: 'image-bottom-left' }] }).errors).toEqual([])
    expect(hasError({ feed_type: type, chips: [{ kind: 'label', slot: 'image-top-left' }, { kind: 'label', slot: 'image-top-right' }] }, '대각선')).toBe(true)
    expect(check({ feed_type: type, chips: [{ kind: 'label', slot: 'image-top-left' }, { kind: 'label' }] }).errors).toEqual([])
    expect(check({ feed_type: type, chips: [{ kind: 'label' }, { kind: 'label' }] }).errors).toEqual([])
  })

  it('제목 속 칩 낱말은 2개까지이고 제목에 그대로 들어 있어야 한다', () => {
    expect(check({ title_chip_words: ['문경새재', '주말'] }).errors).toEqual([])
    expect(hasError({ title_chip_words: ['문경새재', '주말', '걷는'] }, '2개까지')).toBe(true)
    expect(hasError({ title_chip_words: ['설악산'] }, '「설악산」')).toBe(true)
    expect(hasError({ title_chip_words: ['문경 새재'] }, '「문경 새재」')).toBe(true)
    expect(hasError({ title_chip_words: [' '] }, '빈 칸')).toBe(true)
    expect(hasError({ title_chip_words: [1] }, '형식')).toBe(true)
    expect(hasError({ title_chip_words: '문경새재' }, '형식')).toBe(true)
    // 제목이 비어 있으면 어떤 낱말도 들어 있지 않다
    expect(hasError({ title_chip_words: ['문경새재'] }, '「문경새재」', '')).toBe(true)
  })

  it('도장을 쓰면 자리는 허용 자리여야 한다(자리를 비우면 시드가 정한다)', () => {
    expect(check({ feed_type: 'hero_box', stamp_enabled: true, stamp_slot: 'image-top-left' }).errors).toEqual([])
    expect(check({ feed_type: 'hero_box', stamp_enabled: true, stamp_slot: null }).errors).toEqual([])
    expect(hasError({ feed_type: 'hero_box', stamp_enabled: true, stamp_slot: 'box-top-left' }, '도장 자리')).toBe(true)
    // 도장을 쓰지 않으면 자리 값은 보지 않는다
    expect(check({ feed_type: 'hero_box', stamp_enabled: false, stamp_slot: 'box-top-left' }).errors).toEqual([])
    expect(hasError({ stamp_enabled: 'yes' }, '도장 사용')).toBe(true)
    expect(hasError({ show_description: 'hide' }, '설명 노출')).toBe(true)
  })

  it('목록 항목은 3개까지이고 이름이 있어야 하며 주소는 안전한 주소여야 한다', () => {
    const item = { name: '항목', href: '/drops' }
    expect(check({ feed_type: 'gallery_list', list_items: [item, item, item] }).errors).toEqual([])
    expect(hasError({ list_items: [item, item, item, item] }, '3개까지')).toBe(true)
    expect(hasError({ list_items: [{ name: '', href: '/drops' }] }, '이름이 없어요')).toBe(true)
    expect(hasError({ list_items: [{ href: '/drops' }] }, '이름이 없어요')).toBe(true)
    for (const href of ['javascript:alert(1)', 'http://example.com', '//evil.com', '/\\evil.com', '', 'drops', '/a b']) {
      expect(hasError({ list_items: [{ name: '항목', href }] }, '주소를 쓸 수 없어요'), href).toBe(true)
    }
    for (const href of ['/drops', '/', 'https://j-a-m.app/drops']) {
      expect(check({ list_items: [{ name: '항목', href }] }).errors, href).toEqual([])
    }
    expect(hasError({ list_items: [{ name: '항목', href: '/a', image_url: 5 }] }, '이미지 주소')).toBe(true)
    expect(hasError({ list_items: 'x' }, '형식')).toBe(true)
  })

  it('대표 페이지 주소도 같은 규칙이다', () => {
    expect(check({ list_more_href: '/drops' }).errors).toEqual([])
    expect(check({ list_more_href: null }).errors).toEqual([])
    expect(hasError({ list_more_href: 'javascript:alert(1)' }, '대표 페이지 주소')).toBe(true)
    expect(hasError({ list_more_href: '' }, '대표 페이지 주소')).toBe(true)
  })

  it('컬렉션 모션 배지는 4개까지이고 값 범위 안이어야 한다', () => {
    const point = { x: 0, y: 0 }
    expect(check({ collection_burst: [point, point, point, point] }).errors).toEqual([])
    expect(hasError({ collection_burst: [point, point, point, point, point] }, '4개까지')).toBe(true)
    // 경계 값은 통과
    expect(check({ collection_burst: [{ x: -1, y: 1, tilt: -45, size: 68, delay_ms: 70 }, { x: 1, y: -1, tilt: 45, size: 84, delay_ms: 210 }] }).errors).toEqual([])
    // 경계 밖은 항목마다 막는다
    for (const bad of [{ x: 1.01, y: 0 }, { x: 0, y: -1.01 }, { x: 0, y: 0, tilt: 46 }, { x: 0, y: 0, tilt: -46 }, { x: 0, y: 0, size: 67 }, { x: 0, y: 0, size: 85 }, { x: 0, y: 0, delay_ms: 69 }, { x: 0, y: 0, delay_ms: 211 }, { x: Number.NaN, y: 0 }, { x: '0', y: 0 }]) {
      expect(hasError({ collection_burst: [bad] }, '범위 밖'), JSON.stringify(bad)).toBe(true)
    }
    expect(hasError({ collection_burst: [3] }, '형식')).toBe(true)
  })

  it('시드는 0 이상 2^32 미만 정수만 받는다', () => {
    for (const seed of [0, 1, 4294967295]) expect(check({ feed_seed: seed }).errors, String(seed)).toEqual([])
    for (const seed of [-1, 4294967296, 1.5, Number.NaN, '12']) expect(hasError({ feed_seed: seed }, '시드'), String(seed)).toBe(true)
  })

  it('오류가 여러 개면 모두 알려 준다', () => {
    const result = check({ feed_type: 'nope', box_shape: 'nope', chips: [{ kind: 'x' }] })
    expect(result.errors.length).toBe(3)
  })
})

describe('validateFeedCardColumns — warnings(막지 않는다)', () => {
  it('문구 칩이 12자를 넘으면 경고하고, 12자까지는 조용하다', () => {
    expect(hasWarning({ chips: [{ kind: 'phrase', text: '가'.repeat(13) }] }, '13자')).toBe(true)
    expect(check({ chips: [{ kind: 'phrase', text: '가'.repeat(13) }] }).errors).toEqual([])
    expect(check({ feed_type: 'hero_box', chips: [{ kind: 'phrase', text: '가'.repeat(12) }] }).warnings).toEqual([])
  })

  it('색 규칙에 걸리는 조합은 경고한다(둘 다 고른 쌍만 본다)', () => {
    // 같은 색
    expect(hasWarning({ bg_color_key: 'red', chip_color_key: 'red' }, '같아서')).toBe(true)
    // 규칙을 통과하는 기본 조합
    expect(check({ feed_type: 'hero_box', bg_color_key: 'red-soft', chip_color_key: 'red', box_color_key: 'ref-lime' }).warnings).toEqual([])
    // 하나만 골랐으면 짝이 없어 판정하지 않는다
    expect(check({ feed_type: 'hero_box', bg_color_key: 'red' }).warnings).toEqual([])
    expect(check({ bg_color_key: 'red', chip_color_key: 'red' }).errors).toEqual([])
  })

  it('목록형인데 항목이 0개면 경고한다', () => {
    expect(hasWarning({ feed_type: 'gallery_list' }, '항목이 없어요')).toBe(true)
    expect(hasWarning({ feed_type: 'gallery_list', list_items: [] }, '항목이 없어요')).toBe(true)
    expect(check({ feed_type: 'gallery_list', list_items: [{ name: '항목', href: '/drops' }] }).warnings).toEqual([])
  })

  it('컬렉션 소개인데 컬렉션이 없으면 경고한다(컬렉션 정보를 안 넘기면 판정하지 않는다)', () => {
    expect(hasWarning({ feed_type: 'collection_intro' }, '컬렉션이 연결돼', TITLE, null)).toBe(true)
    expect(hasWarning({ feed_type: 'collection_intro' }, '컬렉션이 연결돼', TITLE, '')).toBe(true)
    expect(hasWarning({ feed_type: 'collection_intro' }, '컬렉션이 연결돼', TITLE, 'book-1')).toBe(false)
    expect(hasWarning({ feed_type: 'collection_intro' }, '컬렉션이 연결돼', TITLE, undefined)).toBe(false)
  })

  it('유형 없이 새 칸이 채워져 있으면 경고하고 막지 않는다', () => {
    for (const columns of [{ box_shape: 'wave' }, { chips: [] }, { stamp_enabled: false }, { show_description: false }, { feed_seed: 7 }, { list_items: [{ name: '항목', href: '/a' }] }, { title_chip_words: ['주말'] }]) {
      const result = check(columns)
      expect(result.errors, JSON.stringify(columns)).toEqual([])
      expect(result.warnings.some((warning) => warning.includes('유형이 비어')), JSON.stringify(columns)).toBe(true)
    }
    // 빈 목록과 NULL은 채워진 것이 아니다
    expect(check({ feed_type: null, list_items: [], title_chip_words: [], collection_burst: [] }).warnings).toEqual([])
  })

  it('유형이 허용하는 칩 수를 넘으면 경고한다', () => {
    expect(hasWarning({ feed_type: 'gallery_list', chips: [{ kind: 'label' }, { kind: 'label' }] }, '1개까지만')).toBe(true)
    expect(hasWarning({ feed_type: 'badge_only', chips: [{ kind: 'label' }] }, '0개까지만')).toBe(true)
  })
})

describe('validateFeedCardColumns — 같은 입력 같은 결과', () => {
  it('두 번 불러도 문구와 순서가 같다', () => {
    const columns: FeedCardColumnsInput = {
      feed_type: 'gallery_list',
      chips: [{ kind: 'phrase', text: '가'.repeat(14), slot: 'card-top-right', tilt: 5 }],
      title_chip_words: ['설악산'],
      list_items: [{ name: '', href: 'javascript:x' }],
      bg_color_key: 'red',
      chip_color_key: 'red',
    }
    expect(check(columns)).toEqual(check(columns))
  })
})
