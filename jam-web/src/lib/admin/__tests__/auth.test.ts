/**
 * 어드민 권한 판정 `hasAdminAccess` — staging 자동 로그인 계정 차단 (티켓 20261006_1527)
 *
 * stage.j-a-m.app은 Vercel 접근 보호가 없어 쿠키 없는 요청이 `/api/dev-login`으로 가서 dev-tester
 * 세션을 받는다. 그 계정이 `users.is_admin = true`면 누구나 공용 DB 어드민을 쓸 수 있었다.
 * DB 값을 되돌리는 응급 조치와 별개로, 코드가 다음을 지켜야 재발하지 않는다:
 * 1. staging(`STAGING_MODE=true`)에서 dev-login 계정(id 또는 이메일)은 `is_admin`·`ADMIN_EMAILS`와
 *    무관하게 어드민이 아니다 — DB도 조회하지 않는다
 * 2. 로컬 개발(`STAGING_MODE` 없음)은 `ADMIN_EMAILS`로 관리자가 될 수 있다(패턴 13 유지)
 * 3. staging의 다른 관리자는 기존 판정대로 어드민이다
 */
import { vi, beforeEach, afterEach } from 'vitest'

const dbState = vi.hoisted(() => ({
  isAdmin: true as boolean | null,
  queried: [] as string[],
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
  createServiceClient: () => ({
    from: (table: string) => {
      dbState.queried.push(table)
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { is_admin: dbState.isAdmin } }),
          }),
        }),
      }
    },
  }),
}))

import { hasAdminAccess, isAdminAccount } from '../auth'
import { DEV_LOGIN_USER_EMAIL, DEV_LOGIN_USER_ID } from '@/lib/env/test-accounts'

const DEV_ID = '00000000-0000-0000-0000-000000000001'
const DEV_EMAIL = 'dev-tester@jam.local'
const OTHER_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_EMAIL = 'someone@example.com'

describe('hasAdminAccess — staging 자동 로그인 계정 차단', () => {
  const originalStaging = process.env.STAGING_MODE
  const originalAdminEmails = process.env.ADMIN_EMAILS

  beforeEach(() => {
    dbState.isAdmin = true
    dbState.queried = []
    delete process.env.ADMIN_EMAILS
    process.env.STAGING_MODE = 'true'
  })

  afterEach(() => {
    if (originalStaging === undefined) delete process.env.STAGING_MODE
    else process.env.STAGING_MODE = originalStaging
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = originalAdminEmails
  })

  it('공용 상수가 dev-login 계정의 고정 id·이메일과 같다', () => {
    expect(DEV_LOGIN_USER_ID).toBe(DEV_ID)
    expect(DEV_LOGIN_USER_EMAIL).toBe(DEV_EMAIL)
  })

  it('staging + dev-login 계정은 users.is_admin이 참이어도 false이고 DB를 조회하지 않는다', async () => {
    dbState.isAdmin = true
    await expect(hasAdminAccess(DEV_ID, DEV_EMAIL)).resolves.toBe(false)
    expect(dbState.queried).toEqual([])
  })

  it('staging + dev-login 계정은 ADMIN_EMAILS에 있어도 false', async () => {
    process.env.ADMIN_EMAILS = `${DEV_EMAIL},${OTHER_EMAIL}`
    await expect(hasAdminAccess(DEV_ID, DEV_EMAIL)).resolves.toBe(false)
    expect(dbState.queried).toEqual([])
  })

  it('staging + id만 dev-login 계정이어도(이메일이 다르거나 없어도) false', async () => {
    await expect(hasAdminAccess(DEV_ID, OTHER_EMAIL)).resolves.toBe(false)
    await expect(hasAdminAccess(DEV_ID, null)).resolves.toBe(false)
    expect(dbState.queried).toEqual([])
  })

  it('staging + 이메일만 dev-login 계정이어도(id가 달라도) false — 대소문자 무관', async () => {
    process.env.ADMIN_EMAILS = DEV_EMAIL
    await expect(hasAdminAccess(OTHER_ID, DEV_EMAIL)).resolves.toBe(false)
    await expect(hasAdminAccess(OTHER_ID, DEV_EMAIL.toUpperCase())).resolves.toBe(false)
    expect(dbState.queried).toEqual([])
  })

  it('staging + 다른 관리자는 기존 판정대로 — users.is_admin이 참이면 true', async () => {
    dbState.isAdmin = true
    await expect(hasAdminAccess(OTHER_ID, OTHER_EMAIL)).resolves.toBe(true)
    expect(dbState.queried).toEqual(['users'])
  })

  it('staging + 다른 관리자는 기존 판정대로 — ADMIN_EMAILS에 있으면 DB 조회 없이 true', async () => {
    process.env.ADMIN_EMAILS = OTHER_EMAIL
    await expect(hasAdminAccess(OTHER_ID, OTHER_EMAIL)).resolves.toBe(true)
    expect(dbState.queried).toEqual([])
  })

  it('staging + 관리자가 아닌 일반 유저는 false', async () => {
    dbState.isAdmin = false
    await expect(hasAdminAccess(OTHER_ID, OTHER_EMAIL)).resolves.toBe(false)
  })

  it('staging이 아닌 로컬 개발 + ADMIN_EMAILS 화이트리스트면 dev-login 계정도 true(패턴 13 유지)', async () => {
    delete process.env.STAGING_MODE
    process.env.ADMIN_EMAILS = DEV_EMAIL
    await expect(hasAdminAccess(DEV_ID, DEV_EMAIL)).resolves.toBe(true)
    expect(dbState.queried).toEqual([])
  })

  it('STAGING_MODE가 "true"가 아닌 값이면 차단하지 않는다', async () => {
    process.env.STAGING_MODE = 'false'
    process.env.ADMIN_EMAILS = DEV_EMAIL
    await expect(hasAdminAccess(DEV_ID, DEV_EMAIL)).resolves.toBe(true)
  })
})

describe('isAdminAccount — 이번 변경 범위 밖(유저 일괄 처리 자동 제외용)', () => {
  const originalStaging = process.env.STAGING_MODE
  const originalAdminEmails = process.env.ADMIN_EMAILS

  afterEach(() => {
    if (originalStaging === undefined) delete process.env.STAGING_MODE
    else process.env.STAGING_MODE = originalStaging
    if (originalAdminEmails === undefined) delete process.env.ADMIN_EMAILS
    else process.env.ADMIN_EMAILS = originalAdminEmails
  })

  it('staging에서도 판정 기준이 그대로다 — is_admin이 참이면 어드민 계정으로 본다', () => {
    process.env.STAGING_MODE = 'true'
    delete process.env.ADMIN_EMAILS
    expect(isAdminAccount({ email: DEV_EMAIL, is_admin: true })).toBe(true)
  })
})
