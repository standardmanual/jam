import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/admin/auth'
import { parseExportIds } from '@/lib/admin/export-ids'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { formatKstYmd } from '@/lib/admin/kst-format'
import { fetchUserRowsByIds } from '@/lib/admin/user-list'

/**
 * 선택한 유저를 CSV로 내보낸다(티켓 20260924_0951, 상위 티켓 §4.4). ID 목록을 본문으로 받는다 —
 * 최대 1,000명(전체 선택 상한)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어 POST로 받는다
 * (`badges/export/route.ts`와 동일 이유).
 */
export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const parsed = parseExportIds(body, '내보낼 유저를 선택해주세요.')
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status })
  const uniqueIds = parsed.ids

  let rows
  try {
    rows = await fetchUserRowsByIds(createServiceClient(), uniqueIds)
  } catch (error) {
    console.error('[admin/users/export]', error)
    return NextResponse.json({ error: '유저 정보를 불러오지 못했습니다.' }, { status: 500 })
  }

  const csv = toCsv(rows, [
    { header: 'ID', value: (r) => r.id },
    { header: '이름', value: (r) => r.username },
    { header: '표시 이름', value: (r) => r.displayName },
    { header: '이메일', value: (r) => r.email },
    { header: '트라이브', value: (r) => r.tribeName },
    { header: '가입일', value: (r) => formatKstYmd(r.createdAt) },
    { header: '온보딩', value: (r) => (r.onboarded ? '완료' : '미완료') },
    { header: '어드민', value: (r) => (r.isAdmin ? '예' : '아니오') },
    {
      header: '제재',
      value: (r) => (r.banLevel ? `${r.banLevel}${r.banExpiresAt ? `(~${formatKstYmd(r.banExpiresAt)})` : ''}` : '없음'),
    },
  ])

  const filename = `users_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
