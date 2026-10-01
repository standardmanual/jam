'use client'

import { useState } from 'react'
import Link from 'next/link'
import { IconAlertTriangle, IconInfoCircle, IconQuestionMark, IconRuler2, IconScale } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import {
  BALANCE_BLOCK_TITLE,
  BALANCE_EDITING_NOTE,
  BALANCE_FAILED_NOTICE,
  BALANCE_ITEM_FOOTER,
  BALANCE_LINE_LABELS,
  BALANCE_REGION_LABEL,
  BALANCE_RULE_LINK_LABEL,
  BALANCE_SAMPLE_NOTE,
  BALANCE_SHOW_ITEMS_LABEL,
  PROVISIONAL_CHIP_LABEL,
  balanceNoticeSubtitle,
  balanceNoticeTitle,
} from '@/lib/admin/opsInbox/balance/messages'
import { balanceItemIdSet, type BalanceLine, type BalanceLineKind, type BalanceView } from '@/lib/admin/opsInbox/balance/view'
import type { OpsIcon } from './opsIcons'
import { Chip, OpsStatusBadge, type Tone } from './OpsStatusBadge'

/**
 * 밸런스 경고 표시 부품 (티켓 20260930_1459 조각 A, 채원 확정 설계 「조각 A (S3)」). 기획 상세(S3)가 쓰고, 1502의 운영 홈·일정표·서랍이
 * `OpsBalanceLine`을 함께 쓴다(규칙 계산을 따로 만들지 않고 평가 결과를 읽어 표시만 한다).
 *
 * - `OpsBalanceLine`: 경고 한 줄. 수준 칩(주의·참고·점검 못 함) + 문장 + 임시값 규칙이면 「임시값·실측 전」 칩. `showSampleChip`이면 「시험」 칩을
 *   더한다(1502가 운영 홈·일정표에서 시험 묶음을 포함해 볼 때. 기획 상세는 시험 묶음이어도 줄마다 칩을 달지 않는다).
 * - `OpsBalanceItemWarnings`: 항목 상세의 「밸런스 경고」 블록(형식 오류 바로 아래). 항목에 걸린 줄만 보인다.
 * - `OpsBalanceBundleNotice`: 묶음 알림(형식 오류 요약 다음). 묶음 줄은 5건까지 보이고 나머지는 「더 보기」다.
 *
 * 수준은 색만으로 나누지 않고 아이콘과 글자로 함께 말한다. 경고 블록과 묶음 알림은 `role="region"` + `aria-label="밸런스 경고"`다
 * (`Alert`의 `role="alert"`를 덮어쓴다 — 화면을 열 때마다 읽어 주는 알림이 아니라 찾아볼 수 있는 구역이다). 문장은 모두 React 텍스트
 * 노드로만 그린다. 새 토큰은 없다(어드민 shadcn 시맨틱 토큰과 `Alert`의 경고 색만 쓴다).
 */

const BUNDLE_LINES_VISIBLE = 5

const LINE_CHIPS: Record<BalanceLineKind, { tone: Tone; Icon: OpsIcon; className?: string }> = {
  warn: { tone: 'warning', Icon: IconAlertTriangle },
  info: { tone: 'neutral', Icon: IconInfoCircle },
  unreadable: { tone: 'muted', Icon: IconQuestionMark, className: 'border-dashed' },
}

export interface OpsBalanceLineProps {
  line: BalanceLine
  /** 「시험」 칩을 단다(운영 홈·일정표에서 시험 묶음을 포함해 볼 때). */
  showSampleChip?: boolean
  className?: string
}

/** 경고 한 줄. 좁은 폭에서도 가로로 넘치지 않도록 칩은 한 줄로 감싸고 문장은 아래에서 줄을 바꾼다. */
export function OpsBalanceLine({ line, showSampleChip = false, className }: OpsBalanceLineProps) {
  const chip = LINE_CHIPS[line.kind]
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip tone={chip.tone} Icon={chip.Icon} className={chip.className}>
          {BALANCE_LINE_LABELS[line.kind]}
        </Chip>
        {line.warning.provisional && (
          <Chip tone="muted" Icon={IconRuler2}>
            {PROVISIONAL_CHIP_LABEL}
          </Chip>
        )}
        {showSampleChip && <OpsStatusBadge type="sample" />}
      </div>
      <p className="break-words text-sm">{line.warning.message}</p>
    </div>
  )
}

function LineList({ lines, showSampleChip }: { lines: readonly BalanceLine[]; showSampleChip?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {lines.map((line, index) => (
        <li key={`${line.warning.ruleKey}-${index}`}>
          <OpsBalanceLine line={line} showSampleChip={showSampleChip} />
        </li>
      ))}
    </ul>
  )
}

interface OpsBalanceItemWarningsProps {
  /** 이 항목의 줄(주의 → 참고 → 점검 못 함 순). 비어 있으면 아무것도 그리지 않는다. */
  lines: readonly BalanceLine[]
  /** 편집 중이면(`editNode !== null`) 「고치는 중이에요」 안내를 더한다. */
  editing?: boolean
  /** 「밸런스 규칙 보기」 링크를 보인다(새 탭으로 설정 화면 S7의 그 규칙 카드 `#rule-<규칙 키>`로 간다. 기획 상세가 켠다). */
  showRuleLink?: boolean
}

/** 항목 상세의 「밸런스 경고」 블록. 주의가 하나라도 있으면 경고 색이고, 참고·점검 못 함만 있으면 기본 색이다. */
export function OpsBalanceItemWarnings({ lines, editing = false, showRuleLink = false }: OpsBalanceItemWarningsProps) {
  if (lines.length === 0) return null
  const hasWarn = lines.some((line) => line.kind === 'warn')
  return (
    <Alert variant={hasWarn ? 'warning' : 'default'} role="region" aria-label={BALANCE_REGION_LABEL}>
      <IconScale className="size-4" aria-hidden="true" />
      <AlertTitle>{BALANCE_BLOCK_TITLE}</AlertTitle>
      <AlertDescription>
        <LineList lines={lines} />
        <p className="mt-2.5 text-sm">{BALANCE_ITEM_FOOTER}</p>
        {editing && <p className="mt-1 text-sm">{BALANCE_EDITING_NOTE}</p>}
        {showRuleLink && (
          <Link
            href={`/admin/ops-settings#rule-${lines[0].warning.ruleKey}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block rounded text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            {BALANCE_RULE_LINK_LABEL}
          </Link>
        )}
      </AlertDescription>
    </Alert>
  )
}

interface OpsBalanceBundleNoticeProps {
  view: BalanceView
  /** 시험 묶음이면 「이 묶음의 항목은 다른 묶음의 경고 계산에 들어가지 않아요」 안내를 더한다. */
  isSample?: boolean
  /** 「경고 있는 항목만 보기」 — 5번째 탭으로 옮긴다. 없으면 버튼을 그리지 않는다. */
  onShowItems?: () => void
}

/**
 * 묶음 알림. 제목의 건수는 항목 줄과 묶음 줄을 모두 센 것이고(항목 칩·5번째 탭과 같은 줄에서 센다), 목록에는 항목 키가 없는 줄(R2·R3·R7과
 * 값이 틀린 규칙)만 보인다. 항목 줄은 행 칩과 상세 블록이 맡는다. 평가가 실패하면 실패 알림 한 줄이다.
 */
export function OpsBalanceBundleNotice({ view, isSample = false, onShowItems }: OpsBalanceBundleNoticeProps) {
  const [expanded, setExpanded] = useState(false)
  if (!view.available) return null

  if (view.failed) {
    return (
      <Alert variant="warning" role="region" aria-label={BALANCE_REGION_LABEL}>
        <IconAlertTriangle className="size-4" aria-hidden="true" />
        <AlertDescription>{BALANCE_FAILED_NOTICE}</AlertDescription>
      </Alert>
    )
  }

  const total = view.totals.warn + view.totals.info
  if (total === 0) return null

  const visible = expanded ? view.bundleLines : view.bundleLines.slice(0, BUNDLE_LINES_VISIBLE)
  const hidden = view.bundleLines.length - visible.length
  const hasItemLines = balanceItemIdSet(view).size > 0

  return (
    <Alert variant={view.totals.warn > 0 ? 'warning' : 'default'} role="region" aria-label={BALANCE_REGION_LABEL}>
      <IconScale className="size-4" aria-hidden="true" />
      <AlertTitle>{balanceNoticeTitle(total)}</AlertTitle>
      <AlertDescription>
        <p>{balanceNoticeSubtitle(view.totals.warn, view.totals.info)}</p>
        {isSample && <p className="mt-1">{BALANCE_SAMPLE_NOTE}</p>}
        {visible.length > 0 && (
          <div className="mt-2.5">
            <LineList lines={visible} />
          </div>
        )}
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-2 rounded text-sm font-medium underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900"
          >
            나머지 {hidden}건 더 보기
          </button>
        )}
        {hasItemLines && onShowItems && (
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={onShowItems}>
              {BALANCE_SHOW_ITEMS_LABEL}
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  )
}
