/**
 * 컬렉션별 획득 경로 (티켓 20261022_1136 2회, 운영 로직 19.2절, 어드민 PRD 5-10절)
 *
 * 컬렉션마다 아이템 배지가 어느 길로 얻어지는지 — 드랍·믹스·미션·동기화와 캡슐·등급 올리기 — 와, 닫힌 길의 사유를 보인다.
 * 기간 한정 운영이 끝나 얻을 길이 없는 아이템 배지는 «막힘»으로 먼저 보인다. 컬렉션은 막힘이 많은 순서이고 한 쪽에 10개다.
 *
 * 받은 보기 모델(`CollectionPathView`)을 그리기만 한다. 읽기와 계산, 인가는 화면(`app/admin/balance/dashboard/page.tsx`)이 맡는다.
 * 잠긴 채 받는 아이템 배지는 길이 아니라 «받는 모습»이라 열린 길 아래에 따로 적는다(열림 판정에는 쓰지 않는다).
 * 막힘이 있는 첫 컬렉션만 처음부터 펼쳐 둔다 — 컬렉션마다 아이템 배지가 많아 모두 펼치면 화면이 너무 길어진다.
 */
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { Badge } from '@/components/admin/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/admin/ui/table'
import { DataTablePagination } from '@/components/admin/data-table/data-table-pagination'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import { RARITY_LABEL } from '@/lib/rarity'
import type { CollectionPageInfo, CollectionPathView, ItemPathRow } from '@/lib/admin/itemPaths/pathView'
import type { ItemPathStatus } from '@/lib/admin/itemPaths/types'
import { PATH_LABELS, PATH_REASON_LABELS, STATUS_LABELS, lockLabel } from './PathReasonLabels'

export const UNKNOWN_COLLECTION_NAME = '이름을 모르는 컬렉션'
export const UNKNOWN_ITEM_NAME = '이름을 모르는 아이템 배지'
export const NO_COLLECTIONS_TEXT = '아직 공개된 컬렉션이 없어요'
export const NO_ITEMS_TEXT = '이 컬렉션에는 아이템 배지가 없어요'
export const NO_OPEN_PATH_TEXT = '열린 길이 없어요'
export const NO_CLOSED_PATH_TEXT = '닫힌 길이 없어요'

export interface CollectionPathsProps {
  views: readonly CollectionPathView[]
  pageInfo: Pick<CollectionPageInfo, 'page' | 'totalPages' | 'total'>
  /** 계산 기준 시각(ISO) */
  generatedAt: string
}

const STATUS_VARIANT: Record<ItemPathStatus, 'secondary' | 'destructive' | 'outline'> = {
  open: 'secondary',
  blocked: 'destructive',
  drop_excluded: 'outline',
}

function blockedSummary(blocked: number): string {
  return blocked > 0 ? `얻을 길이 없는 아이템 배지가 ${blocked}개 있어요` : '얻을 길이 없는 아이템 배지는 없어요'
}

function ItemRow({ row }: { row: ItemPathRow }) {
  return (
    <TableRow>
      <TableCell className="min-w-40 align-top break-keep wrap-break-word">
        <span>{row.name ?? UNKNOWN_ITEM_NAME}</span>
        {row.rarity ? <span className="block text-xs text-muted-foreground">{RARITY_LABEL[row.rarity]}</span> : null}
      </TableCell>
      <TableCell className="align-top">
        <Badge variant={STATUS_VARIANT[row.status]} className="whitespace-nowrap">
          {STATUS_LABELS[row.status]}
        </Badge>
      </TableCell>
      <TableCell className="min-w-44 align-top">
        {row.openPaths.length > 0 ? (
          <ul className="flex flex-wrap gap-1">
            {row.openPaths.map((path) => (
              <li key={path}>
                <Badge variant="secondary" className="whitespace-nowrap">
                  {PATH_LABELS[path]}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground break-keep wrap-break-word">{NO_OPEN_PATH_TEXT}</span>
        )}
        {row.lock.receivedLocked && row.lock.unlockPoints !== null && (
          <p className="mt-1 text-xs text-muted-foreground text-pretty break-keep wrap-break-word">{lockLabel(row.lock.unlockPoints)}</p>
        )}
      </TableCell>
      <TableCell className="min-w-64 align-top">
        {row.closedPaths.length > 0 ? (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {row.closedPaths.map(({ path, reasons }) => (
              <li key={path} className="text-pretty break-keep wrap-break-word">
                <span className="font-medium text-foreground">{PATH_LABELS[path]}</span>
                {': '}
                {reasons.map((reason) => PATH_REASON_LABELS[reason]).join(' · ')}
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-muted-foreground break-keep wrap-break-word">{NO_CLOSED_PATH_TEXT}</span>
        )}
      </TableCell>
    </TableRow>
  )
}

function CollectionItem({ view }: { view: CollectionPathView }) {
  return (
    <AccordionItem value={view.collectionId}>
      <AccordionTrigger className="gap-3 text-left">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-balance break-keep wrap-break-word">{view.name ?? UNKNOWN_COLLECTION_NAME}</span>
          <span className="flex flex-wrap items-center gap-1">
            <Badge variant={view.blocked > 0 ? 'destructive' : 'secondary'} className="whitespace-nowrap">
              막힘 {view.blocked}개
            </Badge>
            <Badge variant="secondary" className="whitespace-nowrap">
              열림 {view.open}개
            </Badge>
            {view.dropExcluded > 0 && (
              <Badge variant="outline" className="whitespace-nowrap">
                드랍 제외 {view.dropExcluded}개
              </Badge>
            )}
            <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">전체 {view.total}개</span>
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <p className="mb-3 text-sm text-muted-foreground text-pretty break-keep wrap-break-word">{blockedSummary(view.blocked)}</p>
        {view.items.length === 0 ? (
          <p className="text-sm text-muted-foreground break-keep wrap-break-word">{NO_ITEMS_TEXT}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">아이템 배지</TableHead>
                <TableHead className="whitespace-nowrap">상태</TableHead>
                <TableHead className="whitespace-nowrap">열린 길</TableHead>
                <TableHead className="whitespace-nowrap">닫힌 길과 사유</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {view.items.map((row) => (
                <ItemRow key={row.itemId} row={row} />
              ))}
            </TableBody>
          </Table>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}

export function CollectionPaths({ views, pageInfo, generatedAt }: CollectionPathsProps) {
  const firstBlocked = views.find((view) => view.blocked > 0)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground break-keep wrap-break-word">
          {formatKstYmdHm(generatedAt)} 기준 · 컬렉션 {pageInfo.total}개 · {pageInfo.page}/{pageInfo.totalPages}쪽
        </p>
        <p className="text-sm text-muted-foreground text-pretty break-keep wrap-break-word">
          얻을 길이 없는 아이템 배지가 많은 컬렉션부터 보여요. 잠긴 채 받는 아이템 배지는 어느 길로 얻어도 잠겨 있어서, 열린 길 아래에 따로 적어요.
        </p>
      </div>

      {views.length === 0 ? (
        <p className="rounded-lg border bg-white p-6 text-sm text-muted-foreground break-keep wrap-break-word">{NO_COLLECTIONS_TEXT}</p>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={firstBlocked ? [firstBlocked.collectionId] : []}
          className="rounded-lg border bg-white px-4"
        >
          {views.map((view) => (
            <CollectionItem key={view.collectionId} view={view} />
          ))}
        </Accordion>
      )}

      <DataTablePagination page={pageInfo.page} totalPages={pageInfo.totalPages} />
    </div>
  )
}
