import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin/auth'
import { toCsv } from '@/lib/admin/csv'
import { kstDateString } from '@/lib/notifications/kst'
import { parseFamilyListParams } from '@/lib/admin/badge-families'
import { listFamilies } from '@/lib/admin/badge-families-query'
import { getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { adminCategoryLabel } from '@/lib/admin/badge-labels'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'

/**
 * 선택된 배지 계열을 CSV로 내보낸다(티켓 20260924_0949, 상위 티켓 §4.3). 계열 키 목록을
 * 본문으로 받는다 — 전체 선택 상한(1,000건)까지도 GET 쿼리스트링 16KB 상한에 걸릴 수 있어
 * POST로 받는다(`api/admin/poi/export`와 같은 이유).
 */
const MAX_EXPORT_KEYS = 1000

const KIND_LABEL = { graded: '등급형', leveled: '레벨형', mixed: '섞임' } as const

export async function POST(req: NextRequest) {
  const authError = await requireAdmin()
  if (authError) return authError

  const body = await req.json().catch(() => null)
  const keys = Array.isArray((body as { ids?: unknown })?.ids)
    ? (body as { ids: unknown[] }).ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : []
  if (keys.length === 0) {
    return NextResponse.json({ error: '내보낼 계열을 선택해주세요.' }, { status: 400 })
  }
  const uniqueKeys = new Set(keys)
  if (uniqueKeys.size > MAX_EXPORT_KEYS) {
    return NextResponse.json({ error: `한 번에 최대 ${MAX_EXPORT_KEYS}건까지 내보낼 수 있습니다.` }, { status: 400 })
  }

  // 조건 없이 전체를 조회해 선택된 키만 남긴다 — 화면과 같은 정렬(기본순)을 그대로 쓴다.
  const { all, error } = await listFamilies(parseFamilyListParams({}))
  if (error) return NextResponse.json({ error }, { status: 500 })
  const families = all.filter((family) => uniqueKeys.has(family.key))

  const labelOf = (key: string) => getConditionField(key as Parameters<typeof getConditionField>[0])?.label ?? key

  const csv = toCsv(families, [
    {
      header: '종목',
      value: (f) =>
        f.activityType ? (ACTIVITY_TYPE_LABELS[f.activityType] ?? f.activityType) : (adminCategoryLabel(f.adminCategory) ?? ''),
    },
    { header: '계열', value: (f) => f.name },
    { header: '계열 키', value: (f) => f.familyKey },
    { header: '종류', value: (f) => KIND_LABEL[f.kind] },
    { header: '가장 높은 단계', value: (f) => f.topLabel },
    { header: '단계 수', value: (f) => f.variants.length },
    {
      header: '조건값',
      value: (f) => (f.measurableKeys.length > 0 ? f.measurableKeys : f.usageMetricKeys).map(labelOf).join(' · '),
    },
    { header: '이미지 있는 배지 수', value: (f) => f.withImage },
  ])

  const filename = `badge_families_${kstDateString().replace(/-/g, '')}.csv`
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
