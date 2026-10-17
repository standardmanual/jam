import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { liftSuspension } from '@/lib/suspension/suspension-write'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 이용 정지 풀기(티켓 20261017_1426 2회) — `id`는 정지 이력 한 줄의 id다. 본문의 `note`(선택)는 상담 결과 메모다.
 * 어드민만 부를 수 있다(`getAdminUser()`, 아니면 403). 이미 풀렸거나 없는 정지는 409다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: '정지 ID 형식이 올바르지 않아요.', code: 'invalid_id' }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as { note?: unknown } | null
  const note = typeof body?.note === 'string' ? body.note : null

  try {
    const result = await liftSuspension(createServiceClient(), { suspensionId: id, adminEmail: admin.email, note })
    if (!result.ok) {
      return NextResponse.json(
        { error: '이미 풀렸거나 진행 중이 아닌 정지예요. 화면을 새로고침해 주세요.', code: result.code },
        { status: 409 }
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `이용 정지가 풀리지 않았어요. 데이터베이스가 요청을 거부했어요. (${detail})` },
      { status: 500 }
    )
  }
}
