import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { OPS_INBOX_METHOD, OPS_INBOX_PATH } from '@/lib/admin/opsInbox/constants'

export function isWhitelistedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)
  return adminEmails.includes(email)
}

/**
 * 어드민 계정 판정(티켓 20260924_0941) — 화이트리스트 이메일이거나 `users.is_admin`이 참이면
 * 어드민이다. {@link hasAdminAccess}와 판정 기준은 같지만, 이미 유저 행을 조회해 둔 화면
 * (유저 일괄 처리 등)이 DB를 다시 조회하지 않고 그 자리에서 바로 쓸 수 있도록 순수 함수로
 * 둔다(후속 티켓의 "어드민·본인 계정 자동 제외"에 쓴다).
 */
export function isAdminAccount(user: {
  email: string | null | undefined
  is_admin: boolean | null | undefined
}): boolean {
  return isWhitelistedAdminEmail(user.email) || Boolean(user.is_admin)
}

/**
 * 어드민 권한 판정 (20260827_015): `ADMIN_EMAILS` 환경변수 화이트리스트 OR `users.is_admin`
 * 컬럼. 화이트리스트에 있으면 DB 조회 없이 즉시 허용한다 — 기존 화이트리스트 계정은
 * 이 변경으로 영향받지 않는다. `proxy.ts`(미들웨어)·`admin/layout.tsx`(서버 컴포넌트
 * defense-in-depth)·`getAdminUser()`(API 라우트) 3곳이 모두 이 판정을 공유한다.
 */
export async function hasAdminAccess(
  userId: string,
  email: string | null | undefined
): Promise<boolean> {
  if (isWhitelistedAdminEmail(email)) return true

  const service = createServiceClient()
  const { data } = await service.from('users').select('is_admin').eq('id', userId).maybeSingle()
  return Boolean((data as { is_admin?: boolean } | null)?.is_admin)
}

export async function getAdminUser(): Promise<{ id: string; email: string } | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return null
  if (!(await hasAdminAccess(user.id, user.email))) return null

  return { id: user.id, email: user.email }
}

export async function requireAdmin(): Promise<NextResponse | null> {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })
  return null
}

// 문자열 길이가 달라도 즉시 반환하지 않고 끝까지 비교해 타이밍 차이를 줄인다.
// node:crypto의 timingSafeEqual은 미들웨어(Edge 런타임)에서 쓸 수 없어 순수 JS로 둔다
// (티켓 20260918_1149).
function timingSafeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length)
  let mismatch = a.length === b.length ? 0 : 1
  for (let i = 0; i < len; i++) {
    const ca = i < a.length ? a.charCodeAt(i) : 0
    const cb = i < b.length ? b.charCodeAt(i) : 0
    mismatch |= ca ^ cb
  }
  return mismatch === 0
}

/**
 * 어드민 자동화 읽기 토큰 검사 (티켓 20260918_1149). `ADMIN_API_READ_TOKEN` 환경변수와
 * 요청 헤더 값이 일치하면 true. 환경변수가 비어 있으면(미설정) 항상 false — 값을 바꾸면
 * 이전 토큰은 즉시 무효가 된다.
 */
export function isValidAdminReadToken(token: string | null | undefined): boolean {
  const expected = process.env.ADMIN_API_READ_TOKEN
  if (!expected || !token) return false
  return timingSafeEqual(token, expected)
}

/**
 * 어드민 GET 전용 자동화 토큰 인증 (티켓 20260918_1149). 클라우드 예약 작업이 관리자
 * 로그인 쿠키 없이 어드민 API를 읽을 수 있게 한다.
 *
 * - GET + 유효한 `x-admin-read-token` 헤더 → 통과(null)
 * - 그 외(POST/PUT/PATCH/DELETE, 토큰 없음/오류, 환경변수 미설정) → 기존 관리자 세션 검사
 *   (`requireAdmin`)로 폴백한다. 즉 쓰기 메서드는 토큰으로 절대 통과하지 못하고, 사람이
 *   쿠키로 접근하던 기존 경로도 그대로 유지된다.
 * - 읽기 라우트에서만 쓴다. `requireAdmin()` 본체는 건드리지 않는다.
 */
export async function requireAdminRead(req: Request): Promise<NextResponse | null> {
  if (req.method === 'GET' && isValidAdminReadToken(req.headers.get('x-admin-read-token'))) {
    return null
  }
  return requireAdmin()
}

/**
 * 운영 묶음 제출 경로의 토큰 쓰기 예외 판정 (티켓 20260930_1816). 읽기 토큰으로 쓰기가 허용되는
 * **유일한** 경우다 — 메서드가 `OPS_INBOX_METHOD`이고, 경로가 `OPS_INBOX_PATH`와 **정확히 같고**
 * (뒤에 `/`나 다른 글자가 붙으면 false, 접두사 비교를 쓰지 않는다), 토큰이 맞을 때만 true.
 *
 * - `proxy.ts`(로그인 리다이렉트 건너뛰기)와 `requireOpsInboxSubmit`(라우트)이 같은 함수를 쓴다.
 *   경로·메서드는 상수 하나(`opsInbox/constants.ts`)라 한쪽만 넓어질 수 없다.
 * - 순수 함수다(요청 객체를 받지 않는다). 그래서 proxy가 파싱한 `pathname`을 그대로 넘긴다.
 * - `requireAdminRead`·`isValidAdminReadToken`은 바꾸지 않았다. GET 전용 판정과 섞이지 않게 따로 둔다.
 */
export function isOpsInboxTokenRequest(
  method: string,
  pathname: string,
  token: string | null | undefined
): boolean {
  return (
    method === OPS_INBOX_METHOD &&
    pathname === OPS_INBOX_PATH &&
    isValidAdminReadToken(token)
  )
}
