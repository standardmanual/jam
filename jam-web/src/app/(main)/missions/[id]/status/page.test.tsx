/**
 * 미션 상황 화면 서버 분기 (티켓 20261111_0850)
 *
 * 랭킹형만 이 화면을 연다. 달성형은 상세에 «랭킹» 버튼이 없고, 알림(미션 종료·팔로잉 미션 완료)이나 직접 주소로 들어와도
 * 미션 상세로 돌려보낸다. 미참가자도 상세로 돌려보낸다(기존 동작).
 *
 * 페이지 함수를 모의 Supabase로 직접 호출하고, 클라이언트 컴포넌트는 그리지 않는다.
 * 실행: cd jam-web && npx vitest run "src/app/(main)/missions/[id]/status/page.test.tsx"
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row | null>,
}))

/** 어떤 필터 체인이든 받고, `.maybeSingle()`에서 테이블의 한 행을 돌려준다. */
function makeBuilder(table: string): unknown {
  return new Proxy(
    {},
    {
      get(_target, method) {
        if (method === 'maybeSingle') return () => Promise.resolve({ data: state.tables[table] ?? null, error: null })
        return () => makeBuilder(table)
      },
    }
  )
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }) } }),
  createServiceClient: () => ({ from: (table: string) => makeBuilder(table) }),
}))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`)
  },
}))
vi.mock('./MissionStatusClient', () => ({ default: () => null }))

import MissionStatusPage from './page'

function mission(displayType: string): Row {
  return { id: 'm1', title: '미션', status_display_type: displayType, mission_type: 'distance' }
}

async function open() {
  return MissionStatusPage({ params: Promise.resolve({ id: 'm1' }) })
}

describe('미션 상황 화면 — 서버 분기', () => {
  beforeEach(() => {
    state.tables = { missions: mission('ranking'), user_mission_participations: { user_id: 'user-1' } }
  })

  it('랭킹형 미션의 참가자에게는 화면을 연다', async () => {
    const element = (await open()) as { props: { missionId: string; displayType: string } }
    expect(element.props.missionId).toBe('m1')
    expect(element.props.displayType).toBe('ranking')
  })

  it.each(['achievement'])('%s 미션은 미션 상세로 돌려보낸다', async (displayType) => {
    state.tables.missions = mission(displayType)
    await expect(open()).rejects.toThrow('NEXT_REDIRECT:/missions/m1')
  })

  it('참가하지 않았으면 표시 방식과 상관없이 미션 상세로 돌려보낸다', async () => {
    state.tables.user_mission_participations = null
    await expect(open()).rejects.toThrow('NEXT_REDIRECT:/missions/m1')
  })

  it('없는 미션이면 404다', async () => {
    state.tables.missions = null
    await expect(open()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
