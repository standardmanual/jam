/**
 * GET /api/dev-login — 환경 게이트와 테스트 계정 트라이브 지정 (티켓 20261021_1247 1회, 사용자 결정 2)
 *
 * 고정하는 것
 *  - 개발·staging이 아니면(프로덕션) 404이고 Supabase를 부르지 않으며 트라이브도 지정하지 않는다.
 *  - 허용 환경에서는 세션을 만든 뒤 테스트 계정(`DEV_LOGIN_USER_ID`)에 대해서만 트라이브 지정을 부르고 `/`로 보낸다.
 *  - 세션을 만들지 못한 경로(계정 생성 실패·링크 실패·세션 발급 실패)는 트라이브 지정을 부르지 않는다.
 *  - 트라이브 지정이 `skipped`여도 로그인은 `/`로 끝난다.
 *
 * 비어 있을 때만 지정·이미 있으면 그대로 같은 지정 규칙 자체는 `lib/tribe/__tests__/dev-login-tribe.test.ts`가 맡는다.
 * 공용 DB는 호출하지 않는다 — 가짜 클라이언트만 쓴다.
 *
 * 실행: cd jam-web && npx vitest run src/app/api/dev-login/__tests__/route.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ORIGIN = 'https://stage.jam.test'

const state = vi.hoisted(() => ({
  createUserError: null as null | { message: string },
  linkError: null as null | { message: string },
  verifyError: null as null | { message: string },
  serviceClient: { marker: 'service-client' },
  supabaseCalls: 0,
}))
const ensureMock = vi.hoisted(() => vi.fn<(client: unknown, userId: string) => Promise<string>>())

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    state.supabaseCalls += 1
    return { auth: { verifyOtp: async () => ({ error: state.verifyError }) } }
  },
  createServiceClient: () => {
    state.supabaseCalls += 1
    return {
      ...state.serviceClient,
      auth: {
        admin: {
          createUser: async () => ({ error: state.createUserError }),
          generateLink: async () => ({
            data: state.linkError ? null : { properties: { hashed_token: 'hashed' } },
            error: state.linkError,
          }),
        },
      },
    }
  },
}))
vi.mock('@/lib/tribe/dev-login-tribe', () => ({
  ensureDevLoginTribe: (client: unknown, userId: string) => ensureMock(client, userId),
}))

import { GET } from '../route'
import { DEV_LOGIN_USER_ID } from '@/lib/env/test-accounts'

const request = () => new NextRequest(`${ORIGIN}/api/dev-login`)
const location = (res: Response) => res.headers.get('location') ?? ''

beforeEach(() => {
  state.createUserError = null
  state.linkError = null
  state.verifyError = null
  state.supabaseCalls = 0
  ensureMock.mockReset().mockResolvedValue('assigned')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubEnv('NODE_ENV', 'test')
  vi.stubEnv('STAGING_MODE', '')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('GET /api/dev-login — 환경 게이트', () => {
  it('프로덕션(개발도 staging도 아님)에서는 404이고 Supabase도 트라이브 지정도 부르지 않는다', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const res = await GET(request())

    expect(res.status).toBe(404)
    expect(state.supabaseCalls).toBe(0)
    expect(ensureMock).not.toHaveBeenCalled()
  })

  it('STAGING_MODE가 true가 아니면 NODE_ENV가 production이 아니어도 404다', async () => {
    vi.stubEnv('STAGING_MODE', 'false')

    const res = await GET(request())

    expect(res.status).toBe(404)
    expect(ensureMock).not.toHaveBeenCalled()
  })
})

describe('GET /api/dev-login — 허용 환경', () => {
  it('staging(STAGING_MODE=true)에서 세션을 만든 뒤 테스트 계정의 트라이브를 지정하고 /로 보낸다', async () => {
    vi.stubEnv('STAGING_MODE', 'true')

    const res = await GET(request())

    expect(location(res)).toBe(`${ORIGIN}/`)
    expect(ensureMock).toHaveBeenCalledTimes(1)
    expect(ensureMock.mock.calls[0][1]).toBe(DEV_LOGIN_USER_ID)
    // 서비스 클라이언트(service_role)로 부른다
    expect(ensureMock.mock.calls[0][0]).toMatchObject(state.serviceClient)
  })

  it('로컬 개발(NODE_ENV=development)에서도 같다', async () => {
    vi.stubEnv('NODE_ENV', 'development')

    const res = await GET(request())

    expect(location(res)).toBe(`${ORIGIN}/`)
    expect(ensureMock).toHaveBeenCalledTimes(1)
  })

  it('트라이브 지정이 skipped·kept·no_active_tribe여도 로그인은 /로 끝난다', async () => {
    vi.stubEnv('STAGING_MODE', 'true')

    for (const result of ['skipped', 'kept', 'no_active_tribe']) {
      ensureMock.mockResolvedValueOnce(result)
      expect(location(await GET(request()))).toBe(`${ORIGIN}/`)
    }
  })

  it('세션을 만들지 못한 경로는 트라이브 지정을 부르지 않는다', async () => {
    vi.stubEnv('STAGING_MODE', 'true')

    state.createUserError = { message: 'boom' }
    expect(location(await GET(request()))).toBe(`${ORIGIN}/login?error=auth_failed`)

    state.createUserError = null
    state.linkError = { message: 'boom' }
    expect(location(await GET(request()))).toBe(`${ORIGIN}/login?error=auth_failed`)

    state.linkError = null
    state.verifyError = { message: 'boom' }
    expect(location(await GET(request()))).toBe(`${ORIGIN}/login?error=auth_failed`)

    expect(ensureMock).not.toHaveBeenCalled()
  })

  it('이미 등록된 이메일이라는 계정 생성 오류는 무시하고 계속한다', async () => {
    vi.stubEnv('STAGING_MODE', 'true')
    state.createUserError = { message: 'A user with this email address has already been registered' }

    expect(location(await GET(request()))).toBe(`${ORIGIN}/`)
    expect(ensureMock).toHaveBeenCalledTimes(1)
  })
})
