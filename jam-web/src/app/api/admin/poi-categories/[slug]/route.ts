import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

// pipeline_linked 관련 필드 검증 — true면 tier(1|2) + 키워드 1개 이상 필수
function validatePipelineFields(pipelineLinked: boolean, tier: unknown, keywords: unknown): string | null {
  if (!pipelineLinked) return null
  if (tier !== 1 && tier !== 2) return '파이프라인 연동 카테고리는 티어(1 또는 2)를 지정해야 합니다.'
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return '파이프라인 연동 카테고리는 키워드가 최소 1개 필요합니다.'
  }
  if (keywords.some((k) => typeof k !== 'string' || !k.trim())) {
    return '키워드는 빈 문자열일 수 없습니다.'
  }
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const { label, pipeline_linked = false, tier = null, keywords = [] } = await req.json()
  if (!label) return NextResponse.json({ error: 'label은 필수입니다.' }, { status: 400 })

  const validationError = validatePipelineFields(pipeline_linked, tier, keywords)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('poi_categories')
    .update({
      label,
      pipeline_linked,
      tier: pipeline_linked ? tier : null,
      keywords: pipeline_linked ? keywords : [],
    })
    .eq('slug', slug)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const supabase = createServiceClient()

  const { count } = await supabase
    .from('poi')
    .select('*', { count: 'exact', head: true })
    .eq('category', slug)
  if (count && count > 0) {
    return NextResponse.json(
      { error: `이 카테고리를 사용 중인 POI가 ${count}개 있어 삭제할 수 없습니다.` },
      { status: 400 }
    )
  }

  const { error } = await supabase.from('poi_categories').delete().eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
