import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import {
  SCHEDULE_STATE_LABEL,
  describeScheduleOutcome,
  formatScheduleAt,
  scheduleActions,
  scheduleStateBadgeClass,
  type AmbientDropScheduleListItem,
  type AmbientDropScheduleNames,
} from '@/lib/ambient-drop/scheduleView'

interface ScheduleListProps {
  items: AmbientDropScheduleListItem[]
  names: AmbientDropScheduleNames
  categories: { slug: string; label: string }[]
  onCancel: (item: AmbientDropScheduleListItem) => void
  onReschedule: (item: AmbientDropScheduleListItem) => void
  /** 취소·시각 수정 요청이 진행 중인 예약 id */
  busyId: string | null
}

const UNKNOWN = '(이름을 읽지 못함)'

/** 이름 2개까지 보이고 나머지는 「외 N{unit}」 */
function summarizeNames(ids: string[], names: Record<string, string>, unit: string): string {
  if (ids.length === 0) return '-'
  const shown = ids.slice(0, 2).map((id) => names[id] ?? UNKNOWN)
  const rest = ids.length - shown.length
  return rest > 0 ? `${shown.join(', ')} 외 ${rest}${unit}` : shown.join(', ')
}

function poiText(item: AmbientDropScheduleListItem, names: AmbientDropScheduleNames, categories: ScheduleListProps['categories']): string {
  if (item.poiMode === 'list') {
    const perPoi = item.perPoiCount ?? 0
    return `${summarizeNames(item.poiIds, names.pois, '곳')} × 지점당 ${perPoi}개`
  }
  const label = item.poiCategory ? (categories.find((c) => c.slug === item.poiCategory)?.label ?? item.poiCategory) : '전체 종류'
  return `${label} × 총 ${item.totalCount ?? 0}개`
}

function itemText(item: AmbientDropScheduleListItem, names: AmbientDropScheduleNames): string {
  return item.itemMode === 'items'
    ? summarizeNames(item.badgeIds, names.badges, '개')
    : `컬렉션 ${summarizeNames(item.collectionIds, names.collections, '개')}`
}

/**
 * 날짜 예약 목록 — 표시만 한다. 버튼이 열리는지는 `scheduleActions` 결과만 따르고,
 * 막힌 버튼에는 `title`로 이유를 단다.
 */
export default function ScheduleList({ items, names, categories, onCancel, onReschedule, busyId }: ScheduleListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">등록한 날짜 예약이 아직 없어요.</p>
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>드랍 시각(KST)</TableHead>
          <TableHead>이름</TableHead>
          <TableHead>지점</TableHead>
          <TableHead>놓을 것</TableHead>
          <TableHead>상태</TableHead>
          <TableHead>결과</TableHead>
          <TableHead>동작</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const actions = scheduleActions(item)
          const busy = busyId === item.id
          const outcomeText = describeScheduleOutcome(item)
          return (
            <TableRow key={item.id} data-schedule-id={item.id}>
              <TableCell className="whitespace-nowrap">{formatScheduleAt(item.scheduledAt)}</TableCell>
              <TableCell>{item.title ?? '-'}</TableCell>
              <TableCell>{poiText(item, names, categories)}</TableCell>
              <TableCell>{itemText(item, names)}</TableCell>
              <TableCell>
                <Badge variant="secondary" className={scheduleStateBadgeClass(item.state)}>
                  {SCHEDULE_STATE_LABEL[item.state]}
                </Badge>
              </TableCell>
              <TableCell className="max-w-xs text-xs text-muted-foreground">{outcomeText ?? '-'}</TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!actions.canReschedule || busy}
                    title={actions.canReschedule ? undefined : (actions.blockedReason ?? undefined)}
                    onClick={() => onReschedule(item)}
                  >
                    시각 수정
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!actions.canCancel || busy}
                    title={actions.canCancel ? undefined : (actions.blockedReason ?? undefined)}
                    onClick={() => onCancel(item)}
                  >
                    취소
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
