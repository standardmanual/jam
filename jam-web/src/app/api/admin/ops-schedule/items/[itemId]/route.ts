/**
 * GET /api/admin/ops-schedule/items/[itemId] — 일정표 항목 서랍의 데이터 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 서랍, 카리나 가정 1·12)
 *
 * 항목 하나와 그 항목의 묶음(항목 전부·결정 기록·밸런스)을 돌려준다. 서랍이 결정·편집에 쓰는 묶음 ID(`bundleId`)도 함께 나간다.
 * 반려·취소·실패 항목도 열린다. **읽기만 한다** — 상태를 바꾸지 않는다.
 *
 * 관리자 로그인 세션만 통과한다(`requireAdmin`). 읽기 토큰(`x-admin-read-token`)으로는 열리지 않는다 — 결정 기록·제출 원본이 들어 있는 화면 데이터다.
 * 없는 항목은 404, UUID가 아니면 400이다. 옛 카드·미션 서랍 키(`card:`·`mission:`)는 운영 묶음에 없어 이 API로 오지 않는다.
 */
import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { getScheduleItemDetail } from '@/lib/admin/opsSchedule/itemDetail'

export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const authError = await requireAdmin()
  if (authError) return authError

  const { itemId } = await params
  if (!isUuid(itemId)) {
    return NextResponse.json({ error: '항목 ID 형식이 올바르지 않아요.' }, { status: 400 })
  }

  try {
    const detail = await getScheduleItemDetail(itemId)
    if (!detail) return NextResponse.json({ error: '찾을 수 없는 항목이에요.' }, { status: 404 })
    return NextResponse.json(detail)
  } catch (error) {
    console.error('[ops-schedule/items] 항목 조회 실패:', error)
    return NextResponse.json({ error: '항목을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.' }, { status: 500 })
  }
}
