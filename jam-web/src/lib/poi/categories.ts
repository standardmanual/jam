// 드랍/픽업 지도에 노출할 POI 카테고리 — 전부 네이버 지역검색으로 자동 수집(어드민 수동 등록 없음)
// level 1: 항상 검색 / level 2: level 1 결과가 지역 내 부족할 때만 보조로 검색 (API 호출 한도 절약)
//
// 카테고리 목록·키워드·티어는 어드민 화면(/admin/poi/categories)에서 poi_categories 테이블에
// 저장된 값을 직접 관리한다 (과거엔 이 파일에 하드코딩돼 있었음) — loadPipelineCategories가
// 매 요청마다 그 값을 읽어온다.
import type { PoiCategory, PoiCategoryKeyword } from '@/types/database'
import type { createServiceClient } from '@/lib/supabase/server'

export interface PoiCategoryConfig {
  category: PoiCategory
  keywords: PoiCategoryKeyword[]
  level: 1 | 2
  /** 20260907_1242 — 이 카테고리 수집 시 원본 분류 검증 게이트(3단계 판정)를 적용할지 여부.
   *  poi_categories.requires_review 그대로 전달 — false면 기존처럼 무조건 자동 저장된다. */
  requiresReview: boolean
  /** 20260907_1243 — poi_categories.display_on_map 그대로 전달. false면 자동수집한 POI를
   *  is_active=false로 저장해 지도에는 노출하지 않는다(수집 자체는 계속). */
  displayOnMap: boolean
}

// level 1 검색 결과가 이 개수 미만이면 level 2(보조 카테고리)까지 검색
export const LEVEL_2_FALLBACK_THRESHOLD = 3

// 같은 위치·카테고리 조합의 네이버 재검색을 건너뛰는 캐시 유효 시간
export const SEARCH_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7 // 1주일

// 결과가 0건이었던 검색의 캐시 유효 시간(짧게) — API 응답 문제·일시적 이슈로 0건이 나온
// 경우 7일씩 묶여있지 않고 빠르게 재시도되게 한다. 실제로 POI가 없는 지역이면 계속 0건이
// 나올 뿐이라 손해 없음.
export const EMPTY_RESULT_CACHE_TTL_SECONDS = 60 * 60 // 1시간

type ServiceClient = ReturnType<typeof createServiceClient>

interface PipelineCategoryRow {
  slug: string
  tier: 1 | 2 | null
  keywords: PoiCategoryKeyword[] | null
  requires_review: boolean | null
  display_on_map: boolean | null
}

export interface PipelineCategories {
  all: PoiCategoryConfig[]
  level1: PoiCategoryConfig[]
  level2: PoiCategoryConfig[]
}

// pipeline_linked=true이고 키워드가 1개 이상 있는 카테고리만 실제 검색 대상으로 로드
export async function loadPipelineCategories(service: ServiceClient): Promise<PipelineCategories> {
  const { data } = await service
    .from('poi_categories')
    .select('slug, tier, keywords, requires_review, display_on_map')
    .eq('pipeline_linked', true)

  // requires_review(마이그레이션 143)·display_on_map(마이그레이션 144)은 최근 추가된 컬럼이라
  // 생성 타입(database.generated.ts)에 아직 없다 — db:types CLI 부재로 재생성 불가(완료 보고
  // 참고). select() 결과가 SelectQueryError로 잡혀 직접 캐스팅이 막히므로 unknown을 경유한다.
  // keywords도 144에서 text[]→jsonb로 바뀌었으나 생성 타입은 여전히 string[]로 알고 있어
  // 같은 이유로 unknown 경유가 필요하다.
  const all: PoiCategoryConfig[] = ((data ?? []) as unknown as PipelineCategoryRow[])
    .filter((c): c is PipelineCategoryRow & { tier: 1 | 2 } => (c.tier === 1 || c.tier === 2) && (c.keywords?.length ?? 0) > 0)
    .map((c) => ({
      category: c.slug,
      keywords: c.keywords!,
      level: c.tier,
      requiresReview: c.requires_review ?? false,
      displayOnMap: c.display_on_map ?? true,
    }))

  return {
    all,
    level1: all.filter((c) => c.level === 1),
    level2: all.filter((c) => c.level === 2),
  }
}
