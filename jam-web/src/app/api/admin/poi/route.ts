import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import { resolvePoiRadiusMeters } from '@/lib/poi/radius-policy'

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('poi').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data })
}

/**
 * pending_review는 마이그레이션 143에서 추가된 컬럼이라 생성 타입(database.generated.ts)에
 * 아직 없다 — db:types CLI 부재로 재생성 불가(`lib/admin/poi-review.ts`와 동일 사유). `.insert()`의
 * 초과 속성 검사가 이 컬럼을 알 수 없는 키로 보고 막으므로, 이 라우트가 실제로 쓰는 컬럼만 포함한
 * 최소 인터페이스로 빌더를 좁게 캐스팅한다.
 */
interface PoiInsertWithReviewColumn {
  insert: (values: {
    name: string
    latitude: number
    longitude: number
    radius_meters: number
    category: string
    linked_badge_id: string | null
    is_active: boolean
    pending_review: boolean
  }) => { select: () => { single: () => PromiseLike<{ data: unknown; error: { message: string } | null }> } }
}

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, latitude, longitude, radius_meters, category, linked_badge_id } = body

  if (!name || latitude == null || longitude == null || !radius_meters || !category) {
    return NextResponse.json({ error: '필수 필드가 누락되었습니다.' }, { status: 400 })
  }

  const supabase = createServiceClient()
  // 티켓 20260907_1811 — 자동수집 중단·수동등록 전환에 따라, 어드민에서 신규 등록하는 모든
  // POI는 클라이언트가 무엇을 보내든 항상 "임시등록"(비활성·검토대기)으로 저장한다. 최종
  // 노출(is_active=true)은 검토 큐/편집 화면에서 확인·수정 후 명시적으로 활성화해야만 이뤄진다
  // (`api/admin/poi/[id]/route.ts` PUT의 활성화 시 pending_review 자동 해제 로직과 짝을 이룬다).
  const insertPayload = {
    name,
    latitude,
    longitude,
    radius_meters: resolvePoiRadiusMeters(category, radius_meters),
    category,
    linked_badge_id: linked_badge_id ?? null,
    is_active: false,
    pending_review: true,
  }
  const table = supabase.from('poi') as unknown as PoiInsertWithReviewColumn
  const { data, error } = await table.insert(insertPayload).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ poi: data }, { status: 201 })
}
