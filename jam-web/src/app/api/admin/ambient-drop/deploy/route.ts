/**
 * POST /api/admin/ambient-drop/deploy — 어드민 「지금 배포」
 *
 * 두 갈래다.
 * 1. 본문이 없거나 빈 객체: 저장된 설정으로 배포한다(기존 「지금 배포」 버튼). 예약 배포(auto_enabled)가 켜져 있으면
 *    그 시각(schedule_hour_kst, KST 정시) 전후 exclusion_window_minutes분 동안은 거부한다(409) — 화면의 버튼
 *    비활성화는 UX 편의이고, 실제 강제는 여기서 한다 (레이스 컨디션 방지가 목적, 티켓 20260826_009 §3).
 * 2. 본문이 있음: 지정 배포(티켓 20261001_2053). 날짜 예약 폼의 「지금」이 보낸다. 본문은 예약 등록과 같고
 *    `scheduled_at`은 없거나 `"now"`다. 지정한 지점·아이템으로 한 번만 놓고 `ambient_drop_config`는 읽기만 한다.
 *    저장된 설정으로 도는 매일 배포와 지점·아이템이 다르고 설정을 쓰지 않아 상호 배제 창을 적용하지 않는다.
 *
 * 응답: 설정 배포는 `{ result }`, 지정 배포는 `{ outcome }`.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { getAmbientDropConfig } from '@/lib/ambient-drop/config'
import { runAmbientDropBatch } from '@/lib/ambient-drop'
import {
  formatAmbientDropScheduleTime,
  isWithinAmbientDropExclusionWindow,
} from '@/lib/ambient-drop/schedule'
import { runAmbientDropSpec } from '@/lib/ambient-drop/scheduleRun'
import { checkScheduleCategory } from '@/lib/ambient-drop/schedulePreview'
import { forbidden, unexpected } from '@/lib/ambient-drop/scheduleRoute'
import { parseAmbientDropScheduleInput } from '@/lib/ambient-drop/scheduleSpec'
import { createServiceClient } from '@/lib/supabase/server'

// 지정 배포는 지점·아이템 조회와 드랍 생성을 한 요청에서 한다
export const maxDuration = 60

/** 본문을 읽는다. 비어 있거나 빈 객체면 `empty`, 깨진 JSON이면 `body: null`(입력 검증이 400으로 돌려준다) */
async function readOptionalBody(req: Request): Promise<{ empty: true } | { empty: false; body: unknown }> {
  const text = await req.text().catch(() => '')
  if (text.trim() === '') return { empty: true }
  try {
    const body: unknown = JSON.parse(text)
    if (typeof body === 'object' && body !== null && !Array.isArray(body) && Object.keys(body).length === 0) {
      return { empty: true }
    }
    return { empty: false, body }
  } catch {
    return { empty: false, body: null }
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await getAdminUser()
    if (!admin) return forbidden()

    const read = await readOptionalBody(req)

    if (!read.empty) {
      const now = new Date()
      const parsed = parseAmbientDropScheduleInput(read.body, now, { allowNow: true })
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

      const supabase = createServiceClient()
      const categoryProblem = await checkScheduleCategory(supabase, parsed.spec, '지정 배포')
      if (categoryProblem) return NextResponse.json({ error: categoryProblem.error }, { status: categoryProblem.status })

      const outcome = await runAmbientDropSpec(supabase, parsed.spec, { ranAt: now, trigger: 'manual' })
      return NextResponse.json({ outcome })
    }

    const config = await getAmbientDropConfig()

    if (
      config.auto_enabled &&
      isWithinAmbientDropExclusionWindow(new Date(), config.schedule_hour_kst, config.exclusion_window_minutes)
    ) {
      return NextResponse.json(
        {
          error: `지금은 배포할 수 없어요. 예약 배포 시각 ${formatAmbientDropScheduleTime(config.schedule_hour_kst)} 전후 ${config.exclusion_window_minutes}분이라 배포가 겹칠 수 있어요. 이 시간이 지난 뒤에 다시 눌러주세요.`,
        },
        { status: 409 }
      )
    }

    const result = await runAmbientDropBatch('manual')
    return NextResponse.json({ result })
  } catch (err) {
    return unexpected('지금 배포 응답 실패', err)
  }
}
