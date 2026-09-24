/**
 * 계열 관리 — 목록 (티켓 20260905_0032 B-1)
 *
 * 어드민에는 「계열」 개념이 없어 배지 1개당 폼 1개를 열어야 했다. 활동 배지 207종 =
 * 87계열이고 v5는 164계열 550종이라 그 방식으로는 관리가 불가능하다.
 *
 * 계열 그룹핑은 `familyKeyOf()` 기준이다 — 엔진·싱크·계열 정합성 트리거(마이그레이션 134)와
 * 같은 규칙이라 화면과 발급이 어긋나지 않는다.
 */
import { Suspense } from 'react'
import { listFamilies } from '@/lib/admin/badge-families-query'
import { parseFamilyListParams, type BadgeFamily } from '@/lib/admin/badge-families'
import { MEASURABLE_CONDITION_KEYS, getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { TREE_ACTIVITY_ORDER } from '@/lib/badgeTree'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import { adminCategoryLabel } from '@/lib/admin/badge-labels'
import BadgeFamiliesFilterBar from './BadgeFamiliesFilterBar'
import { BadgeFamiliesTable, type FamilyTableRow } from './BadgeFamiliesTable'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { ADMIN_LIST_PAGE_SIZE, totalPagesOf } from '@/lib/admin/list-params'
import { pickSingleQueryParams, type SearchParamsPromise } from '@/lib/searchParams'

const FAMILY_KIND_LABEL = {
  graded: '등급형',
  leveled: '레벨형',
  mixed: '섞임',
} as const

/** 표에 그릴 값만 뽑는다 — 구성 배지 전체(조건 JSON 등)를 클라이언트로 넘기지 않는다 */
function toTableRow(family: BadgeFamily): FamilyTableRow {
  const labelOf = (key: string) => getConditionField(key as Parameters<typeof getConditionField>[0])?.label ?? key
  const conditionKeys = family.measurableKeys.length > 0 ? family.measurableKeys : family.usageMetricKeys
  return {
    key: family.key,
    familyKey: family.familyKey,
    name: family.name,
    categoryLabel: family.activityType
      ? (ACTIVITY_TYPE_LABELS[family.activityType] ?? family.activityType)
      : (adminCategoryLabel(family.adminCategory) ?? '—'),
    kindLabel: FAMILY_KIND_LABEL[family.kind],
    topLabel: family.topLabel,
    variantCount: family.variants.length,
    withImage: family.withImage,
    conditionLabels: conditionKeys.map(labelOf),
    missionReward: family.missionReward,
    pendingLabels: family.pendingKeys.map(labelOf),
  }
}

/**
 * ⚠️ 쿼리 값의 타입을 `string`으로 좁히지 말 것 — 같은 키가 두 번 오면(`?page=1&page=2`)
 * Next가 배열을 넘긴다. `pickSingleQueryParams`가 배열을 「값 없음」으로 흡수해 이 아래
 * 모든 읽기가 단일 문자열만 보게 한다 (티켓 20260906_1312).
 */
interface AdminBadgeFamiliesPageProps {
  searchParams: SearchParamsPromise
}

export default async function AdminBadgeFamiliesPage({ searchParams }: AdminBadgeFamiliesPageProps) {
  const rawParams = pickSingleQueryParams(await searchParams)
  const params = parseFamilyListParams(rawParams)
  // 조회 → 계열로 묶기 → 필터 → 정렬 → 쪽 나누기는 `listFamilies` 한 함수다(티켓 20260924_0949).
  const { all: allFamilies, matched, items, page, badgeCount, error } = await listFamilies(params)

  // 필터 선택지는 **목록에 실제로 있는 값**만 노출한다 — 결과가 0건인 선택지를 고르게 하지
  // 않는다. 라벨·순서는 조건 레지스트리와 배지 트리 탭 순서를 그대로 쓴다(재선언 없음).
  const usedActivityTypes = new Set(allFamilies.map((f) => f.activityType).filter((t) => !!t))
  const activityOptions = TREE_ACTIVITY_ORDER.filter((t) => usedActivityTypes.has(t)).map((t) => ({
    value: t,
    label: ACTIVITY_TYPE_LABELS[t] ?? t,
  }))
  const usedConditionKeys = new Set(allFamilies.flatMap((f) => f.measurableKeys))
  const conditionOptions = MEASURABLE_CONDITION_KEYS.filter((k) => usedConditionKeys.has(k)).map((k) => ({
    value: k as string,
    label: getConditionField(k)?.label ?? k,
  }))

  const hasFilter = !!(params.q || params.activityType || params.conditionKey)
  const keyless = matched.filter((f) => !f.familyKey).length
  const rows = items.map(toTableRow)
  const totalPages = totalPagesOf(matched.length, ADMIN_LIST_PAGE_SIZE)

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">계열 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          레벨(Lv.1~N)이나 등급(Common~Mystic)으로 단계가 나뉘는 같은 시리즈의 배지를 한 화면에서
          보고 고쳐요. 이 시리즈를 &apos;계열&apos;이라고 불러요. 계열 키(family_key)라는 값으로
          배지들을 하나의 계열로 묶고, 계열 키가 없는 배지는 이름이 같으면 자동으로 같은 계열로 봐요.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          배지를 불러오지 못했어요. 목록이 일부만 보일 수 있어요 — {error}
        </div>
      )}

      {/* 필터 바가 useSearchParams()를 쓴다 — 배지 목록과 같은 이유로 Suspense로 감싼다. */}
      <Suspense>
        <BadgeFamiliesFilterBar activityOptions={activityOptions} conditionOptions={conditionOptions} />
      </Suspense>

      <div className="text-sm text-muted-foreground">
        {hasFilter ? (
          <>
            {matched.length}개 계열 (전체 {allFamilies.length}개 중)
          </>
        ) : (
          <>
            총 {matched.length}개 계열 · 활동 배지 {badgeCount}종
          </>
        )}
        {keyless > 0 && (
          <span className="ml-2 text-amber-700">
            · 계열 키가 없는 계열 {keyless}개 (다른 미션 조건이 이 계열을 지정할 수 없어요)
          </span>
        )}
      </div>

      <BadgeFamiliesTable families={rows} totalCount={matched.length} />

      <DataTablePagination page={page} totalPages={totalPages} />
    </div>
  )
}
