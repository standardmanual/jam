/**
 * GET·PUT /api/admin/balance/[section] — 밸런스 설정 구역의 현재 값 읽기·바꾸기 (티켓 20261022_1132, 운영 로직 19.1절)
 *
 * - `GET`: `{ values, updatedAt, history }` — 구역의 현재 값, 화면이 저장 때 돌려보낼 수정 시각, 최근 변경 몇 건(바꾼 사람은 표시 이름만, ID·이메일 없음).
 * - `PUT`: 본문 `{ values, expectedUpdatedAt, note? }`. 처리와 규칙(칸별 검증, 바뀐 칸만 계산, `updated_at` 조건 갱신, 이력 쓰기와 되돌리기)은 `lib/admin/balance/save.ts`의
 *   `saveBalanceSection`이 한다. 이 라우트는 인증·구역 찾기·본문 읽기·응답만 맡는다. 응답은 200 `{ values, updatedAt, changes, affectsDisclosure }`,
 *   400 `{ error, fieldErrors? }`, 404, 409, 500이다. 응답에 DB 오류 원문을 싣지 않는다.
 *
 * 알 수 없는 구역은 404다(구역은 `lib/admin/balance/sections.tsx` 레지스트리에 있는 것만). 오류 문구는 현상 → 원인 → 해결책 순서다.
 * 관리자 로그인 세션(`getAdminUser()`)만 통과한다. 읽기 토큰은 이 경로에서 보지 않는다(토큰 쓰기 예외는 운영 묶음 제출 경로 하나뿐이다).
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { findBalanceSection } from '@/lib/admin/balance/sections'
import {
  BALANCE_LOAD_FAILED_MESSAGE,
  BALANCE_SECTION_NOT_FOUND_MESSAGE,
  loadBalanceSection,
  saveBalanceSection,
} from '@/lib/admin/balance/save'

/** 본문 상한(바이트). 칸 값 몇 개와 메모 수준이다. */
const MAX_BODY_BYTES = 16_384

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 })
}

type RouteContext = { params: Promise<{ section: string }> }

export async function GET(_req: Request, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { section: sectionKey } = await params
  const section = findBalanceSection(sectionKey)
  if (!section) return NextResponse.json({ error: BALANCE_SECTION_NOT_FOUND_MESSAGE }, { status: 404 })

  try {
    const loaded = await loadBalanceSection(createServiceClient(), section.binding)
    return NextResponse.json({ values: loaded.values, updatedAt: loaded.updatedAt, history: loaded.history })
  } catch (error) {
    console.error(`[admin/balance] ${sectionKey} 읽기 실패:`, error instanceof Error ? error.message : error)
    return NextResponse.json({ error: BALANCE_LOAD_FAILED_MESSAGE }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: RouteContext) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { section: sectionKey } = await params
  const section = findBalanceSection(sectionKey)
  if (!section) return NextResponse.json({ error: BALANCE_SECTION_NOT_FOUND_MESSAGE }, { status: 404 })

  const text = await req.text()
  if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) return badRequest('본문이 너무 커요. 바꾼 칸과 메모만 보내 주세요.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return badRequest('본문을 JSON으로 읽을 수 없어요. 화면을 새로고침한 뒤 다시 저장해 주세요.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return badRequest('본문은 객체여야 해요.')
  const input = body as Record<string, unknown>

  const outcome = await saveBalanceSection(createServiceClient(), {
    binding: section.binding,
    values: input.values,
    expectedUpdatedAt: input.expectedUpdatedAt,
    note: input.note,
    actor: admin.id,
  })

  if (!outcome.ok) {
    return NextResponse.json(
      { error: outcome.error, ...(outcome.fieldErrors ? { fieldErrors: outcome.fieldErrors } : {}) },
      { status: outcome.status }
    )
  }
  return NextResponse.json({
    values: outcome.values,
    updatedAt: outcome.updatedAt,
    changes: outcome.changes,
    affectsDisclosure: outcome.affectsDisclosure,
  })
}
