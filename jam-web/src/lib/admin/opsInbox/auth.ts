/**
 * 운영 묶음 제출 경로의 인증 (티켓 20260930_1816). `POST /api/admin/ops-inbox` 라우트만 쓴다.
 *
 * 통과 조건은 둘 중 하나다.
 * 1. 읽기 토큰 제출: 메서드·경로가 제출 경로와 **정확히 일치**하고 `x-admin-read-token`이 맞을 때
 *    (`isOpsInboxTokenRequest`, proxy와 같은 함수). 토큰 쓰기가 열리는 유일한 곳이다.
 * 2. 관리자 로그인: 그 밖의 모든 요청은 `getAdminUser()`로 관리자 세션을 확인한다. 토큰이 맞아도 제출 경로가
 *    아니면 여기로 온다 — 세션이 없으면 거부된다.
 *
 * 토큰 제출의 행위자 이름(`token:<author>`)은 본문을 읽은 뒤 라우트가 붙인다. `author`는 자기 신고라
 * 신뢰하지 않는다 — 권한 판단에 쓰지 않고 기록에만 남긴다.
 *
 * `docs/agents/contract.json`의 `deploy_gate.auth_wrappers`에 등록된 래퍼다(배포 게이트가 이 파일이 실제로
 * 인증을 부르는지 확인한다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser, isOpsInboxTokenRequest } from '@/lib/admin/auth'

export type OpsInboxSubmitAuth =
  | { ok: true; via: 'token' }
  | { ok: true; via: 'admin'; adminId: string }
  | { ok: false; response: NextResponse }

export async function requireOpsInboxSubmit(req: Request): Promise<OpsInboxSubmitAuth> {
  const { pathname } = new URL(req.url)
  if (isOpsInboxTokenRequest(req.method, pathname, req.headers.get('x-admin-read-token'))) {
    return { ok: true, via: 'token' }
  }

  const admin = await getAdminUser()
  if (!admin) {
    return { ok: false, response: NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 }) }
  }
  return { ok: true, via: 'admin', adminId: admin.id }
}
