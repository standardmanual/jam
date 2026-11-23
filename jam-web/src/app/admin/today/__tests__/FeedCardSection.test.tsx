/**
 * 「카드 모양」 섹션 (티켓 20261121_1316, 상위 20261120_2026 5회차-2)
 *
 * 확인하는 것: 유형별로 보이는 칸, «자동» 기본과 보조 문구, 색 견본·이름, 색 규칙 경고 문구, 제목에 없는 낱말 오류 문구.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)로 그려진 모양만 본다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/FeedCardSection.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

import FeedCardSection, {
  BOX_KIND_LABELS,
  BOX_SHAPE_LABELS,
  FEED_COLOR_LABELS,
  FEED_TYPE_LABELS,
  feedColorWarnings,
  feedFieldVisibility,
  feedTypeValueNote,
  stampSlotLabel,
  titleChipWordError,
  typeChangePatch,
} from '../FeedCardSection'
import { EMPTY_FEED_CARD_FORM_VALUES, type FeedCardFormValues } from '@/lib/admin/feedCardFields'
import { FEED_CHIP_SLOT_SPECS, FEED_TYPES } from '@/lib/today/feedChipSlots'
import { FEED_COLOR_KEYS } from '@/lib/today/feedConstants'
import { DEFAULT_FEED_PALETTE } from '@/lib/today/feedAssign'
import { BOX_SHAPES } from '@/lib/today/boxShape'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const values = (patch: Partial<FeedCardFormValues> = {}): FeedCardFormValues => ({ ...EMPTY_FEED_CARD_FORM_VALUES, ...patch })

const render = (patch: Partial<FeedCardFormValues> = {}, props: Partial<ComponentProps<typeof FeedCardSection>> = {}): string =>
  renderToStaticMarkup(<FeedCardSection values={values(patch)} onChange={() => {}} title="핫한 성수동 배지" {...props} />)

describe('이름 표 — 상수와 같은 키를 모두 덮는다', () => {
  it('유형 8개·박스 모양 5개·색 19개·박스 용도 2개에 한국어 이름이 있다', () => {
    expect(Object.keys(FEED_TYPE_LABELS).sort()).toEqual([...FEED_TYPES].sort())
    expect(Object.keys(BOX_SHAPE_LABELS).sort()).toEqual([...BOX_SHAPES].sort())
    expect(Object.keys(FEED_COLOR_LABELS).sort()).toEqual([...FEED_COLOR_KEYS].sort())
    expect(Object.keys(BOX_KIND_LABELS).sort()).toEqual(['image_mask', 'text'])
  })
  it('도장 자리 이름은 앵커와 모서리를 한국어로 읽는다', () => {
    expect(stampSlotLabel('image-top-left')).toBe('이미지 왼쪽 위')
    expect(stampSlotLabel('box-bottom-right')).toBe('박스 오른쪽 아래')
    expect(stampSlotLabel('box-row-top-right')).toBe('박스 줄 오른쪽 위')
    expect(stampSlotLabel('art-bottom-left')).toBe('그림 왼쪽 아래')
    expect(stampSlotLabel('card-top-right')).toBe('card-top-right')
  })
})

describe('feedFieldVisibility — 유형이 쓰는 칸', () => {
  it('박스가 있는 유형은 히어로·텍스트·드랍·픽업이고, 용도는 텍스트만 고른다', () => {
    const withBox = FEED_TYPES.filter((t) => feedFieldVisibility(t).boxShape)
    expect(withBox).toEqual(['hero_box', 'drop_pickup', 'text_box'])
    expect(FEED_TYPES.filter((t) => feedFieldVisibility(t).boxKind)).toEqual(['text_box'])
    for (const t of FEED_TYPES) expect(feedFieldVisibility(t).boxColor, t).toBe(feedFieldVisibility(t).boxShape)
  })
  it('목록형·컬렉션 소개에는 박스 칸이 없다', () => {
    expect(feedFieldVisibility('gallery_list')).toMatchObject({ boxShape: false, boxKind: false, boxColor: false })
    expect(feedFieldVisibility('collection_intro')).toMatchObject({ boxShape: false, boxKind: false, boxColor: false })
  })
  it('칩 색은 칩을 둘 수 있는 유형만 쓴다(배지만은 칩이 없다)', () => {
    expect(feedFieldVisibility('badge_only').chipColor).toBe(false)
    expect(feedFieldVisibility('hero_box').chipColor).toBe(true)
  })
  it('설명 문장은 기본 노출이 숨김인 유형(텍스트·배지만·전체 배경 이미지)에서 비활성이다', () => {
    expect(FEED_TYPES.filter((t) => !feedFieldVisibility(t).description)).toEqual(['full_image', 'badge_only', 'text_box'])
  })
  it('도장 자리는 그 유형 칩 자리 중 모서리 자리만이다(목록형·배지만은 없다)', () => {
    expect(feedFieldVisibility('hero_box').stampSlots).toEqual(FEED_CHIP_SLOT_SPECS.hero_box.slots)
    expect(feedFieldVisibility('full_image').stampSlots).toEqual(['image-top-left', 'image-top-right', 'image-bottom-right'])
    expect(feedFieldVisibility('gallery_list').stampSlots).toEqual([])
    expect(feedFieldVisibility('badge_only').stampSlots).toEqual([])
  })
})

describe('FeedCardSection — 유형별로 보이는 칸', () => {
  it('유형이 비어 있으면(폼 상태에서는 생기지 않는다) 유형 칸만 보이고 «옛 모양 그대로»는 없으며 다른 칸도 없다', () => {
    const html = render()
    expect(html).toContain('id="feed-card-type"')
    expect(html).toContain('유형을 골라 주세요')
    expect(html).not.toContain('옛 모양')
    for (const id of ['feed-card-bg-color', 'feed-card-chip-color', 'feed-card-box-color', 'feed-card-box-shape', 'feed-card-box-kind']) {
      expect(html, id).not.toContain(`id="${id}"`)
    }
    expect(html).not.toContain('제목 속 칩 낱말')
  })

  it('히어로는 박스 모양·세 색 칸이 있고 박스 용도 칸은 없다', () => {
    const html = render({ feedType: 'hero_box' })
    expect(html).toContain('히어로')
    for (const id of ['feed-card-box-shape', 'feed-card-bg-color', 'feed-card-chip-color', 'feed-card-box-color']) {
      expect(html, id).toContain(`id="${id}"`)
    }
    expect(html).not.toContain('id="feed-card-box-kind"')
  })

  it('텍스트는 박스 용도 칸도 있다', () => {
    const html = render({ feedType: 'text_box' })
    expect(html).toContain('id="feed-card-box-kind"')
    expect(html).toContain('id="feed-card-box-shape"')
  })

  it('목록형·컬렉션 소개는 박스 모양·박스 색·박스 용도 칸이 없고 배경색·칩 색은 있다', () => {
    for (const feedType of ['gallery_list', 'collection_intro'] as const) {
      const html = render({ feedType })
      for (const id of ['feed-card-box-shape', 'feed-card-box-color', 'feed-card-box-kind']) {
        expect(html, `${feedType} ${id}`).not.toContain(`id="${id}"`)
      }
      expect(html, feedType).toContain('id="feed-card-bg-color"')
      expect(html, feedType).toContain('id="feed-card-chip-color"')
    }
  })

  it('배지만은 칩 색 칸이 없고, 설명·도장 칸은 쓰지 않는다는 문구로 비활성이다', () => {
    const html = render({ feedType: 'badge_only' })
    expect(html).not.toContain('id="feed-card-chip-color"')
    expect(html).toContain('이 유형은 설명을 보이지 않아요')
    expect(html).toContain('이 유형은 도장을 쓰지 않아요')
    expect(html).toContain('<fieldset disabled=""')
  })

  it('설명 문장을 보이는 유형(히어로)은 설명 칸이 활성이다', () => {
    const html = render({ feedType: 'hero_box' })
    expect(html).not.toContain('이 유형은 설명을 보이지 않아요')
    expect(html).not.toContain('<fieldset disabled=""')
  })

  it('도장을 «사용»으로 하면 그 유형이 허용하는 자리 칸이 열리고 고른 자리는 한국어 이름으로 보인다', () => {
    const html = render({ feedType: 'collection_intro', stampMode: 'on', stampSlot: 'art-top-right' })
    expect(html).toContain('id="feed-card-stamp-slot"')
    expect(html).toContain('그림 오른쪽 위')
    expect(render({ feedType: 'hero_box', stampMode: 'auto' })).not.toContain('id="feed-card-stamp-slot"')
  })

  it('제목 속 칩 낱말 입력은 2개다', () => {
    const html = render({ feedType: 'hero_box' })
    expect(html).toContain('id="feed-card-title-chip-word-1"')
    expect(html).toContain('id="feed-card-title-chip-word-2"')
    expect(html).not.toContain('id="feed-card-title-chip-word-3"')
  })
})

describe('FeedCardSection — «자동»이 기본이다', () => {
  it('비워 둔 칸은 «자동»으로 보이고 «저장할 때 자동으로 정해져요»를 보인다', () => {
    const html = render({ feedType: 'hero_box' })
    expect(html).toContain('>자동</span>')
    expect(html).toContain('저장할 때 자동으로 정해져요')
    expect(html).toContain('aria-checked="true"')
  })

  it('값을 고른 칸은 «자동»이 아니라 고른 값을 보인다', () => {
    const html = render({ feedType: 'hero_box', boxShape: 'wave' })
    expect(html).toContain('물결')
  })
})

describe('FeedCardSection — 색 견본과 이름', () => {
  it('고른 색은 견본(색 변수)과 한국어 이름이 함께 보이고 견본은 보조 기술이 읽지 않는다', () => {
    const html = render({ feedType: 'hero_box', bgColorKey: 'green' })
    expect(html).toContain('그린')
    expect(html).toContain('background-color:var(--feed-color-green, var(--jam-green))')
    expect(html).toContain('aria-hidden="true"')
  })
})

describe('feedColorWarnings — 규칙에 걸리는 조합은 경고만', () => {
  const show = { chip: true, box: true }

  it('같은 색 둘은 경고한다(색 이름과 이유가 문구에 있다)', () => {
    const warnings = feedColorWarnings({ bgColorKey: 'red', chipColorKey: 'red', boxColorKey: '' }, show)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('배경색 레드 · 칩 색 레드 조합이 색 규칙에 걸려요')
    expect(warnings[0]).toContain('두 색이 같아서 구분이 안 돼요')
    expect(warnings[0]).toContain('저장은 되지만')
  })

  it('규칙을 통과하는 조합(안전한 기본 조합)은 경고가 없다', () => {
    expect(feedColorWarnings({ bgColorKey: 'yellow', chipColorKey: 'pink', boxColorKey: 'green' }, show)).toEqual([])
    // 저장된 옛 키 조합도 배제 표에 없어 조용하다
    expect(feedColorWarnings({ bgColorKey: 'red-soft', chipColorKey: 'red', boxColorKey: 'ref-lime' }, show)).toEqual([])
  })

  it('두 칸을 다 고르지 않았으면 판정하지 않는다', () => {
    expect(feedColorWarnings({ bgColorKey: 'red', chipColorKey: '', boxColorKey: '' }, show)).toEqual([])
  })

  it('사용자가 제외한 조합은 순서와 상관없이 경고한다', () => {
    const colors = { bgColorKey: 'yellow', chipColorKey: 'pink', boxColorKey: '' } as const
    expect(feedColorWarnings(colors, show)).toEqual([])
    expect(feedColorWarnings(colors, show, [['pink', 'yellow']])[0]).toContain('제외하기로 한 조합')
  })

  it('보이지 않는 칸이 낀 짝은 판정하지 않는다', () => {
    expect(feedColorWarnings({ bgColorKey: 'red', chipColorKey: 'red', boxColorKey: '' }, { chip: false, box: false })).toEqual([])
    expect(feedColorWarnings({ bgColorKey: '', chipColorKey: '', boxColorKey: 'green-deep', feedType: 'text_box' }, { chip: false, box: false })).toEqual([])
  })

  it('배제 표: 빨강 칩이 초록·짙은 초록 위, 흰 칩이 노랑 위, 보라 칩이 분홍 위에 있으면 경고한다', () => {
    const cases = [
      [{ bgColorKey: 'green', chipColorKey: 'red', boxColorKey: '' }, '배경색 그린 · 칩 색 레드 조합이'],
      [{ bgColorKey: 'green-deep', chipColorKey: 'red', boxColorKey: '' }, '배경색 짙은 그린 · 칩 색 레드 조합이'],
      [{ bgColorKey: '', chipColorKey: 'white', boxColorKey: 'yellow' }, '칩 색 화이트 · 박스 색 옐로 조합이'],
      [{ bgColorKey: 'pink', chipColorKey: 'purple', boxColorKey: '' }, '배경색 핑크 · 칩 색 퍼플 조합이'],
    ] as const
    for (const [colors, head] of cases) {
      const warnings = feedColorWarnings(colors, show)
      expect(warnings, head).toHaveLength(1)
      expect(warnings[0]).toContain(`${head} 색 규칙에 걸려요`)
      expect(warnings[0]).toContain('함께 쓰지 않기로 한 색 조합이에요')
      expect(warnings[0]).toContain('저장은 되지만')
    }
    // 반대 방향은 막지 않는다
    expect(feedColorWarnings({ bgColorKey: 'yellow', chipColorKey: '', boxColorKey: 'white' }, show)).toEqual([])
    expect(feedColorWarnings({ bgColorKey: '', chipColorKey: 'yellow', boxColorKey: 'white' }, show)).toEqual([])
  })

  it('바탕과 박스가 같은 색이면 경고한다', () => {
    const warnings = feedColorWarnings({ bgColorKey: 'sky', chipColorKey: '', boxColorKey: 'sky' }, show)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('배경색 스카이 · 박스 색 스카이 조합이 색 규칙에 걸려요')
  })

  it('글자가 들어가는 박스에 짙은 초록 박스를 고르면 경고하고, 그림만 담는 박스에는 경고하지 않는다', () => {
    const colors = { bgColorKey: 'yellow', chipColorKey: '', boxColorKey: 'green-deep' } as const
    for (const feedType of ['text_box', 'drop_pickup', 'gallery_list'] as const) {
      const warnings = feedColorWarnings({ ...colors, feedType }, show)
      expect(warnings, feedType).toHaveLength(1)
      expect(warnings[0]).toContain('박스 색 짙은 그린이 색 규칙에 걸려요')
      expect(warnings[0]).toContain('글자가 들어가는 박스에는 맞지 않아요')
    }
    expect(feedColorWarnings({ ...colors, feedType: 'hero_box' }, show)).toEqual([])
    expect(feedColorWarnings({ ...colors, feedType: 'hero_box', boxKind: 'text' }, show)).toHaveLength(1)
    expect(feedColorWarnings({ ...colors, feedType: 'text_box', boxColorKey: 'pink' }, show)).toEqual([])
  })

  it('섹션이 경고를 보이고 저장을 막는 오류 문구는 아니다', () => {
    const html = render({ feedType: 'hero_box', bgColorKey: 'green', chipColorKey: 'red' })
    expect(html).toContain('data-testid="feed-color-warnings"')
    expect(html).toContain('함께 쓰지 않기로 한 색 조합이에요')
    expect(render({ feedType: 'hero_box', bgColorKey: 'yellow', chipColorKey: 'red' })).not.toContain('feed-color-warnings')
    expect(render({ feedType: 'text_box', boxColorKey: 'green-deep' })).toContain('글자가 들어가는 박스에는 맞지 않아요')
  })

  describe('덮어쓴 팔레트 (티켓 20261121_2145) — 색 조합 경고는 키 기반이라 hex를 읽지 않고 이미지 경고만 읽는다', () => {
    const overridden = { ...DEFAULT_FEED_PALETTE, red: DEFAULT_FEED_PALETTE.pink }

    it('palette를 줘도 키 기반 색 조합 경고는 그대로다', () => {
      const colors = { bgColorKey: 'yellow', chipColorKey: 'pink', boxColorKey: '' } as const
      expect(feedColorWarnings(colors, show, [], undefined, overridden)).toEqual([])
      expect(feedColorWarnings({ ...colors, bgColorKey: 'green', chipColorKey: 'red' }, show, [], undefined, overridden)).toHaveLength(1)
    })

    it('이미지 색 경고도 덮어쓴 hex로 판정한다', () => {
      const image = { imageHexes: [DEFAULT_FEED_PALETTE.blue], chipOnImage: false }
      const only = { bgColorKey: 'green', chipColorKey: '', boxColorKey: '' } as const
      expect(feedColorWarnings(only, show, [], image)).toEqual([])
      const warnings = feedColorWarnings(only, show, [], image, { ...DEFAULT_FEED_PALETTE, green: DEFAULT_FEED_PALETTE.blue })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    })
  })
})

describe('이미지 대표 색 규칙 경고 — 직접 고른 색만, 대표 색을 아는 경우만 (티켓 20261121_1829)', () => {
  const show = { chip: true, box: true }
  // red(#FF1D1D)와 같은 색상·밝기라 걸리고, blue(#0695EC)는 색상이 달라 통과한다.
  const redImage = { imageHexes: ['#FF1D1D'], chipOnImage: true }
  const none = { bgColorKey: '', chipColorKey: '', boxColorKey: '' } as const

  it('직접 고른 배경색이 이미지 대표 색과 겹치면 경고한다(이유 문구는 COLOR_RULE_REASON.image)', () => {
    const warnings = feedColorWarnings({ ...none, bgColorKey: 'red' }, show, [], redImage)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('배경색(레드)이 색 규칙에 걸려요')
    expect(warnings[0]).toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    expect(warnings[0]).toContain('저장은 되지만')
  })

  it('겹치지 않는 색은 경고가 없다', () => {
    expect(feedColorWarnings({ ...none, bgColorKey: 'blue' }, show, [], redImage)).toEqual([])
    expect(feedColorWarnings({ ...none, chipColorKey: 'blue' }, show, [], redImage)).toEqual([])
  })

  it('«자동»으로 둔 칸은 검사하지 않는다', () => {
    expect(feedColorWarnings(none, show, [], redImage)).toEqual([])
  })

  it('칩 색은 칩이 이미지 위에 걸치는 유형(chipOnImage)일 때만 본다', () => {
    const colors = { ...none, chipColorKey: 'red' } as const
    expect(feedColorWarnings(colors, show, [], redImage)[0]).toContain('칩 색(레드)이 색 규칙에 걸려요')
    expect(feedColorWarnings(colors, show, [], { ...redImage, chipOnImage: false })).toEqual([])
    expect(feedColorWarnings(colors, { chip: false, box: true }, [], redImage)).toEqual([])
  })

  it('배경색은 chipOnImage와 상관없이 본다', () => {
    expect(feedColorWarnings({ ...none, bgColorKey: 'red' }, show, [], { ...redImage, chipOnImage: false })).toHaveLength(1)
  })

  it('이미지 대표 색을 모르면(없음·빈 목록) 경고하지 않는다', () => {
    const colors = { ...none, bgColorKey: 'red', chipColorKey: 'red' } as const
    expect(feedColorWarnings({ ...colors, chipColorKey: '' }, show)).toEqual([])
    expect(feedColorWarnings({ ...colors, chipColorKey: '' }, show, [], { imageHexes: [], chipOnImage: false })).toEqual([])
  })

  it('색 쌍 규칙 경고와 함께 나온다', () => {
    const warnings = feedColorWarnings({ ...none, bgColorKey: 'red', chipColorKey: 'red' }, show, [], redImage)
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('두 색이 같아서 구분이 안 돼요')
  })

  describe('섹션', () => {
    it('커버 색을 아는 히어로 카드에서 직접 고른 배경색이 겹치면 경고가 보인다', () => {
      const html = render({ feedType: 'hero_box', bgColorKey: 'red' }, { coverColors: ['#FF1D1D'] })
      expect(html).toContain('data-testid="feed-color-warnings"')
      expect(html).toContain('이미지의 대표 색과 너무 비슷해서 묻혀요')
    })

    it('커버 색이 없거나 읽을 수 없으면 경고가 없다', () => {
      expect(render({ feedType: 'hero_box', bgColorKey: 'red' })).not.toContain('feed-color-warnings')
      expect(render({ feedType: 'hero_box', bgColorKey: 'red' }, { coverColors: null })).not.toContain('feed-color-warnings')
      expect(render({ feedType: 'hero_box', bgColorKey: 'red' }, { coverColors: [] })).not.toContain('feed-color-warnings')
    })

    it('커버 색 규칙을 쓰지 않는 유형(전체 배경 이미지·글자 박스)은 대표 색이 있어도 경고가 없다', () => {
      expect(render({ feedType: 'full_image', bgColorKey: 'red' }, { coverColors: ['#FF1D1D'] })).not.toContain('feed-color-warnings')
      expect(render({ feedType: 'text_box', boxKind: 'text', bgColorKey: 'red' }, { coverColors: ['#FF1D1D'] })).not.toContain(
        'feed-color-warnings',
      )
    })

    it('텍스트 박스의 이미지 마스크는 커버 색 규칙을 쓴다', () => {
      const html = render({ feedType: 'text_box', boxKind: 'image_mask', bgColorKey: 'red' }, { coverColors: ['#FF1D1D'] })
      expect(html).toContain('feed-color-warnings')
    })

    it('배지 소개는 첫 배지의 색을 쓰고, 칩 색은 이미지 규칙으로 보지 않는다', () => {
      const html = render({ feedType: 'badge_intro', bgColorKey: 'red', chipColorKey: 'red' }, { badgeColors: [['#FF1D1D'], ['#0695EC']] })
      expect(html).toContain('배경색(레드)')
      expect(html).not.toContain('칩 색(레드)이 색 규칙에 걸려요. 이미지의')
      // 첫 배지의 색을 모르면(undefined) 두 번째 배지로 건너뛰지 않고 경고하지 않는다.
      expect(render({ feedType: 'badge_intro', bgColorKey: 'red' }, { badgeColors: [undefined, ['#FF1D1D']] })).not.toContain(
        'feed-color-warnings',
      )
    })

    it('커버 색이 저장 전이면 커버 색 규칙 유형에서만 안내 한 줄을 보인다', () => {
      const note = 'data-testid="feed-cover-colors-notice"'
      expect(render({ feedType: 'hero_box' }, { coverColorsPending: true })).toContain(note)
      expect(render({ feedType: 'hero_box' }, { coverColorsPending: true })).toContain('커버 이미지를 저장하면 색이 겹치는지 알려 드려요')
      expect(render({ feedType: 'hero_box' })).not.toContain(note)
      expect(render({ feedType: 'badge_intro' }, { coverColorsPending: true })).not.toContain(note)
      expect(render({ feedType: 'text_box', boxKind: 'text' }, { coverColorsPending: true })).not.toContain(note)
    })
  })
})

describe('제목 속 칩 낱말 — 제목에 없으면 오류', () => {
  it('제목에 그대로 들어 있으면 오류가 없고, 없거나 비어 있으면 낱말만 오류다', () => {
    expect(titleChipWordError('성수동', '핫한 성수동 배지')).toBeNull()
    expect(titleChipWordError('  ', '핫한 성수동 배지')).toBeNull()
    expect(titleChipWordError('', '핫한 성수동 배지')).toBeNull()
    expect(titleChipWordError('문경', '핫한 성수동 배지')).toBe(
      '제목에 「문경」가 그대로 들어 있지 않아요. 제목 속 낱말만 칩으로 만들 수 있으니 제목이나 낱말을 고쳐 주세요.',
    )
  })

  it('섹션은 제목에 없는 낱말 입력 아래에 오류 문구를 붙이고 입력을 오류 상태로 표시한다', () => {
    const html = render({ feedType: 'hero_box', titleChipWords: ['성수동', '문경'] })
    expect(html).toContain('제목에 「문경」가 그대로 들어 있지 않아요')
    expect(html).not.toContain('제목에 「성수동」가')
    expect(html).toContain('id="feed-card-title-chip-word-2-error"')
    expect(html).not.toContain('id="feed-card-title-chip-word-1-error"')
    expect(html).toContain('aria-invalid="true"')
  })

  it('낱말을 모두 지우면 오류가 없다', () => {
    const html = render({ feedType: 'hero_box', titleChipWords: ['', ''] })
    expect(html).not.toContain('그대로 들어 있지 않아요')
    expect(html).not.toContain('aria-invalid="true"')
  })
})

describe('FeedCardSection — 한국어 줄바꿈', () => {
  it('새로 만든 안내 문구에 break-keep과 wrap-break-word가 붙는다', () => {
    const html = render({ feedType: 'hero_box', bgColorKey: 'red', chipColorKey: 'red', titleChipWords: ['문경'] })
    expect(html).toContain('break-keep wrap-break-word')
  })
})

describe('typeChangePatch — 유형을 바꿀 때 막힌 칸의 값을 정리한다', () => {
  const stampOn: FeedCardFormValues = { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'hero_box', stampMode: 'on', stampSlot: 'image-top-right' }

  it('도장을 둘 수 있는 자리가 없는 유형으로 바꾸면 도장 «사용»을 «자동»으로 되돌리고 자리도 비운다', () => {
    const noStampType = FEED_TYPES.find((type) => feedFieldVisibility(type).stampSlots.length === 0)
    expect(noStampType).toBeDefined()
    const patch = typeChangePatch(stampOn, noStampType as string)
    expect(patch).toMatchObject({ feedType: noStampType, stampMode: 'auto', stampSlot: '' })
  })

  it('새 유형이 허용하는 자리면 도장 값을 그대로 둔다', () => {
    const slot = feedFieldVisibility('hero_box').stampSlots[0]
    const patch = typeChangePatch({ ...stampOn, stampSlot: slot }, 'hero_box')
    expect(patch).toEqual({ feedType: 'hero_box' })
  })
})

describe('feedTypeValueNote — 값이 없으면 텍스트 박스로 보이는 유형의 안내', () => {
  it('컬렉션 소개·드랍·픽업·목록형에만 안내가 있고 이유를 알려 준다', () => {
    expect(feedTypeValueNote('collection_intro')).toContain('대표 그림')
    expect(feedTypeValueNote('drop_pickup')).toContain('배지')
    expect(feedTypeValueNote('gallery_list')).toContain('항목')
    for (const type of ['hero_box', 'text_box', 'badge_intro', 'badge_only', 'full_image'] as const) {
      expect(feedTypeValueNote(type)).toBeNull()
    }
    expect(feedTypeValueNote(null)).toBeNull()
  })

  it('안내는 해요체이고 마침표로 끝나는 문장이며 유형을 고르면 섹션에 보인다', () => {
    for (const type of ['collection_intro', 'drop_pickup', 'gallery_list'] as const) {
      const note = feedTypeValueNote(type) as string
      expect(note.endsWith('요.')).toBe(true)
      const html = renderToStaticMarkup(
        <FeedCardSection {...({ values: { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: type }, onChange: () => {}, title: '제목' } as ComponentProps<typeof FeedCardSection>)} />,
      )
      expect(html).toContain(note)
      expect(note).toContain('텍스트 박스로 보여요')
      expect(note).not.toContain('옛 모양')
    }
  })

  it('안내가 없는 유형이나 유형을 비운 상태에서는 안내 문단이 없다', () => {
    const html = renderToStaticMarkup(
      <FeedCardSection {...({ values: { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'hero_box' }, onChange: () => {}, title: '제목' } as ComponentProps<typeof FeedCardSection>)} />,
    )
    expect(html).not.toContain('새 모습으로 보여요')
  })
})
