import { describe, it, expect } from 'vitest'
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { PREVIEW_NAME_UNKNOWN, type OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'
import { PREVIEW_TITLE_PLACEHOLDER, bundleBadgeNamesOf, itemToPreviewCard, previewOf, previewViewOf, type PreviewItem } from '@/lib/admin/opsInbox/cardPreview'

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

  it('모양이 「모름」이면 shape를 비워 resolveShape에 맡긴다', () => {
    const view = previewViewOf(card({ shape: '이상한값', copy: { title: 'a' } }), undefined, { now: NOW })!
    expect(['hero', 'poster', 'square', 'brief', 'list']).toContain(view.shape)
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
    expect(view.shape).toBe('hero')
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
  it('지점 직접은 이름·지점당 개수, 배지는 이름 두 개와 외 N개로 요약한다', () => {
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
      poiLine: '한강공원, 서울숲 외 1곳 × 지점당 2개',
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
