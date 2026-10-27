'use client'

import { IconAlertTriangle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { bundleRationaleChips, highlightItems, itemRationaleChips, kindGroups } from '@/lib/admin/opsBoard/rationale'
import { kindLabel } from '@/lib/admin/opsInbox/labels'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { describeBundleItem } from '@/lib/admin/opsSignals/composition'
import { OpsRationaleChips, kindChipEntries } from './board/OpsRationaleChip'
import { OpsHomeFeedPreviewRow } from './preview/OpsHomeFeedPreviewRow'

/**
 * 기획 상세의 결정 패널 머리 (티켓 20261026_2024 1회차, 어드민 상황판 PRD §6.3). `OpsBundleWorkspace`의 `panel` 슬롯에 들어간다.
 *
 * 위에서 아래로: 묶음 이유 칩 줄 → 「이번 기획의 핵심」(핵심 표시 항목, 없으면 「확인이 필요한 항목」) → 접힌 「종류별로 고르기」
 * → 바닥 줄(「공개 시작 …」과 [홈피드로 보기], 티켓 20261026_2025 2회차. `homeFeedPreview`를 주었을 때만).
 * 기획 제목은 페이지 머리가 이미 쓰므로 여기서 반복하지 않는다. 체크 상태는 래퍼(`OpsDecisionWorkspace`)가 들고 있고 이 컴포넌트는 그리기만 한다.
 * 항목이 하나도 없으면 아무것도 그리지 않는다. 새 필드(이유·핵심)가 없는 옛 묶음은 칩과 핵심 구역이 비고 「종류별로 고르기」만 남는다.
 */

const TEXT_CLASS = 'break-keep wrap-break-word'

export const HIGHLIGHT_TITLE = '이번 기획의 핵심'
export const NEEDS_CHECK_TITLE = '확인이 필요한 항목'
export const NEEDS_CHECK_LABEL = '확인 필요'
export const NEW_MISSION_LABEL = '새 미션'
export const NOTHING_CHOSEN_TEXT = '고른 항목이 없어요'

interface OpsDecisionPanelProps {
  items: readonly OpsItemRecord[]
  /** 확인 필요 항목 ID(밸런스 경고 + 형식 오류). */
  needsCheckIds: ReadonlySet<string>
  /** 지금 체크된 결정 가능 항목 ID. */
  checkedIds: ReadonlySet<string>
  /** 단계 표시줄의 주 버튼 건수와 같은 값(체크한 검토중 항목 + 예약할 승인됨 항목). */
  approvableCount: number
  /** 종류 묶음의 체크를 한꺼번에 바꾼다. */
  onSetChecked: (itemIds: readonly string[], checked: boolean) => void
  /** 핵심 줄을 눌렀을 때 그 항목을 고른다. */
  onSelectItem: (itemId: string) => void
  /**
   * 바닥 줄 [홈피드로 보기]에 넘길 값. 주면 바닥 줄을 그린다(티켓 20261026_2025 2회차).
   * `startsAt`은 체크한 항목 중 가장 이른 공개 시각(없으면 null), `initialDate`는 시트가 처음 보여줄 날짜다.
   */
  homeFeedPreview?: { bundleId: string; startsAt: string | null; initialDate: string }
}

export function OpsDecisionPanel({ items, needsCheckIds, checkedIds, approvableCount, onSetChecked, onSelectItem, homeFeedPreview }: OpsDecisionPanelProps) {
  if (items.length === 0) return null

  const bundleChips = bundleRationaleChips(items)
  const highlights = highlightItems(items, needsCheckIds)
  const groups = kindGroups(items)
  // 처음 열 때(도착 항목뿐)는 이유 칩·핵심·결정할 항목이 모두 비어 빈 카드가 잠깐 보이므로 그리지 않는다.
  if (bundleChips.length === 0 && highlights.items.length === 0 && groups.length === 0) return null

  return (
    <section aria-label="결정 패널" className="space-y-4 rounded-lg border border-border bg-background p-4">
      {bundleChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-xs text-muted-foreground', TEXT_CLASS)}>기획 이유</span>
          <OpsRationaleChips chips={kindChipEntries(bundleChips)} />
        </div>
      )}

      {highlights.items.length > 0 && (
        <div className="space-y-2">
          <h2 className={cn('text-sm font-semibold', TEXT_CLASS)}>{highlights.fallback ? NEEDS_CHECK_TITLE : HIGHLIGHT_TITLE}</h2>
          <ul role="list" className="space-y-1">
            {highlights.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onSelectItem(item.id)}
                  className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className={cn('text-xs text-muted-foreground', TEXT_CLASS)}>{kindLabel(item.kind)}</span>
                  <span className={cn('min-w-0 font-medium', TEXT_CLASS)}>{describeBundleItem(item)}</span>
                  {item.kind === 'mission' && (
                    <span className={cn('rounded-sm border border-border px-1.5 text-xs', TEXT_CLASS)}>{NEW_MISSION_LABEL}</span>
                  )}
                  <OpsRationaleChips
                    chips={itemRationaleChips(item).map((rationale) => ({
                      kind: rationale.kind,
                      label: rationale.label,
                      title: rationale.note ?? undefined,
                    }))}
                    max={2}
                  />
                  {needsCheckIds.has(item.id) && (
                    <span className={cn('inline-flex items-center gap-1 text-xs text-amber-900', TEXT_CLASS)}>
                      <IconAlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      {NEEDS_CHECK_LABEL}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {groups.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="kinds" className="border-b-0">
            <AccordionTrigger className="py-1 text-sm">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className={TEXT_CLASS}>종류별로 고르기</span>
                <span className="font-normal tabular-nums text-muted-foreground">{`승인 대상 ${approvableCount}건`}</span>
                {approvableCount === 0 && <span className={cn('font-normal text-muted-foreground', TEXT_CLASS)}>{NOTHING_CHOSEN_TEXT}</span>}
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-2">
              <ul role="list" className="space-y-1">
                {groups.map((group) => {
                  const checkedCount = group.itemIds.filter((id) => checkedIds.has(id)).length
                  const total = group.itemIds.length
                  const state = checkedCount === 0 ? false : checkedCount === total ? true : 'indeterminate'
                  const name = kindLabel(group.kind)
                  return (
                    <li key={group.kind ?? 'unknown'}>
                      <label className="flex cursor-pointer items-center gap-2 py-1.5">
                        <Checkbox
                          checked={state}
                          onCheckedChange={() => onSetChecked(group.itemIds, state !== true)}
                          aria-label={`${name} 전체 고르기`}
                        />
                        <span className={cn('text-sm', TEXT_CLASS)}>{name}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{`체크 ${checkedCount}/전체 ${total}`}</span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}

      {homeFeedPreview && <OpsHomeFeedPreviewRow {...homeFeedPreview} />}
    </section>
  )
}
