import Link from 'next/link'
import { IconRun, IconShieldOff, IconMapPinOff, IconFlag, IconAward } from '@tabler/icons-react'

/**
 * 어드민 메인 상단 — 이상 신호(Strava 동기화 실패·제재·차단 POI)와 주간 핵심 지표
 * (미션 달성자 수·배지 발급량) (티켓 20260924_0909).
 *
 * 데이터는 전부 `page.tsx`가 조회해 내려준다 — 이 화면은 그리기와 증감·강조 판정만 한다
 * (게이트 미션 화면과 같은 원칙, `gate-missions/page.tsx` 주석 참고).
 */

/** 이상 신호 강조 기준선 — 값이 이 값보다 크면(즉 1 이상) 강조색을 켠다. */
export const ANOMALY_BASELINE = 0

export interface WeeklyComparison {
  value: number
  previousValue: number | null
  /** previousValue가 없으면(비교 대상 자체가 없음) null */
  diff: number | null
  elevated: boolean
}

/**
 * 이번 주 값과 지난주 값을 비교해 증감과 강조 여부를 계산한다.
 *
 * 완료 조건 "0보다 크거나 지난주보다 늘었을 때 강조"를 그대로 판정식으로 옮긴다.
 * previousValue가 없으면(제재 수·차단 POI 수처럼 지난주 스냅샷을 조회하지 않는 지표이거나,
 * 지난주 조회 자체가 실패했으면) diff는 null이고 elevated는 "0보다 큰가"만으로 판정한다.
 */
export function buildWeeklyComparison(value: number, previousValue: number | null): WeeklyComparison {
  const diff = previousValue === null ? null : value - previousValue
  const elevated = value > ANOMALY_BASELINE || (diff !== null && diff > 0)
  return { value, previousValue, diff, elevated }
}

function formatDiffLabel(diff: number | null): string {
  if (diff === null) return '지난주 대비 비교 불가'
  if (diff > 0) return `지난주 대비 +${diff.toLocaleString()}`
  if (diff < 0) return `지난주 대비 ${diff.toLocaleString()}`
  return '지난주와 동일'
}

export interface DashboardSignalMetric {
  value: number | null
  /** 지난주 값. 비교 대상이 없으면 undefined/null — buildWeeklyComparison이 null로 취급한다 */
  previousValue?: number | null
  /** 조회 실패 사유. null이면 정상 조회됨 */
  error: string | null
}

export interface DashboardSignalsProps {
  stravaSyncFailures: DashboardSignalMetric
  shadowBans: DashboardSignalMetric
  blockedPoi: DashboardSignalMetric
  missionAchievers: DashboardSignalMetric
  badgeIssuance: DashboardSignalMetric
}

type TablerIcon = typeof IconRun

function ErrorCard({ label, error }: { label: string; error: string | null }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
      <p className="font-semibold text-sm text-red-600 mb-1">{label}</p>
      <p className="text-red-500 text-xs">불러오지 못했어요 — {error ?? '알 수 없는 오류'}</p>
    </div>
  )
}

function AnomalyCard({
  label,
  href,
  icon: Icon,
  metric,
}: {
  label: string
  href: string
  icon: TablerIcon
  metric: DashboardSignalMetric
}) {
  if (metric.error || metric.value === null) {
    return (
      <Link href={href}>
        <ErrorCard label={label} error={metric.error} />
      </Link>
    )
  }

  const value = metric.value
  const { elevated } = buildWeeklyComparison(value, metric.previousValue ?? null)

  return (
    <Link
      href={href}
      className={`border rounded-2xl p-5 transition-colors ${
        elevated
          ? 'bg-red-50 border-red-200 hover:border-red-300'
          : 'bg-white border-border hover:border-foreground/30'
      }`}
    >
      <Icon className={`mb-2 h-8 w-8 ${elevated ? 'text-red-500' : 'text-muted-foreground'}`} />
      <p className={`text-3xl font-bold tabular-nums ${elevated ? 'text-red-600' : 'text-foreground'}`}>
        {value.toLocaleString()}
      </p>
      <p className={`text-sm mt-1 ${elevated ? 'text-red-500' : 'text-muted-foreground'}`}>{label}</p>
    </Link>
  )
}

function KpiCard({ label, icon: Icon, metric }: { label: string; icon: TablerIcon; metric: DashboardSignalMetric }) {
  if (metric.error || metric.value === null) {
    return <ErrorCard label={label} error={metric.error} />
  }

  const value = metric.value
  const { diff } = buildWeeklyComparison(value, metric.previousValue ?? null)

  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <Icon className="mb-2 h-8 w-8 text-muted-foreground" />
      <p className="text-3xl font-bold tabular-nums">{value.toLocaleString()}</p>
      <p className="text-muted-foreground text-sm mt-1">{label}</p>
      <p className={`text-xs mt-1 ${diff !== null && diff > 0 ? 'text-emerald-600' : 'text-muted-foreground'}`}>
        {formatDiffLabel(diff)}
      </p>
    </div>
  )
}

export default function DashboardSignals({
  stravaSyncFailures,
  shadowBans,
  blockedPoi,
  missionAchievers,
  badgeIssuance,
}: DashboardSignalsProps) {
  return (
    <div className="mb-10 space-y-6">
      <section>
        <h2 className="text-base font-semibold mb-4 text-foreground">이상 신호</h2>
        <div className="grid grid-cols-3 gap-4">
          <AnomalyCard
            label="Strava 동기화 실패 건수"
            href="/admin/strava-backfill"
            icon={IconRun}
            metric={stravaSyncFailures}
          />
          <AnomalyCard label="유효 제재 수" href="/admin/abusing" icon={IconShieldOff} metric={shadowBans} />
          <AnomalyCard label="차단 POI 수" href="/admin/abusing" icon={IconMapPinOff} metric={blockedPoi} />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold mb-4 text-foreground">주간 핵심 지표</h2>
        <div className="grid grid-cols-2 gap-4">
          <KpiCard label="미션 달성자 수" icon={IconFlag} metric={missionAchievers} />
          <KpiCard label="배지 발급량" icon={IconAward} metric={badgeIssuance} />
        </div>
      </section>
    </div>
  )
}
