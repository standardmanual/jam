// 네이버 지역검색 원본 분류 검증 게이트 (티켓 20260907_1242)
//
// 네이버 지역검색 API는 좌표/반경 파라미터가 없어 해당 지역에 대상이 없으면 무관한 장소를
// 반환한다(실측 2026-09-07: nature 카테고리 오염률 87.5%). 네이버가 함께 내려주는 원본 분류
// 문자열(item.category, 예: "음식점>카페,디저트")을 우리가 기대한 카테고리와 대조해 3단계로
// 판정한다.
//
// 패턴은 실제 오염 사례를 근거로 시작한 하드코딩 상수다 — 처음부터 완벽한 분류 사전을
// 만들기보다 실 수집 데이터(검토 큐에 쌓이는 pending 건)로 반복 보정하는 편이 낫다는 판단
// (티켓 완료기록 참고). 패턴이 정의되지 않은 카테고리(어드민이 poi_categories에서 새로 만든
// 파이프라인 카테고리 등)는 근거 없이 자동승인/자동거부하지 않고 안전하게 'pending'으로
// 떨어진다.
//
// 20260907_1243: transit(대중교통) 카테고리와 기존 POI가 전부 삭제되면서 transit 패턴도
// 함께 제거했다(더 이상 매칭될 대상 카테고리가 없음).

export type CategoryGateVerdict = 'approved' | 'pending' | 'rejected'

interface GatePattern {
  /** naver_category에 이 중 하나라도 포함되면 명백히 일치로 간주(자동승인) */
  allow: string[]
  /** naver_category에 이 중 하나라도 포함되면 명백히 불일치로 간주(자동거부) */
  reject: string[]
}

const CATEGORY_GATE_PATTERNS: Record<string, GatePattern> = {
  government: {
    allow: ['공공기관', '주민센터', '구청', '시청', '동사무소', '행정'],
    reject: ['음식점', '카페', '술집', '숙박', '병원', '약국', '부동산', '학원'],
  },
  hospital: {
    allow: ['병원', '의원', '한의원', '의료'],
    reject: ['음식점', '카페', '술집', '숙박', '부동산', '학원', '미용'],
  },
  pharmacy: {
    allow: ['약국'],
    reject: ['음식점', '카페', '술집', '숙박', '병원', '부동산'],
  },
  tourist_attraction: {
    allow: ['관광', '명소', '유적', '전망대', '박물관', '미술관', '고궁', '유원지', '테마파크'],
    reject: ['음식점', '카페', '술집', '숙박', '부동산', '학원', '병원', '약국'],
  },
  nature: {
    allow: ['자연', '공원', '계곡', '해수욕장', '폭포', '산', '휴양림', '생태'],
    reject: ['음식점', '카페', '술집', '숙박', '부동산', '학원', '병원', '약국', '편의점'],
  },
  convenience: {
    allow: ['편의점', '마트', '슈퍼'],
    reject: ['음식점', '카페', '술집', '병원', '약국', '숙박', '부동산', '학원'],
  },
  food: {
    allow: ['음식점', '카페', '디저트', '베이커리', '주점', '술집', '푸드'],
    reject: ['병원', '약국', '부동산', '숙박', '학원', '공공기관'],
  },
}

/**
 * 원본 분류 문자열(naverCategoryRaw)을 기대 카테고리(expectedCategory)와 대조해 판정한다.
 * - 패턴이 없는 카테고리, 원본 분류가 비어있는 경우 → 'pending'(안전한 기본값)
 * - allow 패턴 매칭 → 'approved'
 * - reject 패턴 매칭 → 'rejected'
 * - 둘 다 매칭 안 됨(알려지지 않은 형식) → 'pending'
 */
export function classifyNaverCategory(expectedCategory: string, naverCategoryRaw: string): CategoryGateVerdict {
  const pattern = CATEGORY_GATE_PATTERNS[expectedCategory]
  const raw = naverCategoryRaw?.trim()
  if (!pattern || !raw) return 'pending'
  if (pattern.allow.some((p) => raw.includes(p))) return 'approved'
  if (pattern.reject.some((p) => raw.includes(p))) return 'rejected'
  return 'pending'
}
