/**
 * 홈 막힘 배너 값 읽기 — 서버 모듈 (티켓 20261105_0104 T4)
 *
 * 고정하는 것:
 * - 막혔으면 부족분(`needed - free`)을 돌려주고, 부족분이 1 미만으로 계산돼도 최소 1이다.
 * - 막히지 않았으면 null이다(홈은 배너를 그리지 않고 자리도 남기지 않는다).
 * - 조회가 실패하거나 응답 모양이 다르면 던지지 않고 null이며 서버 로그만 남긴다 — 홈 전체를 500으로 만들지 않는다.
 * - 홈 page.tsx 배선: 정지 배너가 없을 때만 그리고, 정지 배너 바로 뒤·인사말 줄 위에 있으며, 조회를 Promise.all 안에서 함께 시작한다.
 *   위젯에는 홈 전용 prop을 넘긴다. (저장소에 홈 page를 렌더하는 시험 틀이 없어 정지 배너 시험과 같은 방식으로 소스를 읽어 고정한다)
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/capsule/__tests__/home-blocked-banner.test.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadHomeCapsuleBlockedBanner } from '../home-blocked-banner'

const USER_ID = '11111111-1111-4111-8111-111111111111'

function makeFake(result: { data: unknown; error: { message: string } | null }) {
  const rpc = vi.fn(async () => result)
  return { client: { rpc } as unknown as SupabaseClient, rpc }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadHomeCapsuleBlockedBanner', () => {
  it('막혔으면 부족분(필요 - 빈칸)을 돌려주고 capsule_receive_blocked 하나만 부른다', async () => {
    const { client, rpc } = makeFake({ data: { blocked: true, free: 0, needed: 2 }, error: null })

    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toEqual({ shortfall: 2 })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('capsule_receive_blocked', { p_user_id: USER_ID })
  })

  it('빈칸이 하나 모자라면 1이다', async () => {
    const { client } = makeFake({ data: { blocked: true, free: 1, needed: 2 }, error: null })
    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toEqual({ shortfall: 1 })
  })

  it('막혔는데 부족분이 0 이하로 계산돼도 최소 1이다', async () => {
    const { client } = makeFake({ data: { blocked: true, free: 3, needed: 2 }, error: null })
    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toEqual({ shortfall: 1 })
  })

  it('막히지 않았으면 null이다', async () => {
    const { client } = makeFake({ data: { blocked: false, free: 0, needed: 2 }, error: null })
    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toBeNull()
  })

  it('조회가 실패하면 던지지 않고 null이며 서버 로그만 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = makeFake({ data: null, error: { message: 'boom' } })

    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('응답 모양이 다르면 던지지 않고 null이다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = makeFake({ data: { blocked: 'yes' }, error: null })

    await expect(loadHomeCapsuleBlockedBanner(client, USER_ID)).resolves.toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('홈 page.tsx 배선', () => {
  const source = readFileSync(fileURLToPath(new URL('../../../app/(main)/page.tsx', import.meta.url)), 'utf8')

  it('정지 배너가 없을 때만 막힘 배너를 그린다(상시 배너 최대 1개)', () => {
    expect(source).toMatch(/\{!suspension && capsuleBlocked && <CapsuleBlockedBanner /)
  })

  it('막힘 배너는 정지 배너 바로 뒤, 인사말 줄 위에 있다', () => {
    const container = source.indexOf('px-4 pt-6 pb-8 flex flex-col gap-6')
    const suspension = source.indexOf('<SuspensionBanner', container)
    const blocked = source.indexOf('<CapsuleBlockedBanner', container)
    const greeting = source.indexOf('d.todayStatus.greeting', container)
    expect(suspension).toBeGreaterThan(container)
    expect(blocked).toBeGreaterThan(suspension)
    expect(blocked).toBeLessThan(greeting)
  })

  it('막힘 조회를 다른 조회와 함께 시작한다(Promise.all 안)', () => {
    const all = source.slice(source.indexOf('await Promise.all(['))
    expect(all.slice(0, all.indexOf('])'))).toContain('capsuleBlockedPromise')
  })

  it('캡슐 위젯에 홈 전용 prop을 넘긴다', () => {
    expect(source).toMatch(/<CapsuleWidget initial=\{capsuleInitial\} hideBlockedAction \/>/)
  })
})
