/**
 * POST /api/admin/ops-inbox/routine-start — 루틴 「시작」 기록 (티켓 20261026_2032, 어드민 상황판 PRD §5.3)
 *
 * 주간 루틴이 시작할 때 읽기 토큰(`x-admin-read-token`)으로 한 줄을 보낸다. 토큰 쓰기가 열리는 **두 번째이자 마지막 경로**다
 * (제출 경로 다음, 경로·메서드는 `opsInbox/constants.ts` 상수를 proxy와 이 라우트가 함께 쓴다). 관리자 로그인 세션으로도 보낼 수 있다.
 *
 * 흐름: ① 인증 → ② 본문 16KB 확인 → ③ JSON 파싱 → ④ 형식 검증(틀리면 400) → ⑤ 저장.
 * 같은 `run_key`를 다시 보내면 덮어쓰지 않고 200(이미 받음)이다. 제출 경로에 섞지 않은 이유: 제출의 1MB 본문 한계·시간당 제출
 * 수 제한이 같이 걸리면 루틴이 시작 직후 한 줄만 보내기 어렵다. DB 오류 원문은 응답에 싣지 않는다.
 */
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireOpsInboxSubmit } from '@/lib/admin/opsInbox/auth'
import { MAX_ROUTINE_START_BODY_BYTES } from '@/lib/admin/opsInbox/constants'
import { recordRoutineStart, validateRoutineStart } from '@/lib/admin/opsInbox/routineStart'

function badRequest(error: string, details?: string[]) {
  return NextResponse.json(details ? { error, details } : { error }, { status: 400 })
}

export async function POST(req: Request) {
  // ① 인증
  const auth = await requireOpsInboxSubmit(req)
  if (!auth.ok) return auth.response

  // ② 본문 크기
  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_ROUTINE_START_BODY_BYTES) {
    return badRequest('본문이 너무 커요. 시작 기록은 16KB까지 받아요. 항목을 줄여서 다시 보내 주세요.')
  }

  // ③ JSON 파싱
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 올바른 JSON인지 확인하고 다시 보내 주세요.')
  }

  // ④ 형식 검증
  const validation = validateRoutineStart(parsed)
  if (!validation.ok) {
    return badRequest('시작 기록의 형식이 맞지 않아요. details를 보고 고쳐서 다시 보내 주세요.', validation.errors)
  }

  // ⑤ 저장
  const result = await recordRoutineStart(createServiceClient(), validation.value)
  if (!result.ok) {
    return NextResponse.json({ error: '저장하지 못했어요. 잠시 뒤에 다시 보내 주세요.' }, { status: 500 })
  }
  if (!result.created) {
    return NextResponse.json(
      { status: 'duplicate', message: '이미 받았어요.', run_key: validation.value.run_key },
      { status: 200 }
    )
  }
  return NextResponse.json({ status: 'created', id: result.id, run_key: validation.value.run_key }, { status: 201 })
}
