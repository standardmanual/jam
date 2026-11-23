/**
 * 칩 입력 칸 (티켓 20261121_1317, 상위 20261120_2026 5회차-3)
 *
 * 확인하는 것: 모드별 마크업, 칩 2개일 때 두 번째 자리가 대각선 짝으로 고정, 문구 12자 경고, 유형별 허용 자리, 값 출처의 템플릿 필터, 저장 검증과 같은 문구.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)와 순수 함수로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/FeedChipsEditor.test.tsx
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

import FeedChipsEditor, {
  blankChip,
  chipSlotChoice,
  chipsModePatch,
  chipsWithPatch,
  chipsWithSlot,
  chipValidation,
  slotHelpOf,
  SLOT_HELP_AUTO,
  SLOT_HELP_DIRECT,
  SLOT_HELP_SECOND,
  VALUE_KIND_LABELS,
  valueChipResourcesOf,
  valueChipSourceOptions,
} from '../FeedChipsEditor'
import { typeChangePatch } from '../FeedCardSection'
import { EMPTY_FEED_CARD_FORM_VALUES, type FeedChipFormValue } from '@/lib/admin/feedCardFields'
import { FEED_CHIP_SLOT_SPECS, FEED_TYPES } from '@/lib/today/feedChipSlots'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))

const chip = (patch: Partial<FeedChipFormValue> = {}): FeedChipFormValue => ({ ...blankChip(), ...patch })

const render = (props: Partial<ComponentProps<typeof FeedChipsEditor>> = {}): string =>
  renderToStaticMarkup(<FeedChipsEditor feedType="hero_box" mode="auto" chips={[]} onChange={() => {}} {...props} />)

describe('FeedChipsEditor — 모드별 마크업', () => {
  it('«자동»이면 보조 문구만 있고 칩 입력 칸은 없다', () => {
    const html = render()
    expect(html).toContain('저장할 때 자동으로 정해져요')
    expect(html).toContain('칩 입력 방식')
    expect(html).not.toContain('1번째 칩')
    expect(html).not.toContain('칩 추가')
  })

  it('«칩 없음»이면 칩 입력 칸 없이 안내만 보인다', () => {
    const html = render({ mode: 'none' })
    expect(html).toContain('칩 없이 보여요')
    expect(html).not.toContain('1번째 칩')
  })

  it('«직접»이면 칩마다 종류·문구·자리·기울기 칸이 보이고 한국어 줄바꿈 클래스가 붙는다', () => {
    const html = render({ mode: 'custom', chips: [chip({ text: '신규' })] })
    for (const text of ['1번째 칩 종류', '1번째 칩 문구', '1번째 칩 자리', '1번째 칩 기울기', '칩 추가']) expect(html, text).toContain(text)
    expect(html).toContain('id="feed-card-chip-1-slot"')
    expect(html).toContain('break-keep wrap-break-word')
  })

  it('종류가 «값»이면 출처 칸이, «구분»이면 문구·출처 칸이 모두 없다', () => {
    const value = render({ mode: 'custom', chips: [chip({ kind: 'value' })] })
    expect(value).toContain('id="feed-card-chip-1-source"')
    expect(value).not.toContain('id="feed-card-chip-1-text"')
    const label = render({ mode: 'custom', chips: [chip({ kind: 'label' })] })
    expect(label).not.toContain('id="feed-card-chip-1-source"')
    expect(label).not.toContain('id="feed-card-chip-1-text"')
  })

  it('칩이 2개이면 두 번째 칩에 «대각선 자리에 놓여요» 안내가 있고, 첫 칩 자리가 자동이면 안내가 바뀐다', () => {
    const html = render({ mode: 'custom', chips: [chip({ text: 'A', slot: 'image-top-left' }), chip({ text: 'B', slot: 'image-bottom-right' })] })
    expect(html).toContain('대각선 자리에 놓여요')
    expect(html).toContain(SLOT_HELP_SECOND)
    const waiting = render({ mode: 'custom', chips: [chip({ text: 'A' }), chip({ text: 'B' })] })
    expect(waiting).toContain('첫 번째 칩의 자리를 고르면 이 칩이 대각선 자리에 놓여요')
  })

  it('칩 수가 유형 한도에 닿으면 «칩 추가»가 비활성이다', () => {
    expect(render({ feedType: 'gallery_list', mode: 'custom', chips: [chip({ text: 'A' })] })).toMatch(/<button[^>]*disabled=""[^>]*>칩 추가/)
    expect(render({ feedType: 'hero_box', mode: 'custom', chips: [chip({ text: 'A' })] })).not.toMatch(/<button[^>]*disabled=""[^>]*>칩 추가/)
  })

  it('칩이 하나뿐이면 삭제 버튼이 비활성이고 버튼 이름에 순번이 있다', () => {
    const html = render({ mode: 'custom', chips: [chip({ text: 'A' })] })
    expect(html).toContain('aria-label="1번째 칩 삭제"')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="1번째 칩 삭제"|<button[^>]*aria-label="1번째 칩 삭제"[^>]*disabled=""/)
  })
})

describe('문구 12자 경고(막지 않는다)', () => {
  it('12자를 넘으면 칩 칸에 경고가 보이고 오류는 없다', () => {
    const long = '열세글자짜리문구입니다요오'
    expect([...long].length).toBe(13)
    const html = render({ mode: 'custom', chips: [chip({ text: long })] })
    expect(html).toContain('칩 글자는 12자 이내를 권해요. 지금 13자예요.')
    const validation = chipValidation('hero_box', 'custom', [chip({ text: long })])
    expect(validation.errors).toEqual([])
    expect(validation.warnings.join(' ')).toContain('13자로 길어요')
  })
  it('12자 이내면 경고가 없다', () => {
    const html = render({ mode: 'custom', chips: [chip({ text: '열두글자짜리문구입니다' })] })
    expect(html).not.toContain('지금')
    expect(html).toContain('12자 이내를 권해요')
  })
})

describe('자리 선택지 — 유형별 허용 자리와 대각선 짝', () => {
  it('칩이 하나이면 그 유형의 허용 자리 전부다', () => {
    for (const feedType of FEED_TYPES) {
      const choice = chipSlotChoice(feedType, [chip()], 0)
      expect(choice.options.map((o) => o.value), feedType).toEqual([...FEED_CHIP_SLOT_SPECS[feedType].slots])
      expect(choice.followsFirst).toBe(false)
    }
  })
  it('목록형은 오른쪽 위 하나뿐이고 전체 배경 이미지는 왼쪽 아래를 쓰지 않는다', () => {
    expect(chipSlotChoice('gallery_list', [chip()], 0).options.map((o) => o.value)).toEqual(['card-top-right'])
    expect(chipSlotChoice('full_image', [chip()], 0).options.map((o) => o.value)).not.toContain('image-bottom-left')
  })
  it('칩이 2개일 때 두 번째 칩의 선택지는 첫 칩의 대각선 짝 하나뿐이다', () => {
    const chips = [chip({ slot: 'image-top-right' }), chip()]
    const second = chipSlotChoice('hero_box', chips, 1)
    expect(second.options.map((o) => o.value)).toEqual(['image-bottom-left'])
    expect(second.followsFirst).toBe(true)
    expect(second.waitingForFirst).toBe(false)
    expect(second.options[0].label).toBe('이미지 왼쪽 아래')
    // 첫 칩은 여전히 네 자리 전부를 고를 수 있다
    expect(chipSlotChoice('hero_box', chips, 0).options).toHaveLength(4)
  })
  it('첫 칩 자리가 자동이면 두 번째 칩은 고를 자리가 없다', () => {
    const second = chipSlotChoice('hero_box', [chip(), chip()], 1)
    expect(second).toMatchObject({ options: [], followsFirst: true, waitingForFirst: true })
  })
  it('첫 칩 자리를 바꾸면 두 번째 칩 자리가 새 대각선 짝으로 따라간다', () => {
    const chips = [chip({ slot: 'image-top-left' }), chip({ slot: 'image-bottom-right' })]
    expect(chipsWithSlot('hero_box', chips, 0, 'image-top-right')[1].slot).toBe('image-bottom-left')
    expect(chipsWithSlot('hero_box', chips, 0, '')[1].slot).toBe('')
    // 두 번째 칩 쪽을 고쳐도 첫 칩은 건드리지 않는다
    expect(chipsWithSlot('hero_box', chips, 1, 'image-bottom-right')[0].slot).toBe('image-top-left')
  })
  it('대각선이 아닌 두 자리는 저장 검증과 같은 문구로 막힌다', () => {
    const bad = chipValidation('hero_box', 'custom', [chip({ text: 'A', slot: 'image-top-left' }), chip({ text: 'B', slot: 'image-top-right' })])
    expect(bad.errors).toContain('칩 두 개는 서로 대각선 자리에 둬야 해요. 한 칩의 자리를 맞은편 모서리로 바꿔 주세요.')
    const ok = chipValidation('hero_box', 'custom', [chip({ text: 'A', slot: 'image-top-left' }), chip({ text: 'B', slot: 'image-bottom-right' })])
    expect(ok.errors).toEqual([])
  })
})

describe('폼 상태 변경 함수', () => {
  it('«직접»으로 바꿨는데 칩이 없으면 빈 문구 칩 하나를 둔다', () => {
    expect(chipsModePatch('custom', [])).toEqual({ chipsMode: 'custom', chips: [blankChip()] })
    expect(chipsModePatch('auto', [chip({ text: 'A' })])).toEqual({ chipsMode: 'auto', chips: [chip({ text: 'A' })] })
  })
  it('종류를 바꾸면 맞지 않는 문구·출처 입력을 비운다', () => {
    const [changed] = chipsWithPatch([chip({ kind: 'phrase', text: '신규' })], 0, { kind: 'value' })
    expect(changed).toMatchObject({ kind: 'value', text: '' })
    const [back] = chipsWithPatch([chip({ kind: 'value', source: 'mission.remaining' })], 0, { kind: 'label' })
    expect(back).toMatchObject({ kind: 'label', source: '' })
  })
  it('유형을 바꾸면 새 유형이 못 쓰는 칩 자리를 자동으로 되돌리고 한도를 넘는 칩을 덜어낸다', () => {
    const base = { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'hero_box' as const, chipsMode: 'custom' as const }
    const slotPatch = typeChangePatch({ ...base, chips: [chip({ text: 'A', slot: 'image-top-left' })] }, 'badge_intro')
    expect(slotPatch.chips?.[0].slot).toBe('')
    const limitPatch = typeChangePatch({ ...base, chips: [chip({ text: 'A' }), chip({ text: 'B' })] }, 'gallery_list')
    expect(limitPatch.chips).toHaveLength(1)
    // 그대로 쓸 수 있으면 칩 값을 건드리지 않는다
    expect(typeChangePatch({ ...base, chips: [chip({ text: 'A', slot: 'image-top-left' })] }, 'hero_box').chips).toBeUndefined()
  })
  it('유형을 바꾸면 그 유형만 쓰는 목록 항목·컬렉션 모션 값을 비운다', () => {
    const base = { ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'gallery_list' as const }
    const list = { name: 'a', href: '/a', imageUrl: '' }
    expect(typeChangePatch({ ...base, listItems: [list], listMoreHref: '/x' }, 'hero_box')).toMatchObject({ listItems: [], listMoreHref: '' })
    expect(typeChangePatch({ ...base, listItems: [list] }, 'gallery_list').listItems).toBeUndefined()
    const burst = { x: '0.5', y: '0.5', tilt: '', size: '', delayMs: '' }
    expect(typeChangePatch({ ...base, feedType: 'collection_intro', collectionBurst: [burst] }, 'hero_box').collectionBurst).toEqual([])
    expect(typeChangePatch({ ...base, feedType: 'collection_intro', collectionBurst: [burst] }, 'collection_intro').collectionBurst).toBeUndefined()
  })
})

describe('값 칩 출처 — 카드 템플릿에 맞는 것만', () => {
  it('템플릿을 모르면 폼이 아는 자원 전부다', () => {
    expect(valueChipResourcesOf()).toEqual(['mission', 'activity_badge', 'collection', 'checkin'])
  })
  it('템플릿마다 자원이 좁혀진다', () => {
    expect(valueChipResourcesOf('mission_spotlight')).toEqual(['mission'])
    expect(valueChipResourcesOf('badge_spotlight')).toEqual(['activity_badge'])
    expect(valueChipResourcesOf('itembook_milestone')).toEqual(['collection'])
    expect(valueChipResourcesOf('location_trend')).toEqual(['checkin'])
    expect(valueChipResourcesOf('drop_alert')).toEqual([])
    expect(valueChipResourcesOf('editorial_article')).toEqual([])
  })
  it('출처 키는 홈이 읽는 이름(자원.종류)이다', () => {
    expect(valueChipSourceOptions('mission_spotlight').map((o) => o.value)).toEqual(['mission.remaining', 'mission.reward_points', 'mission.condition'])
    expect(valueChipSourceOptions('location_trend').map((o) => o.value)).toEqual(['checkin.required_badges', 'checkin.place_name'])
    expect(valueChipSourceOptions('drop_alert')).toEqual([])
  })
})

describe('값 칩 출처 선택지 — 분류 문구(영어) · 값 이름(한국어)', () => {
  it('자원마다 선택지가 «영어 분류 · 한국어 값 이름»이고 영어만 있거나 한국어만 있는 라벨이 없다', () => {
    const labelsOf = (resource: Parameters<typeof valueChipResourcesOf>[0]) => valueChipSourceOptions(resource).map((o) => o.label)
    expect(labelsOf('mission_spotlight')).toEqual(['MISSION · 남은 기간(N일 남음)', 'MISSION · 보상 포인트', 'MISSION · 미션 조건 값'])
    expect(labelsOf('badge_spotlight')).toEqual(['ACTIVITY · 달성 기준', 'ACTIVITY · 배지 레벨'])
    expect(labelsOf('itembook_milestone')).toEqual(['COLLECTION · 아이템 수'])
    expect(labelsOf('location_trend')).toEqual(['CHECK IN · 필요한 배지 수', 'CHECK IN · 장소 이름'])
    expect(labelsOf('drop_alert')).toEqual([])
    // 템플릿을 모르면 폼이 아는 자원 전부, 모든 라벨이 영어 대문자 + « · » + 한글 이름이다
    for (const label of labelsOf(undefined)) expect(label).toMatch(/^[A-Z ]+ · [가-힣]/)
  })

  it('값 이름 표는 명사형이고 해요체 서술문이 아니다', () => {
    for (const name of Object.values(VALUE_KIND_LABELS)) expect(name).not.toMatch(/(해요|이에요|예요|요)\.?$/)
  })
})

describe('자리·기울기 도움말 — 새 배치 규칙', () => {
  it('비워 두면 자동 안내, 직접 정한 값이 있으면 존중·물러서기 안내, 두 번째 칩이면 두 칩 안내다', () => {
    expect(slotHelpOf(chip(), false)).toBe(SLOT_HELP_AUTO)
    expect(slotHelpOf(chip({ slot: 'image-top-left' }), false)).toBe(SLOT_HELP_DIRECT)
    expect(slotHelpOf(chip({ tilt: '4' }), false)).toBe(SLOT_HELP_DIRECT)
    expect(slotHelpOf(chip(), true)).toBe(SLOT_HELP_SECOND)
    expect(slotHelpOf(chip({ slot: 'image-bottom-right' }), true)).toBe(SLOT_HELP_SECOND)
  })

  it('화면에 문구가 나오고 내부 용어(시드·물러서기 단계)는 나오지 않으며 «저장할 때 정해져요»는 자리 칸에 붙지 않는다', () => {
    const auto = render({ mode: 'custom', chips: [chip({ text: 'A' })] })
    expect(auto).toContain('자리와 기울기는 비워 두면 카드마다 자동으로 정해져요.')
    const direct = render({ mode: 'custom', chips: [chip({ text: 'A', slot: 'image-top-left' })] })
    expect(direct).toContain('직접 정한 값은 존중하지만, 앞 카드와 겹치면 자리 이동을 뺀 방식으로 조금 물러서요.')
    for (const html of [auto, direct]) {
      expect(html).not.toMatch(/시드|단계/)
      // 모드 줄의 «저장할 때 자동으로 정해져요»는 «자동» 모드 문구라 «직접»에서는 나오지 않는다
      expect(html).not.toContain('저장할 때 자동으로 정해져요')
    }
  })

  it('«자동» 모드나 모드 문구는 그대로다', () => {
    expect(render()).toContain('저장할 때 자동으로 정해져요')
  })
})
