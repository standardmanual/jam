/**
 * GET /api/points — 포인트 화면의 잔액과 받은 내역 (티켓 20261019_1317 3회, 운영 로직 14.2절)
 *
 * 고정하는 것
 *  - 비로그인은 401이고 잔액·내역·배지·미션을 읽지 않는다.
 *  - 배지 포인트 행의 제목은 배지 이름이고 `/badges/{id}`로 간다. 삭제됐거나 못 찾은 배지는 «배지 보상»으로 물러난다(소프트 삭제 배지는 이름 조회에서 거른다).
 *  - 미션 포인트 행의 제목은 미션 제목이고 `/missions/{id}`로 간다. 못 찾으면 «미션 보상»이다.
 *  - `admin_grant`·`admin_deduct`는 `admin_reason_label`이 있으면 유저용 라벨, 없거나 «기타»·모르는 코드면 «포인트 조정»이다.
 *    `ADMIN_REASONS`의 모든 값을 두 방향으로 돌려도 제목에 «회수»·«지급»·«차감»(어드민 용어, UX 가이드 1.3절)이 없다.
 *  - 모든 `reason`의 제목에 어드민 용어가 없다. 음수 금액과 `nextCursor`는 그대로 나오고, 행에는 화면이 쓰는 필드만 실린다.
 *
 * 한계(기록만): 사유 «기타»의 자유 입력 메모(`note`)는 어드민이 쓴 글이 그대로 나온다. 메모에 «회수»를 적으면 화면에 보인다(이번에는 막지 않는다).
 *
 * 포인트 읽기(`@/lib/points`)와 Supabase는 기록형 가짜로 대신한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/points/__tests__/route.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { d } from '@/lib/i18n'
import { ADMIN_REASONS } from '@/lib/points/reasons'
import type { PointReason, PointTransactionRow } from '@/types/database'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const BADGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const GONE_BADGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const MISSION_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const GONE_MISSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

/** 어드민 용어 — 유저 화면 제목에 있으면 안 된다(UX 가이드 1.3절) */
const FORBIDDEN_TERMS = ['회수', '지급', '차감']

interface Recorded {
  table: string
  select: string
  inFilter?: { column: string; ids: string[] }
  isFilter?: { column: string; value: unknown }
}

const state = vi.hoisted(() => ({
  authenticated: true,
  balance: 0,
  page: { items: [] as unknown[], nextCursor: null as string | null },
  badges: [] as { id: string; name: string }[],
  missions: [] as { id: string; title: string }[],
  recorded: [] as unknown[],
}))
const getWalletMock = vi.hoisted(() => vi.fn())
const listTransactionsMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        state.authenticated
          ? { data: { user: { id: USER_ID } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      const record: Recorded = { table, select: '' }
      state.recorded.push(record)
      const result = () => {
        const data = table === 'badges' ? state.badges : table === 'missions' ? state.missions : []
        // 실제 쿼리처럼 요청한 id만 돌려준다 — 못 찾은 id는 빠진다
        const wanted = new Set(record.inFilter?.ids ?? [])
        return Promise.resolve({ data: data.filter((row) => wanted.has(row.id)), error: null })
      }
      const builder = {
        select: (columns: string) => {
          record.select = columns
          return builder
        },
        in: (column: string, ids: string[]) => {
          record.inFilter = { column, ids }
          return builder
        },
        is: (column: string, value: unknown) => {
          record.isFilter = { column, value }
          return builder
        },
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => result().then(resolve, reject),
      }
      return builder
    },
  }),
}))
vi.mock('@/lib/points', () => ({
  getWallet: (...args: unknown[]) => getWalletMock(...args),
  listTransactions: (...args: unknown[]) => listTransactionsMock(...args),
}))

import { GET } from '../route'

function row(over: Partial<PointTransactionRow> = {}): PointTransactionRow {
  return {
    id: 'tx-1',
    user_id: USER_ID,
    amount: 10,
    reason: 'badge_point_reward',
    source_badge_id: null,
    source_mission_id: null,
    admin_reason_label: null,
    admin_reason_note: null,
    source_item_book_id: null,
    created_at: '2026-10-20T01:00:00.000Z',
    ...over,
  }
}

function setRows(items: PointTransactionRow[], nextCursor: string | null = null) {
  state.page = { items, nextCursor }
}

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/points${query}`)
}

async function titles(items: PointTransactionRow[]): Promise<string[]> {
  setRows(items)
  const body = await (await GET(request())).json()
  return body.items.map((it: { title: string }) => it.title)
}

beforeEach(() => {
  state.authenticated = true
  state.balance = 120
  state.page = { items: [], nextCursor: null }
  state.badges = [{ id: BADGE_ID, name: '한강 러너' }]
  state.missions = [{ id: MISSION_ID, title: '주말 러닝' }]
  state.recorded = []
  getWalletMock.mockReset()
  getWalletMock.mockImplementation(async () => state.balance)
  listTransactionsMock.mockReset()
  listTransactionsMock.mockImplementation(async () => state.page)
})

describe('GET /api/points — 로그인', () => {
  it('비로그인은 401이고 아무것도 읽지 않는다', async () => {
    state.authenticated = false

    const res = await GET(request())

    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: d.common.authRequired })
    expect(getWalletMock).not.toHaveBeenCalled()
    expect(listTransactionsMock).not.toHaveBeenCalled()
    expect(state.recorded).toEqual([])
  })

  it('세션 유저의 잔액과 내역을 읽고 쿼리의 cursor를 그대로 넘긴다', async () => {
    const cursor = '2026-10-19T00:00:00.000Z'

    await GET(request(`?cursor=${encodeURIComponent(cursor)}`))

    expect(getWalletMock).toHaveBeenCalledWith(USER_ID)
    expect(listTransactionsMock).toHaveBeenCalledWith(USER_ID, cursor)
  })

  it('cursor가 없으면 첫 페이지를 읽는다', async () => {
    await GET(request())

    expect(listTransactionsMock).toHaveBeenCalledWith(USER_ID, null)
  })

  it('잔액·내역·nextCursor를 한 응답으로 돌려준다', async () => {
    setRows([row({ id: 'tx-1', amount: 10 })], '2026-10-20T01:00:00.000Z')

    const res = await GET(request())

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['balance', 'items', 'nextCursor'])
    expect(body.balance).toBe(120)
    expect(body.nextCursor).toBe('2026-10-20T01:00:00.000Z')
    expect(body.items).toHaveLength(1)
  })

  it('내역이 비면 빈 배열이고 배지·미션을 조회하지 않는다', async () => {
    const body = await (await GET(request())).json()

    expect(body.items).toEqual([])
    expect(body.nextCursor).toBeNull()
    expect(state.recorded).toEqual([])
  })
})

describe('GET /api/points — 행의 모양', () => {
  it('행에는 화면이 쓰는 필드만 실린다(유저 id·원천 id·사유 코드 열을 내리지 않는다)', async () => {
    setRows([row({ source_badge_id: BADGE_ID })])

    const { items } = await (await GET(request())).json()

    expect(Object.keys(items[0]).sort()).toEqual(['amount', 'created_at', 'href', 'id', 'note', 'reason', 'title'])
    expect(JSON.stringify(items)).not.toContain(USER_ID)
  })

  it('음수 금액은 부호 그대로 나온다 — 화면 이름이 «최근 내역»인 까닭이다', async () => {
    setRows([row({ id: 'tx-minus', amount: -50, reason: 'admin_deduct', admin_reason_label: 'error_correction' }), row({ id: 'tx-plus', amount: 30 })])

    const { items } = await (await GET(request())).json()

    expect(items.map((it: { id: string; amount: number }) => [it.id, it.amount])).toEqual([
      ['tx-minus', -50],
      ['tx-plus', 30],
    ])
  })

  it('내역 순서를 바꾸지 않는다', async () => {
    setRows([row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })])

    const { items } = await (await GET(request())).json()

    expect(items.map((it: { id: string }) => it.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('GET /api/points — 배지 포인트', () => {
  it('제목은 배지 이름이고 /badges/{id}로 간다', async () => {
    setRows([row({ source_badge_id: BADGE_ID })])

    const { items } = await (await GET(request())).json()

    expect(items[0].title).toBe('한강 러너')
    expect(items[0].href).toBe(`/badges/${BADGE_ID}`)
  })

  it('삭제됐거나 못 찾은 배지는 «배지 보상»으로 물러난다', async () => {
    setRows([row({ source_badge_id: GONE_BADGE_ID })])

    const { items } = await (await GET(request())).json()

    expect(items[0].title).toBe(d.points.reasonKindBadgeReward)
  })

  it('이름 조회는 소프트 삭제된 배지를 거른다(deleted_at IS NULL) — 이름을 노출하지 않는다', async () => {
    setRows([row({ source_badge_id: BADGE_ID })])

    await GET(request())

    const badgeQuery = (state.recorded as Recorded[]).find((r) => r.table === 'badges')
    expect(badgeQuery?.isFilter).toEqual({ column: 'deleted_at', value: null })
    expect(badgeQuery?.select).toBe('id, name')
  })

  it('원천 배지가 없는 배지 포인트 행은 일반 제목이고 링크가 없다', async () => {
    setRows([row({ source_badge_id: null })])

    const { items } = await (await GET(request())).json()

    expect(items[0].title).toBe(d.points.reasonKindBadgeReward)
    expect(items[0].href).toBeNull()
  })

  it('같은 배지가 여러 행이어도 한 번에 중복 없이 조회한다', async () => {
    setRows([row({ id: 'a', source_badge_id: BADGE_ID }), row({ id: 'b', source_badge_id: BADGE_ID })])

    await GET(request())

    const badgeQueries = (state.recorded as Recorded[]).filter((r) => r.table === 'badges')
    expect(badgeQueries).toHaveLength(1)
    expect(badgeQueries[0].inFilter).toEqual({ column: 'id', ids: [BADGE_ID] })
  })
})

describe('GET /api/points — 미션 포인트', () => {
  it('제목은 미션 제목이고 /missions/{id}로 간다', async () => {
    setRows([row({ reason: 'mission_point_reward', source_mission_id: MISSION_ID })])

    const { items } = await (await GET(request())).json()

    expect(items[0].title).toBe('주말 러닝')
    expect(items[0].href).toBe(`/missions/${MISSION_ID}`)
  })

  it('못 찾은 미션은 «미션 보상»으로 물러난다', async () => {
    setRows([row({ reason: 'mission_point_reward', source_mission_id: GONE_MISSION_ID })])

    const { items } = await (await GET(request())).json()

    expect(items[0].title).toBe(d.points.reasonKindMissionReward)
  })

  it('배지 행만 있으면 미션을 조회하지 않고 미션 행만 있으면 배지를 조회하지 않는다', async () => {
    setRows([row({ source_badge_id: BADGE_ID })])
    await GET(request())
    expect((state.recorded as Recorded[]).map((r) => r.table)).toEqual(['badges'])

    state.recorded = []
    setRows([row({ reason: 'mission_point_reward', source_mission_id: MISSION_ID })])
    await GET(request())
    expect((state.recorded as Recorded[]).map((r) => r.table)).toEqual(['missions'])
  })
})

describe('GET /api/points — 어드민 조정', () => {
  const REASON_BY_CODE: Record<string, string | null> = {
    cs_compensation: d.points.reasonCsCompensation,
    error_correction: d.points.reasonErrorCorrection,
    event_promotion: d.points.reasonEventPromotion,
    abuse_reclaim: d.points.reasonAbuseReclaim,
    retroactive_adjustment: d.points.reasonRetroactiveAdjustment,
    other: null,
  }

  it('사유 라벨이 있으면 유저용 라벨로 보인다', async () => {
    expect(await titles([row({ reason: 'admin_grant', admin_reason_label: 'cs_compensation' })])).toEqual(['불편 보상'])
    expect(await titles([row({ reason: 'admin_deduct', admin_reason_label: 'abuse_reclaim' })])).toEqual(['이용 정책 위반'])
  })

  it('라벨이 없거나 «기타»거나 모르는 코드면 «포인트 조정»이다', async () => {
    for (const reason of ['admin_grant', 'admin_deduct'] as const) {
      expect(await titles([row({ reason, admin_reason_label: null })])).toEqual([d.points.reasonKindAdminAdjustment])
      expect(await titles([row({ reason, admin_reason_label: 'other' })])).toEqual([d.points.reasonKindAdminAdjustment])
      // 모르는 코드가 화면에 새지 않는다
      expect(await titles([row({ reason, admin_reason_label: 'legacy_unknown_code' })])).toEqual([d.points.reasonKindAdminAdjustment])
    }
  })

  it('«기타»일 때만 자유 입력 메모를 note로 싣는다', async () => {
    setRows([
      row({ id: 'other', reason: 'admin_grant', admin_reason_label: 'other', admin_reason_note: '운영 사정으로 조정했어요' }),
      row({ id: 'coded', reason: 'admin_grant', admin_reason_label: 'cs_compensation', admin_reason_note: '남아 있는 메모' }),
      row({ id: 'none', reason: 'admin_grant', admin_reason_label: null, admin_reason_note: '라벨 없는 메모' }),
    ])

    const { items } = await (await GET(request())).json()

    expect(items.map((it: { id: string; note: string | null }) => [it.id, it.note])).toEqual([
      ['other', '운영 사정으로 조정했어요'],
      ['coded', null],
      ['none', null],
    ])
  })

  it('어드민 조정 행은 링크가 없다', async () => {
    setRows([row({ reason: 'admin_grant', admin_reason_label: 'cs_compensation' })])

    const { items } = await (await GET(request())).json()

    expect(items[0].href).toBeNull()
  })

  it('ADMIN_REASONS의 모든 값을 두 방향으로 돌려도 제목에 어드민 용어(회수·지급·차감)가 없다', async () => {
    // 사유 목록이 늘면 이 시험이 새 값도 함께 돈다
    expect(ADMIN_REASONS.length).toBeGreaterThan(0)
    for (const reason of ['admin_grant', 'admin_deduct'] as const) {
      for (const option of ADMIN_REASONS) {
        const [title] = await titles([row({ reason, admin_reason_label: option.value })])
        for (const term of FORBIDDEN_TERMS) {
          expect(title, `${reason}/${option.value} 제목 «${title}»`).not.toContain(term)
        }
      }
    }
  })

  it('사유 코드별 유저용 라벨이 문구 사전의 값과 같다(어드민 라벨 «…회수»가 아니다)', async () => {
    for (const option of ADMIN_REASONS) {
      const [title] = await titles([row({ reason: 'admin_deduct', admin_reason_label: option.value })])
      expect(title).toBe(REASON_BY_CODE[option.value] ?? d.points.reasonKindAdminAdjustment)
    }
  })
})

describe('GET /api/points — 믹스·컬렉션 보상과 전체 사유', () => {
  it('믹스·컬렉션 보상은 일반 제목이고 링크가 없다', async () => {
    const items = [
      row({ id: 'a', reason: 'combine_fail_reward' }),
      row({ id: 'b', reason: 'combine_recipe_reward' }),
      row({ id: 'c', reason: 'item_book_completion_point_reward' }),
    ]
    setRows(items)

    const body = await (await GET(request())).json()

    expect(body.items.map((it: { title: string }) => it.title)).toEqual([
      d.points.reasonKindCombineFailReward,
      d.points.reasonKindCombineRecipeReward,
      d.points.reasonKindItemBookCompletionReward,
    ])
    expect(body.items.every((it: { href: string | null }) => it.href === null)).toBe(true)
  })

  it('PointReason 일곱 가지 모두 제목이 있고 어드민 용어가 없다', async () => {
    const reasons: PointReason[] = [
      'badge_point_reward',
      'mission_point_reward',
      'admin_grant',
      'admin_deduct',
      'combine_fail_reward',
      'combine_recipe_reward',
      'item_book_completion_point_reward',
    ]

    const all = await titles(reasons.map((reason, i) => row({ id: `tx-${i}`, reason })))

    expect(all).toHaveLength(reasons.length)
    for (const title of all) {
      expect(title).toBeTruthy()
      for (const term of FORBIDDEN_TERMS) expect(title).not.toContain(term)
    }
  })
})
