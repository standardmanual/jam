import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/admin/uuid'
import {
  TRIBE_CHANGE_MEMO_MAX_LENGTH,
  changeUserTribe,
  fetchTribeChangeHistory,
  previewTribeChange,
  type ChangeUserTribeFailure,
} from '@/lib/admin/user-tribe'

/**
 * 어드민의 유저 트라이브 변경 (티켓 20261021_1247 2회, 운영 로직 2.4절)
 *
 * - POST: 유저의 트라이브를 바꾼다. 본문 `{ newTribeId, reasonCode, memo? }`. 갱신·참가 취소·변경 기록은 DB 함수 하나가 한 트랜잭션으로 처리하고
 *   (`admin_change_user_tribe`, 마이그레이션 259), 성공하면 유저에게 소식을 보낸다. 거절은 DB가 아무것도 바꾸지 않은 상태다.
 * - GET: 최근 변경 이력과, `?newTribeId=`가 있으면 그 트라이브로 바꿨을 때 참가가 취소될 미션 미리 보기(읽기만).
 *
 * 어드민만 부를 수 있다(`getAdminUser()`, 아니면 403). 서버 오류는 DB 오류 원문 없이 고정 문구로 응답하고 원인은 서버 로그에만 남긴다.
 */

const FAILURES: Record<ChangeUserTribeFailure, { status: number; error: string }> = {
  invalid_reason: { status: 400, error: '사유를 목록에서 골라 주세요' },
  invalid_memo: { status: 400, error: '메모 형식이 올바르지 않아요' },
  memo_required: { status: 400, error: '사유가 "기타"일 때는 메모를 적어 주세요' },
  memo_too_long: { status: 400, error: `메모는 ${TRIBE_CHANGE_MEMO_MAX_LENGTH}자까지 적을 수 있어요` },
  user_not_found: { status: 404, error: '해당 유저를 찾지 못했어요. 유저 UUID가 맞는지 확인해 주세요.' },
  no_tribe: { status: 409, error: '트라이브를 아직 고르지 않은 유저예요. 유저가 고르기 화면에서 직접 골라요.' },
  invalid_tribe: { status: 409, error: '고를 수 없는 트라이브예요. 활성 상태인 트라이브인지 확인해 주세요.' },
  same_tribe: { status: 409, error: '이미 이 트라이브를 고른 유저예요. 다른 트라이브를 골라 주세요.' },
}

const INVALID_USER_ID = { error: '유저 UUID 형식이 올바르지 않아요', code: 'invalid_user_id' }
const INVALID_TRIBE_ID = { error: '바꿀 트라이브를 골라 주세요', code: 'invalid_tribe_id' }
const CHANGE_FAILED = '트라이브를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'
const READ_FAILED = '트라이브 변경 정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const userId = id.trim()
  if (!isUuid(userId)) return NextResponse.json(INVALID_USER_ID, { status: 400 })

  const body = (await req.json().catch(() => null)) as { newTribeId?: unknown; reasonCode?: unknown; memo?: unknown } | null
  const newTribeId = typeof body?.newTribeId === 'string' ? body.newTribeId.trim() : ''
  if (!isUuid(newTribeId)) return NextResponse.json(INVALID_TRIBE_ID, { status: 400 })

  try {
    const result = await changeUserTribe(createServiceClient(), {
      adminId: admin.id,
      userId,
      newTribeId,
      reasonCode: body?.reasonCode,
      memo: body?.memo,
    })
    if (!result.ok) {
      const failure = FAILURES[result.code]
      return NextResponse.json({ error: failure.error, code: result.code }, { status: failure.status })
    }

    console.info(
      `[admin/users/tribe] userId: ${userId}, ${result.fromTribeId} → ${result.toTribeId}, 취소된 미션 ${result.cancelledMissions.length}건, changeId: ${result.changeId} (by admin: ${admin.email})`
    )
    return NextResponse.json({
      ok: true,
      changeId: result.changeId,
      fromTribeId: result.fromTribeId,
      toTribeId: result.toTribeId,
      toTribeName: result.toTribeName,
      cancelledMissions: result.cancelledMissions,
    })
  } catch (error) {
    // DB 오류 원문은 응답에 싣지 않는다(내부 구조가 새 나간다). 원인은 서버 로그로만 확인한다
    console.error(`[admin/users/tribe] 트라이브 변경 실패 — userId: ${userId}, newTribeId: ${newTribeId} (by admin: ${admin.email}):`, error)
    return NextResponse.json({ error: CHANGE_FAILED }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const userId = id.trim()
  if (!isUuid(userId)) return NextResponse.json(INVALID_USER_ID, { status: 400 })

  const rawTribeId = req.nextUrl.searchParams.get('newTribeId')
  const newTribeId = rawTribeId === null ? null : rawTribeId.trim()
  if (newTribeId !== null && !isUuid(newTribeId)) return NextResponse.json(INVALID_TRIBE_ID, { status: 400 })

  try {
    const supabase = createServiceClient()
    const { data: user, error: userError } = await supabase.from('users').select('id').eq('id', userId).maybeSingle()
    if (userError) throw new Error(`users 조회 실패: ${userError.message}`)
    if (!user) return NextResponse.json({ error: FAILURES.user_not_found.error, code: 'user_not_found' }, { status: 404 })

    const history = await fetchTribeChangeHistory(supabase, userId)
    const preview =
      newTribeId === null ? null : { newTribeId, cancelledMissions: await previewTribeChange(supabase, userId, newTribeId) }
    return NextResponse.json({ history, preview })
  } catch (error) {
    console.error(`[admin/users/tribe] 읽기 실패 — userId: ${userId} (by admin: ${admin.email}):`, error)
    return NextResponse.json({ error: READ_FAILED }, { status: 500 })
  }
}
