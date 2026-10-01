import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { toScheduleListItem } from '@/lib/ambient-drop/scheduleList'
import { forbidden, readJson, unexpected } from '@/lib/ambient-drop/scheduleRoute'
import { cancelScheduledAmbientDrop, rescheduleAmbientDrop } from '@/lib/ambient-drop/scheduleStore'

/**
 * 앰비언트 드랍 날짜 예약 시각 수정·취소 (티켓 20261001_2052). 관리자 세션만 쓸 수 있다.
 * 「공개 전」 조건(`status='scheduled'`)과 문장은 `scheduleStore`가 단일 출처다 — 실행 중·실행 뒤 예약은 409,
 * 놓침으로 읽히는 예약의 시각 수정도 409(티켓 20261001_2132), 없는 id는 404다.
 */

/** 시각 수정. 내용(지점·아이템)은 바꾸지 않는다 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const { id } = await params
    const body = await readJson(req)
    const scheduledAt = typeof body === 'object' && body !== null ? (body as Record<string, unknown>).scheduled_at : undefined
    const now = new Date()
    const result = await rescheduleAmbientDrop(createServiceClient(), id, scheduledAt, now)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ schedule: toScheduleListItem(result.schedule, now) })
  } catch (err) {
    return unexpected('예약 시각 수정 응답 실패', err)
  }
}

/** 공개 전 취소. 행은 지우지 않고 `canceled`로 남긴다 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const { id } = await params
    const result = await cancelScheduledAmbientDrop(createServiceClient(), id, new Date())
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return unexpected('예약 취소 응답 실패', err)
  }
}
