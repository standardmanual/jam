/**
 * DELETE /api/admin/ops-inbox/[bundleId] — 시험 묶음 지우기 (티켓 20260930_1818)
 *
 * 시험 묶음(`is_sample`)만 지운다. 묶음 행을 지우면 항목과 결정 기록이 함께 지워진다(ON DELETE CASCADE, 마이그레이션 198).
 * 시험이 아닌 묶음은 403이다 — 결정 기록은 에이전트의 학습 재료라 남긴다. 처리는 `opsInbox/decide.ts`의 `deleteSampleBundle`이 한다.
 *
 * 관리자 로그인 세션만 통과한다. 읽기 토큰으로는 이 경로에 닿기 전에 proxy가 로그인으로 돌려보낸다.
 */
import { NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/admin/auth'
import { isUuid } from '@/lib/admin/uuid'
import { createServiceClient } from '@/lib/supabase/server'
import { deleteSampleBundle } from '@/lib/admin/opsInbox/decide'

export async function DELETE(_req: Request, { params }: { params: Promise<{ bundleId: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요해요.' }, { status: 403 })

  const { bundleId } = await params
  if (!isUuid(bundleId)) return NextResponse.json({ error: '기획 ID 형식이 올바르지 않아요.' }, { status: 400 })

  const outcome = await deleteSampleBundle(createServiceClient(), bundleId)
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.extra }, { status: outcome.status })
  return NextResponse.json(outcome.body)
}
