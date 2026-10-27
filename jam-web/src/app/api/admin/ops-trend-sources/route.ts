/**
 * GET·POST /api/admin/ops-trend-sources — 트렌드 출처 목록 읽기와 등록 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4)
 *
 * - GET 인증: 관리자 세션 또는 어드민 읽기 토큰(`requireAdminRead`, GET 전용).
 *   · 읽기 토큰으로 온 요청: **켜진 출처만** `{ sources: [{ no, name, kind, location }] }`. `includeDisabled`는 무시한다.
 *   · 관리자 세션: 기본은 켜진 출처, `?includeDisabled=true`이면 전부
 *     `{ sources: [{ id, no, name, kind, location, enabled, lastReadAt, createdAt }] }`.
 * - POST(출처 등록): **관리자 세션만**(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). 본문은 8KB까지,
 *   검증 실패 400, 이름 중복 409, 성공 201 `{ source }`.
 * - 응답에 `created_by`를 싣지 않는다. 오류 본문에 내부 메시지를 싣지 않는다(원문은 서버 로그에만 남긴다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser, isAdminReadTokenRequest, requireAdminRead } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_TREND_SOURCE_MAX_BODY_BYTES } from '@/lib/admin/opsTrends/constants'
import { validateTrendSourceCreate } from '@/lib/admin/opsTrends/sources'
import { createTrendSource, listTrendSources } from '@/lib/admin/opsTrends/sourceStore'

export async function GET(req: Request) {
  const denied = await requireAdminRead(req)
  if (denied) return denied

  const viaToken = isAdminReadTokenRequest(req)
  const includeDisabled = !viaToken && new URL(req.url).searchParams.get('includeDisabled') === 'true'

  try {
    const sources = await listTrendSources(createServiceClient(), { includeDisabled, withLastReadAt: !viaToken })
    if (viaToken) {
      return NextResponse.json({
        sources: sources.map(({ no, name, kind, location }) => ({ no, name, kind, location })),
      })
    }
    return NextResponse.json({
      sources: sources.map(({ id, no, name, kind, location, enabled, lastReadAt, createdAt }) => ({
        id,
        no,
        name,
        kind,
        location,
        enabled,
        lastReadAt,
        createdAt,
      })),
    })
  } catch (error) {
    console.error('[admin/ops-trend-sources] 출처 목록 조회 실패:', error)
    return NextResponse.json({ error: '트렌드 출처를 불러오지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, { status: 500 })
  }
}

function badRequest(error: string, details?: string[]) {
  return NextResponse.json(details ? { error, details } : { error }, { status: 400 })
}

export async function POST(req: Request) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > OPS_TREND_SOURCE_MAX_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 출처 등록은 8KB까지 받아요. 내용을 줄여서 다시 보내 주세요.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  const validation = validateTrendSourceCreate(parsed)
  if (!validation.ok) {
    return badRequest('출처 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.errors)
  }

  try {
    const result = await createTrendSource(createServiceClient(), validation.value, admin.id)
    if (!result.ok) {
      return NextResponse.json({ error: '같은 이름의 출처가 이미 있어요. 다른 이름으로 등록해 주세요.' }, { status: 409 })
    }
    return NextResponse.json({ source: result.source }, { status: 201 })
  } catch (error) {
    console.error('[admin/ops-trend-sources] 출처 등록 실패:', error)
    return NextResponse.json({ error: '출처를 등록하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, { status: 500 })
  }
}
