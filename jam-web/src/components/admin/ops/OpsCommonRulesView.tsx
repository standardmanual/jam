'use client'

import { useId, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/admin/ui/button'
import type { OpsCommonRuleRecord, OpsTasteSignalRecord } from '@/lib/admin/opsPatterns/read'
import { OpsSectionNotice } from './OpsSectionNotice'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 패턴 사전의 「공통 규칙·취향 신호」 탭 (티켓 20261008_1400, 채원 판정 「⑨ 목록」 공통 탭). 읽기만 한다 — [고치기]·[이유 고치고 확정하기]는 ⑩b가 단다.
 *
 * - 공통 규칙: 번호·제목·본문(`whitespace-pre-wrap`, 길면 `line-clamp-3` + [전체 보기]). 모든 패턴에 적용되는 규칙이다.
 * - 공통 취향 신호: 어느 패턴에도 묶이지 않은 방향. [추정]/[확정] 칩 · 이름 · 이유.
 * 두 구역은 따로 읽어서 하나가 실패해도 다른 하나는 보인다(`null`이면 그 구역만 안내 카드). 실패를 0건으로 보이지 않는다.
 * 제목·본문·이름·이유는 사람이 쓴 글이라 텍스트 노드로만 그린다.
 */

export const COMMON_RULES_FAILED_TITLE = '공통 규칙을 불러오지 못했어요'
export const COMMON_SIGNALS_FAILED_TITLE = '공통 취향 신호를 불러오지 못했어요'
export const COMMON_RULES_EMPTY_TEXT = '아직 공통 규칙이 없어요'
export const COMMON_SIGNALS_EMPTY_TEXT = '정리된 취향 신호가 없어요'
export const RULE_EXPAND_LABEL = '전체 보기'
export const RULE_COLLAPSE_LABEL = '접기'

/** 본문이 이만큼 길거나 줄이 이만큼 많으면 3줄로 줄이고 [전체 보기]를 둔다(렌더 폭을 재지 않고 글자 수로 가늠한다). */
const LONG_BODY_CHARS = 140
const LONG_BODY_LINES = 3

export function isLongRuleBody(body: string): boolean {
  return body.length > LONG_BODY_CHARS || body.split('\n').length > LONG_BODY_LINES
}

function RuleBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const long = isLongRuleBody(body)
  return (
    <div className="space-y-1">
      <p id={id} className={cn('whitespace-pre-wrap break-words text-sm', long && !open && 'line-clamp-3')}>
        {body}
      </p>
      {long && (
        <Button type="button" variant="ghost" size="sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
          {open ? RULE_COLLAPSE_LABEL : RULE_EXPAND_LABEL}
        </Button>
      )}
    </div>
  )
}

function CommonRules({ rules }: { rules: readonly OpsCommonRuleRecord[] | null }) {
  if (rules === null) return <OpsSectionNotice icon="patterns" title={COMMON_RULES_FAILED_TITLE} />
  return (
    <section aria-labelledby="ops-common-rules-heading" className="space-y-3">
      <div>
        <h2 id="ops-common-rules-heading" className="text-lg font-semibold">
          공통 규칙 {rules.length}
        </h2>
        <p className="text-sm text-muted-foreground">모든 패턴에 적용돼요</p>
      </div>
      {rules.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted-foreground">{COMMON_RULES_EMPTY_TEXT}</p>
      ) : (
        <ol className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {rules.map((rule) => (
            <li key={rule.ruleNo} className="space-y-1 px-4 py-3">
              <p className="font-medium break-words">
                <span className="tabular-nums">{rule.ruleNo}</span>. {rule.title}
              </p>
              <RuleBody body={rule.body} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function CommonSignals({ signals }: { signals: readonly OpsTasteSignalRecord[] | null }) {
  if (signals === null) return <OpsSectionNotice icon="patterns" title={COMMON_SIGNALS_FAILED_TITLE} />
  return (
    <section aria-labelledby="ops-common-signals-heading" className="space-y-3">
      <div>
        <h2 id="ops-common-signals-heading" className="text-lg font-semibold">
          공통 취향 신호 {signals.length}
        </h2>
        <p className="text-sm text-muted-foreground">어느 패턴에도 묶이지 않은 방향이에요</p>
      </div>
      {signals.length === 0 ? (
        <p className="rounded-lg border border-border bg-background p-5 text-sm text-muted-foreground">{COMMON_SIGNALS_EMPTY_TEXT}</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-background">
          {signals.map((signal) => (
            <li key={signal.id} className="space-y-1 px-4 py-3">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <OpsStatusBadge type="taste-basis" basis={signal.basis} />
                <span className="font-medium break-words">{signal.name}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{signal.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface OpsCommonRulesViewProps {
  /** 공통 규칙 전부(번호 순서). 못 읽었으면 `null`. */
  rules: readonly OpsCommonRuleRecord[] | null
  /** 취향 신호 전부. 못 읽었으면 `null`. 어느 패턴에도 묶이지 않은(`patternNo`가 없는) 것만 그린다. */
  signals: readonly OpsTasteSignalRecord[] | null
  className?: string
}

export function OpsCommonRulesView({ rules, signals, className }: OpsCommonRulesViewProps) {
  const common = signals === null ? null : signals.filter((signal) => signal.patternNo === null)
  return (
    <div className={cn('space-y-8', className)}>
      <CommonRules rules={rules} />
      <CommonSignals signals={common} />
    </div>
  )
}
