/**
 * 기존 자동수집(T2) POI 재분류 — 매핑 규칙 + 실행 로직 (티켓 20260907_1243)
 *
 * ## 왜 필요한가
 * 카테고리 체계 재정리(마이그레이션 144)로 기존 599건(2026-09-07 기준, 산·기차/지하철
 * 제외)의 자동수집 POI가 새 카테고리 표의 어느 항목에도 정확히 대응하지 않을 수 있다.
 * 원본 검색 키워드가 DB에 저장돼 있지 않아(마이그레이션 143 이전 수집분은 naver_category가
 * NULL) 이름만으로는 원래 무엇으로 수집됐는지 판정할 수 없다 — 이름+좌표로 네이버
 * 지역검색에 재조회해 원본 분류 문자열을 다시 받아 새 카테고리 표에 매핑한다.
 *
 * ## 매핑 로직
 * `RECLASSIFY_RULES`는 순서가 있는 (슬러그, 허용 패턴) 목록이다 — 더 구체적인 패턴을
 * 앞에 둬서 상위(광의) 패턴에 가로채이지 않게 한다(예: "국립공원"이 일반 "공원"보다 먼저
 * 검사돼야 nature로 제대로 분류된다). 이 순서·패턴은 새 카테고리 표(티켓 문서)의 키워드를
 * 기반으로 한 판단이며, category-gate.ts(원본 분류 대 "기대 카테고리 하나" 이진 판정)와
 * 달리 "raw 분류 하나를 여러 후보 카테고리 중 어디에 배정할지" 다대일 매핑이라 별도로
 * 작성했다. 실측 데이터 없이 작성한 초안이라 재분류 실행 결과(특히 unassigned 배정 비율)를
 * 보고 보정이 필요할 수 있다.
 *
 * ## 안전장치
 * - 이름 재검색은 동명이인 장소를 반환할 수 있다 — 응답 좌표와 기존 POI 좌표의 거리가
 *   `NAVER_MATCH_DISTANCE_M` 이내인 후보만 "같은 장소"로 인정한다. 근접 후보가 없으면
 *   unassigned로 배정한다(애매한 것은 전부 unassigned — 티켓 확정 사항).
 * - `apply: true`를 명시해야만 실제로 poi.category를 UPDATE한다. 기본은 계획(plan)만
 *   만드는 미리보기.
 * - mountain·train_subway·unassigned는 애초에 대상 풀에서 제외한다(티켓이 명시적으로
 *   재분류 대상에서 제외 지시, unassigned는 이미 최종 상태라 "이전 카테고리"가 아님).
 *
 * ⚠️ 이 파일은 CLAUDE.md 규칙(jam-work의 jam-developer 서브에이전트)에 따라 로직만
 * 작성했다 — 실행(scripts/reclassify-poi-categories.ts 경유)은 사용자 승인 후
 * 오케스트레이터가 처리한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineDistance } from './matcher'
import { searchNaverPlaces } from './naver'
import { UNASSIGNED_POI_CATEGORY_SLUG } from '@/lib/admin/poi-review'

/** 재분류 대상에서 제외하는 카테고리 — mountain/train_subway는 티켓이 명시적으로 재분류
 *  대상에서 제외를 지시했고(자동수집만 중단, 기존 POI는 그대로), unassigned는 이미
 *  최종 상태라 "재분류할 이전 카테고리"가 아니다. */
export const RECLASSIFY_EXCLUDED_CATEGORIES = ['mountain', 'train_subway', UNASSIGNED_POI_CATEGORY_SLUG]

/** 동명이인 장소를 걸러내는 거리 상한(m). 그리드 수집 반경(500m)보다 보수적으로 좁혀
 *  이름만으로 다른 지역의 동명 장소를 같은 곳으로 오판할 위험을 줄인다. */
const NAVER_MATCH_DISTANCE_M = 300

interface ReclassifyRule {
  slug: string
  /** naver_category(원본 분류 원문)에 이 중 하나라도 포함되면 이 슬러그로 배정 */
  patterns: string[]
  /** 패턴이 매칭돼도 원본 분류에 이 문자열이 포함돼 있으면 이 규칙을 건너뛴다
   *  (예: "대학병원"을 school이 아니라 hospital로 보내기 위한 예외) */
  excludeIfContains?: string[]
}

// 순서가 중요하다 — 구체적인 패턴을 앞에 둔다(국립공원 등 nature 세부 유형이 park의
// 일반 "공원"보다 먼저 검사돼야 한다).
export const RECLASSIFY_RULES: ReclassifyRule[] = [
  { slug: 'nature', patterns: ['국립공원', '자연휴양림', '해수욕장', '수목원'] },
  { slug: 'tourist_attraction', patterns: ['박물관', '미술관', '전망대'] },
  { slug: 'stadium', patterns: ['종합운동장', '경기장'] },
  { slug: 'school', patterns: ['대학교', '대학'], excludeIfContains: ['병원', '의료'] },
  { slug: 'hospital', patterns: ['병원', '의원', '의료'] },
  { slug: 'pharmacy', patterns: ['약국'] },
  { slug: 'government', patterns: ['주민센터', '구청', '군청', '시청', '동사무소'] },
  { slug: 'convenience', patterns: ['편의점', '마트', '시장'] },
  { slug: 'food', patterns: ['음식점', '카페', '디저트', '베이커리', '주점', '술집'] },
  { slug: 'park', patterns: ['공원'] },
]

/**
 * 네이버 원본 분류 문자열을 새 카테고리 표 슬러그에 매핑한다. 어느 패턴에도 안 걸리면
 * null — 호출부가 unassigned로 배정한다(애매한 것은 전부 unassigned로, 티켓 확정 사항).
 */
export function matchNaverCategoryToTargetSlug(naverCategoryRaw: string | null | undefined): string | null {
  const raw = naverCategoryRaw?.trim()
  if (!raw) return null
  for (const rule of RECLASSIFY_RULES) {
    if (rule.excludeIfContains?.some((p) => raw.includes(p))) continue
    if (rule.patterns.some((p) => raw.includes(p))) return rule.slug
  }
  return null
}

export interface ReclassifyTargetPoi {
  id: string
  name: string
  latitude: number
  longitude: number
  category: string
}

/** 재분류 대상 POI(자동수집분, 산·기차지하철·unassigned 제외)를 불러온다. */
export async function loadReclassifyTargets(service: SupabaseClient): Promise<ReclassifyTargetPoi[]> {
  const { data, error } = await service
    .from('poi')
    .select('id, name, latitude, longitude, category')
    .eq('poi_tier', 2)
    .not('category', 'in', `(${RECLASSIFY_EXCLUDED_CATEGORIES.join(',')})`)
  if (error) throw new Error(`재분류 대상 POI 조회 실패: ${error.message}`)
  return (data ?? []) as ReclassifyTargetPoi[]
}

interface NaverMatch {
  naverCategoryRaw: string
  distanceMeters: number
}

/** 이름으로 네이버 재검색해 기존 좌표와 가장 가까운(NAVER_MATCH_DISTANCE_M 이내) 후보를 찾는다.
 *  동명이인 장소가 여러 지역에 있을 수 있어 이름만으로는 확정할 수 없다 — 좌표 근접성으로
 *  "같은 곳"인지 검증한다. */
async function findMatchingNaverPlace(poi: ReclassifyTargetPoi): Promise<NaverMatch | null> {
  const results = await searchNaverPlaces(poi.name)
  let best: NaverMatch | null = null
  for (const item of results) {
    const distanceMeters = haversineDistance(poi.latitude, poi.longitude, item.latitude, item.longitude)
    if (distanceMeters > NAVER_MATCH_DISTANCE_M) continue
    if (!best || distanceMeters < best.distanceMeters) {
      best = { naverCategoryRaw: item.category, distanceMeters }
    }
  }
  return best
}

export interface ReclassifyPlanEntry {
  id: string
  name: string
  oldCategory: string
  /** 매칭 실패(동명이인만 있거나 검색 결과 없음) 시 UNASSIGNED_POI_CATEGORY_SLUG */
  newCategory: string
  matchedNaverCategoryRaw: string | null
  /** null이면 지오매칭 실패(근접 후보를 못 찾음) — unassigned 배정 사유 중 하나 */
  matchDistanceMeters: number | null
}

export interface ReclassifySummary {
  totalTargets: number
  plan: ReclassifyPlanEntry[]
  byNewCategory: Record<string, number>
  /** 지오매칭 실패로 unassigned가 된 건수(패턴 미매칭으로 unassigned가 된 것과는 별도 집계) */
  unresolvedCount: number
  errors: { id: string; name: string; message: string }[]
  applied: boolean
  updatedCount: number
}

export interface ReclassifyOptions {
  /** 동시 네이버 조회 수 (기본 5) */
  concurrency?: number
  /** 실제로 poi.category를 UPDATE할지. 기본 false(미리보기만) */
  apply?: boolean
  /** 대상을 앞에서부터 이만큼만 처리(부분 실행/속도 확인용) */
  limit?: number
}

const DEFAULT_CONCURRENCY = 5

/**
 * 대상 POI를 전부 재조회해 재분류 계획을 만들고, `apply: true`일 때만 실제로 반영한다.
 * 대상 하나의 조회/매칭 실패는 전체를 중단시키지 않고 errors에 쌓인다(599건 중 일부
 * 네이버 조회 실패가 나머지 처리를 막지 않아야 함).
 */
export async function reclassifyAutoCollectedPois(
  service: SupabaseClient,
  options: ReclassifyOptions = {}
): Promise<ReclassifySummary> {
  const { concurrency = DEFAULT_CONCURRENCY, apply = false, limit } = options

  const allTargets = await loadReclassifyTargets(service)
  const targets = typeof limit === 'number' ? allTargets.slice(0, limit) : allTargets

  const plan: ReclassifyPlanEntry[] = []
  const errors: ReclassifySummary['errors'] = []

  for (let i = 0; i < targets.length; i += concurrency) {
    const chunk = targets.slice(i, i + concurrency)
    await Promise.all(
      chunk.map(async (poi) => {
        try {
          const match = await findMatchingNaverPlace(poi)
          const mappedSlug = match ? matchNaverCategoryToTargetSlug(match.naverCategoryRaw) : null
          plan.push({
            id: poi.id,
            name: poi.name,
            oldCategory: poi.category,
            newCategory: mappedSlug ?? UNASSIGNED_POI_CATEGORY_SLUG,
            matchedNaverCategoryRaw: match?.naverCategoryRaw ?? null,
            matchDistanceMeters: match?.distanceMeters ?? null,
          })
        } catch (err) {
          errors.push({ id: poi.id, name: poi.name, message: err instanceof Error ? err.message : String(err) })
        }
      })
    )
  }

  const byNewCategory: Record<string, number> = {}
  for (const entry of plan) byNewCategory[entry.newCategory] = (byNewCategory[entry.newCategory] ?? 0) + 1
  const unresolvedCount = plan.filter((e) => e.matchDistanceMeters === null).length

  let updatedCount = 0
  if (apply) {
    for (const entry of plan) {
      if (entry.newCategory === entry.oldCategory) continue // 변경 없음 — UPDATE 생략
      const { error } = await service.from('poi').update({ category: entry.newCategory }).eq('id', entry.id)
      if (error) {
        errors.push({ id: entry.id, name: entry.name, message: `UPDATE 실패: ${error.message}` })
        continue
      }
      updatedCount++
    }
  }

  return {
    totalTargets: targets.length,
    plan,
    byNewCategory,
    unresolvedCount,
    errors,
    applied: apply,
    updatedCount,
  }
}
