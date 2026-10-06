'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { IconAlertTriangle, IconArrowRight, IconEyeOff, IconSearch } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { Skeleton } from '@/components/admin/ui/skeleton'
import { buildBalanceView, itemBalanceInfoOf } from '@/lib/admin/opsInbox/balance/view'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import { opsTargetHref } from '@/lib/admin/opsHome/links'
import { splitItemKey } from '@/lib/admin/opsSchedule/drawerParams'
import { legacyEntryOf, type LegacyDrawerEntry } from '@/lib/admin/opsSchedule/drawerView'
import type { ScheduleItemDetail } from '@/lib/admin/opsSchedule/itemDetail'
import type { ScheduleWeek } from '@/lib/admin/opsSchedule/weekView'
import { describeBundleItem } from '@/lib/admin/opsSignals/composition'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import type { OpsItemDraft, OpsWorkspaceContext } from './OpsBundleWorkspace'
import { OpsDrawerFrame } from './OpsDrawerFrame'
import { OpsItemDetail } from './OpsItemDetail'
import { OpsItemEditForm } from './OpsItemEditForm'
import { OpsItemFooter, useOpsItemResultHandlers } from './OpsItemFooter'
import { OpsKindIcon, type OpsIcon } from './opsIcons'
import { Chip, OpsStatusBadge } from './OpsStatusBadge'
import { fetchScheduleItem, type ScheduleItemOutcome } from './scheduleItemClient'

/**
 * 일정표 항목 서랍 (티켓 20261006_1537 ③-b, 상위 20260930_1502 「채원 S1·S4 사전 판정」 S4 「서랍」).
 *
 * 달력의 항목·미션 막대를 누르면 달력 옆(좁으면 아래)에 열린다. 서랍이 열려도 달력은 그대로 보이고 딤·`fixed`가 없다(`OpsDrawerFrame`).
 * 머리는 「서랍 · {종류} 「{제목}」」, 그 아래 칩 줄(상태·시험), `OpsItemDetail`(받은 기획함 상세와 같은 카드), 상태별 고정 줄(`OpsItemFooter`)이다.
 *
 * - **운영 항목**(서랍 키가 항목 ID): 새 GET API로 그 항목의 묶음(항목 전부·결정 기록·밸런스)을 받는다(가정 1). 승인·반려·수정·되돌리기는 기획 상세와 **같은 결정 API·결정 기록 줄**을 쓰고
 *   항목 **자기 묶음의 `bundleId`**를 넘긴다. 서랍에서 묶음 단위 일(일괄 승인·예약 등록)은 하지 않는다 — 승인됨 항목은 「예약 등록은 기획 상세에서 해요」 + [기획 상세로 가기 →]이고,
 *   「새로 도착」 항목은 서랍이 「도착 → 검토중」 전환을 요청하지 않으므로(가정 2) 「기획 상세를 열면 검토중으로 바뀌어요」 + 같은 링크다.
 *   결정이 끝나면 서랍 데이터를 다시 받고 서버 화면도 새로 읽는다(`router.refresh()`) — 달력 칸의 상태 칩이 바뀌고 1.2초 잔상이 남는다(`OpsScheduleBoard`).
 * - **옛 카드·미션**(`card:`·`mission:` 키, 운영 묶음에 없는 실제 카드·미션): 이미 읽은 주간 데이터의 요약과 [카드 상세 열기]뿐이다. 결정 줄이 없다.
 * - 조회 실패와 「찾을 수 없는 항목이에요」는 서랍 안에서만 보인다(달력은 그대로다).
 * 제출 문자열은 React 텍스트 노드로만 그린다(`OpsItemDetail`과 같다).
 */

interface OpsScheduleDrawerProps {
  /** 주소의 서랍 키: 운영 항목 ID, `card:<ID>`, `mission:<ID>`. */
  itemKey: string
  /** 지금 보는 주. 옛 카드·미션 요약을 여기서 찾는다. */
  week: ScheduleWeek
  /** 시험 묶음 포함 여부. 기획 상세 링크에 이어 붙인다. */
  includeSample: boolean
  onClose: () => void
  /** 같은 묶음의 다른 항목(「연결」)으로 서랍을 옮긴다. */
  onOpenItem: (key: string) => void
  className?: string
}

const DEFAULT_TITLE = '서랍'
export const SCHEDULE_ITEM_NOT_FOUND_TITLE = '찾을 수 없는 항목이에요'
export const SCHEDULE_ITEM_LOAD_FAILED_TITLE = '항목을 불러오지 못했어요'
export const SCHEDULE_ITEM_LOAD_FAILED_DESCRIPTION = '서버에 문제가 있었을 수 있어요. 새로 고쳐 다시 불러와 주세요'
export const SCHEDULE_ITEM_RETRY_LABEL = '새로 고치기'
export const SCHEDULE_PLAN_LINK_LABEL = '기획 상세로 가기'
export const SCHEDULE_APPROVED_NOTICE = '예약 등록은 기획 상세에서 해요'
export const SCHEDULE_ARRIVED_NOTICE = '기획 상세를 열면 검토중으로 바뀌어요'
export const SCHEDULE_LEGACY_CARD_LINK_LABEL = '카드 상세 열기'
export const SCHEDULE_LEGACY_MISSION_LINK_LABEL = '미션 상세 열기'

/** 서랍 안 안내(조회 실패·없는 항목). 서랍 틀 안이라 카드를 한 겹 더 두르지 않는다. */
function DrawerNotice({
  Icon,
  title,
  description,
  retry,
}: {
  Icon: OpsIcon
  title: string
  description?: string
  retry?: { label: string; run: () => void }
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      <p className="font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {retry && (
        <Button type="button" variant="outline" className="h-11 @[40rem]:h-10" onClick={retry.run}>
          {retry.label}
        </Button>
      )}
    </div>
  )
}

function DrawerLoading() {
  return (
    <div role="status" aria-label="불러오는 중" className="space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

/** 서랍 제목 글자: 「서랍 · 홈피드 카드 「우산 챙겨 달리기」」. */
function drawerTitle(kind: string | null, title: string): string {
  return `${DEFAULT_TITLE} · ${kindLabel(kind)} 「${title}」`
}

function PlanLinkNotice({ text, href }: { text: string; href: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">{text}</p>
      {href && (
        <Button asChild variant="outline" className="h-11 @[40rem]:h-10">
          <Link href={href}>
            {SCHEDULE_PLAN_LINK_LABEL}
            <IconArrowRight aria-hidden="true" />
          </Link>
        </Button>
      )}
    </div>
  )
}

/** 옛 카드·미션의 요약. 운영 묶음에 없는 실제 카드·미션이라 결정 줄이 없다. */
function LegacyItemSummary({ entry }: { entry: LegacyDrawerEntry }) {
  const kind = entry.origin === 'card' ? 'home_feed_card' : 'mission'
  return (
    <div className="space-y-4">
      <section aria-label="항목 요약" className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-base font-semibold">
            <OpsKindIcon kind={kind} className="size-5 shrink-0" />
            {kindLabel(kind)}
          </h3>
          {entry.inactive && (
            <Chip tone="muted" Icon={IconEyeOff}>
              비활성
            </Chip>
          )}
        </div>
        <dl className="space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">제목:</dt>
            <dd className="min-w-0 break-words">{entry.title}</dd>
          </div>
          {entry.time !== null && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">유형:</dt>
              <dd className="min-w-0 break-words">{entry.time}</dd>
            </div>
          )}
          {entry.note && (
            <div className="flex gap-2">
              <dt className="shrink-0 text-muted-foreground">노출·열람:</dt>
              <dd className="min-w-0 break-words">{entry.note}</dd>
            </div>
          )}
        </dl>
      </section>
      <Button asChild variant="outline" className="h-11 @[40rem]:h-10">
        <Link href={entry.href}>
          {entry.origin === 'card' ? SCHEDULE_LEGACY_CARD_LINK_LABEL : SCHEDULE_LEGACY_MISSION_LINK_LABEL}
          <IconArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  )
}

export interface ReadyItemBodyProps {
  detail: ScheduleItemDetail
  item: OpsItemRecord
  includeSample: boolean
  /** 결정·수정이 끝난 뒤 서랍 데이터와 서버 화면을 다시 읽는다. */
  onRefresh: () => void
  onOpenItem: (key: string) => void
}

/** 데이터를 받은 운영 항목 서랍의 안쪽. 결정 줄과 편집 초안은 기획 상세(S3)와 같은 부품이다. */
export function ReadyItemBody({ detail, item, includeSample, onRefresh, onOpenItem }: ReadyItemBodyProps) {
  const [draft, setDraft] = useState<OpsItemDraft | null>(null)
  const handlers = useOpsItemResultHandlers({ bundleId: detail.bundleId, onRefresh })
  const balanceView = useMemo(() => buildBalanceView(detail.balance), [detail.balance])
  const ctx: OpsWorkspaceContext = {
    bundleId: detail.bundleId,
    items: detail.items,
    selectedItem: item,
    draft,
    setDraft,
    selectItem: onOpenItem,
  }
  const planHref = opsTargetHref({ bundleId: detail.bundleId, itemId: item.id }, { includeSample })

  const statusNotice = (target: OpsItemRecord): ReactNode | null => {
    if (target.status === 'approved') return <PlanLinkNotice text={SCHEDULE_APPROVED_NOTICE} href={planHref} />
    if (target.status === 'arrived') return <PlanLinkNotice text={SCHEDULE_ARRIVED_NOTICE} href={planHref} />
    return null
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <OpsStatusBadge type="item" status={item.status} />
        {detail.isSample && <OpsStatusBadge type="sample" />}
      </div>
      <OpsItemDetail
        item={item}
        items={detail.items}
        decisions={detail.decisions}
        onSelectItem={onOpenItem}
        balance={itemBalanceInfoOf(balanceView, item.id)}
        detailEdit={(target) =>
          target.status === 'reviewing' && draft?.itemId === target.id ? (
            <OpsItemEditForm bundleId={detail.bundleId} item={target} ctx={ctx} onSaved={handlers.handleSaved} onConflict={handlers.refresh} />
          ) : null
        }
        detailFooter={(target) => (
          <OpsItemFooter
            bundleId={detail.bundleId}
            item={target}
            ctx={ctx}
            isSample={detail.isSample}
            handlers={handlers}
            statusNotice={statusNotice}
          />
        )}
      />
    </div>
  )
}

interface ItemDrawerViewProps {
  /** 받은 결과. 아직 못 받았으면 null(받는 중)이다. */
  outcome: ScheduleItemOutcome | null
  includeSample: boolean
  className?: string
  onClose: () => void
  onOpenItem: (key: string) => void
  /** 결정·수정 뒤: 서랍 데이터를 다시 받고 서버 화면도 새로 읽는다. */
  onRefresh: () => void
  /** 조회 실패 뒤 [새로 고치기]: 처음부터 다시 받는다. */
  onRetry: () => void
}

/**
 * 운영 항목 서랍의 모양. 받는 중·찾을 수 없음·조회 실패·완료를 한 틀(`OpsDrawerFrame`) 안에서 바꿔 그린다 — 틀은 하나라서 상태가 바뀌어도 다시 만들어지지 않고 제목 글자만 바뀐다.
 * 조회 실패와 없는 항목은 서랍 안에서만 보인다(달력은 그대로다).
 */
export function ItemDrawerView({ outcome, includeSample, className, onClose, onOpenItem, onRefresh, onRetry }: ItemDrawerViewProps) {
  const item = outcome?.kind === 'ok' ? outcome.detail.items.find((entry) => entry.id === outcome.detail.itemId) : undefined
  const title = item ? drawerTitle(item.kind, describeBundleItem(item)) : DEFAULT_TITLE

  return (
    <OpsDrawerFrame title={title} onClose={onClose} className={className}>
      {outcome === null ? (
        <DrawerLoading />
      ) : outcome.kind === 'ok' && item ? (
        <ReadyItemBody detail={outcome.detail} item={item} includeSample={includeSample} onRefresh={onRefresh} onOpenItem={onOpenItem} />
      ) : outcome.kind === 'notFound' ? (
        <DrawerNotice Icon={IconSearch} title={SCHEDULE_ITEM_NOT_FOUND_TITLE} />
      ) : (
        <DrawerNotice
          Icon={IconAlertTriangle}
          title={SCHEDULE_ITEM_LOAD_FAILED_TITLE}
          description={SCHEDULE_ITEM_LOAD_FAILED_DESCRIPTION}
          retry={{ label: SCHEDULE_ITEM_RETRY_LABEL, run: onRetry }}
        />
      )}
    </OpsDrawerFrame>
  )
}

/** 운영 항목 서랍: 항목 ID가 바뀌면 처음부터 다시 받는다(`OpsScheduleBoard`가 항목마다 `key`를 준다). 결정이 끝나면 같은 항목을 다시 받되 지금 화면은 새 데이터가 올 때까지 지우지 않는다. */
function OpsItemDrawer({ itemId, includeSample, onClose, onOpenItem, className }: Omit<OpsScheduleDrawerProps, 'itemKey' | 'week'> & { itemId: string }) {
  const router = useRouter()
  const [version, setVersion] = useState(0)
  const [outcome, setOutcome] = useState<ScheduleItemOutcome | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchScheduleItem(itemId, controller.signal).then((result) => {
      if (controller.signal.aborted || result.kind === 'aborted') return
      setOutcome(result)
    })
    return () => controller.abort()
  }, [itemId, version])

  return (
    <ItemDrawerView
      outcome={outcome}
      includeSample={includeSample}
      className={className}
      onClose={onClose}
      onOpenItem={onOpenItem}
      onRefresh={() => {
        setVersion((current) => current + 1)
        router.refresh()
      }}
      onRetry={() => {
        setOutcome(null)
        setVersion((current) => current + 1)
      }}
    />
  )
}

export function OpsScheduleDrawer({ itemKey, week, includeSample, onClose, onOpenItem, className }: OpsScheduleDrawerProps) {
  const { origin, id } = splitItemKey(itemKey)
  if (origin === 'ops') {
    return <OpsItemDrawer itemId={id} includeSample={includeSample} onClose={onClose} onOpenItem={onOpenItem} className={className} />
  }

  const entry = legacyEntryOf(week, itemKey)
  const kind = origin === 'card' ? 'home_feed_card' : 'mission'
  return (
    <OpsDrawerFrame title={entry ? drawerTitle(kind, entry.title) : DEFAULT_TITLE} onClose={onClose} className={className}>
      {entry ? <LegacyItemSummary entry={entry} /> : <DrawerNotice Icon={IconSearch} title={SCHEDULE_ITEM_NOT_FOUND_TITLE} />}
    </OpsDrawerFrame>
  )
}
