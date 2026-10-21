/**
 * GET·PUT /api/admin/chapter-names — 트라이브 × 챕터 이름 표 (티켓 20261019_1318 2회, 운영 로직 12.5절)
 * GET: 표 전체(트라이브, 챕터 번호, 이름이 있는 칸). PUT: 바뀐 칸만 `{ changes: [{ tribe_id, chapter_no, name }] }`로 받아 저장한다.
 * 규칙(공백 정리, 길이 상한, 빈 칸 = 행 삭제)은 `lib/chapter/names-table.ts`가 단일 출처다.
 * 오류 응답은 고정 문구다 — DB 오류 원문은 서버 로그에만 남긴다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { createServiceClient } from '@/lib/supabase/server'
import {
  CHAPTER_NAMES_BODY_INVALID_MESSAGE,
  CHAPTER_NAMES_PARTIAL_ERROR_MESSAGE,
  CHAPTER_NAMES_READ_ERROR_MESSAGE,
  CHAPTER_NAMES_SAVE_ERROR_MESSAGE,
  ChapterNamesSaveError,
  parseChapterNameChanges,
  readChapterNamesTable,
  saveChapterNameChanges,
} from '@/lib/chapter/names-table'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    return NextResponse.json(await readChapterNamesTable(createServiceClient()))
  } catch (e) {
    console.error('[api/admin/chapter-names GET] 읽기 실패:', e)
    return NextResponse.json({ error: CHAPTER_NAMES_READ_ERROR_MESSAGE }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: CHAPTER_NAMES_BODY_INVALID_MESSAGE }, { status: 400 })
  }

  const parsed = parseChapterNameChanges(body)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    const result = await saveChapterNameChanges(createServiceClient(), parsed.changes)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, saved: result.saved, cleared: result.cleared })
  } catch (e) {
    console.error('[api/admin/chapter-names PUT] 저장 실패:', e)
    const partial = e instanceof ChapterNamesSaveError && e.partial
    return NextResponse.json(
      { error: partial ? CHAPTER_NAMES_PARTIAL_ERROR_MESSAGE : CHAPTER_NAMES_SAVE_ERROR_MESSAGE },
      { status: 500 }
    )
  }
}
