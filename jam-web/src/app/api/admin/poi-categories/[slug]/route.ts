import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { PoiCategoryRow, PoiCategoryKeyword } from '@/types/database'

/**
 * requires_review(마이그레이션 143)·display_on_map(마이그레이션 144)은 최근 추가된
 * 컬럼이라 생성 타입(database.generated.ts)에 아직 없다 — db:types CLI 부재로 재생성
 * 불가(완료 보고 참고). `.update()`의 초과 속성 검사가 이 컬럼들을 알 수 없는 키로 보고
 * 막으므로, 실제로 쓰는 컬럼만 포함한 최소 인터페이스로 빌더를 좁게 캐스팅한다
 * (`lib/engine-log/index.ts`와 동일 기법). keywords도 144에서 text[]→jsonb로 바뀌어
 * 타입이 달라졌다.
 */
interface PoiCategoriesUpdateWithReview {
  update: (values: {
    label: string
    pipeline_linked: boolean
    tier: number | null
    keywords: PoiCategoryKeyword[]
    requires_review: boolean
    display_on_map: boolean
  }) => {
    eq: (column: string, value: string) => {
      select: () => {
        single: () => PromiseLike<{ data: PoiCategoryRow | null; error: { message: string } | null }>
      }
    }
  }
}

function isValidKeywordScope(scope: unknown): scope is PoiCategoryKeyword['scope'] {
  return scope === 'dong' || scope === 'gu' || scope === 'sido'
}

function isValidKeyword(k: unknown): k is PoiCategoryKeyword {
  if (typeof k !== 'object' || k === null) return false
  const candidate = k as { keyword?: unknown; scope?: unknown }
  return typeof candidate.keyword === 'string' && candidate.keyword.trim().length > 0 && isValidKeywordScope(candidate.scope)
}

// pipeline_linked 관련 필드 검증 — true면 tier(1|2) + 키워드({keyword, scope}) 1개 이상 필수
function validatePipelineFields(pipelineLinked: boolean, tier: unknown, keywords: unknown): string | null {
  if (!pipelineLinked) return null
  if (tier !== 1 && tier !== 2) return '파이프라인 연동 카테고리는 티어(1 또는 2)를 지정해야 합니다.'
  if (!Array.isArray(keywords) || keywords.length === 0) {
    return '파이프라인 연동 카테고리는 키워드가 최소 1개 필요합니다.'
  }
  if (keywords.some((k) => !isValidKeyword(k))) {
    return '키워드는 { keyword, scope } 형태여야 하며 keyword는 빈 문자열일 수 없고 scope는 dong/gu/sido 중 하나여야 합니다.'
  }
  return null
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { slug } = await params
  const {
    label,
    pipeline_linked = false,
    tier = null,
    keywords = [],
    requires_review = false,
    display_on_map = true,
  } = await req.json()
  if (!label) return NextResponse.json({ error: 'label은 필수입니다.' }, { status: 400 })

  const validationError = validatePipelineFields(pipeline_linked, tier, keywords)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const supabase = createServiceClient()
  const updatePayload = {
    label,
    pipeline_linked,
    tier: pipeline_linked ? tier : null,
    keywords: pipeline_linked ? (keywords as PoiCategoryKeyword[]) : [],
    requires_review: Boolean(requires_review),
    display_on_map: Boolean(display_on_map),
  }
  const poiCategoriesQuery = supabase.from('poi_categories') as unknown as PoiCategoriesUpdateWithReview
  const { data, error } = await poiCategoriesQuery
    .update(updatePayload)
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
