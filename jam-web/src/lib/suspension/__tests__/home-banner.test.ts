/**
 * 홈 정지 배너 값 읽기 — 서버 모듈 (티켓 20261017_1426 2회)
 *
 * 고정하는 것:
 * - 진행 중 정지가 있으면 사유와 건 시각을 원시값으로 돌려준다(홈이 배너에 내려 준다).
 * - 정지가 아니면 null이다(홈은 배너를 그리지 않고 자리도 남기지 않는다).
 * - 조회가 실패하면 던지지 않고 null이다 — 홈 전체를 500으로 만들지 않고 배너만 생략한다. 서버 로그는 남긴다.
 * - 홈 page.tsx가 이 값을 정지 중일 때만 배너에 넘기고, 배너가 첫 자식(인사말 줄 위)이다.
 *
 * 실제 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/suspension/__tests__/home-banner.test.ts
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadHomeSuspensionBanner } from '../home-banner'

function makeFake(result: { data: unknown; error: { message: string } | null }): SupabaseClient {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    maybeSingle: async () => result,
  }
  return { from: () => chain } as unknown as SupabaseClient
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('loadHomeSuspensionBanner', () => {
  it('진행 중 정지가 있으면 사유와 건 시각을 돌려준다', async () => {
    const supabase = makeFake({ data: { id: 's1', reason: '부정 이용', suspended_at: '2026-10-17T03:00:00.000Z' }, error: null })

    await expect(loadHomeSuspensionBanner(supabase, 'u1')).resolves.toEqual({
      reason: '부정 이용',
      suspendedAt: '2026-10-17T03:00:00.000Z',
    })
  })

  it('정지가 아니면 null이다', async () => {
    await expect(loadHomeSuspensionBanner(makeFake({ data: null, error: null }), 'u1')).resolves.toBeNull()
  })

  it('조회가 실패하면 던지지 않고 null이며 서버 로그만 남긴다', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const supabase = makeFake({ data: null, error: { message: 'boom' } })

    await expect(loadHomeSuspensionBanner(supabase, 'u1')).resolves.toBeNull()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('홈 page.tsx 배선', () => {
  const source = readFileSync(fileURLToPath(new URL('../../../app/(main)/page.tsx', import.meta.url)), 'utf8')

  it('정지 중일 때만 배너를 그린다', () => {
    expect(source).toMatch(/\{suspension && <SuspensionBanner /)
  })

  it('배너가 컨테이너의 첫 자식이라 인사말 줄보다 위에 있다', () => {
    const container = source.indexOf('px-4 pt-6 pb-8 flex flex-col gap-6')
    const banner = source.indexOf('<SuspensionBanner', container)
    const greeting = source.indexOf('d.todayStatus.greeting', container)
    expect(container).toBeGreaterThan(-1)
    expect(banner).toBeGreaterThan(container)
    expect(banner).toBeLessThan(greeting)
  })

  it('정지 조회를 다른 조회와 함께 시작한다(Promise.all 안)', () => {
    const all = source.slice(source.indexOf('await Promise.all(['))
    expect(all.slice(0, all.indexOf('])'))).toContain('suspensionPromise')
  })
})
