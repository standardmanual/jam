/**
 * 패턴 만들기·고치기 폼의 상태 변환 (티켓 20261008_1617, 상위 20260930_1503 ⑩a-2). 순수 함수만 둔다 — 화면(`OpsPatternForm`)이 부른다.
 *
 * - 폼이 들고 있는 값(`PatternDraft`)은 입력칸에 그대로 묶이도록 전부 문자열이다(샘플 번호도 글자). 저장할 때 `inputFromDraft`가 검사용 입력으로 바꾸고,
 *   검사는 서버와 같은 `validateOpsPatternInput`(`input.ts`)이 한다.
 * - `draftFromRecord`는 DB의 JSONB(`samples`·`cardShapes`·`knobs`)를 믿지 않고 칸 단위로 읽는다. 깨진 칸은 빈 칸이 된다(저장하면 그 칸이 새 값으로 바뀐다).
 * - `changedFields`는 앞뒤 공백만 다른 칸은 바뀐 칸으로 세지 않는다(서버도 앞뒤 공백을 떼고 저장한다). 샘플·카드 모양·메뉴는 줄 순서가 바뀌어도 바뀐 칸이다.
 */
import { OPS_PATTERN_KNOB_LABELS } from '@/lib/admin/opsInbox/labels'
import { isCardShape, type CardShape } from '@/lib/today/shape'
import {
  OPS_PATTERN_KNOB_KEYS,
  OPS_PATTERN_KNOB_VALUE_KEYS,
  OPS_PATTERN_SAMPLE_ROLES,
  type OpsPatternKnobKey,
  type OpsPatternSampleRole,
} from './constants'
import type { OpsPatternFieldErrors } from './input'
import type { OpsPatternRecord } from './read'

export interface PatternDraftSample {
  /** 입력칸 값이라 글자다. 저장할 때 숫자로 바꾼다. */
  no: string
  name: string
  /** 아직 고르지 않았으면 빈 글자. */
  role: OpsPatternSampleRole | ''
  impl: string
}

export interface PatternDraftCardShape {
  /** 아직 고르지 않았으면 빈 글자. */
  shape: CardShape | ''
  note: string
}

/** 손잡이 한 종류의 두 칸. 순서는 `OPS_PATTERN_KNOB_VALUE_KEYS`와 같다(열 수 있는 값·닫은 값, 트라이브는 규칙·예시). */
export type PatternDraftKnob = [string, string]

export interface PatternDraft {
  name: string
  principle: string
  userExperience: string
  menus: string[]
  cardShapes: PatternDraftCardShape[]
  knobs: Record<OpsPatternKnobKey, PatternDraftKnob>
  samples: PatternDraftSample[]
  pitfalls: string
}

function emptyKnobs(): Record<OpsPatternKnobKey, PatternDraftKnob> {
  return Object.fromEntries(OPS_PATTERN_KNOB_KEYS.map((key) => [key, ['', ''] as PatternDraftKnob])) as Record<OpsPatternKnobKey, PatternDraftKnob>
}

/** 만들기 폼의 시작 값. */
export function emptyDraft(): PatternDraft {
  return { name: '', principle: '', userExperience: '', menus: [], cardShapes: [], knobs: emptyKnobs(), samples: [], pitfalls: '' }
}

// ── 레코드 → 초안 ───────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 읽어 온 패턴을 폼 값으로 바꾼다. JSONB가 깨져 있어도 던지지 않고 그 칸만 비운다. */
export function draftFromRecord(
  record: Pick<OpsPatternRecord, 'name' | 'principle' | 'userExperience' | 'menus' | 'samples' | 'cardShapes' | 'knobs' | 'pitfalls'>
): PatternDraft {
  const menus = Array.isArray(record.menus) ? record.menus.filter((menu): menu is string => typeof menu === 'string') : []

  const samples = (Array.isArray(record.samples) ? record.samples : []).map((entry): PatternDraftSample => {
    const sample = isRecord(entry) ? entry : {}
    const no = typeof sample.no === 'number' && Number.isFinite(sample.no) ? String(sample.no) : ''
    const role = (OPS_PATTERN_SAMPLE_ROLES as readonly unknown[]).includes(sample.role) ? (sample.role as OpsPatternSampleRole) : ''
    return { no, name: text(sample.name), role, impl: text(sample.impl) }
  })

  const cardShapes = (Array.isArray(record.cardShapes) ? record.cardShapes : []).map((entry): PatternDraftCardShape => {
    const item = isRecord(entry) ? entry : {}
    return { shape: isCardShape(item.shape) ? item.shape : '', note: text(item.note) }
  })

  const knobs = emptyKnobs()
  const knobsRaw = isRecord(record.knobs) ? record.knobs : {}
  for (const key of OPS_PATTERN_KNOB_KEYS) {
    const group = isRecord(knobsRaw[key]) ? (knobsRaw[key] as Record<string, unknown>) : {}
    const [first, second] = OPS_PATTERN_KNOB_VALUE_KEYS[key]
    knobs[key] = [text(group[first]), text(group[second])]
  }

  return {
    name: text(record.name),
    principle: text(record.principle),
    userExperience: text(record.userExperience),
    menus,
    cardShapes,
    knobs,
    samples,
    pitfalls: text(record.pitfalls),
  }
}

// ── 초안 → 검사용 입력 ──────────────────────────────────────────────────────────────────────────

/**
 * 폼 값을 `validateOpsPatternInput`이 받는 입력으로 바꾼다. 검사 전의 값이라 `unknown`으로 돌려준다 — 고르지 않은 역할·모양은 빈 글자로 남아
 * 검사가 「골라 주세요」 문장을 낸다. 샘플 번호는 숫자 글자만 숫자로 바꾸고, 비었으면 없는 것으로, 그 밖의 글자는 그대로 둬 검사가 막게 한다.
 */
export function inputFromDraft(draft: PatternDraft): unknown {
  return {
    name: draft.name,
    principle: draft.principle,
    userExperience: draft.userExperience,
    menus: draft.menus,
    samples: draft.samples.map((sample) => {
      const no = sample.no.trim()
      return { no: no === '' ? undefined : /^[0-9]+$/.test(no) ? Number(no) : no, name: sample.name, role: sample.role, impl: sample.impl }
    }),
    cardShapes: draft.cardShapes.map((item) => ({ shape: item.shape, note: item.note })),
    knobs: Object.fromEntries(
      OPS_PATTERN_KNOB_KEYS.map((key) => {
        const [first, second] = OPS_PATTERN_KNOB_VALUE_KEYS[key]
        return [key, { [first]: draft.knobs[key][0], [second]: draft.knobs[key][1] }]
      })
    ),
    pitfalls: draft.pitfalls,
  }
}

// ── 바뀐 칸 ─────────────────────────────────────────────────────────────────────────────────────

export const FIELD_LABEL = {
  name: '이름',
  principle: '작동 원리',
  userExperience: '유저가 겪는 것',
  menus: '쓰는 메뉴',
  cardShapes: '카드 모양',
  samples: '샘플',
  pitfalls: '주의점',
} as const

/** 손잡이 칸 이름: 「손잡이 · 장소」. */
export function knobFieldLabel(key: OpsPatternKnobKey): string {
  return `손잡이 · ${OPS_PATTERN_KNOB_LABELS[key]}`
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function trimmed(draft: PatternDraft) {
  return {
    name: draft.name.trim(),
    principle: draft.principle.trim(),
    userExperience: draft.userExperience.trim(),
    menus: draft.menus.map((menu) => menu.trim()),
    cardShapes: draft.cardShapes.map((item) => ({ shape: item.shape, note: item.note.trim() })),
    knobs: OPS_PATTERN_KNOB_KEYS.map((key) => [key, draft.knobs[key].map((value) => value.trim())] as const),
    samples: draft.samples.map((sample) => ({ no: sample.no.trim(), name: sample.name.trim(), role: sample.role, impl: sample.impl.trim() })),
    pitfalls: draft.pitfalls.trim(),
  }
}

/** 처음 값(`base`)과 다른 칸의 이름을 폼 순서대로 돌려준다. 앞뒤 공백만 다른 칸은 세지 않는다. */
export function changedFields(base: PatternDraft, draft: PatternDraft): string[] {
  const before = trimmed(base)
  const after = trimmed(draft)
  const changed: string[] = []
  if (before.name !== after.name) changed.push(FIELD_LABEL.name)
  if (before.principle !== after.principle) changed.push(FIELD_LABEL.principle)
  if (before.userExperience !== after.userExperience) changed.push(FIELD_LABEL.userExperience)
  if (!same(before.menus, after.menus)) changed.push(FIELD_LABEL.menus)
  if (!same(before.cardShapes, after.cardShapes)) changed.push(FIELD_LABEL.cardShapes)
  before.knobs.forEach(([key, values], index) => {
    if (!same(values, after.knobs[index][1])) changed.push(knobFieldLabel(key))
  })
  if (!same(before.samples, after.samples)) changed.push(FIELD_LABEL.samples)
  if (before.pitfalls !== after.pitfalls) changed.push(FIELD_LABEL.pitfalls)
  return changed
}

// ── 서버·검사 오류 경로 ─────────────────────────────────────────────────────────────────────────

export type PatternFormSectionId = 'basic' | 'menus' | 'knobs' | 'samples' | 'pitfalls'

/** 오류 경로(`name`·`samples.2.role`·`knobs.place.open`)의 첫 마디가 놓인 구역. 모르는 경로는 `null`. */
const SECTION_OF_ROOT: Record<string, PatternFormSectionId> = {
  name: 'basic',
  principle: 'basic',
  userExperience: 'basic',
  menus: 'menus',
  cardShapes: 'menus',
  knobs: 'knobs',
  samples: 'samples',
  pitfalls: 'pitfalls',
}

const ROOT_ORDER = ['name', 'principle', 'userExperience', 'menus', 'cardShapes', 'knobs', 'samples', 'pitfalls']

/** 칸의 DOM id. 오류 문장이 붙는 칸과 포커스 대상이 같은 규칙을 쓴다(`samples.2.role` → `pattern-field-samples-2-role`). */
export function fieldDomId(path: string): string {
  return `pattern-field-${path.replace(/\./g, '-')}`
}

/** 오류 경로가 가리키는 구역과 칸 id. */
export function fieldErrorTarget(path: string): { section: PatternFormSectionId | null; domId: string } {
  const root = path.split('.')[0]
  return { section: SECTION_OF_ROOT[root] ?? null, domId: fieldDomId(path) }
}

/** 오류 경로를 폼에 나온 순서(이름 → … → 주의점)로 세운다. 같은 칸 안에서는 받은 순서를 지킨다. */
export function orderedErrorPaths(errors: OpsPatternFieldErrors): string[] {
  const rank = (path: string) => {
    const index = ROOT_ORDER.indexOf(path.split('.')[0])
    return index === -1 ? ROOT_ORDER.length : index
  }
  return Object.keys(errors)
    .map((path, position) => ({ path, position }))
    .sort((a, b) => rank(a.path) - rank(b.path) || a.position - b.position)
    .map((entry) => entry.path)
}
