import Link from 'next/link'
import type { ReactNode } from 'react'
import { IconArrowLeft } from '@tabler/icons-react'
import { cn } from '@/lib/utils'
import { ReadOnlyGrid, ReadOnlyItem, RailCard, SectionCard, SectionNav } from '@/components/admin/AdminEditorLayout'
import {
  PATTERN_FIELD_MISSING_TEXT,
  TASTE_EVIDENCE_TEXT,
  TASTE_SIGNAL_EMPTY_TEXT,
  formatKstDate,
  formatKstDateTime,
  originText,
  pauseReasonLine,
  readCardShapeLines,
  readKnobLines,
  readSampleLines,
  type TasteSignalLine,
} from '@/lib/admin/opsPatterns/detailView'
import { patternEditHref, patternListHref } from '@/lib/admin/opsPatterns/listView'
import type { OpsPatternRecord } from '@/lib/admin/opsPatterns/read'
import { Button } from '@/components/admin/ui/button'
import { OpsPatternStatusMenu } from './OpsPatternStatusMenu'
import { OpsStatusBadge } from './OpsStatusBadge'

/**
 * 패턴 상세(S5 상세)의 표시 부품 (티켓 20261008_1435, 상위 20260930_1503 ⑨b, 채원 판정 「⑨ 상세」). 훅이 없는 표시 전용 부품이다 — 읽기는 페이지가 맡는다.
 *
 * 구역 순서 = 목차 순서: 요약 · 손잡이 · 샘플 · 주의점 · 취향 신호 · 사용 이력 · 결과. 사용 이력은 `OpsPatternUsage`가 그린다.
 * JSONB(`samples`·`cardShapes`·`knobs`)가 깨져도 화면이 유지되고 칸마다 「적지 않았어요」·「역할 모름」·「목록에 없는 모양」으로 보인다(해석은 `detailView.ts`).
 * 사람이 쓴 글(이름·원리·이유·메모)은 텍스트 노드로만 그린다. 쓰기 버튼([수정하기]·[상태 바꾸기 ▾])은 머리의 `actions` 자리에 `OpsPatternDetailActions`가 들어간다(티켓 20261008_1617 ⑩a-2).
 * 수정한 사람은 어디에도 보이지 않는다.
 */

export const PATTERN_SECTION_NAMESPACE = 'pattern'

export const PATTERN_DETAIL_SECTIONS = [
  { id: 'summary', label: '요약', description: '이 패턴이 무엇이고 유저가 무엇을 겪는지 적어요' },
  { id: 'knobs', label: '손잡이', description: '운영 묶음에서 바꿀 수 있는 값과 닫아 둔 값이에요' },
  { id: 'samples', label: '샘플', description: '이 패턴을 보여 주는 예시예요' },
  { id: 'pitfalls', label: '주의점', description: '쓸 때 조심할 점이에요' },
  { id: 'signals', label: '취향 신호', description: '이 패턴에 정리된 운영 취향이에요' },
  { id: 'usage', label: '사용 이력', description: '이 패턴으로 만든 항목 중 승인 이후 기록이에요' },
  { id: 'result', label: '결과', description: '이 패턴이 낸 결과를 보는 곳이에요' },
] as const

export type PatternSectionId = (typeof PATTERN_DETAIL_SECTIONS)[number]['id']

export const PATTERN_RESULT_TEXT = '결과와 기록에서 봐요'
export const PATTERN_DETAIL_BACK_LABEL = '패턴 사전'

const SECTION_BY_ID = Object.fromEntries(PATTERN_DETAIL_SECTIONS.map((section) => [section.id, section])) as Record<
  PatternSectionId,
  (typeof PATTERN_DETAIL_SECTIONS)[number]
>

/** 구역 카드 틀. 제목·설명은 `PATTERN_DETAIL_SECTIONS`에서 가져와 목차와 늘 같다. */
export function PatternSection({ id, children }: { id: PatternSectionId; children: ReactNode }) {
  const section = SECTION_BY_ID[id]
  return (
    <SectionCard namespace={PATTERN_SECTION_NAMESPACE} id={id} title={section.label} description={section.description}>
      {children}
    </SectionCard>
  )
}

const MUTED_CLASS = 'text-sm text-muted-foreground'
const BACK_LINK_CLASS =
  'inline-flex min-h-6 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring @max-[40rem]:min-h-11'

/** 「← 패턴 사전」 되돌아가기 링크. 패턴을 못 읽은 화면도 쓴다. */
export function PatternBackLink() {
  return (
    <Link href={patternListHref()} className={BACK_LINK_CLASS}>
      <IconArrowLeft className="size-3.5" aria-hidden="true" />
      {PATTERN_DETAIL_BACK_LABEL}
    </Link>
  )
}

/** 머리: 되돌아가기 → `P03  이름 [상태 칩]` → 출처 글자 → (쉬는 중이면) 쉬는 이유. */
export function OpsPatternDetailHeader({
  pattern,
  actions,
}: {
  pattern: Pick<OpsPatternRecord, 'patternNo' | 'name' | 'status' | 'origin' | 'pauseReason'>
  /** 머리 아래 버튼 줄(`OpsPatternDetailActions`). 없으면 버튼 줄을 그리지 않는다. */
  actions?: ReactNode
}) {
  const reason = pauseReasonLine(pattern.status, pattern.pauseReason)
  return (
    <header className="@container space-y-2">
      <PatternBackLink />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 break-words text-2xl font-bold">
          <span className="tabular-nums">{pattern.patternNo}</span> {pattern.name}
        </h1>
        <OpsStatusBadge type="pattern-status" status={pattern.status} />
      </div>
      <p className={MUTED_CLASS}>{originText(pattern.origin)}</p>
      {reason && <p className={cn(MUTED_CLASS, 'break-words')}>{reason}</p>}
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </header>
  )
}

export const PATTERN_EDIT_LABEL = '수정하기'

/** 머리의 쓰기 버튼: [수정하기](고치기 화면 링크) [상태 바꾸기 ▾](상태별 항목과 확인창). */
export function OpsPatternDetailActions({ pattern }: { pattern: Pick<OpsPatternRecord, 'patternNo' | 'status' | 'pauseReason' | 'updatedAt'> }) {
  return (
    <>
      <Button asChild variant="outline">
        <Link href={patternEditHref(pattern.patternNo)}>{PATTERN_EDIT_LABEL}</Link>
      </Button>
      <OpsPatternStatusMenu patternNo={pattern.patternNo} status={pattern.status} pauseReason={pattern.pauseReason} updatedAt={pattern.updatedAt} />
    </>
  )
}

function MissingText() {
  return <span className="text-muted-foreground">{PATTERN_FIELD_MISSING_TEXT}</span>
}

function LongText({ value }: { value: string }) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? <span className="whitespace-pre-wrap break-words">{text}</span> : <MissingText />
}

/** 해석을 마친 칸 글자. 「적지 않았어요」는 muted로 그려 값과 구분한다. */
function ValueText({ text }: { text: string }) {
  return text === PATTERN_FIELD_MISSING_TEXT ? <MissingText /> : <span className="whitespace-pre-wrap break-words">{text}</span>
}

function menusOf(menus: unknown): string[] {
  return Array.isArray(menus) ? menus.filter((menu): menu is string => typeof menu === 'string' && menu.trim() !== '').map((menu) => menu.trim()) : []
}

export function OpsPatternSummarySection({ pattern }: { pattern: Pick<OpsPatternRecord, 'principle' | 'userExperience' | 'menus' | 'cardShapes'> }) {
  const menus = menusOf(pattern.menus)
  const shapes = readCardShapeLines(pattern.cardShapes)
  return (
    <PatternSection id="summary">
      <ReadOnlyGrid>
        <ReadOnlyItem label="작동 원리" span={3}>
          <LongText value={pattern.principle} />
        </ReadOnlyItem>
        <ReadOnlyItem label="유저가 겪는 것" span={3}>
          <LongText value={pattern.userExperience} />
        </ReadOnlyItem>
        <ReadOnlyItem label="쓰는 메뉴" span={3}>
          {menus.length > 0 ? menus.join(', ') : <MissingText />}
        </ReadOnlyItem>
        <ReadOnlyItem label="카드 모양" span={3}>
          {shapes === null || shapes.length === 0 ? (
            <MissingText />
          ) : (
            <ul className="space-y-1">
              {shapes.map((line, index) => (
                <li key={index} className="break-words">
                  <span className="font-medium">{line.shape}</span>
                  <span className="text-muted-foreground"> · {line.note}</span>
                </li>
              ))}
            </ul>
          )}
        </ReadOnlyItem>
      </ReadOnlyGrid>
    </PatternSection>
  )
}

/** 손잡이 5줄. 조건·장소·시간·보상은 「열 수 있는 값 | 닫은 값」, 트라이브는 「규칙 | 예시」다. 좁은 폭에서는 두 칸이 위아래로 쌓인다. */
export function OpsPatternKnobs({ knobs }: { knobs: unknown }) {
  const lines = readKnobLines(knobs)
  return (
    <ul className="@container divide-y divide-border rounded-lg border border-border">
      {lines.map((line) => (
        <li key={line.key} className="space-y-2 px-4 py-3">
          <p className="text-sm font-medium">{line.label}</p>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 @sm:grid-cols-2">
            {line.cells.map((cell) => (
              <ReadOnlyItem key={cell.label} label={cell.label}>
                <ValueText text={cell.text} />
              </ReadOnlyItem>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  )
}

export function OpsPatternKnobsSection({ knobs }: { knobs: unknown }) {
  return (
    <PatternSection id="knobs">
      <OpsPatternKnobs knobs={knobs} />
    </PatternSection>
  )
}

/** 샘플: 번호 · 이름 · 역할 · 구현. 40rem 미만에서는 카드 줄이다. `samples`가 배열이 아니거나 비었으면 「적지 않았어요」 한 줄이다. */
export function OpsPatternSamples({ samples }: { samples: unknown }) {
  const lines = readSampleLines(samples)
  if (lines === null || lines.length === 0) return <p className={MUTED_CLASS}>{PATTERN_FIELD_MISSING_TEXT}</p>
  return (
    <div className="@container">
      <table className="w-full border-collapse text-sm @max-[40rem]:hidden">
        <caption className="sr-only">패턴 샘플 목록</caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">번호</th>
            <th scope="col" className="px-3 py-2 font-medium">이름</th>
            <th scope="col" className="px-3 py-2 font-medium">역할</th>
            <th scope="col" className="px-3 py-2 font-medium">구현</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((line, index) => (
            <tr key={index} className="align-top">
              <th scope="row" className="px-3 py-2.5 text-left font-medium tabular-nums">{line.noText}</th>
              <td className="px-3 py-2.5 break-words"><ValueText text={line.name} /></td>
              <td className="px-3 py-2.5">{line.role}</td>
              <td className="px-3 py-2.5 break-words"><ValueText text={line.impl} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="hidden divide-y divide-border @max-[40rem]:block">
        {lines.map((line, index) => (
          <li key={index} className="space-y-1 px-1 py-3">
            <p className="break-words">
              <span className="font-medium tabular-nums">{line.noText}</span> <span className="font-medium"><ValueText text={line.name} /></span>
            </p>
            <p className={MUTED_CLASS}>{line.role}</p>
            <p className="text-sm break-words">
              <ValueText text={line.impl} />
            </p>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OpsPatternSamplesSection({ samples }: { samples: unknown }) {
  return (
    <PatternSection id="samples">
      <OpsPatternSamples samples={samples} />
    </PatternSection>
  )
}

export function OpsPatternPitfallsSection({ pitfalls }: { pitfalls: string }) {
  return (
    <PatternSection id="pitfalls">
      <p className="text-sm">
        <LongText value={pitfalls} />
      </p>
    </PatternSection>
  )
}

/** 취향 신호 구역의 내용: 이 패턴 것만. 추정/확정 칩 + (확정이면) 확정일 + 이름 + 이유. 근거 결정이 있으면 muted 글자(링크는 ⑩b). */
export function OpsPatternSignals({ signals }: { signals: readonly TasteSignalLine[] }) {
  if (signals.length === 0) return <p className={MUTED_CLASS}>{TASTE_SIGNAL_EMPTY_TEXT}</p>
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {signals.map((signal) => (
        <li key={signal.id} className="space-y-1 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <OpsStatusBadge type="taste-basis" basis={signal.basis} />
            {signal.confirmedDay && <span className="text-xs tabular-nums text-muted-foreground">{signal.confirmedDay}(KST)</span>}
            <span className="font-medium break-words">{signal.name}</span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{signal.reason}</p>
          {signal.hasEvidence && <p className="text-xs text-muted-foreground">{TASTE_EVIDENCE_TEXT}</p>}
        </li>
      ))}
    </ul>
  )
}

/** 결과 구역. 링크는 ⑫a가 결과와 기록(S6) 경로를 만든 뒤 단다 — 지금은 글자만이라 404 링크가 남지 않는다. */
export function OpsPatternResultSection() {
  return (
    <PatternSection id="result">
      <p className={MUTED_CLASS}>{PATTERN_RESULT_TEXT}</p>
    </PatternSection>
  )
}

/** 레일: 목차 · 마지막 수정 시각(KST) · 만든 날. 수정한 사람은 싣지 않는다. */
export function OpsPatternRail({ pattern }: { pattern: Pick<OpsPatternRecord, 'updatedAt' | 'createdAt'> }) {
  return (
    <>
      <RailCard title="목차">
        <SectionNav namespace={PATTERN_SECTION_NAMESPACE} items={PATTERN_DETAIL_SECTIONS.map(({ id, label }) => ({ id, label }))} />
      </RailCard>
      <RailCard title="기록">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">마지막 수정</dt>
            <dd className="tabular-nums">{formatKstDateTime(pattern.updatedAt)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">만든 날</dt>
            <dd className="tabular-nums">{formatKstDate(pattern.createdAt)}</dd>
          </div>
        </dl>
      </RailCard>
    </>
  )
}
