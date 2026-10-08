/**
 * 패턴 상세 화면(S5 상세)의 보기 계산 (티켓 20261008_1435, 상위 20260930_1503 ⑨b, 채원 판정 「⑨ 상세」). 순수 함수만 둔다 — 읽기는 페이지가 맡는다.
 *
 * - `samples`·`cardShapes`·`knobs`는 DB의 JSONB라 모양을 믿지 않는다. **칸 단위로** 읽어, 깨진 칸은 「적지 않았어요」·「역할 모름」·「목록에 없는 모양」으로 남기고
 *   화면은 유지한다. 깨진 값을 0이나 빈 목록으로 바꿔 숨기지 않는다(배열이 아닌 `samples`·`cardShapes`는 `null` = 그 구역 전체가 「적지 않았어요」).
 * - 사용 이력의 줄은 목록·조합 뽑기가 세는 것과 **같은 판정**(`countableUsedAt`)으로 고른다 — 시험 묶음·승인 전 상태·`pattern_proposal`·사용 시각 없음은 줄이 되지 않는다.
 *   요약 숫자(최근 4주·마지막 사용)는 같은 세기 함수(`countOpsPatternUsage`)가 만들고 여기서는 글자로만 바꾼다.
 * - 시각은 모두 KST다.
 */
import { CARD_SHAPES } from '@/lib/today/shape'
import { describeBundleItem } from '@/lib/admin/opsSignals/composition'
import { OPS_FIELD_UNKNOWN, readOpsItemPatternNo } from '@/lib/admin/opsInbox/fields'
import { asRecord } from '@/lib/admin/opsInbox/itemView'
import { OPS_PATTERN_KNOB_LABELS, formatKstClock, kindLabel, kstDateKey } from '@/lib/admin/opsInbox/labels'
import {
  OPS_PATTERN_KNOB_KEYS,
  OPS_PATTERN_KNOB_VALUE_FIELD_LABELS,
  OPS_PATTERN_KNOB_VALUE_KEYS,
  OPS_PATTERN_SAMPLE_ROLES,
  OPS_PATTERN_SAMPLE_ROLE_LABELS,
  type OpsPatternKnobKey,
  type OpsPatternSampleRole,
} from './constants'
import { countableUsedAt, type OpsPatternUsageCount, type OpsPatternUsageRow } from './draw'
import type { OpsTasteSignalRecord } from './read'

export const PATTERN_FIELD_MISSING_TEXT = '적지 않았어요'
export const SAMPLE_ROLE_UNKNOWN_TEXT = '역할 모름'
export const CARD_SHAPE_UNKNOWN_TEXT = '목록에 없는 모양'
export const PATTERN_ORIGIN_UNKNOWN_TEXT = '출처 확인 필요'
export const PATTERN_DETAIL_MISSING_TEXT = '–'

// ── 머리 ─────────────────────────────────────────────────────────────────────────────────────────

const ORIGIN_LABELS: Record<string, string> = {
  seed: '원고 입력',
  manual: '직접 만듦',
  proposal: '제안 승인',
}

/** 출처 글자(칩이 아니라 muted 글자). 모르는 값은 「출처 확인 필요」다. */
export function originText(origin: string): string {
  return Object.prototype.hasOwnProperty.call(ORIGIN_LABELS, origin) ? `출처: ${ORIGIN_LABELS[origin]}` : PATTERN_ORIGIN_UNKNOWN_TEXT
}

/** 쉬는 중일 때의 쉬는 이유 줄(목록과 같은 글자). 쉬는 중이 아니면 `null`. */
export function pauseReasonLine(status: string, pauseReason: string | null): string | null {
  if (status !== 'paused') return null
  const reason = pauseReason?.trim()
  return `쉬는 이유: ${reason ? reason : PATTERN_FIELD_MISSING_TEXT}`
}

/** 「2026-10-07 14:05」(KST). 읽을 수 없으면 「–」. */
export function formatKstDateTime(iso: string | null | undefined): string {
  const day = kstDateKey(iso)
  const clock = formatKstClock(iso)
  return day && clock ? `${day} ${clock}` : PATTERN_DETAIL_MISSING_TEXT
}

/** 「2026-10-07」(KST). 읽을 수 없으면 「–」. */
export function formatKstDate(iso: string | null | undefined): string {
  return kstDateKey(iso) ?? PATTERN_DETAIL_MISSING_TEXT
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function orMissing(value: unknown): string {
  return textOf(value) || PATTERN_FIELD_MISSING_TEXT
}

// ── 샘플 ─────────────────────────────────────────────────────────────────────────────────────────

export interface SampleLine {
  /** 정렬에 쓰는 번호. 읽을 수 없으면 `null`(맨 뒤). */
  no: number | null
  noText: string
  name: string
  role: string
  impl: string
}

function readSampleNo(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * 샘플 목록(번호 순). `samples`가 배열이 아니면 `null`(구역 전체가 「적지 않았어요」)이다. 빈 배열은 빈 목록이다.
 * 칸마다 읽어서 번호가 없으면 맨 뒤로 가고, 모르는 역할은 「역할 모름」이다.
 */
export function readSampleLines(samples: unknown): SampleLine[] | null {
  if (!Array.isArray(samples)) return null
  const lines = samples.map((entry): SampleLine => {
    const record = asRecord(entry)
    const no = readSampleNo(record?.no)
    const role = textOf(record?.role)
    return {
      no,
      noText: no === null ? PATTERN_DETAIL_MISSING_TEXT : String(no),
      name: orMissing(record?.name),
      role: (OPS_PATTERN_SAMPLE_ROLES as readonly string[]).includes(role) ? OPS_PATTERN_SAMPLE_ROLE_LABELS[role as OpsPatternSampleRole] : SAMPLE_ROLE_UNKNOWN_TEXT,
      impl: orMissing(record?.impl),
    }
  })
  // Array.prototype.sort는 안정 정렬이라 같은 번호·번호 없음은 읽은 순서를 지킨다.
  return lines.sort((a, b) => (a.no === null ? 1 : 0) - (b.no === null ? 1 : 0) || (a.no ?? 0) - (b.no ?? 0))
}

// ── 카드 모양 ────────────────────────────────────────────────────────────────────────────────────

export interface CardShapeLine {
  shape: string
  note: string
}

/** 카드 모양 목록. `cardShapes`가 배열이 아니면 `null`. 목록(`CARD_SHAPES`) 밖의 모양은 「목록에 없는 모양」, 비었으면 「적지 않았어요」다. */
export function readCardShapeLines(cardShapes: unknown): CardShapeLine[] | null {
  if (!Array.isArray(cardShapes)) return null
  return cardShapes.map((entry): CardShapeLine => {
    const record = asRecord(entry)
    const shape = textOf(record?.shape)
    const known = (CARD_SHAPES as readonly string[]).includes(shape)
    return {
      shape: shape === '' ? PATTERN_FIELD_MISSING_TEXT : known ? shape : CARD_SHAPE_UNKNOWN_TEXT,
      note: orMissing(record?.note),
    }
  })
}

// ── 손잡이 ───────────────────────────────────────────────────────────────────────────────────────

export interface KnobCell {
  label: string
  text: string
}

export interface KnobLine {
  key: OpsPatternKnobKey
  label: string
  cells: [KnobCell, KnobCell]
}

/** 손잡이 5줄(조건·장소·시간·보상·트라이브, 늘 이 순서). `knobs`가 객체가 아니거나 칸이 틀리면 그 칸만 「적지 않았어요」다. */
export function readKnobLines(knobs: unknown): KnobLine[] {
  const root = asRecord(knobs)
  return OPS_PATTERN_KNOB_KEYS.map((key): KnobLine => {
    const knob = asRecord(root?.[key])
    const [first, second] = OPS_PATTERN_KNOB_VALUE_KEYS[key]
    return {
      key,
      label: OPS_PATTERN_KNOB_LABELS[key],
      cells: [
        { label: OPS_PATTERN_KNOB_VALUE_FIELD_LABELS[first], text: orMissing(knob?.[first]) },
        { label: OPS_PATTERN_KNOB_VALUE_FIELD_LABELS[second], text: orMissing(knob?.[second]) },
      ],
    }
  })
}

// ── 취향 신호 ────────────────────────────────────────────────────────────────────────────────────

export const TASTE_SIGNAL_EMPTY_TEXT = '이 패턴에 정리된 취향 신호가 없어요'
export const TASTE_EVIDENCE_TEXT = '근거 반려 기록 있음'

export interface TasteSignalLine {
  id: string
  basis: OpsTasteSignalRecord['basis']
  name: string
  reason: string
  /** 확정한 날(KST, `YYYY-MM-DD`). 확정이 아니거나 읽을 수 없으면 `null`. */
  confirmedDay: string | null
  hasEvidence: boolean
}

/** 이 패턴의 취향 신호 줄(입력 순서 그대로 — 읽기 함수가 `sortOrder`로 정렬해 둔다). 공통 신호(`patternNo: null`)와 다른 패턴 것은 뺀다. */
export function tasteSignalLines(signals: readonly OpsTasteSignalRecord[], patternNo: string): TasteSignalLine[] {
  return signals
    .filter((signal) => signal.patternNo === patternNo)
    .map((signal) => ({
      id: signal.id,
      basis: signal.basis,
      name: orMissing(signal.name),
      reason: orMissing(signal.reason),
      confirmedDay: signal.basis === 'confirmed' ? kstDateKey(signal.confirmedAt) : null,
      hasEvidence: signal.evidenceDecisionId !== null,
    }))
}

// ── 사용 이력 ────────────────────────────────────────────────────────────────────────────────────

export const USAGE_PAGE_SIZE = 10
export const USAGE_EMPTY_TEXT = '아직 이 패턴을 쓴 기록이 없어요'
export const USAGE_FAILED_TEXT = '사용 기록을 읽지 못했어요'
export const USAGE_NEVER_TEXT = '쓴 적 없어요'

/**
 * 요약 줄. 사용 기록을 못 읽었으면(`usage`가 `null`) 숫자 자리를 「–」로 둔다(0으로 보이지 않는다).
 * 한 번도 안 썼으면 「최근 4주 0회 · 쓴 적 없어요」, 썼으면 「최근 4주 N회 · 마지막 사용 2026-10-07 14:05」다.
 */
export function usageSummaryText(usage: OpsPatternUsageCount | null): string {
  if (usage === null) return `최근 4주 ${PATTERN_DETAIL_MISSING_TEXT} · 마지막 사용 ${PATTERN_DETAIL_MISSING_TEXT}`
  const last = usage.lastUsedAt === null ? USAGE_NEVER_TEXT : `마지막 사용 ${formatKstDateTime(usage.lastUsedAt)}`
  return `최근 4주 ${usage.uses}회 · ${last}`
}

export interface UsageLine {
  itemId: string
  bundleId: string
  usedAtMs: number
  /** 「2026-10-07 14:05」(KST). */
  usedAtText: string
  kind: string | null
  kindText: string
  name: string
  status: string
}

/**
 * 이 패턴의 사용 이력 줄 전부(사용 시각 최신순, 같은 시각이면 항목 ID 순). 세는 판정(`countableUsedAt`)이 시각을 돌려주고 항목의 패턴 번호가 이 패턴인 줄만 남는다 —
 * 시험·승인 전·반려·취소·실패·`pattern_proposal`·사용 시각 없음은 줄이 되지 않는다. **기간 제한은 없다.**
 */
export function selectPatternUsage(rows: readonly OpsPatternUsageRow[], patternNo: string): UsageLine[] {
  const lines: UsageLine[] = []
  for (const row of rows) {
    const usedAt = countableUsedAt(row)
    if (usedAt === null) continue
    const rowPatternNo = readOpsItemPatternNo(row)
    if (rowPatternNo === null || rowPatternNo === OPS_FIELD_UNKNOWN || rowPatternNo !== patternNo) continue
    lines.push({
      itemId: row.id,
      bundleId: row.bundle_id,
      usedAtMs: usedAt,
      usedAtText: formatKstDateTime(new Date(usedAt).toISOString()),
      kind: row.kind,
      kindText: kindLabel(row.kind),
      name: describeBundleItem({ original: row.original, edited: row.edited, itemKey: row.item_key, kind: row.kind }),
      status: row.status,
    })
  }
  return lines.sort((a, b) => b.usedAtMs - a.usedAtMs || (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0))
}

export function usagePageCount(lineCount: number): number {
  return Math.max(1, Math.ceil(lineCount / USAGE_PAGE_SIZE))
}

/** `?usagePage=`를 읽는다. 1부터 시작하는 정수만 받고, 틀린 값·범위 밖은 1쪽이다. */
export function parseUsagePage(raw: string | undefined, lineCount: number): number {
  if (raw === undefined || !/^[0-9]+$/.test(raw)) return 1
  const page = Number(raw)
  return page >= 1 && page <= usagePageCount(lineCount) ? page : 1
}

/** 한 쪽(10건)에 해당하는 줄. */
export function pageOfUsage(lines: readonly UsageLine[], page: number): UsageLine[] {
  const start = (page - 1) * USAGE_PAGE_SIZE
  return lines.slice(start, start + USAGE_PAGE_SIZE)
}
