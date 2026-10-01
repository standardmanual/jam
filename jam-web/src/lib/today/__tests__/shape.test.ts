/**
 * 홈피드 카드 모양 상수·술어 (티켓 20261001_1152)
 *
 * 확인하는 것: 모양 5개와 이미지 모양 3개, 대소문자가 다른 값·옛 layout 값·문자열이 아닌 값은 모양이 아니다.
 * (티켓 20261001_1357 추가) 옛 값 → 새 모양 대응표와 예외, 그려질 모양(전환 상수), 이미지에 제목 있음 판정.
 *
 * 실행: cd jam-web && npx vitest run src/lib/today/__tests__/shape.test.ts
 */
import { describe, it, expect } from 'vitest'
import {
  CARD_RESOURCES,
  CARD_SHAPES,
  IMAGE_CARD_SHAPES,
  LEGACY_SHAPE_CUTOVER,
  drawnShape,
  fallbackEmptyTileShape,
  isCardShape,
  isImageShape,
  isRankingRows,
  resolveShape,
  resolveTitleInImage,
  resourceOfTemplate,
  type ShapeCardInput,
} from '../shape'

describe('카드 모양', () => {
  it('모양은 5개다(마이그레이션 206 today_cards_shape_check와 같은 목록)', () => {
    expect([...CARD_SHAPES]).toEqual(['hero', 'poster', 'square', 'brief', 'list'])
  })

  it('이미지 모양은 hero·poster·square 3개이고 모두 모양 목록 안에 있다', () => {
    expect([...IMAGE_CARD_SHAPES]).toEqual(['hero', 'poster', 'square'])
    for (const shape of IMAGE_CARD_SHAPES) expect(CARD_SHAPES).toContain(shape)
  })

  it.each(['hero', 'poster', 'square', 'brief', 'list'])('isCardShape: %s는 모양이다', (shape) => {
    expect(isCardShape(shape)).toBe(true)
  })

  it.each(['hero', 'poster', 'square'])('isImageShape: %s는 이미지 모양이다', (shape) => {
    expect(isImageShape(shape)).toBe(true)
  })

  it.each(['brief', 'list'])('isImageShape: %s는 이미지가 없는 모양이다', (shape) => {
    expect(isCardShape(shape)).toBe(true)
    expect(isImageShape(shape)).toBe(false)
  })

  it.each([
    ['대문자', 'Hero'],
    ['전부 대문자', 'POSTER'],
    ['앞뒤 공백', ' hero '],
    ['빈 문자열', ''],
    ['옛 layout 값', 'large_thumbnail'],
    ['옛 layout 값(기사)', 'editorial_article'],
    ['숫자', 1],
    ['null', null],
    ['undefined', undefined],
    ['배열', ['hero']],
    ['객체', { shape: 'hero' }],
  ])('모양이 아니다: %s', (_label, value) => {
    expect(isCardShape(value)).toBe(false)
    expect(isImageShape(value)).toBe(false)
  })
})

function card(overrides: Partial<ShapeCardInput> = {}): ShapeCardInput {
  return {
    shape: null,
    template_type: 'badge_spotlight',
    layout_type: 'large_thumbnail',
    cover_image_url: 'https://cdn.example/cover.png',
    ...overrides,
  }
}

describe('resolveShape — 옛 값 → 새 모양 대응표 (1453 확정 설계 6절)', () => {
  it.each([
    ['large_thumbnail', 'hero'],
    ['banner', 'poster'],
    ['badge_gallery', 'list'],
    ['shortcut', 'brief'],
    ['other', 'brief'],
    ['ranking_list', 'list'],
  ] as const)('커버가 있는 %s는 %s다', (layout, expected) => {
    expect(resolveShape(card({ layout_type: layout }))).toBe(expected)
  })

  it('옛 layout 6종이 모두 새 모양 5개 안으로 대응된다', () => {
    const layouts = ['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other', 'ranking_list'] as const
    for (const layout of layouts) expect(CARD_SHAPES).toContain(resolveShape(card({ layout_type: layout })))
  })

  describe('large_thumbnail 예외', () => {
    it('미션 소개 카드는 square다(커버가 있어도, 없어도)', () => {
      expect(resolveShape(card({ template_type: 'mission_spotlight' }))).toBe('square')
      expect(resolveShape(card({ template_type: 'mission_spotlight', cover_image_url: null }))).toBe('square')
    })

    it('커버 없이 배지가 걸려 있던 카드는 square다(배지 그림이 올라가던 카드)', () => {
      expect(resolveShape(card({ cover_image_url: null, badge_ids: ['b1'] }))).toBe('square')
    })

    it('커버가 있으면 배지가 있어도 hero다(커버가 우선)', () => {
      expect(resolveShape(card({ badge_ids: ['b1'] }))).toBe('hero')
    })

    it('커버가 없고 배지도 없으면 hero다', () => {
      expect(resolveShape(card({ cover_image_url: null, badge_ids: [] }))).toBe('hero')
      expect(resolveShape(card({ cover_image_url: null }))).toBe('hero')
      expect(resolveShape(card({ cover_image_url: null, badge_ids: null }))).toBe('hero')
    })

    it('배지 그림이 있는지는 보지 않는다 — 배지가 걸려 있기만 하면 square다(그림 없는 배지도, 티켓 20261001_2244)', () => {
      // 화면(`toCardView`)과 계측(`events.ts`)·신호 엔진이 같은 카드 행을 같은 입력(badge_ids)으로 판정해야 기록 모양과 화면 모양이 같다.
      // 서버가 조회한 배지 정보(`resolved_badges`)를 넘겨도 읽지 않는다.
      const input = { ...card({ cover_image_url: null, badge_ids: ['b1'] }), resolved_badges: [{ image_url: null }] }
      expect(resolveShape(input)).toBe('square')
      const deleted = { ...card({ cover_image_url: null, badge_ids: ['b1'] }), resolved_badges: [] }
      expect(resolveShape(deleted)).toBe('square')
    })

    it('알 수 없는 layout 값은 지금 렌더러처럼 큰 썸네일형으로 본다', () => {
      expect(resolveShape(card({ layout_type: 'unknown' as ShapeCardInput['layout_type'] }))).toBe('hero')
    })
  })

  describe('banner 예외', () => {
    it('커버가 없으면 brief다(빈 문자열도 커버 없음)', () => {
      expect(resolveShape(card({ layout_type: 'banner', cover_image_url: null }))).toBe('brief')
      expect(resolveShape(card({ layout_type: 'banner', cover_image_url: '' }))).toBe('brief')
    })

    it('미션 소개 카드라도 배너는 포스터다(미션 예외는 large_thumbnail에만 있다)', () => {
      expect(resolveShape(card({ layout_type: 'banner', template_type: 'mission_spotlight' }))).toBe('poster')
    })
  })

  describe('기사', () => {
    it.each(['large_thumbnail', 'banner', 'badge_gallery', 'shortcut', 'other', 'ranking_list'] as const)(
      '기사는 레이아웃이 %s여도 hero다',
      (layout) => {
        expect(resolveShape(card({ template_type: 'editorial_article', layout_type: layout, cover_image_url: null }))).toBe('hero')
      },
    )
  })

  describe('저장된 shape', () => {
    it('모양 값이면 옛 값과 상관없이 그대로 쓴다', () => {
      expect(resolveShape(card({ shape: 'poster', layout_type: 'shortcut' }))).toBe('poster')
      expect(resolveShape(card({ shape: 'list', template_type: 'mission_spotlight' }))).toBe('list')
    })

    it('기사에도 저장된 모양이 먼저다(기사를 hero로 고정하는 것은 옛 값을 바꿀 때만이다)', () => {
      expect(resolveShape(card({ shape: 'brief', template_type: 'editorial_article' }))).toBe('brief')
    })

    it.each([null, undefined, '', 'Hero', ' hero ', 'large_thumbnail'])('모양 값이 아니면(%s) 옛 값으로 정한다', (shape) => {
      expect(resolveShape(card({ shape, layout_type: 'shortcut' }))).toBe('brief')
    })
  })
})

describe('drawnShape — 지금 그려질 모양 (전환 상수)', () => {
  it('전환 상수는 꺼져 있다(조각 b7에서 켠다)', () => {
    expect(LEGACY_SHAPE_CUTOVER).toBe(false)
  })

  it('shape가 저장된 카드는 전환 상수와 상관없이 그 값이다', () => {
    expect(drawnShape(card({ shape: 'square' }))).toBe('square')
    expect(drawnShape(card({ shape: 'square' }), true)).toBe('square')
    expect(drawnShape(card({ shape: 'square' }), false)).toBe('square')
  })

  it('전환 상수가 꺼져 있으면 shape가 없는 옛 카드는 null이다(옛 렌더러로 그린다)', () => {
    expect(drawnShape(card())).toBeNull()
    expect(drawnShape(card({ shape: null, layout_type: 'badge_gallery' }))).toBeNull()
    expect(drawnShape(card({ shape: undefined }))).toBeNull()
    expect(drawnShape(card(), false)).toBeNull()
  })

  it('모양 값이 아닌 shape는 없는 것으로 본다', () => {
    expect(drawnShape(card({ shape: 'Hero' }))).toBeNull()
  })

  it('전환 상수가 켜지면 옛 카드도 resolveShape의 모양으로 그린다', () => {
    expect(drawnShape(card({ layout_type: 'badge_gallery' }), true)).toBe('list')
    expect(drawnShape(card({ layout_type: 'banner', cover_image_url: null }), true)).toBe('brief')
  })
})

describe('resourceOfTemplate·CARD_RESOURCES — 화면과 계측이 함께 쓰는 자원 판정 (티켓 20261001_2244)', () => {
  it('템플릿 8종이 자원 8개 중 하나로 대응되고 레시피만 대응하는 템플릿이 없다', () => {
    const templates = [
      'mission_spotlight',
      'drop_alert',
      'badge_spotlight',
      'editorial_article',
      'ranking_board',
      'itembook_milestone',
      'progress_nudge',
      'location_trend',
    ] as const
    const mapped = templates.map(resourceOfTemplate)
    for (const resource of mapped) expect(CARD_RESOURCES).toContain(resource)
    expect(CARD_RESOURCES.filter((r) => !mapped.includes(r))).toEqual(['recipe'])
  })

  it('진행 알림과 지역 트렌드는 같은 자원(auto)이다', () => {
    expect(resourceOfTemplate('progress_nudge')).toBe('auto')
    expect(resourceOfTemplate('location_trend')).toBe('auto')
  })
})

describe('isRankingRows — 랭킹이면 행형 (티켓 20261001_2244)', () => {
  it('랭킹 자원만 행형이다', () => {
    for (const resource of CARD_RESOURCES) expect(isRankingRows(resource)).toBe(resource === 'ranking')
  })

  it('타일 0개 대체(fallbackEmptyTileShape)도 같은 판정을 쓴다 — 행형은 타일이 없어도 list다', () => {
    for (const resource of CARD_RESOURCES) {
      expect(fallbackEmptyTileShape('list', resource, 0)).toBe(isRankingRows(resource) ? 'list' : 'brief')
      expect(fallbackEmptyTileShape('list', resource, 1)).toBe('list')
    }
  })
})

describe('resolveTitleInImage — 이미지에 제목 있음 (1453 결정 6·12)', () => {
  const COVER = 'https://cdn.example/mission.png'
  const mission = (overrides: Partial<Parameters<typeof resolveTitleInImage>[0]> = {}) => ({
    template_type: 'mission_spotlight' as const,
    cover_image_url: COVER,
    title_in_image: null,
    ...overrides,
  })

  it('저장된 값이 true면 true다', () => {
    expect(resolveTitleInImage({ template_type: 'badge_spotlight', cover_image_url: null, title_in_image: true })).toBe(true)
  })

  it('저장된 값이 false면 연결 미션 이미지와 커버가 같아도 false다(저장값이 우선)', () => {
    expect(resolveTitleInImage(mission({ title_in_image: false }), COVER)).toBe(false)
  })

  it('NULL인 옛 미션 소개 카드는 커버가 연결 미션의 image_url과 같을 때만 true다', () => {
    expect(resolveTitleInImage(mission(), COVER)).toBe(true)
    expect(resolveTitleInImage(mission({ title_in_image: undefined }), COVER)).toBe(true)
    expect(resolveTitleInImage(mission(), 'https://cdn.example/other.png')).toBe(false)
  })

  it('옛 미션 소개 카드라도 연결 미션 이미지가 없거나 커버가 없으면 false다', () => {
    expect(resolveTitleInImage(mission(), null)).toBe(false)
    expect(resolveTitleInImage(mission(), undefined)).toBe(false)
    expect(resolveTitleInImage(mission({ cover_image_url: null }), null)).toBe(false)
    expect(resolveTitleInImage(mission({ cover_image_url: '' }), '')).toBe(false)
  })

  it('NULL인 미션 소개가 아닌 옛 카드는 커버가 미션 이미지와 같아 보여도 false다', () => {
    expect(resolveTitleInImage({ template_type: 'badge_spotlight', cover_image_url: COVER, title_in_image: null }, COVER)).toBe(false)
  })
})
