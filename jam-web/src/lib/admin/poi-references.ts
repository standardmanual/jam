/**
 * POI(`poi` 테이블)를 가리키는 «모든» 참조를 한 곳에서 센다 (티켓 20260907_1138)
 *
 * ## 왜 필요한가
 * `api/admin/poi/[id]/route.ts` DELETE는 참조 카운트 체크 없이 바로
 * `supabase.from('poi').delete()`를 실행했다. `/admin/poi`·`/admin/recipes` 둘 다 별도
 * 일괄삭제 API가 없고 선택된 행 각각에 대해 이 단건 DELETE를 순차 호출하는 구조라(`PoiTable.tsx`),
 * 이 라우트 하나만 가드하면 단건·일괄 양쪽 다 막힌다.
 *
 * `badges` 테이블에서 `point_transactions.source_badge_id`(ON DELETE NO ACTION)가 겪었던
 * 사고(티켓 20260905_0034 — 사전 체크 통과 후 DELETE가 FK 위반으로 실패, raw Postgres 에러가
 * 500으로 노출)와 같은 패턴이 POI에도 잠재해 있었다:
 * `user_activity_badges.triggered_by_poi_id`가 ON DELETE 미지정(=NO ACTION)이라
 * 참조가 있는 POI를 삭제하면 그대로 500이 난다.
 *
 * ## 실제 스키마 재검증 (2026-09-07, 마이그레이션 파일 + database.generated.ts 대조)
 * 티켓 초안의 표를 아래와 같이 정정한다 — 실측 근거는 `poi(id)`를 REFERENCES하는 전체
 * 마이그레이션 grep + `database.generated.ts`의 Relationships 블록 대조.
 *
 * - **011(`current_poi_id`)의 "미상 테이블"은 `wandering_mythic_state`였다.** 그런데 이 테이블은
 *   마이그레이션 095(`095_remove_wandering_mythic.sql`, 티켓 20260824_017)에서 **DROP TABLE로
 *   이미 제거됐다.** 더 이상 존재하지 않으므로 참조 목록에서 제외한다.
 * - **002(`triggered_by_poi_id`)의 "미상 테이블"은 `user_activity_badges`였다.** ON DELETE
 *   미지정(NO ACTION) 그대로 살아있다 — `blocksDelete: true`.
 * - 티켓이 "notifications(096)"로 표기한 CASCADE 참조는 **실제로는 같은 파일(096) 안의
 *   `poi_views` 테이블**이다(`notifications` 테이블 자체에는 `poi_id` 컬럼이 없다). 정정해서
 *   `poi_views`로 반영한다.
 * - `user_poi_badge_earns`(053)는 마이그레이션 103(티켓 20260826_004)에서
 *   `user_checkin_badge_earns`로 **테이블명이 바뀌었다.** 컬럼명 `poi_id`는 그대로다
 *   (지점 참조 FK — 배지 도메인 용어 통일 범위 밖).
 * - **티켓에 없던 신규 발견: `custody_events.poi_id`**(마이그레이션 108, 아이템 소유권 이력).
 *   `ON DELETE SET NULL`이라 FK 위반으로 막히지도, 행 자체가 CASCADE로 사라지지도 않는다.
 *   다만 이 테이블은 "append-only 이력"(108 주석)으로 설계된 어드민 조회용 소유권 감사
 *   기록이라, POI를 삭제하면 그 이력에서 "어느 지점 근처였는지"가 조용히 사라진다 — 이
 *   가드가 막으려는 "조용한 데이터 손실"과 성격이 같다고 판단해 `cascades: true` 버킷에
 *   묶는다(엄밀히는 CASCADE가 아니라 SET NULL이지만, 가드 목적상 "삭제 후 조용히 사라지는
 *   컨텍스트"로 취급).
 */
import type { createServiceClient } from '@/lib/supabase/server'

type ServiceClient = ReturnType<typeof createServiceClient>

/** `.in()` 한 번에 넣는 id 개수. `badge-references.ts`와 동일한 URL 상한 여유 기준. */
const ID_CHUNK = 80

export type PoiReferenceKey =
  | 'poi_drops'
  | 'user_checkin_badge_earns'
  | 'poi_blocks'
  | 'poi_views'
  | 'user_activity_badges'
  | 'custody_events'

export interface PoiReferenceSource {
  key: PoiReferenceKey
  /** 화면 표기 */
  label: string
  /** 실제 위치 */
  location: string
  /** 이 참조가 남아 있으면 `poi` 행 DELETE가 FK 위반으로 실패한다(ON DELETE NO ACTION). */
  blocksDelete: boolean
  /**
   * ON DELETE CASCADE(행 자체가 조용히 함께 삭제) 또는 SET NULL(참조 컬럼만 조용히
   * null이 되어 감사 기록의 맥락이 사라짐) — 둘 다 실패하지 않고 조용히 데이터가
   * 손실되는 자리라 같은 버킷으로 묶는다.
   */
  cascades: boolean
}

/** 실제 스키마 재검증 결과(2026-09-07). 근거는 파일 상단 주석 참고. */
export const POI_REFERENCE_SOURCES: PoiReferenceSource[] = [
  {
    key: 'poi_drops',
    label: '월드 드랍 기록',
    location: 'poi_drops.poi_id',
    blocksDelete: false,
    cascades: true,
  },
  {
    key: 'user_checkin_badge_earns',
    label: '체크인 배지 획득 이력',
    location: 'user_checkin_badge_earns.poi_id',
    blocksDelete: false,
    cascades: true,
  },
  {
    key: 'poi_blocks',
    label: 'GPS 조작 차단 이력',
    location: 'poi_blocks.poi_id',
    blocksDelete: false,
    cascades: true,
  },
  {
    key: 'poi_views',
    label: 'POI 열람 계측 기록',
    location: 'poi_views.poi_id',
    blocksDelete: false,
    cascades: true,
  },
  {
    key: 'user_activity_badges',
    label: '체크인 배지 발급 이력(활동 배지 발급 트리거)',
    location: 'user_activity_badges.triggered_by_poi_id',
    blocksDelete: true,
    cascades: false,
  },
  {
    key: 'custody_events',
    label: '아이템 소유권 이력',
    location: 'custody_events.poi_id',
    blocksDelete: false,
    cascades: true,
  },
]

function emptyCounts(): Record<PoiReferenceKey, number> {
  const counts = {} as Record<PoiReferenceKey, number>
  for (const source of POI_REFERENCE_SOURCES) counts[source.key] = 0
  return counts
}

function chunkIds(ids: string[], size = ID_CHUNK): string[][] {
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size))
  return chunks
}

type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>

/** 청크를 병렬 폭 6으로 돌린다 — `badge-references.ts`와 동일한 이유(Vercel 함수 시간 상한). */
const CHUNK_CONCURRENCY = 6

async function countChunked(ids: string[], run: (chunk: string[]) => CountResult) {
  let total = 0
  const chunks = chunkIds(ids)
  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const results = await Promise.all(chunks.slice(i, i + CHUNK_CONCURRENCY).map((c) => run(c)))
    for (const { count, error } of results) {
      // 부분 집계를 "정확한 수"로 내보내지 않는다 — 먼저 실패한 것을 그대로 돌려준다.
      if (error) return { count: total, error: error.message }
      total += count ?? 0
    }
  }
  return { count: total, error: null as string | null }
}

export interface PoiReferenceReport {
  /** 참조 자리별 건수 — 값이 0인 자리도 키는 존재한다 */
  counts: Record<PoiReferenceKey, number>
  /** 하드 삭제를 FK 위반으로 실패시키는 참조 합계 */
  blockingTotal: number
  /** 하드 삭제 시 조용히 함께 사라지는(CASCADE) 또는 맥락이 사라지는(SET NULL) 참조 합계 */
  cascadeTotal: number
  /** 전체 합계 */
  total: number
  /** 조회 실패 메시지. 값이 있으면 **어떤 실행도 하면 안 된다**(부분 카운트로 0건 오판 금지) */
  error: string | null
}

/**
 * 대상 POI 집합을 가리키는 참조를 전부 센다. **아무것도 쓰지 않는다.**
 *
 * fail-closed: 한 자리라도 조회가 실패하면 `error`를 채운다. 호출부는 이 경우 삭제를
 * 무조건 차단해야 한다 — 부분 카운트로 "참조 0건"을 오판하면 CASCADE/SET NULL 참조
 * (체크인 배지 획득 이력·소유권 감사 기록 등)가 조용히 함께/맥락 없이 사라진다.
 */
export async function collectPoiReferences(supabase: ServiceClient, poiIds: string[]): Promise<PoiReferenceReport> {
  const counts = emptyCounts()

  if (poiIds.length === 0) {
    return { counts, blockingTotal: 0, cascadeTotal: 0, total: 0, error: null }
  }

  const errors: string[] = []

  const counters: { key: PoiReferenceKey; run: (chunk: string[]) => CountResult }[] = [
    {
      key: 'poi_drops',
      run: (chunk) => supabase.from('poi_drops').select('*', { count: 'exact', head: true }).in('poi_id', chunk),
    },
    {
      key: 'user_checkin_badge_earns',
      run: (chunk) =>
        supabase.from('user_checkin_badge_earns').select('*', { count: 'exact', head: true }).in('poi_id', chunk),
    },
    {
      key: 'poi_blocks',
      run: (chunk) => supabase.from('poi_blocks').select('*', { count: 'exact', head: true }).in('poi_id', chunk),
    },
    {
      key: 'poi_views',
      run: (chunk) => supabase.from('poi_views').select('*', { count: 'exact', head: true }).in('poi_id', chunk),
    },
    {
      key: 'user_activity_badges',
      run: (chunk) =>
        supabase
          .from('user_activity_badges')
          .select('*', { count: 'exact', head: true })
          .in('triggered_by_poi_id', chunk),
    },
    {
      key: 'custody_events',
      run: (chunk) => supabase.from('custody_events').select('*', { count: 'exact', head: true }).in('poi_id', chunk),
    },
  ]

  for (const counter of counters) {
    const { count, error } = await countChunked(poiIds, counter.run)
    counts[counter.key] = count
    if (error) errors.push(`${counter.key}: ${error}`)
  }

  let blockingTotal = 0
  let cascadeTotal = 0
  for (const source of POI_REFERENCE_SOURCES) {
    const value = counts[source.key]
    if (source.blocksDelete) blockingTotal += value
    if (source.cascades) cascadeTotal += value
  }

  return {
    counts,
    blockingTotal,
    cascadeTotal,
    total: blockingTotal + cascadeTotal,
    error: errors.length > 0 ? errors.join(' / ') : null,
  }
}
