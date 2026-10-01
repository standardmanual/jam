import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { listAmbientDropSchedules, toScheduleListItem } from '@/lib/ambient-drop/scheduleList'
import { forbidden, readJson, unexpected } from '@/lib/ambient-drop/scheduleRoute'
import { createAmbientDropSchedule } from '@/lib/ambient-drop/scheduleStore'

/**
 * 앰비언트 드랍 날짜 예약 목록·등록 (티켓 20261001_2052). 관리자 세션만 쓸 수 있다.
 * 규칙·문장은 서버 함수(`scheduleList`·`scheduleStore`)가 단일 출처다 — 이 라우트는 인증과 응답 모양만 맡는다.
 */

/** 최근 예약 50건(예정 시각 내림차순)과 지점·아이템·컬렉션 이름 */
export async function GET() {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const result = await listAmbientDropSchedules(createServiceClient(), new Date())
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ schedules: result.schedules, names: result.names })
  } catch (err) {
    return unexpected('예약 목록 응답 실패', err)
  }
}

/** 예약 등록. `created_by`에는 관리자 이메일이 들어간다 */
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const body = await readJson(req)
    const now = new Date()
    const result = await createAmbientDropSchedule(createServiceClient(), body, admin.email, now)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ schedule: toScheduleListItem(result.schedule, now) }, { status: 201 })
  } catch (err) {
    return unexpected('예약 등록 응답 실패', err)
  }
}
