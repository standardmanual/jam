/**
 * 컬렉션별 획득 경로 화면 (티켓 20261022_1136 2회) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양만 고정한다. 지키는 것:
 * - 컬렉션마다 이름과 막힘·열림·드랍 제외·전체 개수가 보이고, 막힘이 있는 첫 컬렉션은 펼쳐져 아이템 표가 보인다
 * - 아이템마다 열린 길의 이름(드랍·믹스·미션·동기화·캡슐·등급 올리기)과 닫힌 길의 사유가 한국어 문구로 보이고, 사유 상수(영문)가 그대로 새지 않는다
 * - 기간 한정 운영이 끝나 얻을 길이 없는 아이템이 «막힘»과 «컬렉션 기간이 끝났어요»로 보인다
 * - 잠긴 채 받는 아이템은 «잠긴 채 받고 잼으로 열어요»와 필요한 양(정했으면 «잼 N만큼», 아니면 «등급 기본값»)이 보이고, 열린 아이템은 이 문구가 없다
 * - 이름을 모르면 «이름을 모르는 …», 컬렉션이 없으면 빈 상태 문구
 * - 쪽이 둘 이상이면 이동 링크가 있고 탭 주소가 `?tab=paths`를 지킨다. 한국어 문구에는 줄바꿈 클래스(`break-keep`)가 붙는다
 * - 사유 문구는 모든 사유 상수에 있고 해요체다
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/balance/dashboard',
  useSearchParams: () => new URLSearchParams('tab=paths'),
}))

import { computeItemPaths } from '@/lib/admin/itemPaths/compute'
import { RARITY_LABEL } from '@/lib/rarity'
import { buildCollectionPathViews, pickCollectionPage, type CollectionPathView, type PathNames } from '@/lib/admin/itemPaths/pathView'
import {
  ITEM_PATH_REASONS,
  type ItemPathCollectionInput,
  type ItemPathItemInput,
  type ItemPathMissionInput,
} from '@/lib/admin/itemPaths/types'
import { BalanceDashboardTabs, dashboardTabHref } from '../BalanceDashboardTabs'
import {
  CollectionPaths,
  NO_COLLECTIONS_TEXT,
  NO_ITEMS_TEXT,
  NO_OPEN_PATH_TEXT,
  UNKNOWN_COLLECTION_NAME,
  UNKNOWN_ITEM_NAME,
} from '../CollectionPaths'
import { LOCKED_ON_RECEIVE_LABEL, PATH_LABELS, PATH_REASON_LABELS, STATUS_LABELS, lockLabel } from '../PathReasonLabels'

const NOW = new Date('2026-10-26T06:30:00.000Z') // 2026.10.26 15:30 KST
const PAST = '2026-09-01T00:00:00.000Z'

const collection = (over: Partial<ItemPathCollectionInput> = {}): ItemPathCollectionInput => ({
  id: 'c1',
  tribe_id: 't1',
  is_active: true,
  valid_from: null,
  valid_until: null,
  drop_excluded: false,
  ...over,
})

const item = (over: Partial<ItemPathItemInput> = {}): ItemPathItemInput => ({
  id: 'i1',
  item_book_id: 'c1',
  deleted_at: null,
  drop_excluded: false,
  valid_from: null,
  valid_until: null,
  rarity: 'common',
  always_locked: false,
  unlock_required: null,
  ...over,
})

const mission = (rewardIds: string[]): ItemPathMissionInput => ({
  id: 'm1',
  reward_badge_ids: rewardIds,
  starts_at: PAST,
  ends_at: null,
  exposure_mode: 'start_date',
  exposure_at: null,
})

const names = (collections: Record<string, string> = {}, items: Record<string, string> = {}): PathNames => ({
  collections: new Map(Object.entries(collections)),
  items: new Map(Object.entries(items)),
})

/** 계산 → 보기 모델 → 화면까지 실제 코드로 지나가게 한다 */
function viewsOf(
  input: { collections: ItemPathCollectionInput[]; items: ItemPathItemInput[]; missions?: ItemPathMissionInput[] },
  pathNames: PathNames,
): CollectionPathView[] {
  const computed = computeItemPaths({ collections: input.collections, items: input.items, recipes: [], missions: input.missions ?? [], now: NOW })
  const page = pickCollectionPage(computed.collections, 1)
  return buildCollectionPathViews(computed, page.collectionIds, pathNames)
}

const render = (views: CollectionPathView[], pageInfo = { page: 1, totalPages: 1, total: views.length }) =>
  renderToStaticMarkup(<CollectionPaths views={views} pageInfo={pageInfo} generatedAt={NOW.toISOString()} />).replace(/<!-- -->/g, '')

const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('CollectionPaths — 같은 이름의 아이템 배지는 등급으로 구분된다', () => {
  // 막힘이 있는 컬렉션은 기본으로 펼쳐지므로(닫힌 아코디언은 내용을 그리지 않는다) 끝난 컬렉션으로 아이템을 모두 막힘으로 둔다
  const sameNameViews = viewsOf(
    {
      collections: [collection({ valid_until: PAST })],
      items: [
        item({ id: 'r1', rarity: 'common' }),
        item({ id: 'r2', rarity: 'rare' }),
        item({ id: 'r3', rarity: 'epic' }),
        item({ id: 'r4', rarity: 'mystic' }),
      ],
    },
    names({ c1: '편의점 심야 만찬' }, { r1: '검은 비닐봉지', r2: '검은 비닐봉지', r3: '검은 비닐봉지', r4: '검은 비닐봉지' }),
  )
  const sameNameText = textOf(render(sameNameViews))

  it('이름이 같아도 등급 라벨이 줄마다 보이고 낮은 등급부터 나온다', () => {
    const positions = [RARITY_LABEL.common, RARITY_LABEL.rare, RARITY_LABEL.epic, RARITY_LABEL.mystic].map((label) =>
      sameNameText.indexOf(`검은 비닐봉지 ${label}`),
    )
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})

describe('CollectionPaths — 컬렉션과 아이템', () => {
  // 끝난 컬렉션: 아이템 하나는 미션으로 열려 있고 하나는 얻을 길이 없다. 노출 중 컬렉션: 아이템 하나가 열려 있다.
  const views = viewsOf(
    {
      collections: [collection({ id: 'c-ended', valid_until: PAST }), collection({ id: 'c-live' })],
      items: [
        item({ id: 'e1', item_book_id: 'c-ended' }),
        item({ id: 'e2', item_book_id: 'c-ended' }),
        item({ id: 'o1', item_book_id: 'c-live' }),
      ],
      missions: [mission(['e2'])],
    },
    names({ 'c-ended': '끝난 컬렉션', 'c-live': '진행 중 컬렉션' }, { e1: '닫힌 배지', e2: '미션 배지', o1: '열린 배지' }),
  )
  const markup = render(views)
  const text = textOf(markup)

  it('컬렉션 이름과 막힘·열림·전체 개수가 보이고, 막힘이 있는 컬렉션이 먼저다', () => {
    expect(text).toContain('끝난 컬렉션')
    expect(text).toContain('막힘 1개')
    expect(text).toContain('열림 1개')
    expect(text).toContain('전체 2개')
    expect(text.indexOf('끝난 컬렉션')).toBeLessThan(text.indexOf('진행 중 컬렉션'))
  })

  it('막힘이 있는 첫 컬렉션은 펼쳐져 있고 나머지는 접혀 있다', () => {
    expect(text).toContain('닫힌 배지')
    expect(text).toContain('미션 배지')
    expect(text).not.toContain('열린 배지')
  })

  it('기간이 끝나 얻을 길이 없는 아이템이 막힘과 사유 문구로 보이고, 막힌 아이템이 먼저다', () => {
    expect(text).toContain('얻을 길이 없는 아이템 배지가 1개 있어요')
    expect(text).toContain(STATUS_LABELS.blocked)
    expect(text).toContain(PATH_REASON_LABELS.collection_ended)
    expect(text.indexOf('닫힌 배지')).toBeLessThan(text.indexOf('미션 배지'))
  })

  it('열린 길의 이름이 보인다 — 끝난 컬렉션에서 미션으로 열린 아이템은 «미션»', () => {
    const row = text.slice(text.indexOf('미션 배지'))
    expect(row).toContain(STATUS_LABELS.open)
    expect(row).toContain(PATH_LABELS.mission)
  })

  it('닫힌 길의 사유는 길 이름과 함께 한국어 문구로 보이고 영문 사유 상수가 새지 않는다', () => {
    // 길 이름은 강조 태그 안에 있어 태그를 지우면 «믹스 :»처럼 벌어진다 — 콜론 앞의 공백만 붙여 대조한다
    const joined = text.replace(/\s+:/g, ':')
    expect(joined).toContain(`${PATH_LABELS.mix}: ${PATH_REASON_LABELS.no_recipe}`)
    expect(joined).toContain(`${PATH_LABELS.syncCapsule}: ${PATH_REASON_LABELS.collection_ended}`)
    expect(joined).toContain(`${PATH_LABELS.tierUp}: ${PATH_REASON_LABELS.collection_ended}`)
    for (const reason of Object.values(ITEM_PATH_REASONS)) expect(markup).not.toContain(reason)
  })

  it('기준 시각(KST)과 컬렉션 수·쪽이 보인다', () => {
    expect(text).toContain('2026.10.26 15:30 기준')
    expect(text).toContain('컬렉션 2개')
    expect(text).toContain('1/1쪽')
  })

  it('한국어 문구에 줄바꿈 클래스가 붙는다', () => {
    expect(markup).toContain('break-keep')
    expect(markup).toContain('wrap-break-word')
    expect(markup).toContain('text-balance')
    expect(markup).toContain('whitespace-nowrap')
  })

  it('쪽이 하나면 쪽 이동 링크가 없다', () => {
    expect(text).not.toContain('이전')
    expect(text).not.toContain('다음')
  })
})

describe('CollectionPaths — 잠긴 채 받는 모습', () => {
  // 막힌 아이템 z를 함께 둬서 컬렉션이 처음부터 펼쳐지게 한다(막힘이 있는 첫 컬렉션만 펼쳐 둔다)
  const lockedViews = (over: Partial<ItemPathItemInput>) =>
    viewsOf(
      { collections: [collection({ valid_until: PAST })], items: [item({ id: 'a', ...over }), item({ id: 'z' })], missions: [mission(['a'])] },
      names({ c1: '컬렉션' }, { a: '잠긴 배지', z: '막힌 배지' }),
    )

  it('필요한 양을 정했으면 «잼 N만큼»과 함께 보인다', () => {
    const text = textOf(render(lockedViews({ always_locked: true, unlock_required: 12 })))
    expect(text).toContain(`${LOCKED_ON_RECEIVE_LABEL} (필요한 양 잼 12만큼)`)
    expect(lockLabel(12)).toBe('잠긴 채 받고 잼으로 열어요 (필요한 양 잼 12만큼)')
  })

  it('필요한 양을 정하지 않았으면 «등급 기본값»만 적는다', () => {
    const text = textOf(render(lockedViews({ always_locked: true, unlock_required: null })))
    expect(text).toContain(`${LOCKED_ON_RECEIVE_LABEL} (필요한 양 등급 기본값)`)
  })

  it('잠기지 않은 아이템에는 이 문구가 없다', () => {
    const text = textOf(render(lockedViews({ always_locked: false, unlock_required: 12 })))
    expect(text).not.toContain(LOCKED_ON_RECEIVE_LABEL)
  })

  it('잠겨 있어도 열림 판정은 그대로다 — 열린 길 이름과 상태가 함께 보인다', () => {
    const text = textOf(render(lockedViews({ always_locked: true })))
    expect(text).toContain(STATUS_LABELS.open)
    expect(text).toContain(PATH_LABELS.mission)
  })
})

describe('CollectionPaths — 이름·빈 상태·쪽 이동', () => {
  it('이름을 모르는 컬렉션과 아이템은 대신하는 문구로 보인다', () => {
    const views = viewsOf({ collections: [collection({ valid_until: PAST })], items: [item()] }, names())
    const text = textOf(render(views))
    expect(text).toContain(UNKNOWN_COLLECTION_NAME)
    expect(text).toContain(UNKNOWN_ITEM_NAME)
  })

  it('열린 길이 하나도 없는 아이템은 «열린 길이 없어요»가 보인다', () => {
    const views = viewsOf({ collections: [collection({ valid_until: PAST })], items: [item()] }, names({ c1: '컬렉션' }, { i1: '배지' }))
    expect(textOf(render(views))).toContain(NO_OPEN_PATH_TEXT)
  })

  it('아이템이 없는 컬렉션은 안내 문구가 보이고 표는 없다', () => {
    const views = viewsOf({ collections: [collection()], items: [] }, names({ c1: '빈 컬렉션' }))
    // 막힘이 없는 컬렉션은 접혀 있어 안내 문구는 펼친 뒤에 보인다 — 펼친 상태로 그리려고 막힘 개수를 맞춘다
    const opened = [{ ...views[0], blocked: 1 }]
    const markup = render(opened)
    expect(textOf(markup)).toContain(NO_ITEMS_TEXT)
    expect(markup).not.toContain('<table')
  })

  it('컬렉션이 없으면 빈 상태 문구만 보인다', () => {
    const text = textOf(render([], { page: 1, totalPages: 1, total: 0 }))
    expect(text).toContain(NO_COLLECTIONS_TEXT)
  })

  it('쪽이 둘 이상이면 이전·다음 이동 링크가 현재 주소의 tab을 지킨 채 있다', () => {
    const views = viewsOf({ collections: [collection({ valid_until: PAST })], items: [item()] }, names({ c1: '컬렉션' }))
    const markup = render(views, { page: 2, totalPages: 3, total: 25 })
    expect(textOf(markup)).toContain('2/3쪽')
    expect(markup).toContain('href="/admin/balance/dashboard?tab=paths"')
    expect(markup).toContain('href="/admin/balance/dashboard?tab=paths&amp;page=3"')
  })
})

describe('BalanceDashboardTabs', () => {
  it('지표 탭은 tab 없는 주소이고 획득 경로 탭은 ?tab=paths다', () => {
    expect(dashboardTabHref('metrics')).toBe('/admin/balance/dashboard')
    expect(dashboardTabHref('paths')).toBe('/admin/balance/dashboard?tab=paths')
  })

  it('현재 탭만 선택된 상태로 그려지고 두 탭 모두 링크다', () => {
    const paths = renderToStaticMarkup(<BalanceDashboardTabs tab="paths" />)
    const metrics = renderToStaticMarkup(<BalanceDashboardTabs tab="metrics" />)
    const selectedOf = (markup: string) => [...markup.matchAll(/<a[^>]*aria-selected="true"[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(selectedOf(paths)).toEqual(['컬렉션별 획득 경로'])
    expect(selectedOf(metrics)).toEqual(['지표'])
    expect(paths).toContain('href="/admin/balance/dashboard?tab=paths"')
    expect(paths).toContain('href="/admin/balance/dashboard"')
  })
})

describe('PathReasonLabels', () => {
  it('모든 사유 상수에 문구가 있고 상수 밖의 문구는 없다', () => {
    expect(Object.keys(PATH_REASON_LABELS).sort()).toEqual(Object.values(ITEM_PATH_REASONS).sort())
  })

  it('모든 사유·상태·길 문구는 비어 있지 않고, 사유 문구는 해요체로 끝나며 마침표가 없다', () => {
    for (const label of Object.values(PATH_REASON_LABELS)) {
      expect(label.trim()).not.toBe('')
      expect(label).toMatch(/요$/)
      expect(label).not.toContain('.')
    }
    for (const label of [...Object.values(PATH_LABELS), ...Object.values(STATUS_LABELS)]) expect(label.trim()).not.toBe('')
  })

  it('길 이름은 용어집을 따른다 — 동기화·캡슐, 등급 올리기', () => {
    expect(PATH_LABELS.syncCapsule).toBe('동기화·캡슐')
    expect(PATH_LABELS.tierUp).toBe('등급 올리기')
  })
})
