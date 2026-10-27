/**
 * PATCH /api/admin/ops-trend-sources/[id] — 트렌드 출처 수정·켜기·끄기 (티켓 20261026_2033 1회차, 어드민 상황판 PRD §6.4)
 *
 * **관리자 세션만** 통과한다(`getAdminUser()`가 없으면 403, 읽기 토큰은 보지 않는다). `id`가 UUID가 아니면 404,
 * 검증 실패 400(종류가 직접 올린 자료가 아닌데 위치를 비우는 경우 포함), 이름 중복 409, 없는 행 404, 성공 200 `{ source }`.
 * 삭제 경로는 없다. 옛 묶음의 `source_ids`가 번호로 남아 있어서 끄기로 대신한다. 오류 본문에 내부 메시지를 싣지 않는다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { OPS_TREND_SOURCE_MAX_BODY_BYTES } from '@/lib/admin/opsTrends/constants'
import { validateTrendSourcePatch } from '@/lib/admin/opsTrends/sources'
import { updateTrendSource } from '@/lib/admin/opsTrends/sourceStore'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function badRequest(error: string, details?: string[]) {
  return NextResponse.json(details ? { error, details } : { error }, { status: 400 })
}

function notFound() {
  return NextResponse.json({ error: '출처를 찾을 수 없어요. 목록을 새로 고쳐 주세요.' }, { status: 404 })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '어드민 권한이 필요합니다.' }, { status: 403 })

  const { id } = await params
  if (!UUID_PATTERN.test(id)) return notFound()

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > OPS_TREND_SOURCE_MAX_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 출처 수정은 8KB까지 받아요. 내용을 줄여서 다시 보내 주세요.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  const validation = validateTrendSourcePatch(parsed)
  if (!validation.ok) {
    return badRequest('출처 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.errors)
  }

  try {
    const result = await updateTrendSource(createServiceClient(), id, validation.value)
    if (!result.ok) {
      if (result.code === 'duplicate') {
        return NextResponse.json({ error: '같은 이름의 출처가 이미 있어요. 다른 이름으로 바꿔 주세요.' }, { status: 409 })
      }
      if (result.code === 'location_required') {
        return badRequest('출처 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', [
          'location: 직접 올린 자료가 아닌 종류는 주소·해시태그·검색어를 적어야 해요.',
        ])
      }
      return notFound()
    }
    return NextResponse.json({ source: result.source })
  } catch (error) {
    console.error('[admin/ops-trend-sources] 출처 수정 실패:', error)
    return NextResponse.json({ error: '출처를 수정하지 못했어요. 잠시 뒤에 다시 시도해 주세요.' }, { status: 500 })
  }
}
