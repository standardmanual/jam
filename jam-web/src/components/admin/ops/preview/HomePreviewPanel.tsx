'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/admin/ui/button'
import { Switch } from '@/components/admin/ui/switch'
import TodayCardPreview, { type PreviewCardAnnotation } from '@/app/admin/today/TodayCardPreview'
import { formatKstDateLabel, previewBaseTime } from '@/lib/admin/today-calendar'
import { toCardView } from '@/lib/today/cardView'
import { cn } from '@/lib/utils'
import { OpsRationaleChips } from '../board/OpsRationaleChip'
import { HomePreviewConditionsRow } from './HomePreviewConditions'
import { HomePreviewWeekStrip } from './HomePreviewWeekStrip'
import {
  DEFAULT_CONDITIONS,
  PREVIEW_DAYS,
  buildHomePreviewQuery,
  fetchHomePreview,
  missingStoredInputs,
  weatherLabel,
  type DayPreview,
  type HomePreviewConditions,
  type HomePreviewTribe,
} from './homePreviewClient'

/**
 * 홈피드 미리보기 부품 (티켓 20261026_2025 2회차, 어드민 상황판 PRD §6.3)
 *
 * 위에서 아래로: 조건 줄 → 7일 칸 → 선택한 날의 휴대폰 틀(`TodayCardPreview`). 기획 상세의 결정 패널(`OpsHomeFeedPreview`)과
 * 투데이 화면의 미리보기 창(`TodayPreviewModal`)이 같은 부품과 같은 API(`GET /api/admin/home-preview`)를 쓴다 — 노출 판정이 한 벌이다.
 *
 * 조건이나 시작 날짜가 바뀌면 API를 한 번 부르고, 이전 요청은 `AbortController`로 취소한다. 7일치가 한 번에 오므로 칸을 눌러 날을
 * 바꾸는 것은 다시 부르지 않는다. 실패는 한 줄 오류와 「다시 불러오기」다(빈 목록으로 보이지 않는다).
 * 카드는 계측 정보 없이 서비스 카드(`TodayCard`)로 그린다. 승인 전 카드는 점선과 「승인 전」, 「기획 이유 보기」를 켜면 이유 칩이 카드 위에 올라온다.
 *
 * 부품은 상태·요청을 맡는 `HomePreviewPanel`과 값을 받아 그리기만 하는 `HomePreviewPanelView`로 나뉜다(jsdom이 없어 그림은 서버 렌더로 시험한다).
 */

const TEXT_CLASS = 'break-keep wrap-break-word'
export const EMPTY_DAY_TEXT = '이 날 보이는 카드가 없어요'
export const LOAD_ERROR_TEXT = '미리보기를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.'
export const RETRY_LABEL = '다시 불러오기'

export interface HomePreviewPanelViewProps {
  fromDate: string
  onFromDateChange: (date: string) => void
  conditions: HomePreviewConditions
  onConditionsChange: (next: HomePreviewConditions) => void
  tribes: readonly HomePreviewTribe[]
  status: 'loading' | 'ready' | 'error'
  /** 마지막으로 읽은 7일치. 다시 읽는 동안에도 남아 화면이 깜박이지 않는다 */
  days: readonly DayPreview[]
  selectedDate: string
  onSelectDate: (date: string) => void
  /** 묶음(승인 전 카드)이 있을 때만 「기획 이유 보기」를 보인다 */
  hasBundle: boolean
  showRationale: boolean
  onShowRationaleChange: (value: boolean) => void
  onRetry: () => void
  portalContainer?: HTMLElement
}

/** 선택한 날의 카드 순서대로 틀에 두를 표시. 승인 전 카드는 점선·표시, 「기획 이유 보기」가 켜졌고 이유가 있으면 칩 줄. 나머지는 null. */
export function annotationsFor(day: DayPreview, showRationale: boolean): (PreviewCardAnnotation | null)[] {
  return day.entries.map((entry) => {
    const pending = entry.source === 'pending'
    const chips =
      showRationale && entry.rationale.length > 0 ? (
        <OpsRationaleChips chips={entry.rationale.map(({ kind, label }) => ({ kind, label }))} />
      ) : undefined
    return pending || chips ? { pending, chips } : null
  })
}

export function HomePreviewPanelView({
  fromDate,
  onFromDateChange,
  conditions,
  onConditionsChange,
  tribes,
  status,
  days,
  selectedDate,
  onSelectDate,
  hasBundle,
  showRationale,
  onShowRationaleChange,
  onRetry,
  portalContainer,
}: HomePreviewPanelViewProps) {
  const day = days.find((d) => d.date === selectedDate) ?? days[0]

  const views = useMemo(() => {
    if (!day) return []
    const now = previewBaseTime(day.date)
    return day.entries.map((entry) => toCardView(entry.card, { now }))
  }, [day])
  const annotations = useMemo(() => (day ? annotationsFor(day, showRationale) : []), [day, showRationale])

  return (
    <div className="space-y-4">
      <HomePreviewConditionsRow
        fromDate={fromDate}
        onFromDateChange={onFromDateChange}
        conditions={conditions}
        onChange={onConditionsChange}
        tribes={tribes}
        storedWeatherName={weatherLabel(day?.inputs.weather ?? null)}
        missingStored={missingStoredInputs(day, conditions)}
        portalContainer={portalContainer}
      />

      {status === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-destructive/40 px-3 py-2">
          <p className={cn('text-sm text-destructive', TEXT_CLASS)}>{LOAD_ERROR_TEXT}</p>
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            {RETRY_LABEL}
          </Button>
        </div>
      )}

      {days.length === 0 && status === 'loading' && <p className="text-sm text-muted-foreground">불러오는 중...</p>}

      {status !== 'error' && days.length > 0 && day && (
        <div className={cn('space-y-4', status === 'loading' && 'opacity-60')} aria-busy={status === 'loading'}>
          <HomePreviewWeekStrip days={days} selectedDate={day.date} onSelect={onSelectDate} />

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className={cn('text-sm font-medium', TEXT_CLASS)}>
              {formatKstDateLabel(day.date)}
              <span className="ml-2 font-normal tabular-nums text-muted-foreground">{`카드 ${day.entries.length}장`}</span>
            </p>
            {hasBundle && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <Switch checked={showRationale} onCheckedChange={onShowRationaleChange} aria-label="기획 이유 보기" />
                <span className={cn('whitespace-nowrap', TEXT_CLASS)}>기획 이유 보기</span>
              </label>
            )}
          </div>

          <TodayCardPreview views={views} annotations={annotations} emptyMessage={EMPTY_DAY_TEXT} />
        </div>
      )}
    </div>
  )
}

interface HomePreviewPanelProps {
  /** 처음 보여줄 시작 날짜. 'YYYY-MM-DD'(KST). 이 날이 선택된 채로 열린다 */
  initialDate: string
  /** 있으면 이 기획 묶음의 승인 전 카드를 함께 보인다 */
  bundleId?: string | null
  days?: typeof PREVIEW_DAYS
}

export function HomePreviewPanel({ initialDate, bundleId = null, days = PREVIEW_DAYS }: HomePreviewPanelProps) {
  const [fromDate, setFromDate] = useState(initialDate)
  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [conditions, setConditions] = useState<HomePreviewConditions>(DEFAULT_CONDITIONS)
  const [showRationale, setShowRationale] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loaded, setLoaded] = useState<{ days: DayPreview[]; tribes: HomePreviewTribe[] }>({ days: [], tribes: [] })
  const [portalContainer] = useState<HTMLElement | undefined>(() =>
    typeof document === 'undefined' ? undefined : (document.querySelector<HTMLElement>('[data-admin-theme]') ?? undefined),
  )

  const query = useMemo(() => buildHomePreviewQuery({ date: fromDate, days, conditions, bundleId }), [fromDate, days, conditions, bundleId])

  // 이펙트 본문에서 동기 setState를 피하려고 조회를 별도 async 함수로 분리하고 그 안에서만 상태를 갱신한다(TodayPreviewModal과 같은 패턴).
  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      setStatus('loading')
      try {
        const result = await fetchHomePreview(query, { signal: controller.signal })
        if (controller.signal.aborted) return
        setLoaded(result)
        setStatus('ready')
      } catch {
        if (controller.signal.aborted) return
        setStatus('error')
      }
    }
    void load()
    return () => controller.abort()
  }, [query, reloadCount])

  const retry = useCallback(() => setReloadCount((n) => n + 1), [])

  return (
    <HomePreviewPanelView
      fromDate={fromDate}
      onFromDateChange={(date) => {
        setFromDate(date)
        setSelectedDate(date)
      }}
      conditions={conditions}
      onConditionsChange={setConditions}
      tribes={loaded.tribes}
      status={status}
      days={loaded.days}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      hasBundle={Boolean(bundleId)}
      showRationale={showRationale}
      onShowRationaleChange={setShowRationale}
      onRetry={retry}
      portalContainer={portalContainer}
    />
  )
}
