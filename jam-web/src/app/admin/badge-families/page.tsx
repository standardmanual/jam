/**
 * 계열 관리 — 목록 (티켓 20260905_0032 B-1)
 *
 * 어드민에는 「계열」 개념이 없어 배지 1개당 폼 1개를 열어야 했다. 활동 배지 207종 =
 * 87계열이고 v5는 164계열 550종이라 그 방식으로는 관리가 불가능하다.
 *
 * 계열 그룹핑은 `familyKeyOf()` 기준이다 — 엔진·싱크·계열 정합성 트리거(마이그레이션 134)와
 * 같은 규칙이라 화면과 발급이 어긋나지 않는다.
 */
import Link from 'next/link'
import { fetchActivityFamilyBadges } from '@/lib/admin/badge-families-query'
import { groupBadgesIntoFamilies } from '@/lib/admin/badge-families'
import { getConditionField } from '@/lib/badge-engine/conditionRegistry'
import { ACTIVITY_TYPE_LABELS } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table'

const FAMILY_KIND_LABEL = {
  graded: '등급형',
  leveled: '레벨형',
  mixed: '혼재',
} as const

export default async function AdminBadgeFamiliesPage() {
  const { badges, error } = await fetchActivityFamilyBadges()
  const families = groupBadgesIntoFamilies(badges)
  const keyless = families.filter((f) => !f.familyKey).length

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">계열 관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          같은 계열의 배지(Lv.1~N 또는 Common~Mystic)를 한 화면에서 보고 고쳐요. 계열은
          계열 키(family_key)로 묶이고, 키가 없는 배지만 이름으로 묶여요.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          배지를 불러오지 못했어요. 목록이 일부만 보일 수 있어요 — {error}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        총 {families.length}개 계열 · 활동 배지 {badges.length}종
        {keyless > 0 && (
          <span className="ml-2 text-amber-700">
            · 계열 키가 없는 계열 {keyless}개 (교차 게이트 대상이 될 수 없어요)
          </span>
        )}
      </div>

      <div className="bg-white border border-border rounded-2xl overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>종목</TableHead>
              <TableHead>계열</TableHead>
              <TableHead>종류</TableHead>
              <TableHead>최고 자리</TableHead>
              <TableHead className="text-right">자리 수</TableHead>
              <TableHead>사용 조건 지표</TableHead>
              <TableHead className="text-right">이미지</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {families.map((family) => (
              <TableRow key={family.key}>
                <TableCell className="whitespace-nowrap">
                  {family.activityType ? ACTIVITY_TYPE_LABELS[family.activityType] ?? family.activityType : '—'}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/admin/badge-families/${encodeURIComponent(family.key)}`}
                    className="font-medium text-foreground underline underline-offset-4"
                  >
                    {family.name}
                  </Link>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {family.familyKey ? (
                      <span className="font-mono text-xs text-muted-foreground">{family.familyKey}</span>
                    ) : (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                        계열 키 없음
                      </span>
                    )}
                    {family.missionReward && (
                      <span className="rounded bg-neutral-100 px-1.5 py-px text-[11px] text-neutral-600">
                        미션 보상
                      </span>
                    )}
                    {family.pendingKeys.length > 0 && (
                      <span className="rounded bg-amber-100 px-1.5 py-px text-[11px] font-medium text-amber-800">
                        평가 대기 {family.pendingKeys.length}종
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{FAMILY_KIND_LABEL[family.kind]}</TableCell>
                <TableCell className="whitespace-nowrap">{family.topLabel}</TableCell>
                <TableCell className="text-right tabular-nums">{family.variants.length}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {family.measurableKeys.length === 0
                    ? '—'
                    : family.measurableKeys.map((k) => getConditionField(k)?.label ?? k).join(' · ')}
                </TableCell>
                <TableCell className="text-right tabular-nums whitespace-nowrap">
                  {family.withImage}/{family.variants.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
