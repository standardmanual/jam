import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'

const SLUG_RE = /^[a-z][a-z0-9_]*$/

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('poi_categories').select('*').order('slug')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
}

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

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { slug, label, pipeline_linked = false, tier = null, keywords = [] } = body

  if (!slug || !label) {
    return NextResponse.json({ error: 'slug, label은 필수입니다.' }, { status: 400 })
  }
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: 'slug는 영문 소문자/숫자/밑줄만 가능하며 알파벳으로 시작해야 합니다. 예: fitness_center' },
      { status: 400 }
    )
  }
  const validationError = validatePipelineFields(pipeline_linked, tier, keywords)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const supabase = createServiceClient()
  const insertPayload = {
    slug,
    label,
    pipeline_linked,
    tier: pipeline_linked ? tier : null,
    keywords: pipeline_linked ? keywords : [],
  }
  const { data, error } = await supabase
    .from('poi_categories')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .insert(insertPayload as any)
    .select()
    .single()

  if (error) {
    const message = error.code === '23505' ? '이미 존재하는 slug입니다.' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ category: data }, { status: 201 })
}
