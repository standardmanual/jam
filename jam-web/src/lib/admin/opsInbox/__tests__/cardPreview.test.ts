import { describe, it, expect } from 'vitest'
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { PREVIEW_NAME_UNKNOWN, type OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'
import { FEED_PREVIEW_SEED } from '@/lib/today/feedPreviewSeed'
import {
  PREVIEW_FEED_SEED,
  PREVIEW_TITLE_PLACEHOLDER,
  bundleBadgeNamesOf,
  itemToPreviewCard,
  linkedMissionOf,
  previewFeedTypeOf,
  previewOf,
  previewViewOf,
  type PreviewItem,
} from '@/lib/admin/opsInbox/cardPreview'

const NOW = new Date('2026-10-06T00:00:00.000Z')

function card(original: Record<string, unknown>, edited: Record<string, unknown> | null = null, kind: string | null = 'home_feed_card'): PreviewItem {
  return { id: 'item-1', kind, original: original as never, edited: edited as never }
}

const FULL = {
  shape: 'hero',
  starts_at: '2026-10-07T00:00:00.000Z',
  ends_at: '2026-10-08T00:00:00.000Z',
  exposure_tags: ['all'],
  copy: { title: '우산 챙겨 달리기', subtitle: '비 오는 날' },
  colors: { background: '#1a2b3c' },
  resource: { template_type: 'editorial_article', cover_image_url: 'https://example.com/a.png', mission_id: 'm-1', badge_ids: ['b-1'] },
}

describe('applyDraftToItem', () => {
  it('문안·색을 키 단위로 덮고 입력 항목은 바꾸지 않는다', () => {
    const item = card(FULL)
    const next = applyDraftToItem(item, { 'copy.title': '새 제목', 'colors.background': '#ffffff' })
    expect(next.edited).toEqual({ copy: { title: '새 제목', subtitle: '비 오는 날' }, colors: { background: '#ffffff' } })
    expect(item.edited).toBeNull()
  })

  it('시각은 비어 있지 않은 값만 덮고 글자가 아닌 값·모르는 경로는 무시한다', () => {
    const next = applyDraftToItem(card(FULL), { starts_at: '2026-10-09T00:00:00.000Z', ends_at: '', 'copy.title': 3, user_experience: 'x' })
    expect(next.edited).toEqual({ starts_at: '2026-10-09T00:00:00.000Z' })
  })

  it('덮을 값이 없으면 수정본을 만들지 않는다', () => {
    expect(applyDraftToItem(card(FULL), {}).edited).toBeNull()
  })
})

describe('itemToPreviewCard', () => {
  it('카드 칸을 읽어 표시용 카드 행을 만든다(연결된 미션·배지는 읽지 않는다)', () => {
    const row = itemToPreviewCard(card(FULL), undefined, { now: NOW })!
    expect(row.title).toBe('우산 챙겨 달리기')
    expect(row.subtitle).toBe('비 오는 날')
    expect(row.cover_image_url).toBe('https://example.com/a.png')
    expect(row.shape).toBe('hero')
    expect(row.exposure_tags).toEqual(['all'])
    expect(row.mission_id).toBeNull()
    expect(row.badge_ids).toEqual([])
    expect(row.starts_at).toBe('2026-10-07T00:00:00.000Z')
  })

  it('초안이 문안을 덮는다', () => {
    expect(itemToPreviewCard(card(FULL), { 'copy.title': '바뀐 제목' }, { now: NOW })!.title).toBe('바뀐 제목')
  })

  it('copy에 없으면 resource의 글자 칸을 읽는다', () => {
    const row = itemToPreviewCard(card({ resource: { title: '자원 제목' } }), undefined, { now: NOW })!
    expect(row.title).toBe('자원 제목')
  })

  it('제목이 비면 「(제목 미입력)」, 없는 칸은 비우고 읽을 수 없는 시각은 기준 시각이다', () => {
    const row = itemToPreviewCard(card({}), { 'copy.title': '  ' }, { now: NOW })!
    expect(row.title).toBe(PREVIEW_TITLE_PLACEHOLDER)
    expect(row.subtitle).toBeNull()
    expect(row.shape).toBeNull()
    expect(row.exposure_tags).toEqual([])
    expect(row.starts_at).toBe(NOW.toISOString())
  })

  it('모양이 「모름」이어도 던지지 않고 유형은 텍스트 박스다(옛 7모양 갈래는 지웠다, 티켓 20261122_1101)', () => {
    const view = previewViewOf(card({ shape: '이상한값', copy: { title: 'a' } }), undefined, { now: NOW })!
    expect(view.feedType).toBe('text_box')
  })

  it('카드가 아닌 종류는 null이다', () => {
    expect(itemToPreviewCard(card(FULL, null, 'mission'), undefined, { now: NOW })).toBeNull()
    expect(previewViewOf(card(FULL, null, null), undefined, { now: NOW })).toBeNull()
  })
})

describe('previewViewOf', () => {
  it('표시 데이터에 계측 정보가 없다', () => {
    const view = previewViewOf(card(FULL), undefined, { now: NOW })!
    expect(view.title).toBe('우산 챙겨 달리기')
    expect(view.feedType).toBe('text_box')
    expect(view.tracking).toBeUndefined()
  })
})

describe('previewOf', () => {
  const badge = {
    starts_at: '2026-10-07T00:00:00.000Z',
    ends_at: '2026-10-09T00:00:00.000Z',
    copy: { name: '비 맞은 러너', description: '비 오는 날 달렸어요' },
    resource: { rarity: 'rare', level: 2, point_reward: 50, image_url: 'https://example.com/b.png' },
  }

  it('카드는 기존 표시 데이터를 그대로 돌려준다', () => {
    expect(previewOf(card(FULL), undefined, { now: NOW })?.type).toBe('card')
  })

  it('배지는 이름·등급·레벨·보상·이미지·기간을 읽는다', () => {
    expect(previewOf(card(badge, null, 'jam_badge'))).toMatchObject({
      type: 'badge',
      name: '비 맞은 러너',
      rarity: 'rare',
      level: 2,
      pointReward: 50,
      imageUrl: 'https://example.com/b.png',
      startsAt: '2026-10-07T00:00:00.000Z',
    })
  })

  it('초안이 수정본·원본을 덮고 형식이 틀린 값은 비운다', () => {
    const edited = { copy: { name: '수정본 이름' }, resource: { rarity: '전설' } }
    expect(previewOf(card(badge, edited, 'jam_badge'), { 'copy.name': '초안 이름' })).toMatchObject({
      type: 'badge',
      name: '초안 이름',
      rarity: null,
    })
  })

  it('컬렉션·미션은 종류별 칸을 읽고 제목이 비면 자리표시를 쓴다', () => {
    expect(
      previewOf(card({ copy: { name: '비 컬렉션', story_text: '이야기' }, resource: { reward_points: 100 } }, null, 'collection_launch'))
    ).toMatchObject({ type: 'collection', name: '비 컬렉션', storyText: '이야기', rewardPoints: 100 })
    expect(previewOf(card({ copy: { condition_text: '3회 달리기' } }, null, 'mission'))).toMatchObject({
      type: 'mission',
      title: PREVIEW_TITLE_PLACEHOLDER,
      conditionText: '3회 달리기',
    })
  })

  it('알 수 없는 종류는 null이다', () => {
    expect(previewOf(card(badge, null, 'unknown_kind'))).toBeNull()
    expect(previewOf(card(badge, null, null))).toBeNull()
  })
})

const B1 = '11111111-1111-4111-8111-111111111111'
const B2 = '22222222-2222-4222-8222-222222222222'
const B3 = '33333333-3333-4333-8333-333333333333'
const NAMES: OpsPreviewNames = {
  badges: {
    [B1]: { id: B1, name: '비 맞은 러너', imageUrl: 'https://example.com/b1.png', rarity: 'rare' },
    [B2]: { id: B2, name: '우산 수집가', imageUrl: null, rarity: null },
  },
  pois: { 'p-1': '한강공원', 'p-2': '서울숲' },
  collections: { 'c-1': '비 컬렉션' },
  categories: { cafe: '카페' },
}

describe('previewOf — 레시피 (티켓 20261007_1401)', () => {
  const recipe = {
    starts_at: '2026-10-10T00:00:00.000Z',
    ends_at: '2026-10-20T00:00:00.000Z',
    copy: { name: '비 오는 날 레시피' },
    resource: {
      slots: [
        { badge_type: 'item', allowed_badge_ids: [B1, B2] },
        { badge_type: 'activity', allowed_badge_ids: [B3] },
      ],
      reward_points: 30,
      reward_badge_ids: [B1],
    },
  }

  it('이름·슬롯·후보·보상·기간을 읽고 이름 맵으로 배지 이름을 채운다', () => {
    const view = previewOf(card(recipe, null, 'recipe'), undefined, { names: NAMES })
    expect(view).toMatchObject({
      type: 'recipe',
      name: '비 오는 날 레시피',
      rewardPoints: 30,
      startsAt: '2026-10-10T00:00:00.000Z',
      endsAt: '2026-10-20T00:00:00.000Z',
    })
    if (view?.type !== 'recipe') throw new Error('레시피가 아니에요')
    expect(view.slots.map((slot) => [slot.typeLabel, slot.candidates.map((b) => b.name)])).toEqual([
      ['아이템', ['비 맞은 러너', '우산 수집가']],
      ['액티비티', [PREVIEW_NAME_UNKNOWN]],
    ])
    expect(view.rewardBadges).toEqual([NAMES.badges[B1]])
  })

  it('이름 맵이 없으면 폴백 문구, 이름이 비면 자리표시, 같은 묶음의 배지 이름을 싣는다', () => {
    const view = previewOf(card({ resource: recipe.resource }, null, 'recipe'), undefined, { bundleBadgeNames: ['새 배지'] })
    if (view?.type !== 'recipe') throw new Error('레시피가 아니에요')
    expect(view.name).toBe(PREVIEW_TITLE_PLACEHOLDER)
    expect(view.rewardBadges.map((b) => b.name)).toEqual([PREVIEW_NAME_UNKNOWN])
    expect(view.bundleBadgeNames).toEqual(['새 배지'])
  })

  it('초안으로 바뀐 ID가 맵에 없으면 폴백이고 슬롯이 없어도 죽지 않는다', () => {
    const view = previewOf(card({ resource: {} }, null, 'recipe'), undefined, { names: NAMES })
    expect(view).toMatchObject({ type: 'recipe', slots: [], rewardBadges: [], rewardPoints: null })
  })
})

describe('previewOf — 드랍 (티켓 20261007_1401)', () => {
  it('장소 직접은 이름·장소당 개수, 배지는 이름 두 개와 외 N개로 요약한다', () => {
    const view = previewOf(
      card(
        { starts_at: '2026-10-10T00:00:00.000Z', copy: { title: '한강 드랍' }, resource: { poi_ids: ['p-1', 'p-2', 'p-3'], per_poi_count: 2, badge_ids: [B1, B2, B3] } },
        null,
        'drop_schedule'
      ),
      undefined,
      { names: NAMES }
    )
    expect(view).toEqual({
      type: 'drop',
      title: '한강 드랍',
      scheduledAtText: '2026.10.10 09:00',
      poiLine: '한강공원, 서울숲 외 1곳 × 장소당 2개',
      itemLine: '비 맞은 러너, 우산 수집가 외 1개',
    })
  })

  it('종류+개수는 종류 라벨(없으면 전체 종류)과 총 개수, 컬렉션은 「컬렉션 …」이다', () => {
    const byCategory = previewOf(
      card({ resource: { poi_category: 'cafe', total_count: 5, collection_ids: ['c-1', 'c-9'] } }, null, 'drop_schedule'),
      undefined,
      { names: NAMES }
    )
    expect(byCategory).toMatchObject({ poiLine: '카페 × 총 5개', itemLine: `컬렉션 비 컬렉션, ${PREVIEW_NAME_UNKNOWN}`, title: PREVIEW_TITLE_PLACEHOLDER, scheduledAtText: null })
    expect(previewOf(card({ resource: { total_count: 3 } }, null, 'drop_schedule'))).toMatchObject({ poiLine: '전체 종류 × 총 3개' })
  })
})

describe('bundleBadgeNamesOf', () => {
  it('이 레시피를 links로 가리키는 같은 묶음의 jam_badge 이름만 돌려준다', () => {
    const items = [
      { kind: 'jam_badge', itemKey: 'b-1', original: { links: ['recipe-1'], copy: { name: '첫 성공 배지' } } as never, edited: null },
      { kind: 'jam_badge', itemKey: 'b-2', original: { links: ['other'], copy: { name: '다른 배지' } } as never, edited: null },
      { kind: 'mission', itemKey: 'm-1', original: { links: ['recipe-1'] } as never, edited: null },
    ]
    expect(bundleBadgeNamesOf('recipe-1', items)).toEqual(['첫 성공 배지'])
    expect(bundleBadgeNamesOf(null, items)).toEqual([])
  })
})

describe('미션 소개 카드의 연결 미션 이미지 (티켓 20261120_1825)', () => {
  const card: PreviewItem = {
    kind: 'home_feed_card',
    original: { shape: 'square', links: ['m-1'], copy: { title: '카드' }, resource: { template_type: 'mission_spotlight' } } as never,
    edited: null,
  }
  const mission = (image: string | null): PreviewItem & { itemKey: string } => ({
    itemKey: 'm-1',
    kind: 'mission',
    original: { resource: image ? { image_url: image, reward_points: 100 } : { reward_points: 100 } } as never,
    edited: null,
  })

  it('연결 미션의 이미지를 커버로 쓰고 mission_id는 null로 둔다', () => {
    const linked = linkedMissionOf('c-1', card, [mission('https://x/m.png')])
    const row = itemToPreviewCard(card, undefined, { linkedMission: linked })
    expect(row?.mission_id).toBeNull()
    expect(previewViewOf(card, undefined, { linkedMission: linked })).toMatchObject({ imageUrl: 'https://x/m.png', titleInImage: false })
  })

  it('연결이 없거나 미션 이미지가 없으면 이미지 없는 그대로다', () => {
    expect(previewViewOf(card, undefined, { linkedMission: null })).toMatchObject({ imageUrl: null })
    expect(previewViewOf(card, undefined, { linkedMission: mission(null) })).toMatchObject({ imageUrl: null })
  })

  it('다른 템플릿 카드는 연결 미션이 있어도 영향받지 않는다', () => {
    const other: PreviewItem = { ...card, original: { shape: 'square', resource: { template_type: 'editorial_article' } } as never }
    expect(previewViewOf(other, undefined, { linkedMission: mission('https://x/m.png') })).toMatchObject({ imageUrl: null })
  })

  it('linkedMissionOf: 카드의 links나 미션의 links 어느 쪽이든 찾고 없으면 null이다', () => {
    expect(linkedMissionOf('c-1', card, [mission('https://x/m.png')])?.kind).toBe('mission')
    const noLinks: PreviewItem = { ...card, original: { resource: {} } as never }
    expect(linkedMissionOf('c-1', noLinks, [mission('https://x/m.png')])).toBeNull()
    const reverse = { ...mission('https://x/m.png'), original: { links: ['c-1'], resource: {} } as never }
    expect(linkedMissionOf('c-1', noLinks, [reverse])?.kind).toBe('mission')
    expect(linkedMissionOf('c-1', card, [{ ...mission(null), kind: 'jam_badge' }])).toBeNull()
  })
})

// ── 개편 칸 읽기 (티켓 20261121_1532, 상위 20261120_2026 6회차-3) ──────────

describe('itemToPreviewCard — 개편 칸', () => {
  const NEW_KEYS = [
    'feed_type',
    'box_shape',
    'box_kind',
    'bg_color_key',
    'chip_color_key',
    'box_color_key',
    'chips',
    'title_chip_words',
    'show_description',
    'stamp_enabled',
    'stamp_slot',
    'list_items',
    'list_more_href',
    'collection_burst',
    'feed_seed',
  ]
  const feedCard = (resource: Record<string, unknown>, title = '우산 챙겨 달리기'): PreviewItem =>
    card({
      starts_at: '2026-10-07T00:00:00.000Z',
      ends_at: '2026-10-08T00:00:00.000Z',
      copy: { title, description: '비 오는 날의 달리기' },
      resource: { template_type: 'editorial_article', cover_image_url: 'https://example.com/a.png', ...resource },
    })

  it('feed_type이 없으면 새 칸 키가 하나도 없다(옛 항목 결과 그대로)', () => {
    const row = itemToPreviewCard(card(FULL), undefined, { now: NOW })!
    for (const key of NEW_KEYS) expect(key in row).toBe(false)
    const withoutType = itemToPreviewCard(feedCard({ bg_color_key: 'red' }), undefined, { now: NOW })!
    for (const key of NEW_KEYS) expect(key in withoutType).toBe(false)
    const emptyType = itemToPreviewCard(feedCard({ feed_type: '  ', bg_color_key: 'red' }), undefined, { now: NOW })!
    for (const key of NEW_KEYS) expect(key in emptyType).toBe(false)
  })

  it('모르는 feed_type이면 새 칸을 하나도 싣지 않는다', () => {
    const row = itemToPreviewCard(feedCard({ feed_type: 'banner_box', bg_color_key: 'red' }), undefined, { now: NOW })!
    for (const key of NEW_KEYS) expect(key in row).toBe(false)
  })

  it('새 칸을 행의 같은 이름 칸에 싣고 고정 시드를 쓴다', () => {
    const row = itemToPreviewCard(
      feedCard({
        feed_type: 'hero_box',
        box_shape: 'wave',
        bg_color_key: 'red',
        chip_color_key: 'yellow',
        box_color_key: 'blue',
        chips: [{ kind: 'phrase', text: '이번 주', slot: 'image-top-left', tilt: -8 }],
        title_chip_words: ['달리기'],
        show_description: true,
      }),
      undefined,
      { now: NOW },
    )!
    expect(row.feed_type).toBe('hero_box')
    expect(row.bg_color_key).toBe('red')
    expect(row.chip_color_key).toBe('yellow')
    expect(row.box_color_key).toBe('blue')
    expect(row.chips).toEqual([{ kind: 'phrase', text: '이번 주', slot: 'image-top-left', tilt: -8 }])
    expect(row.title_chip_words).toEqual(['달리기'])
    expect(row.show_description).toBe(true)
    expect(row.feed_seed).toBe(PREVIEW_FEED_SEED)
    expect(row.stamp_enabled).toBeNull()
  })

  it('고정 시드는 폼 미리보기(5회차-4)와 같은 상수 하나를 가져온다', () => {
    expect(PREVIEW_FEED_SEED).toBe(FEED_PREVIEW_SEED)
  })

  it('허용 값이 아닌 칸은 싣지 않고 나머지는 그린다', () => {
    const row = itemToPreviewCard(feedCard({ feed_type: 'hero_box', bg_color_key: 'magenta', chip_color_key: 'yellow' }), undefined, { now: NOW })!
    expect(row.feed_type).toBe('hero_box')
    expect(row.bg_color_key).toBeNull()
    expect(row.chip_color_key).toBe('yellow')
  })

  it('모양이 틀린 값(칩이 배열이 아님·원소가 null)도 던지지 않고 그 칸만 뺀다', () => {
    const notArray = itemToPreviewCard(feedCard({ feed_type: 'hero_box', chips: 'x', box_shape: 'wave' }), undefined, { now: NOW })!
    expect(notArray.chips).toBeNull()
    expect(notArray.box_shape).toBe('wave')
    const nullItem = itemToPreviewCard(feedCard({ feed_type: 'hero_box', chips: [null] }), undefined, { now: NOW })!
    expect(nullItem.chips).toBeNull()
  })

  it('제목에 없는 제목 속 칩 낱말은 싣지 않는다', () => {
    const row = itemToPreviewCard(feedCard({ feed_type: 'hero_box', title_chip_words: ['없는낱말'] }), undefined, { now: NOW })!
    expect(row.title_chip_words).toBeNull()
  })

  it('같은 항목은 언제 열어도 같은 결과다', () => {
    const item = feedCard({ feed_type: 'text_box', bg_color_key: 'green' })
    const a = itemToPreviewCard(item, undefined, { now: NOW })
    const b = itemToPreviewCard(item, undefined, { now: new Date('2026-11-01T00:00:00.000Z') })
    expect({ ...a, created_at: '' }).toEqual({ ...b, created_at: '' })
  })

  it('초안으로 바꾼 제목이 제목 속 칩 낱말 검사에 바로 반영된다', () => {
    const item = feedCard({ feed_type: 'hero_box', title_chip_words: ['달리기'] })
    expect(itemToPreviewCard(item, { 'copy.title': '새 제목' }, { now: NOW })!.title_chip_words).toBeNull()
    expect(itemToPreviewCard(item, { 'copy.title': '비 오는 날 달리기' }, { now: NOW })!.title_chip_words).toEqual(['달리기'])
  })

  it('toCardView가 새 유형·색·칩·제목 칩을 그린다', () => {
    const view = previewViewOf(
      feedCard({
        feed_type: 'hero_box',
        bg_color_key: 'red',
        chip_color_key: 'yellow',
        box_color_key: 'blue',
        chips: [{ kind: 'phrase', text: '이번 주', slot: 'image-top-left', tilt: -8 }],
        title_chip_words: ['달리기'],
      }),
      undefined,
      { now: NOW },
    ) as { feedType?: string; look?: { colors: { bg: string; chip: string; box: string }; chips: { text: string }[]; titleChips: { words: string[] } } }
    expect(view.feedType).toBe('hero_box')
    expect(view.look?.colors).toEqual({ bg: 'red', chip: 'yellow', box: 'blue' })
    expect(view.look?.chips.map((chip) => chip.text)).toEqual(['이번 주'])
    expect(view.look?.titleChips.words).toEqual(['달리기'])
  })

  it('값이 없으면 텍스트 박스로 그린다(컬렉션 소개에 커버가 없음)', () => {
    const view = previewViewOf(feedCard({ feed_type: 'collection_intro', cover_image_url: '' }), undefined, { now: NOW }) as { feedType?: string }
    expect(view.feedType).toBe('text_box')
  })

  it('previewFeedTypeOf: 새 유형만 유형을 돌려주고 옛 항목·다른 종류는 null이다', () => {
    expect(previewFeedTypeOf(feedCard({ feed_type: 'gallery_list' }))).toBe('gallery_list')
    expect(previewFeedTypeOf(card(FULL))).toBeNull()
    expect(previewFeedTypeOf(feedCard({ feed_type: 'nope' }))).toBeNull()
    expect(previewFeedTypeOf(card(FULL, null, 'mission'))).toBeNull()
  })
})
