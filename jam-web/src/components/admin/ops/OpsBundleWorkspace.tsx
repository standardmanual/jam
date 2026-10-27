'use client'

/**
 * 기획 상세(S3)의 클라이언트 셸 (티켓 20260930_1817, 채원 화면 설계 「S3 기획 상세」·「1817 / 1818 경계」).
 *
 * 단계 표시줄 → 알림 → [미리보기 | 가운데(탭 + 목록 | 상세) | 서랍]을 한 화면에 놓고, 선택한 항목(`?item=`)과 편집
 * 초안(`draft`)을 들고 있다. 알림은 형식 오류 요약 → 밸런스 알림 → 슬롯(`notices`)이 채운 알림(있을 때만) → 전환 실패 순이다(티켓 20260930_1459, 20261002_1648).
 * 밸런스(`balance`)는 서버가 평가한 결과를 받아 행 칩·5번째 탭 「밸런스 경고 N」·상세 블록·묶음 알림에 같은 줄로 나눠 준다. `draft`를 여기에 두는 이유는 티켓 20260930_1501이 미리보기에 물릴 수 있게 하려는 것이다.
 * 실패한 항목의 사유(「실패」 행 칩 아래 한 줄)는 결정 기록에서 항목별 가장 최근 `fail` 사유를 모아(`latestFailReasons`) 목록에 넘긴다(티켓 20261002_1648).
 *
 * **슬롯(`barAction`·`rowLead`·`listHeader`·`notices`·`detailFooter`·`detailEdit`·`detailHistoryAction`)은 함수라 서버 컴포넌트에서
 * 넘길 수 없다.** 티켓 20260930_1818이 슬롯을 채운 client 래퍼(`OpsDecisionWorkspace.tsx`)를 만들었고 `page.tsx`가 그 래퍼를
 * 렌더한다. 슬롯이 비면 접혀 자리를 잡지 않는다.
 * - `barAction`: 단계 표시줄 오른쪽(「N건 승인하고 예약」)  - `rowLead`: 목록 행 왼쪽(체크박스)
 * - `listHeader`: 목록 머리줄(「전체 선택」과 「결정할 것 12개 중 11개 선택」)
 * - `panel`: 알림 줄과 격자 사이의 결정 패널(이유 칩·이번 기획의 핵심·종류별로 고르기, 티켓 20261026_2024)
 * - `notices`: 알림 줄(래퍼가 지금 채우는 알림은 없다. 예약 등록은 단계 표시줄의 버튼과 요약창이 알리고 공개는 상태 맞추기가 잇는다)
 * - `detailFooter`: 상세 카드 아래 고정 줄(반려·수정·승인, 예약됨은 공개 전 취소, 게재중은 지금 종료)
 * - `detailEdit`: 상세의 「유저가 겪는 것」·「내용」 자리를 대신하는 편집 모드
 * - `detailHistoryAction`: 결정 기록 머리 오른쪽(「마지막 수정 되돌리기」)
 *
 * 처음 열 때 도착 항목이 있으면 「도착 → 검토중」 전환을 화면이 따로 한 번 요청한다(읽기 요청으로 상태를 바꾸지 않는다).
 * 서버는 그 묶음의 `status = 'arrived'` 항목만 바꾼다. 성공하면 서버 화면을 다시 읽고(`router.refresh()`), 실패하면 알림만
 * 띄운다 — 화면은 그대로 볼 수 있고, 새로 고치면 다시 시도한다.
 *
 * 선택(`?item=`)·서랍(`?drawer=`)은 `history.replaceState`로 URL만 바꾼다(Next가 `useSearchParams`와 이어 준다). 서버를
 * 다시 부르지 않아 항목을 누를 때마다 DB를 읽지 않는다.
 *
 * 레이아웃은 컨테이너 쿼리(`@container`)다. 56rem 미만은 1열(표시줄 → 알림 → 목록 → 상세 → 미리보기 → 서랍), 68rem 이상에서
 * 서랍이 열리면 3열로 밀어내고 그보다 좁으면 가운데 열 아래에 쌓인다. 가운데 열은 40rem 이상이면 목록 | 상세 2단이다.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { IconAlertTriangle, IconInbox } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Card } from '@/components/admin/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/admin/ui/tabs'
import { requestJson } from '@/components/admin/data-table/admin-fetch'
import { latestFailReasons } from '@/lib/admin/opsInbox/executeView'
import {
  OPS_ITEM_FILTERS,
  OPS_ITEM_FILTER_LABELS,
  countByItemFilter,
  defaultSelectedItem,
  matchesItemFilter,
  type OpsItemFilter,
} from '@/lib/admin/opsInbox/itemView'
import type { OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'
import {
  balanceItemIdSet,
  buildBalanceView,
  itemBalanceInfoOf,
  type OpsBundleBalance,
} from '@/lib/admin/opsInbox/balance/view'
import { OpsBalanceBundleNotice } from './OpsBalanceWarnings'
import { OpsCardPreview } from './OpsCardPreview'
import type { OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'
import { withColorPick, type OpsColorPick } from './OpsColorPairPicker'
import { OpsDrawerFrame } from './OpsDrawerFrame'
import { OpsFormatErrorSummary } from './OpsFormatErrors'
import { OpsItemDetail } from './OpsItemDetail'
import { OpsItemList, opsItemRowId } from './OpsItemList'
import { OpsStageBar } from './OpsStageBar'
import { useStatusFlash } from './useStatusFlash'

/**
 * 편집 초안. 어느 항목의 초안인지(`itemId`)와 고친 칸의 값을 담는다. 초안이 없으면 null이다.
 * `baseUpdatedAt`은 초안을 열 때 본 항목의 수정 시각이다(저장할 때 서버가 이 값과 맞는지 본다).
 */
export interface OpsItemDraft {
  itemId: string
  values: Record<string, unknown>
  baseUpdatedAt?: string
}

/** 슬롯이 받는 셸의 상태. */
export interface OpsWorkspaceContext {
  /** 묶음의 DB 행 ID(`ops_bundles.id`). */
  bundleId: string
  items: readonly OpsItemRecord[]
  selectedItem: OpsItemRecord | null
  draft: OpsItemDraft | null
  setDraft: (draft: OpsItemDraft | null) => void
  /** 색 대기 카드에서 저장 전에 고른 색 쌍(티켓 20261007_1146). 미리보기가 `withColorPick`으로 덮어 보인다. 쓰지 않는 화면은 비워 둔다. */
  colorPick?: OpsColorPick | null
  setColorPick?: (pick: OpsColorPick | null) => void
  selectItem: (id: string) => void
}

export interface OpsBundleWorkspaceProps {
  bundleId: string
  /** 묶음의 형식 오류 전체(묶음 + 항목). */
  bundleFormatErrors: readonly string[]
  items: readonly OpsItemRecord[]
  decisions: readonly OpsDecisionRecord[]
  /** 밸런스 평가 결과(서버가 계산해 넘긴다). 없으면 밸런스를 표시하지 않는다. */
  balance?: OpsBundleBalance
  /** 시험 묶음이면 밸런스 알림에 「다른 묶음의 경고 계산에 들어가지 않아요」 안내가 붙는다. */
  isSample?: boolean
  barAction?: (ctx: OpsWorkspaceContext) => ReactNode
  rowLead?: (item: OpsItemRecord, ctx: OpsWorkspaceContext) => ReactNode
  listHeader?: (ctx: OpsWorkspaceContext) => ReactNode
  notices?: (ctx: OpsWorkspaceContext) => ReactNode
  /** 알림 줄과 격자 사이의 결정 패널(티켓 20261026_2024). 비면 자리를 잡지 않는다. */
  panel?: (ctx: OpsWorkspaceContext) => ReactNode
  detailFooter?: (item: OpsItemRecord, ctx: OpsWorkspaceContext) => ReactNode
  detailEdit?: (item: OpsItemRecord, ctx: OpsWorkspaceContext) => ReactNode
  detailHistoryAction?: (item: OpsItemRecord, ctx: OpsWorkspaceContext) => ReactNode
  /** 카드 미리보기 바로 아래 칸(이미지 만들기 버튼). 결정 줄 분기에 가려지지 않는다(티켓 20261007_1032). */
  previewAction?: (item: OpsItemRecord, ctx: OpsWorkspaceContext) => ReactNode
  /** 이미지를 만드는 중인 항목 ID. 미리보기의 이미지 자리 안내를 「만드는 중」으로 바꾼다. */
  makingItemIds?: ReadonlySet<string>
  /** 레시피·드랍 미리보기가 쓰는 배지·지점·컬렉션 이름(서버가 읽어 내린다, 티켓 20261007_1401). */
  previewNames?: OpsPreviewNames
}

export const OPS_TRANSITION_FAILED_MESSAGE =
  '검토중으로 바꾸지 못했어요. 화면은 그대로 볼 수 있고, 새로 고치면 다시 시도해요.'

const DRAWER_PARAM = 'drawer'
const DRAWER_EMPTY = 'empty'
const ITEM_PARAM = 'item'

function isItemFilter(value: string): value is OpsItemFilter {
  return (OPS_ITEM_FILTERS as readonly string[]).includes(value)
}

export function OpsBundleWorkspace({
  bundleId,
  bundleFormatErrors,
  items,
  decisions,
  balance,
  isSample = false,
  barAction,
  rowLead,
  listHeader,
  notices,
  panel,
  detailFooter,
  detailEdit,
  detailHistoryAction,
  previewAction,
  makingItemIds,
  previewNames,
}: OpsBundleWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const itemParam = searchParams.get(ITEM_PARAM)
  const drawerOpen = searchParams.get(DRAWER_PARAM) === DRAWER_EMPTY

  const [filter, setFilter] = useState<OpsItemFilter>('all')
  const [draft, setDraft] = useState<OpsItemDraft | null>(null)
  const [colorPick, setColorPick] = useState<OpsColorPick | null>(null)
  const [transitionFailed, setTransitionFailed] = useState(false)

  // ── 선택 ──────────────────────────────────────────────────────────────────────────────────────
  // `?item=`이 가리키는 항목이 없으면(잘못된 값·지워진 항목) 처음 선택 규칙으로 돌아간다: 결정 전 첫 항목, 없으면 첫 행.
  const selectedItem = useMemo(() => {
    const fromUrl = itemParam ? items.find((item) => item.id === itemParam) : undefined
    return fromUrl ?? defaultSelectedItem(items)
  }, [items, itemParam])

  // 밸런스 평가 결과를 화면 모양으로 바꾼다. 행 칩·탭 숫자·묶음 알림 건수가 같은 줄에서 나온다.
  const balanceView = useMemo(() => buildBalanceView(balance), [balance])
  const balanceItemIds = useMemo(() => balanceItemIdSet(balanceView), [balanceView])

  // 실패한 항목의 최근 사유. 목록의 「실패」 행이 칩 아래에 한 줄로 보인다.
  const failReasonsByItem = useMemo(() => latestFailReasons(decisions), [decisions])

  const filteredItems = useMemo(
    () => items.filter((item) => matchesItemFilter(item, filter, balanceItemIds)),
    [items, filter, balanceItemIds]
  )
  const filterCounts = useMemo(() => countByItemFilter(items, balanceItemIds), [items, balanceItemIds])
  const statuses = useMemo(() => items.map((item) => item.status), [items])

  const replaceQuery = useCallback((mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search)
    mutate(params)
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }, [])

  const selectItem = useCallback(
    (id: string) => {
      const target = items.find((item) => item.id === id)
      if (!target) return
      // 지금 탭에 없는 항목(다른 항목의 「연결」·오류 요약에서 옮겨 온 경우)이면 목록에서 보이도록 「전체」로 바꾼다.
      if (!matchesItemFilter(target, filter, balanceItemIds)) setFilter('all')
      replaceQuery((params) => params.set(ITEM_PARAM, id))
      requestAnimationFrame(() => document.getElementById(opsItemRowId(id))?.scrollIntoView({ block: 'nearest' }))
    },
    [items, filter, balanceItemIds, replaceQuery]
  )

  const selectByPosition = useCallback(
    (position: number) => {
      const target = items.find((item) => item.position === position)
      if (target) selectItem(target.id)
    },
    [items, selectItem]
  )

  const closeDrawer = useCallback(() => replaceQuery((params) => params.delete(DRAWER_PARAM)), [replaceQuery])

  const ctx: OpsWorkspaceContext = { bundleId, items, selectedItem, draft, setDraft, colorPick, setColorPick, selectItem }

  // ── 도착 → 검토중 전환: 화면이 따로 한 번 요청한다 ─────────────────────────────────────────────────
  const hasArrived = items.some((item) => item.status === 'arrived')
  const openRequested = useRef(false)
  useEffect(() => {
    if (!hasArrived || openRequested.current) return
    openRequested.current = true
    requestJson(`/api/admin/ops-inbox/${bundleId}/open`, { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => setTransitionFailed(true))
  }, [hasArrived, bundleId, router])

  // ── 상태가 바뀐 행은 1.2초 동안 잔상을 남긴다 ──────────────────────────────────────────────────────
  const statusById = useMemo(() => Object.fromEntries(items.map((item) => [item.id, item.status])), [items])
  const flashingIds = useStatusFlash(statusById)

  // ── 슬롯 ──────────────────────────────────────────────────────────────────────────────────────
  const barActionNode = barAction?.(ctx) ?? null
  const listHeaderNode = listHeader?.(ctx) ?? null
  const customNotices = notices?.(ctx) ?? null
  const panelNode = panel?.(ctx) ?? null
  const balanceNoticeShown = balanceView.available && (balanceView.failed || balanceView.totals.warn + balanceView.totals.info > 0)
  const hasNotices = bundleFormatErrors.length > 0 || balanceNoticeShown || Boolean(customNotices) || transitionFailed

  return (
    <div className="@container space-y-4">
      <OpsStageBar statuses={statuses} barAction={barActionNode} />

      {hasNotices && (
        <div className="space-y-3">
          <OpsFormatErrorSummary errors={bundleFormatErrors} onSelectItem={selectByPosition} />
          <OpsBalanceBundleNotice view={balanceView} isSample={isSample} onShowItems={() => setFilter('balance')} />
          {customNotices}
          {transitionFailed && (
            <Alert variant="warning">
              <IconAlertTriangle className="size-4" aria-hidden="true" />
              <AlertDescription>{OPS_TRANSITION_FAILED_MESSAGE}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {panelNode}

      <div
        className={cn(
          'grid grid-cols-1 gap-4 @4xl:grid-cols-[280px_minmax(0,1fr)]',
          drawerOpen && '@[68rem]:grid-cols-[240px_minmax(0,1fr)_320px]'
        )}
      >
        {/* 가운데: 탭 + 목록 | 상세. 1열일 때 표시줄·알림 다음에 온다. */}
        <div className="@container/center min-w-0 @4xl:col-start-2 @4xl:row-start-1">
          <Tabs value={filter} onValueChange={(value) => isItemFilter(value) && setFilter(value)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {OPS_ITEM_FILTERS.map((key) => (
                <TabsTrigger key={key} value={key}>
                  {OPS_ITEM_FILTER_LABELS[key]}
                  <span className="ml-1.5 tabular-nums">{filterCounts[key]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value={filter} className="mt-3">
              {items.length === 0 ? (
                <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                  <IconInbox className="size-5 shrink-0" aria-hidden="true" />
                  이 기획에는 항목이 없어요
                </Card>
              ) : filteredItems.length === 0 ? (
                <Card className="flex flex-wrap items-center gap-3 p-6 text-sm text-muted-foreground">
                  <span>이 조건에 맞는 항목이 없어요</span>
                  <Button type="button" variant="outline" size="sm" onClick={() => setFilter('all')}>
                    전체 보기
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 items-start gap-4 @[40rem]/center:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                  <div className="min-w-0 space-y-2">
                    {listHeaderNode}
                    <div className="max-h-[50vh] overflow-y-auto @[40rem]/center:max-h-[calc(100vh-10rem)]">
                      <OpsItemList
                        items={filteredItems}
                        selectedId={selectedItem?.id ?? null}
                        onSelect={selectItem}
                        rowLead={rowLead ? (item) => rowLead(item, ctx) : undefined}
                        flashingIds={flashingIds}
                        balanceLinesByItem={balanceView.linesByItem}
                        failReasonsByItem={failReasonsByItem}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 @[40rem]/center:sticky @[40rem]/center:top-[4.5rem] @[40rem]/center:max-h-[calc(100vh-6rem)] @[40rem]/center:overflow-y-auto">
                    {selectedItem && (
                      <OpsItemDetail
                        item={selectedItem}
                        items={items}
                        decisions={decisions}
                        onSelectItem={selectItem}
                        balance={itemBalanceInfoOf(balanceView, selectedItem.id)}
                        detailEdit={detailEdit ? (item) => detailEdit(item, ctx) : undefined}
                        detailFooter={detailFooter ? (item) => detailFooter(item, ctx) : undefined}
                        detailHistoryAction={detailHistoryAction ? (item) => detailHistoryAction(item, ctx) : undefined}
                      />
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* 카드 미리보기(티켓 20261006_1802). 1열일 때 상세 다음에 온다. */}
        <aside
          aria-label="미리보기"
          className={cn(
            'min-w-0 @4xl:sticky @4xl:top-[4.5rem] @4xl:col-start-1 @4xl:row-start-1 @4xl:self-start',
            drawerOpen && '@4xl:row-span-2 @[68rem]:row-span-1'
          )}
        >
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">미리보기</h2>
            {selectedItem ? (
              <div className="space-y-3">
                <OpsCardPreview
                  item={selectedItem}
                  draft={withColorPick(selectedItem.id, draft, colorPick)}
                  making={makingItemIds?.has(selectedItem.id) ?? false}
                  previewNames={previewNames}
                  bundleItems={items}
                />
                {previewAction?.(selectedItem, ctx)}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">항목을 고르면 미리보기가 보여요</p>
            )}
          </Card>
        </aside>

        {/* 서랍 빈 틀. 68rem 이상이면 3열로 밀어내고, 좁으면 가운데 열 아래에 쌓인다. */}
        {drawerOpen && (
          <OpsDrawerFrame
            onClose={closeDrawer}
            className="min-w-0 @4xl:col-start-2 @4xl:row-start-2 @[68rem]:col-start-3 @[68rem]:row-start-1"
          />
        )}
      </div>
    </div>
  )
}
