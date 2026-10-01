import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { forbidden, readJson, unexpected } from '@/lib/ambient-drop/scheduleRoute'
import { previewAmbientDropSchedule } from '@/lib/ambient-drop/schedulePreview'

/**
 * 앰비언트 드랍 날짜 예약 등록 전 미리 확인 (티켓 20261001_2052). 관리자 세션만 쓸 수 있고, DB에 쓰지 않는다.
 * 본문은 등록(`POST /api/admin/ambient-drop/schedules`)과 같다. 입력 오류만 400이고, 예정 시각에 놓을 수 없는
 * 대상이 있으면 200 응답의 `preview.problem`에 담긴다. 정적 세그먼트라 `schedules/[id]`보다 먼저 맞는다.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const body = await readJson(req)
    const result = await previewAmbientDropSchedule(createServiceClient(), body, new Date())
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ preview: result.preview })
  } catch (err) {
    return unexpected('예약 미리 확인 응답 실패', err)
  }
}
