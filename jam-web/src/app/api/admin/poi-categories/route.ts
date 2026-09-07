import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/admin/auth'
import type { PoiCategoryRow, PoiCategoryKeyword } from '@/types/database'

const SLUG_RE = /^[a-z][a-z0-9_]*$/

/**
 * requires_review(마이그레이션 143)·display_on_map(마이그레이션 144)은 최근 추가된
 * 컬럼이라 생성 타입(database.generated.ts)에 아직 없다 — db:types CLI 부재로 재생성
 * 불가(완료 보고 참고). `.insert()`의 초과 속성 검사가 이 컬럼들을 알 수 없는 키로 보고
 * 막으므로, 실제로 쓰는 컬럼만 포함한 최소 인터페이스로 빌더를 좁게 캐스팅한다
 * (`lib/engine-log/index.ts`와 동일 기법). keywords도 144에서 text[]→jsonb로 바뀌어
 * 타입이 달라졌다.
 */
interface PoiCategoriesInsertWithReview {
  insert: (values: {
    slug: string
    label: string
    pipeline_linked: boolean
    tier: number | null
    keywords: PoiCategoryKeyword[]
    requires_review: boolean
    display_on_map: boolean
  }) => {
    select: () => {
      single: () => PromiseLike<{ data: PoiCategoryRow | null; error: { message: string; code?: string } | null }>
    }
  }
}

export async function GET() {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = createServiceClient()
  const { data, error } = await supabase.from('poi_categories').select('*').order('slug')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
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

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const {
    slug,
    label,
    pipeline_linked = false,
    tier = null,
    keywords = [],
    requires_review = false,
    display_on_map = true,
  } = body

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
    keywords: pipeline_linked ? (keywords as PoiCategoryKeyword[]) : [],
    requires_review: Boolean(requires_review),
    display_on_map: Boolean(display_on_map),
  }
  const poiCategoriesQuery = supabase.from('poi_categories') as unknown as PoiCategoriesInsertWithReview
  const insertQuery = poiCategoriesQuery.insert(insertPayload)
  const { data, error } = await insertQuery.select().single()

  if (error) {
    const message = error.code === '23505' ? '이미 존재하는 slug입니다.' : error.message
    return NextResponse.json({ error: message }, { status: 400 })
  }
  return NextResponse.json({ category: data }, { status: 201 })
}
