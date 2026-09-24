import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { changeBanLevel } from '@/lib/abusing/shadow-ban'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 제재 등급 전환(티켓 20260924_0952) — soft ↔ hard. `POST .../bans`(`applyBan`)는 upsert라
 * `expires_at`을 null로 덮어 임시 제재를 영구 제재로 바꾸므로, 등급만 갱신하는 이 경로를 따로 둔다.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: '제재 ID 형식이 올바르지 않아요.' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as { ban_level?: unknown } | null
  const level = body?.ban_level
  if (level !== 'soft' && level !== 'hard') {
    return NextResponse.json({ error: 'ban_level은 soft 또는 hard여야 해요.' }, { status: 400 })
  }

  try {
    const found = await changeBanLevel(id, level)
    if (!found) return NextResponse.json({ error: '이미 해제된 제재예요. 화면을 새로고침해 주세요.' }, { status: 404 })
  } catch (e) {
    // 어드민 화면이므로 운영자가 원인을 특정할 수 있게 DB 오류 메시지를 함께 노출한다
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `제재 등급이 바뀌지 않았어요. 데이터베이스가 요청을 거부했어요. (${detail})` },
      { status: 500 }
    )
  }
  return NextResponse.json({ ok: true, ban_level: level })
}
