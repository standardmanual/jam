/**
 * 앰비언트 드랍 날짜 예약 어드민 라우트 3개가 함께 쓰는 응답 도우미 (서버, 티켓 20261001_2052)
 *
 * 라우트 파일은 HTTP 메서드 외의 export를 둘 수 없어서 공용 문장·응답을 여기에 둔다.
 * 400·404·409 문장은 서버 함수(`scheduleStore`·`schedulePreview`)가 정한 그대로 내보낸다.
 */
import { NextResponse } from 'next/server'

export const SCHEDULE_FORBIDDEN =
  '관리자만 쓸 수 있어요. 관리자 계정으로 로그인되어 있지 않아요. 관리자 계정으로 다시 로그인해 주세요.'

export const SCHEDULE_UNEXPECTED =
  '요청을 처리하지 못했어요. 서버에서 예기치 못한 오류가 났어요. 잠시 후 다시 시도해 주세요.'

/** 관리자가 아닐 때의 403 */
export function forbidden(): NextResponse {
  return NextResponse.json({ error: SCHEDULE_FORBIDDEN }, { status: 403 })
}

/** 예기치 못한 예외의 500 — 원문은 서버 로그에만 남기고 응답에는 고정 문장만 싣는다 */
export function unexpected(tag: string, err: unknown): NextResponse {
  console.error(`[ambient-drop-schedule] ${tag}:`, err)
  return NextResponse.json({ error: SCHEDULE_UNEXPECTED }, { status: 500 })
}

/** 요청 본문을 JSON으로 읽는다. 깨졌으면 null이고, 입력 검증이 400으로 돌려준다 */
export function readJson(req: Request): Promise<unknown> {
  return req.json().catch(() => null)
}
