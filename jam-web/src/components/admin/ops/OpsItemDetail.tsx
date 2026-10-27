'use client'

import type { ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/admin/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { formatDiffValue, formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import {
  describeValue,
  entriesOf,
  itemField,
  linksOf,
  truncateText,
  userExperienceOf,
  worldReviewOf,
} from '@/lib/admin/opsInbox/itemView'
import { readOpsItemHighlight } from '@/lib/admin/opsInbox/rationaleRead'
import { itemRationaleChips } from '@/lib/admin/opsBoard/rationale'
import { keyValuesOf, reviewResultsOf, type ReviewState } from '@/lib/admin/opsBoard/drawerView'
import { readDiff } from '@/lib/admin/opsInbox/edit'
import { classifyActor, decisionLineText } from '@/lib/admin/opsDecisions/line'
import type { OpsDecisionRecord, OpsItemRecord, OpsRoutineStageRecord } from '@/lib/admin/opsInbox/query'
import {
  AGENT_BALANCE_TITLE,
  TOOL_CHECK_TITLE,
  openCollectionsNowText,
  toolCheckText,
} from '@/lib/admin/opsInbox/balance/messages'
import { isBalanceSkippedStatus } from '@/lib/admin/opsInbox/balance/rules'
import type { ItemBalanceInfo } from '@/lib/admin/opsInbox/balance/view'
import { OpsKindIcon } from './opsIcons'
import { OpsDiffLines } from './OpsDiffLines'
import { OpsStatusBadge } from './OpsStatusBadge'
import { OpsItemFormatErrors } from './OpsFormatErrors'
import { OpsBalanceItemWarnings } from './OpsBalanceWarnings'
import { OpsRationaleChip, OpsRationaleChips } from './board/OpsRationaleChip'

/**
 * 항목 서랍(상세 열, 티켓 20260930_1817 → 20261026_2024 2회차, 어드민 상황판 PRD §6.3 서랍 구조). 위에서 아래로:
 *
 * 1. 머리: 종류·상태·「핵심」 표시·패턴 번호·손잡이 값, 그 아래 이 항목의 이유 칩 전부
 * 2. 「왜 이 기획?」: 이유마다 한 줄(칩 + 메모, 트렌드 출처 번호). 이유가 없으면 「적힌 이유가 없어요」
 * 3. 형식 오류·밸런스 경고(②·②′)
 * 4. 「유저가 겪는 것」 — 편집 모드(`detailEdit` 결과가 있을 때)이면 4·5번 자리를 편집 화면이 대신한다
 * 5. 「핵심 값」: 공개 기간·대상·모양·조건·보상 한 줄씩(`keyValuesOf`)
 * 6. 「검수 결과」: 윈터(세계관 검수)·혜린(밸런스 점검) 두 줄(`reviewResultsOf`), 아래 접힘 「검수 자세히」에 예전 검수·판정 문장
 * 7. 접힘 셋(기본 접힘): 「내용 전체」(문안·색·시각·대상·연결), 「제출 원본」, 「결정 기록」
 *
 * 밸런스(`balance`, 티켓 20260930_1459): 이 항목의 경고 줄·확인한 규칙 수. 없으면 밸런스를 표시하지 않는다. 경고 블록은 줄이 있을 때만
 * 그리고, 「검수 자세히」의 「툴 점검」 줄은 평가 결과가 있으면 늘 그린다(경고 없음·적용 규칙 없음·반려한 항목·평가 실패까지 말로 알린다).
 * `stages`는 묶음 단계 기록이고 「검수 결과」의 시각(해당 단계 `endedAt`)에만 쓴다. 없으면 시각을 쓰지 않는다.
 *
 * 제출 문자열은 **React 텍스트 노드로만** 그린다(`dangerouslySetInnerHTML`을 쓰지 않는다). 색 견본은 값이
 * `HEX_COLOR_PATTERN`(`#rrggbb`)을 통과할 때만 `style`에 넣는다. `author`·`item_key`는 자기 신고라 제목으로 쓰지 않는다.
 *
 * 슬롯(1818이 client 래퍼에서 채운다. 함수라 서버 컴포넌트에서 넘길 수 없다):
 * - `detailEdit`: 결과가 있으면 「유저가 겪는 것」과 「핵심 값」 자리를 **대신한다**(편집 모드는 그 자리에서 바뀐다).
 * - `detailFooter`: 카드 아래 고정 줄(빼기·고치기·이대로 두기와 반려). 비어 있으면 줄을 그리지 않는다.
 * - `detailHistoryAction`: 「결정 기록」 머리의 오른쪽(「마지막 수정 되돌리기」). 비어 있으면 자리를 잡지 않는다.
 *
 * 결정 기록은 승인·반려·수정·수정 되돌림(「되돌림」 태그, 버튼 없음)·일괄 승인 표시와 사유, 수정 전후 차이 줄(`OpsDiffLines`)을 그린다.
 * 예약 등록의 `execute`(관리자가 예약 등록했어요)·`fail`(예약 등록에 실패했어요, 사유는 「실패 사유」)·`cancel`(관리자가 공개 전에 취소했어요, 사유는 「취소 사유」)도 같은 줄이다(티켓 20261002_1648).
 */

interface OpsItemDetailProps {
  item: OpsItemRecord
  /** 묶음의 모든 항목(「연결」이 가리키는 항목을 찾는 데 쓴다). */
  items: readonly OpsItemRecord[]
  /** 묶음의 결정 기록(최신순). 이 항목의 것과 묶음 전체의 것(제출)만 보인다. */
  decisions: readonly OpsDecisionRecord[]
  onSelectItem: (id: string) => void
  /** 이 항목의 밸런스 평가 정보. 없으면 밸런스를 표시하지 않는다. */
  balance?: ItemBalanceInfo
  /** 묶음의 에이전트 단계 기록. 「검수 결과」 줄의 시각에만 쓴다. */
  stages?: readonly OpsRoutineStageRecord[]
  detailEdit?: (item: OpsItemRecord) => ReactNode
  detailFooter?: (item: OpsItemRecord) => ReactNode
  detailHistoryAction?: (item: OpsItemRecord) => ReactNode
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-1.5 text-xs font-semibold text-muted-foreground">{children}</h4>
}

function KeyValueLines({ value }: { value: unknown }) {
  const entries = entriesOf(value)
  if (entries === null) {
    const text = describeValue(value)
    return text ? <p className="break-words text-sm">{text}</p> : <p className="text-sm text-muted-foreground">없어요</p>
  }
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">없어요</p>
  return (
    <dl className="space-y-0.5 text-sm">
      {entries.map(({ key, text }) => (
        <div key={key} className="flex gap-2">
          <dt className="shrink-0 text-muted-foreground">{key}:</dt>
          <dd className="min-w-0 break-words">{text}</dd>
        </div>
      ))}
    </dl>
  )
}

function ColorLines({ value }: { value: unknown }) {
  const entries = entriesOf(value)
  if (entries === null) return <KeyValueLines value={value} />
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">없어요</p>
  return (
    <ul className="space-y-1 text-sm">
      {entries.map(({ key, text }) => {
        const isHex = HEX_COLOR_PATTERN.test(text)
        return (
          <li key={key} className="flex items-center gap-2">
            {isHex && (
              <span
                aria-hidden="true"
                className="inline-block size-5 shrink-0 rounded border border-border"
                style={{ backgroundColor: text }}
              />
            )}
            <span className="shrink-0 text-muted-foreground">{key}:</span>
            <span className="min-w-0 break-words tabular-nums">{text}</span>
          </li>
        )
      })}
    </ul>
  )
}

function LinkedItems({
  item,
  items,
  onSelectItem,
}: {
  item: OpsItemRecord
  items: readonly OpsItemRecord[]
  onSelectItem: (id: string) => void
}) {
  const links = linksOf(item)
  if (links.length === 0) return <p className="text-sm text-muted-foreground">없어요</p>
  return (
    <ul className="space-y-1 text-sm">
      {links.map((link, index) => {
        // `item_key`는 겹칠 수 있다. 겹치면 먼저 나온 항목이 원본이므로(검증 규칙) 제출 순서가 가장 앞선 항목을 고른다.
        const target = items.filter((candidate) => candidate.itemKey === link).sort((a, b) => a.position - b.position)[0]
        if (!target || target.id === item.id) {
          return (
            <li key={`${index}-${link}`} className="break-words text-muted-foreground">
              찾을 수 없는 연결이에요
            </li>
          )
        }
        const summary = truncateText(userExperienceOf(target), 40)
        return (
          <li key={`${index}-${link}`}>
            <button
              type="button"
              onClick={() => onSelectItem(target.id)}
              className="break-words rounded text-left underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
            >
              {kindLabel(target.kind)}
              {summary ? ` · ${summary}` : ''}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function ToolCheckLines({ item, balance }: { item: OpsItemRecord; balance: ItemBalanceInfo }) {
  const warnCount = balance.lines.filter((line) => line.kind === 'warn').length
  const text = toolCheckText({
    status: item.status,
    evaluationFailed: balance.failed,
    checkedRuleCount: balance.checkedRuleCount,
    warnCount,
    infoCount: balance.lines.length - warnCount,
  })
  // 지금 열린 컬렉션 수는 R1이 보는 컬렉션 런칭 항목에만, 평가에 들어간 항목에만 참고로 보인다.
  const showOpenNow =
    item.kind === 'collection_launch' &&
    !balance.failed &&
    !isBalanceSkippedStatus(item.status) &&
    balance.openCollectionsNow !== null
  return (
    <div>
      <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{TOOL_CHECK_TITLE}</p>
      <p className="break-words">{text}</p>
      {showOpenNow && <p className="break-words text-muted-foreground">{openCollectionsNowText(balance.openCollectionsNow ?? 0)}</p>}
    </div>
  )
}

function ReviewLines({ item, balance }: { item: OpsItemRecord; balance?: ItemBalanceInfo }) {
  const review = worldReviewOf(item)
  const agentBalance = itemField(item, 'balance_check')
  const balanceEntries = entriesOf(agentBalance)
  const balanceText = balanceEntries === null ? describeValue(agentBalance) : ''

  return (
    <div className="space-y-2 text-sm">
      {review ? (
        <ul className="space-y-0.5">
          {review.worldRelated !== null && (
            <li>{review.worldRelated ? '세계관과 닿는 카드예요' : '세계관과 닿는 카드가 아니에요'}</li>
          )}
          {review.winterReviewed !== null && (
            <li>{review.winterReviewed ? '윈터 검수 끝났어요' : '윈터 검수 아직이에요'}</li>
          )}
          {review.reason && <li className="break-words text-muted-foreground">{review.reason}</li>}
        </ul>
      ) : (
        <p className="text-muted-foreground">검수 결과가 없어요</p>
      )}
      {/* 에이전트가 적은 밸런스 판정은 「이름: 값」 글 그대로 보여 준다. 툴이 규칙으로 잰 결과는 아래 「툴 점검」이다. */}
      {balanceEntries && balanceEntries.length > 0 && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{AGENT_BALANCE_TITLE}</p>
          <KeyValueLines value={agentBalance} />
        </div>
      )}
      {balanceText && (
        <div>
          <p className="mb-0.5 text-xs font-semibold text-muted-foreground">{AGENT_BALANCE_TITLE}</p>
          <p className="break-words">{balanceText}</p>
        </div>
      )}
      {balance && <ToolCheckLines item={item} balance={balance} />}
    </div>
  )
}

/** 사유 줄 앞에 붙는 이름. 반려의 사유는 「반려 이유」, 수정의 사유는 「수정한 이유」, 실패·취소·종료의 사유는 「실패 사유」·「취소 사유」·「종료 사유」다. */
const DECISION_REASON_LABELS: Record<string, string> = {
  reject: '반려 이유',
  edit: '수정한 이유',
  fail: '실패 사유',
  cancel: '취소 사유',
  end: '종료 사유',
}

function decisionLine(decision: OpsDecisionRecord): string {
  return decisionLineText({ action: decision.action, ...classifyActor(decision.actor) })
}

const EXTERNAL_TIME_FIELDS = [
  ['starts_at', '공개 시각'],
  ['ends_at', '종료 시각'],
] as const

/**
 * `external_change`의 `diff`(상태 맞추기 `ExternalDiff`)를 줄마다 읽는다. 시각 칸은 「공개 시각: 항목 → 자원」(KST, 없으면 「(없음)」),
 * 자원이 꺼져 있으면 「자원이 비활성이에요」다. 모양이 맞지 않는 칸은 건너뛴다.
 */
function externalChangeLines(value: unknown): string[] {
  const asObject = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
  const diff = asObject(value)
  if (!diff) return []
  const lines: string[] = []
  for (const [path, label] of EXTERNAL_TIME_FIELDS) {
    const field = asObject(diff[path])
    if (!field) continue
    const { item, resource } = field
    if ((item !== null && typeof item !== 'string') || (resource !== null && typeof resource !== 'string')) continue
    lines.push(`${label}: ${formatDiffValue(path, item)} → ${formatDiffValue(path, resource)}`)
  }
  if (asObject(diff.is_active)?.resource === false) lines.push('자원이 비활성이에요')
  return lines
}

function DecisionLog({ decisions }: { decisions: readonly OpsDecisionRecord[] }) {
  if (decisions.length === 0) return <p className="text-sm text-muted-foreground">아직 기록이 없어요</p>
  return (
    <ol className="space-y-2">
      {decisions.map((decision) => {
        const slack = decision.slackResult
        const slackFailed =
          slack !== null && typeof slack === 'object' && !Array.isArray(slack) && slack.ok === false
        const when = formatKstDayTime(decision.createdAt)
        const isBulk = decision.action === 'approve' && decision.batchId !== null
        const diff = decision.action === 'edit' || decision.action === 'revert' ? readDiff(decision.diff) : []
        const externalLines = decision.action === 'external_change' ? externalChangeLines(decision.diff) : []
        const reasonLabel = Object.prototype.hasOwnProperty.call(DECISION_REASON_LABELS, decision.action)
          ? DECISION_REASON_LABELS[decision.action]
          : null
        return (
          <li key={decision.id} className="text-sm">
            <p className="break-words">
              {decisionLine(decision)}
              {decision.action === 'revert' && (
                // 되돌림 줄에는 버튼이 없다. 되돌림은 그 자체로 새 수정 줄이다(한 번에 한 단계, 다시 하기 없음).
                <span className="ml-1.5 inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                  되돌림
                </span>
              )}
              {isBulk && (
                <span className="ml-1.5 inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                  일괄 승인
                </span>
              )}
              {when && <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">{when}</span>}
            </p>
            {decision.reason && (
              <p className="break-words text-xs text-muted-foreground">
                {reasonLabel ? `${reasonLabel}: ` : ''}
                {decision.reason}
              </p>
            )}
            {diff.length > 0 && <OpsDiffLines diff={diff} className="mt-1 text-xs" />}
            {externalLines.length > 0 && (
              <ul className="mt-1 space-y-1 text-xs">
                {externalLines.map((line) => (
                  <li key={line} className="break-words">
                    {line}
                  </li>
                ))}
              </ul>
            )}
            {slackFailed && (
              <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
                <IconAlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                슬랙 알림 실패
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function rawJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? ''
  } catch {
    return ''
  }
}

const TEXT_CLASS = 'break-keep wrap-break-word'

/** 「왜 이 기획?」: 이유마다 한 줄. 설명은 두 줄을 넘기지 않는다. */
function WhyPlanned({ item }: { item: OpsItemRecord }) {
  const rationales = itemRationaleChips(item)
  return (
    <section aria-label="왜 이 기획?">
      <SectionTitle>왜 이 기획?</SectionTitle>
      {rationales.length === 0 ? (
        <p className={cn('text-sm text-muted-foreground', TEXT_CLASS)}>적힌 이유가 없어요</p>
      ) : (
        <ul className="space-y-1.5">
          {rationales.map((rationale, index) => (
            <li key={`${rationale.kind}:${rationale.label}:${index}`} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-sm">
              <OpsRationaleChip kind={rationale.kind} label={rationale.label} />
              {rationale.note && <span className={cn('line-clamp-2 min-w-0 flex-1 basis-40', TEXT_CLASS)}>{rationale.note}</span>}
              {rationale.kind === 'trend' && rationale.sourceId !== null && (
                <span className="shrink-0 text-xs text-muted-foreground">출처 {rationale.sourceId}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 「핵심 값」: 한 칸에 한 줄. 읽을 수 있는 칸만 그리고, 하나도 없으면 안내 한 줄이다. */
function KeyValues({ item }: { item: OpsItemRecord }) {
  const rows = keyValuesOf(item)
  return (
    <section aria-label="핵심 값">
      <SectionTitle>핵심 값</SectionTitle>
      {rows.length === 0 ? (
        <p className={cn('text-sm text-muted-foreground', TEXT_CLASS)}>읽을 수 있는 핵심 값이 없어요</p>
      ) : (
        <dl className="space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex gap-2">
              <dt className={cn('w-16 shrink-0 text-muted-foreground', TEXT_CLASS)}>{row.label}</dt>
              <dd className={cn('min-w-0 tabular-nums', TEXT_CLASS)}>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

const REVIEW_DOT_CLASS: Record<ReviewState, string> = {
  pass: 'bg-emerald-600',
  check: 'bg-amber-500',
  none: 'bg-neutral-300',
}

/** 「검수 결과」: 윈터·혜린 두 줄. 점은 장식이고 상태는 글자로 읽힌다(색만 쓰지 않는다). 아래 접힘 「검수 자세히」에 예전 검수·판정 문장을 둔다. */
function ReviewResults({
  item,
  stages,
  balance,
}: {
  item: OpsItemRecord
  stages: readonly OpsRoutineStageRecord[]
  balance?: ItemBalanceInfo
}) {
  const results = reviewResultsOf({
    item,
    stages,
    // 평가가 실패했거나 평가에서 뺀 상태(반려·취소 등)이면 점검 기록이 없는 것이다.
    balanceLines: balance && !balance.failed && !isBalanceSkippedStatus(item.status) ? balance.lines : undefined,
  })
  return (
    <section aria-label="검수 결과">
      <SectionTitle>검수 결과</SectionTitle>
      <ul className="space-y-1.5 text-sm">
        {results.map((result) => (
          <li key={result.agent}>
            <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-0.5', TEXT_CLASS)}>
              <span className="font-medium">{result.title}</span>
              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                <span aria-hidden="true" className={cn('inline-block size-2 shrink-0 rounded-full', REVIEW_DOT_CLASS[result.state])} />
                {result.stateText}
              </span>
              {result.at && <span className="text-xs tabular-nums text-muted-foreground">{result.at}</span>}
            </p>
            {result.reason && <p className={cn('line-clamp-2 text-xs text-muted-foreground', TEXT_CLASS)}>{result.reason}</p>}
          </li>
        ))}
      </ul>
      <Accordion type="single" collapsible>
        <AccordionItem value="review-detail" className="border-b-0">
          <AccordionTrigger className="py-2 text-xs text-muted-foreground">검수 자세히</AccordionTrigger>
          <AccordionContent>
            <ReviewLines item={item} balance={balance} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  )
}

export function OpsItemDetail({
  item,
  items,
  decisions,
  onSelectItem,
  balance,
  stages = [],
  detailEdit,
  detailFooter,
  detailHistoryAction,
}: OpsItemDetailProps) {
  const experience = userExperienceOf(item)
  const knobs = entriesOf(itemField(item, 'knobs'))
  const startsAt = formatKstDayTime(item.startsAt)
  const endsAt = formatKstDayTime(item.endsAt)
  const editNode = detailEdit?.(item) ?? null
  const footerNode = detailFooter?.(item) ?? null
  const historyActionNode = detailHistoryAction?.(item) ?? null
  const itemDecisions = decisions.filter((decision) => decision.itemId === item.id || decision.itemId === null)
  const rationaleChips = itemRationaleChips(item)
  const highlighted = readOpsItemHighlight(item.edited ?? item.original)

  return (
    // `overflow-hidden`을 두지 않는다: 아래 고정 줄(`sticky bottom-0`)이 스크롤 하는 바깥 열을 기준으로 붙어야 한다.
    <Card>
      <div className="space-y-5 p-4">
        {/* 1. 머리: 종류·상태·핵심·패턴 번호·손잡이 값, 이유 칩 전부 */}
        <section aria-label="항목 요약" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-base font-semibold">
              <OpsKindIcon kind={item.kind} className="size-5 shrink-0" />
              {kindLabel(item.kind)}
            </h3>
            <OpsStatusBadge type="item" status={item.status} />
            {highlighted && (
              <span className="inline-flex items-center whitespace-nowrap rounded-full border border-border bg-background px-2 py-0.5 text-xs font-medium text-foreground">
                핵심
              </span>
            )}
            {item.patternNo && <span className="break-words text-xs text-muted-foreground">패턴 {item.patternNo}</span>}
          </div>
          <OpsRationaleChips chips={rationaleChips.map((rationale) => ({ kind: rationale.kind, label: rationale.label }))} />
          {knobs && knobs.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {knobs.map(({ key, text }) => (
                <li key={key} className="break-words">
                  {key}: {text}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 2. 왜 이 기획? */}
        <WhyPlanned item={item} />

        {/* 3. 형식 오류 */}
        <OpsItemFormatErrors errors={item.formatErrors} />

        {/* 3. 밸런스 경고: 형식 오류 바로 아래. 줄이 있을 때만 그린다. 편집 중이면 저장하면 다시 확인한다고 알린다. */}
        {balance && <OpsBalanceItemWarnings lines={balance.lines} editing={editNode !== null} showRuleLink />}

        {editNode ?? (
          <>
            {/* 4. 유저가 겪는 것 */}
            <section>
              <SectionTitle>유저가 겪는 것</SectionTitle>
              {experience ? (
                <p className="whitespace-pre-line break-words text-sm">{experience}</p>
              ) : (
                <p className="text-sm text-muted-foreground">유저가 겪는 것이 비어 있어요</p>
              )}
            </section>

            {/* 5. 핵심 값 */}
            <KeyValues item={item} />
          </>
        )}

        {/* 6. 검수 결과 */}
        <ReviewResults item={item} stages={stages} balance={balance} />

        {/* 7. 접힘 셋: 내용 전체 · 제출 원본 · 결정 기록 */}
        <Accordion type="multiple">
          {!editNode && (
            <AccordionItem value="content">
              <AccordionTrigger className="py-2 text-sm">내용 전체</AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">문안</p>
                    <KeyValueLines value={itemField(item, 'copy')} />
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">색</p>
                    <ColorLines value={itemField(item, 'colors')} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="mb-0.5 text-xs font-medium text-muted-foreground">공개 시각</p>
                      <p className={cn('text-sm tabular-nums', !startsAt && 'text-muted-foreground')}>{startsAt ?? '없어요'}</p>
                    </div>
                    <div>
                      <p className="mb-0.5 text-xs font-medium text-muted-foreground">종료 시각</p>
                      <p className={cn('text-sm tabular-nums', !endsAt && 'text-muted-foreground')}>{endsAt ?? '없어요'}</p>
                    </div>
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">대상</p>
                    <KeyValueLines value={itemField(item, 'segment')} />
                  </div>
                  <div>
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">연결</p>
                    <LinkedItems item={item} items={items} onSelectItem={onSelectItem} />
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          )}

          <AccordionItem value="original">
            <AccordionTrigger className="py-2 text-sm">제출 원본 보기</AccordionTrigger>
            <AccordionContent>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {rawJson(item.original)}
              </pre>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="history" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm">결정 기록</AccordionTrigger>
            <AccordionContent>
              {historyActionNode && <div className="mb-1.5 flex justify-end">{historyActionNode}</div>}
              <DecisionLog decisions={itemDecisions} />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {footerNode && <div className="sticky bottom-0 border-t border-border bg-background p-3">{footerNode}</div>}
    </Card>
  )
}
