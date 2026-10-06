import Link from 'next/link'
import { summarizeTrend, TREND_LONG_DAYS, TREND_SHORT_DAYS } from '@/lib/admin/economyTrend'
import { SAMPLE_PARAM, SAMPLE_PARAM_ON } from '@/lib/admin/opsHome/links'

/**
 * 어드민 메인 — 배지 경제 흐름(티켓 20260924_0911). 일별 배지 발급량과 일별 앰비언트 드랍량을
 * CSS 막대 그래프 두 개로 그린다. 두 그래프는 값 크기가 달라 눈금(최댓값)을 따로 쓴다.
 * 데이터는 `page.tsx`가 조회해 내려주고, 이 화면은 그리기만 한다(서버 컴포넌트).
 */

export interface TrendSeries {
  /** 조회 실패면 null */
  counts: number[] | null
  error: string | null
}

interface EconomyTrendProps {
  /** 표시할 날짜 배열(오래된 날 → 오늘), 'YYYY-MM-DD' */
  dates: string[]
  days: number
  /** 오늘(KST), 'YYYY-MM-DD' — 이 날짜 막대에 "오늘"을 붙인다 */
  todayKst: string
  /** 시험 묶음을 포함해서 보는 중이면 기간 전환 링크에서도 `sample=1`을 유지한다(티켓 20261006_1341 ②-c 가정 8) */
  includeSample?: boolean
  badges: TrendSeries
  drops: TrendSeries
}

export function trendHref(days: number, includeSample = false): string {
  const params = new URLSearchParams({ trend: String(days) })
  if (includeSample) params.set(SAMPLE_PARAM, SAMPLE_PARAM_ON)
  return `/admin?${params.toString()}`
}

function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

interface TrendCardProps {
  title: string
  unit: string
  dates: string[]
  todayKst: string
  series: TrendSeries
  barClass: string
}

function TrendCard({ title, unit, dates, todayKst, series, barClass }: TrendCardProps) {
  if (series.counts === null) {
    return (
      <div className="bg-white border border-red-200 rounded-2xl p-5">
        <p className="text-sm font-semibold text-red-700">{title}</p>
        <p className="text-sm text-red-700 mt-1">불러오지 못했어요.</p>
        {series.error && <p className="text-xs text-red-700 mt-1">{series.error}</p>}
      </div>
    )
  }

  const counts = series.counts
  const { total, average, max } = summarizeTrend(counts)

  return (
    <div className="bg-white border border-border rounded-2xl p-5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 tabular-nums">
        합계 {total.toLocaleString()}
        {unit} · 일 평균 {average.toLocaleString()}
        {unit}
      </p>

      {max === 0 ? (
        <p className="text-sm text-muted-foreground mt-4 h-28 flex items-center justify-center">기간 내 없음</p>
      ) : (
        <>
          <ul className="mt-4 flex items-end gap-0.5 h-28 border-b border-border" aria-label={`${title} 일별 추이`}>
            {dates.map((date, i) => {
              const value = counts[i] ?? 0
              const isToday = date === todayKst
              const label = `${date}${isToday ? ' (오늘, 진행 중)' : ''} ${value.toLocaleString()}${unit}`
              return (
                <li key={date} title={label} className="flex-1 h-full flex items-end">
                  <span className="sr-only">{label}</span>
                  <span
                    aria-hidden="true"
                    className={`block w-full rounded-t-sm ${barClass} ${isToday ? 'opacity-60' : ''}`}
                    style={{ height: `${(value / max) * 100}%` }}
                  />
                </li>
              )
            })}
          </ul>
          <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular-nums">
            <span>{shortDate(dates[0])}</span>
            <span>최대 {max.toLocaleString()}{unit}</span>
            <span>{shortDate(dates[dates.length - 1])} (오늘)</span>
          </div>
        </>
      )}
    </div>
  )
}

export default function EconomyTrend({ dates, days, todayKst, includeSample = false, badges, drops }: EconomyTrendProps) {
  const options = [TREND_SHORT_DAYS, TREND_LONG_DAYS]
  return (
    <section className="mb-10" aria-label="배지 경제 흐름">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-foreground">배지 경제 흐름</h2>
        <div className="flex gap-1 text-sm">
          {options.map((option) => (
            <Link
              key={option}
              href={trendHref(option, includeSample)}
              aria-current={option === days ? 'true' : undefined}
              className={
                option === days
                  ? 'px-3 py-1 rounded-lg bg-foreground text-background'
                  : 'px-3 py-1 rounded-lg border border-border hover:border-foreground/30'
              }
            >
              {option}일
            </Link>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <TrendCard
          title="일별 배지 발급량"
          unit="개"
          dates={dates}
          todayKst={todayKst}
          series={badges}
          barClass="bg-primary"
        />
        <TrendCard
          title="일별 앰비언트 드랍량"
          unit="개"
          dates={dates}
          todayKst={todayKst}
          series={drops}
          barClass="bg-foreground/60"
        />
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        두 그래프는 눈금이 달라요. 각자 기간 내 최댓값을 기준으로 그려요.
      </p>
    </section>
  )
}
