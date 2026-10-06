import Link from 'next/link'
import { IconArrowRight } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { inboxListHref, scheduleHomeHref } from '@/lib/admin/opsHome/links'
import { WEEK_CELL_KEYS, WEEK_CELL_LABELS, type WeekCellKey, type WeekStatus } from '@/lib/admin/opsHome/homeView'
import { formatKstDay } from '@/lib/admin/opsInbox/labels'
import { OPS_ITEM_STATUS_ICONS, type OpsIcon } from './opsIcons'

/**
 * 운영 홈의 「이번 주 상태」 (티켓 20261006_1340 ②-b, 채원 판정 「S1 운영 홈」). 훅이 없는 서버 컴포넌트다.
 *
 * 다섯 칸 `승인 대기 › 예약 등록 대기 › 예약됨 › 게재중 | 실패`를 숫자 `text-3xl` 왼쪽 정렬로 그린다. 칸은 링크가 아니고 장식용 큰 아이콘도 없다
 * (라벨 옆 작은 아이콘 + 글자). 실패가 1 이상이면 그 칸만 `border-destructive`(붉은색은 실패에만, 연한 붉은 배경 없음). 시험 묶음을 포함해서 볼 때는
 * 칸 아래에 「시험 N개 포함」(0이면 숨김). 칸 아래에 종료·반려·취소·공개 시각 없음·패턴 제안 각주, 승인 대기가 있으면 결정 링크,
 * 다음 주 줄(`nextWeek`가 있을 때)이 붙는다. 이번 주에 겹치는 항목이 0이면 칸 대신 빈 상태 안내다.
 * 1024px 이상 5열, 좁으면 2열이고 `style=`을 쓰지 않는다. 계산은 `homeView.ts`가 하고 여기서는 그리기만 한다.
 */

/** 칸 라벨 옆 아이콘: 항목 상태 아이콘을 그대로 쓴다(승인 대기는 새로 도착, 예약 등록 대기는 승인됨). */
const CELL_ICONS: Record<WeekCellKey, OpsIcon> = {
  waiting: OPS_ITEM_STATUS_ICONS.arrived,
  prepare: OPS_ITEM_STATUS_ICONS.approved,
  scheduled: OPS_ITEM_STATUS_ICONS.scheduled,
  live: OPS_ITEM_STATUS_ICONS.live,
  failed: OPS_ITEM_STATUS_ICONS.failed,
}

const LINK_CLASS =
  'inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11'

/** 「9/28(월)~10/4(일)」. */
export function weekRangeLabel(status: Pick<WeekStatus, 'weekStart' | 'weekEnd'>): string {
  const start = formatKstDay(`${status.weekStart}T00:00:00+09:00`) ?? status.weekStart
  const end = formatKstDay(`${status.weekEnd}T00:00:00+09:00`) ?? status.weekEnd
  return `${start}~${end}`
}

/** 칸 아래 속내 줄. 승인 대기와 예약 등록 대기만 있고, 칸이 0이면 숨긴다. */
function cellDetail(key: WeekCellKey, status: WeekStatus): string | null {
  if (status.cells[key].count === 0) return null
  if (key === 'waiting') return `새로 도착 ${status.waitingDetail.arrived} · 검토중 ${status.waitingDetail.reviewing}`
  if (key === 'prepare') return `승인됨 ${status.prepareDetail.approved} · 준비중 ${status.prepareDetail.preparing}`
  return null
}

function WeekCellView({ cellKey, status }: { cellKey: WeekCellKey; status: WeekStatus }) {
  const cell = status.cells[cellKey]
  const Icon = CELL_ICONS[cellKey]
  const detail = cellDetail(cellKey, status)
  const failing = cellKey === 'failed' && cell.count >= 1
  return (
    <li className={cn('flex flex-col gap-1 rounded-lg border bg-background p-4', failing ? 'border-destructive' : 'border-border')}>
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {WEEK_CELL_LABELS[cellKey]}
      </p>
      <p className="text-3xl font-bold tabular-nums">{cell.count}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {cell.sample > 0 && <p className="text-xs text-muted-foreground">{`시험 ${cell.sample}개 포함`}</p>}
    </li>
  )
}

/** 종료·반려·취소와, 칸에 세지 못한 항목(공개 시각 없음·패턴 제안)을 한 줄로 알린다. 해당되는 것이 없으면 줄을 그리지 않는다. */
function footnoteText(status: WeekStatus): string | null {
  const parts: string[] = []
  if (status.ended + status.rejected + status.cancelled > 0) {
    parts.push(`이번 주 종료 ${status.ended} · 반려 ${status.rejected} · 취소 ${status.cancelled}`)
  }
  if (status.noStart > 0) parts.push(`공개 시각이 없는 항목 ${status.noStart}개는 빠져 있어요`)
  if (status.patternProposals > 0) parts.push(`패턴 제안 ${status.patternProposals}개는 빠져 있어요`)
  return parts.length > 0 ? parts.join(' · ') : null
}

/** 다음 주를 같은 다섯 칸으로 작게 한 줄에 보인다. */
function NextWeekRow({ status }: { status: WeekStatus }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">다음 주</span>
      {` ${weekRangeLabel(status)} · `}
      {WEEK_CELL_KEYS.map((key) => `${WEEK_CELL_LABELS[key]} ${status.cells[key].count}`).join(' · ')}
      {status.sampleInCells > 0 && ` · 시험 ${status.sampleInCells}개 포함`}
    </p>
  )
}

interface OpsWeekStatusProps {
  /** 이번 주 상태(`computeWeekStatus`). */
  status: WeekStatus
  /** 다음 주 상태. 다음 주 줄을 보일 때만 준다(`showsNextWeekRow`가 참일 때). */
  nextWeek?: WeekStatus | null
  /** 시험 묶음을 포함해서 보는 중이면 링크에 `sample=1`을 이어 붙인다. */
  includeSample?: boolean
  className?: string
}

export function OpsWeekStatus({ status, nextWeek = null, includeSample = false, className }: OpsWeekStatusProps) {
  const empty = status.overlapping === 0
  const footnote = footnoteText(status)
  return (
    <section aria-labelledby="ops-week-status-heading" className={cn('@container space-y-3', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 id="ops-week-status-heading" className="text-lg font-semibold">
            이번 주 상태
          </h2>
          <p className="text-sm text-muted-foreground">{weekRangeLabel(status)}</p>
        </div>
        <Link href={scheduleHomeHref({ includeSample })} className={LINK_CLASS}>
          일정표 보기
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {empty ? (
        <div className="flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-5">
          <p className="font-medium">이번 주에 올라온 기획이 없어요</p>
          <Link href={inboxListHref({ includeSample })} className={LINK_CLASS}>
            받은 기획함 보기
            <IconArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {WEEK_CELL_KEYS.map((key) => (
            <WeekCellView key={key} cellKey={key} status={status} />
          ))}
        </ol>
      )}

      {status.cells.waiting.count > 0 && (
        <Link href={inboxListHref({ tab: 'decide', includeSample })} className={LINK_CLASS}>
          받은 기획함에서 결정하기
          <IconArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      )}
      {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      {nextWeek && <NextWeekRow status={nextWeek} />}
    </section>
  )
}
