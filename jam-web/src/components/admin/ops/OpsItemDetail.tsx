'use client'

import type { ReactNode } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/admin/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/admin/ui/accordion'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { formatKstDayTime, kindLabel } from '@/lib/admin/opsInbox/labels'
import {
  describeValue,
  entriesOf,
  itemField,
  linksOf,
  truncateText,
  userExperienceOf,
  worldReviewOf,
} from '@/lib/admin/opsInbox/itemView'
import { readDiff } from '@/lib/admin/opsInbox/edit'
import type { OpsDecisionRecord, OpsItemRecord } from '@/lib/admin/opsInbox/query'
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

/**
 * 항목 상세 카드(티켓 20260930_1817, 채원 화면 설계 「항목 목록의 한 행」의 상세 카드 ①~⑦).
 *
 * ① 종류·상태 칩·패턴 번호·손잡이 값 ② 형식 오류 ②′ 밸런스 경고 ③ 유저가 겪는 것 ④ 내용(문안·색·공개/종료 시각·대상·연결)
 * ⑤ 검수·판정(에이전트가 적은 밸런스 판정과 툴 점검) ⑥ 제출 원본(접힘) ⑦ 결정 기록.
 *
 * 밸런스(`balance`, 티켓 20260930_1459): 이 항목의 경고 줄·확인한 규칙 수. 없으면 밸런스를 표시하지 않는다. 경고 블록은 줄이 있을 때만
 * 그리고, ⑤의 「툴 점검」 줄은 평가 결과가 있으면 늘 그린다(경고 없음·적용 규칙 없음·반려한 항목·평가 실패까지 말로 알린다).
 *
 * 제출 문자열은 **React 텍스트 노드로만** 그린다(`dangerouslySetInnerHTML`을 쓰지 않는다). 색 견본은 값이
 * `HEX_COLOR_PATTERN`(`#rrggbb`)을 통과할 때만 `style`에 넣는다. `author`·`item_key`는 자기 신고라 제목으로 쓰지 않는다.
 *
 * 슬롯(1818이 client 래퍼에서 채운다. 함수라 서버 컴포넌트에서 넘길 수 없다):
 * - `detailEdit`: 결과가 있으면 ③ 유저가 겪는 것과 ④ 내용 자리를 **대신한다**(편집 모드는 그 자리에서 바뀐다).
 * - `detailFooter`: 카드 아래 고정 줄(반려·수정·승인 버튼). 비어 있으면 줄을 그리지 않는다.
 * - `detailHistoryAction`: ⑦ 결정 기록 머리의 오른쪽(「마지막 수정 되돌리기」). 비어 있으면 자리를 잡지 않는다.
 *
 * ⑦ 결정 기록은 승인·반려·수정·수정 되돌림(「되돌림」 태그, 버튼 없음)·일괄 승인 표시와 사유, 수정 전후 차이 줄(`OpsDiffLines`)을 그린다.
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

const DECISION_ACTION_LABELS: Record<string, string> = {
  submit: '제출했어요',
  approve: '승인했어요',
  reject: '반려했어요',
  edit: '수정했어요',
  revert: '수정을 되돌렸어요',
}

/** 사유 줄 앞에 붙는 이름. 반려의 사유는 「반려 이유」, 수정의 사유는 「수정한 이유」다. */
const DECISION_REASON_LABELS: Record<string, string> = {
  reject: '반려 이유',
  edit: '수정한 이유',
}

function decisionLine(decision: OpsDecisionRecord): string {
  const action = Object.prototype.hasOwnProperty.call(DECISION_ACTION_LABELS, decision.action)
    ? DECISION_ACTION_LABELS[decision.action]
    : '기록을 남겼어요'
  if (decision.actor.startsWith('token:')) {
    // 토큰 제출의 이름은 자기 신고라 글자로만 보여 준다(권한 판단에 쓰지 않는다).
    return `에이전트(${truncateText(decision.actor.slice('token:'.length), 40)})가 ${action}`
  }
  return `관리자가 ${action}`
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

export function OpsItemDetail({
  item,
  items,
  decisions,
  onSelectItem,
  balance,
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

  return (
    // `overflow-hidden`을 두지 않는다: 아래 고정 줄(`sticky bottom-0`)이 스크롤 하는 바깥 열을 기준으로 붙어야 한다.
    <Card>
      <div className="space-y-5 p-4">
        {/* ① 종류·상태·패턴 번호·손잡이 값 */}
        <section aria-label="항목 요약" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="inline-flex items-center gap-1.5 text-base font-semibold">
              <OpsKindIcon kind={item.kind} className="size-5 shrink-0" />
              {kindLabel(item.kind)}
            </h3>
            <OpsStatusBadge type="item" status={item.status} />
            {item.patternNo && <span className="break-words text-xs text-muted-foreground">패턴 {item.patternNo}</span>}
          </div>
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

        {/* ② 형식 오류 */}
        <OpsItemFormatErrors errors={item.formatErrors} />

        {/* ②′ 밸런스 경고: 형식 오류 바로 아래. 줄이 있을 때만 그린다. 편집 중이면 저장하면 다시 확인한다고 알린다. */}
        {balance && <OpsBalanceItemWarnings lines={balance.lines} editing={editNode !== null} showRuleLink />}

        {editNode ?? (
          <>
            {/* ③ 유저가 겪는 것 */}
            <section>
              <SectionTitle>유저가 겪는 것</SectionTitle>
              {experience ? (
                <p className="whitespace-pre-line break-words text-sm">{experience}</p>
              ) : (
                <p className="text-sm text-muted-foreground">유저가 겪는 것이 비어 있어요</p>
              )}
            </section>

            {/* ④ 내용 */}
            <section className="space-y-3">
              <SectionTitle>내용</SectionTitle>
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
            </section>
          </>
        )}

        {/* ⑤ 검수·판정 */}
        <section>
          <SectionTitle>검수와 판정</SectionTitle>
          <ReviewLines item={item} balance={balance} />
        </section>

        {/* ⑥ 제출 원본 */}
        <Accordion type="single" collapsible>
          <AccordionItem value="original" className="border-b-0">
            <AccordionTrigger className="py-2 text-sm">제출 원본 보기</AccordionTrigger>
            <AccordionContent>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
                {rawJson(item.original)}
              </pre>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* ⑦ 결정 기록 */}
        <section>
          {historyActionNode ? (
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-muted-foreground">결정 기록</h4>
              {historyActionNode}
            </div>
          ) : (
            <SectionTitle>결정 기록</SectionTitle>
          )}
          <DecisionLog decisions={itemDecisions} />
        </section>
      </div>

      {footerNode && <div className="sticky bottom-0 border-t border-border bg-background p-3">{footerNode}</div>}
    </Card>
  )
}
