/**
 * 운영 패턴 입력 모양과 검사 (티켓 20261008_1545에서 `write.ts`에 있던 것을 티켓 20261008_1617이 옮겼다).
 *
 * 서버 의존(`read.ts` 런타임, 서비스 클라이언트)이 없는 순수 파일이라 저장 API(`write.ts`)와 화면의 폼(`OpsPatternForm`)이 같은 검사를 쓴다.
 * 동작은 옮기기 전과 같다 — `write.ts`가 이 파일의 이름을 다시 내보낸다.
 */
import { CARD_SHAPES, isCardShape, type CardShape } from '@/lib/today/shape'
import {
  OPS_PATTERN_LIMITS,
  OPS_PATTERN_SAMPLE_ROLES,
  OPS_REJECTION_OFFSET_MAX,
  OPS_TASTE_LIMITS,
  type OpsPatternSampleRole,
} from './constants'

// ── 입력 모양 ───────────────────────────────────────────────────────────────────────────────────

export interface OpsPatternInputSample {
  no: number
  name: string
  role: OpsPatternSampleRole
  impl: string
}

export interface OpsPatternInputCardShape {
  shape: CardShape
  note: string
}

/** 조건·장소·시간·보상 손잡이는 열린 값·닫은 값, 트라이브는 규칙·예시. 칸은 비워 둘 수 있다. */
export interface OpsPatternInputKnobs {
  condition: { open: string; closed: string }
  place: { open: string; closed: string }
  time: { open: string; closed: string }
  reward: { open: string; closed: string }
  tribe: { rule: string; example: string }
}

/** 패턴의 내용 칸 전체. 칸 이름은 `OpsPatternRecord`와 같고, `OpsPatternProposal`(패턴 제안 항목의 내용)과 같은 모양이라 ⑪이 변환 없이 넘긴다. */
export interface OpsPatternInput {
  name: string
  principle: string
  userExperience: string
  menus: string[]
  samples: OpsPatternInputSample[]
  cardShapes: OpsPatternInputCardShape[]
  knobs: OpsPatternInputKnobs
  pitfalls: string
}

export type OpsPatternFieldErrors = Record<string, string>

// ── 검사 ────────────────────────────────────────────────────────────────────────────────────────

const KNOB_LABELS = {
  condition: '조건',
  place: '장소',
  time: '시간',
  reward: '보상',
  tribe: '트라이브',
} as const
const KNOB_FIELD_LABELS = { open: '열린 값', closed: '닫은 값', rule: '규칙', example: '예시' } as const
const KNOB_SHAPE = {
  condition: ['open', 'closed'],
  place: ['open', 'closed'],
  time: ['open', 'closed'],
  reward: ['open', 'closed'],
  tribe: ['rule', 'example'],
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 받침에 따라 조사를 고른다(`이름` + 을/를). 한글이 아닌 끝 글자는 받침이 없는 것으로 본다. */
function withJosa(word: string, withBatchim: string, withoutBatchim: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  const hasBatchim = code >= 0 && code <= 11171 && code % 28 !== 0
  return `${word}${hasBatchim ? withBatchim : withoutBatchim}`
}

/** 선택 문자열 칸: 없으면(undefined·null) 빈 문자열, 문자열이면 앞뒤 공백을 떼고 상한을 본다, 그 밖에는 오류. */
function readOptionalText(value: unknown, path: string, label: string, max: number, errors: OpsPatternFieldErrors): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') {
    errors[path] = `${withJosa(label, '은', '는')} 글로 적어 주세요.`
    return ''
  }
  const text = value.trim()
  if (text.length > max) errors[path] = `${withJosa(label, '은', '는')} ${max.toLocaleString('ko-KR')}자까지 적을 수 있어요. 줄여서 다시 적어 주세요.`
  return text
}

function readRequiredText(value: unknown, path: string, label: string, max: number, errors: OpsPatternFieldErrors): string {
  if (typeof value !== 'string' || value.trim() === '') {
    errors[path] = `${withJosa(label, '을', '를')} 적어 주세요.`
    return ''
  }
  return readOptionalText(value, path, label, max, errors)
}

/**
 * 패턴 내용 검사(티켓 20261008_1545 D2). 통과하면 앞뒤 공백을 뗀 정규 모양(`OpsPatternInput`)을 돌려주고, 아니면 칸별 한국어 문장을 돌려준다.
 * 필수는 이름·작동 원리·유저가 겪는 것 세 칸이다. 메뉴·샘플·카드 모양·손잡이·주의점은 비워 둘 수 있고 손잡이 칸은 빈 문자열도 받는다.
 */
export function validateOpsPatternInput(raw: unknown): { ok: true; value: OpsPatternInput } | { ok: false; fieldErrors: OpsPatternFieldErrors } {
  const errors: OpsPatternFieldErrors = {}
  if (!isRecord(raw)) return { ok: false, fieldErrors: { name: '이름을 적어 주세요.', principle: '작동 원리를 적어 주세요.', userExperience: '유저가 겪는 것을 적어 주세요.' } }
  const { nameMax, longTextMax, menuMax, menusMaxCount, samplesMaxCount, cardShapeNoteMax } = OPS_PATTERN_LIMITS

  const name = readRequiredText(raw.name, 'name', '이름', nameMax, errors)
  const principle = readRequiredText(raw.principle, 'principle', '작동 원리', longTextMax, errors)
  const userExperience = readRequiredText(raw.userExperience, 'userExperience', '유저가 겪는 것', longTextMax, errors)
  const pitfalls = readOptionalText(raw.pitfalls, 'pitfalls', '주의점', longTextMax, errors)

  // 메뉴
  const menus: string[] = []
  if (raw.menus !== undefined && raw.menus !== null) {
    if (!Array.isArray(raw.menus)) errors.menus = '메뉴는 목록으로 보내 주세요.'
    else {
      if (raw.menus.length > menusMaxCount) errors.menus = `메뉴는 ${menusMaxCount}개까지 넣을 수 있어요.`
      raw.menus.forEach((entry, index) => {
        const path = `menus.${index}`
        if (typeof entry !== 'string' || entry.trim() === '') errors[path] = '메뉴 이름을 적어 주세요.'
        else if (entry.trim().length > menuMax) errors[path] = `메뉴 이름은 ${menuMax}자까지 적을 수 있어요.`
        else menus.push(entry.trim())
      })
    }
  }

  // 샘플
  const samples: OpsPatternInputSample[] = []
  if (raw.samples !== undefined && raw.samples !== null) {
    if (!Array.isArray(raw.samples)) errors.samples = '샘플은 목록으로 보내 주세요.'
    else {
      if (raw.samples.length > samplesMaxCount) errors.samples = `샘플은 ${samplesMaxCount}개까지 넣을 수 있어요.`
      const seenNos = new Set<number>()
      raw.samples.forEach((entry, index) => {
        const at = `samples.${index}`
        if (!isRecord(entry)) {
          errors[at] = '샘플 내용을 확인해 주세요.'
          return
        }
        const no = entry.no
        let noOk = false
        if (typeof no !== 'number' || !Number.isInteger(no) || no < 1) errors[`${at}.no`] = '샘플 번호는 1 이상의 정수로 적어 주세요.'
        else if (seenNos.has(no)) errors[`${at}.no`] = '이미 넣은 샘플 번호예요. 다른 번호를 적어 주세요.'
        else {
          seenNos.add(no)
          noOk = true
        }
        const sampleName = readRequiredText(entry.name, `${at}.name`, '샘플 이름', longTextMax, errors)
        const role = entry.role
        const roleOk = typeof role === 'string' && (OPS_PATTERN_SAMPLE_ROLES as readonly string[]).includes(role)
        if (!roleOk) errors[`${at}.role`] = '샘플의 역할은 주·보조 장치·걸침 중에서 골라 주세요.'
        const impl = readOptionalText(entry.impl, `${at}.impl`, '샘플 구현', longTextMax, errors)
        if (noOk && roleOk) samples.push({ no: no as number, name: sampleName, role: role as OpsPatternSampleRole, impl })
      })
    }
  }

  // 카드 모양
  const cardShapes: OpsPatternInputCardShape[] = []
  if (raw.cardShapes !== undefined && raw.cardShapes !== null) {
    if (!Array.isArray(raw.cardShapes)) errors.cardShapes = '카드 모양은 목록으로 보내 주세요.'
    else {
      raw.cardShapes.forEach((entry, index) => {
        const at = `cardShapes.${index}`
        if (!isRecord(entry)) {
          errors[at] = '카드 모양 내용을 확인해 주세요.'
          return
        }
        const shapeOk = isCardShape(entry.shape)
        if (!shapeOk) errors[`${at}.shape`] = `카드 모양은 ${CARD_SHAPES.join('·')} 중에서 골라 주세요.`
        const note = readOptionalText(entry.note, `${at}.note`, '카드 모양 메모', cardShapeNoteMax, errors)
        if (shapeOk) cardShapes.push({ shape: entry.shape as CardShape, note })
      })
    }
  }

  // 손잡이 — 칸은 선택이라 없으면 빈 문자열이다. 저장 모양은 항상 5종 × 두 칸이다.
  const knobsRaw = raw.knobs
  if (knobsRaw !== undefined && knobsRaw !== null && !isRecord(knobsRaw)) errors.knobs = '손잡이는 칸별 내용으로 보내 주세요.'
  const knobs = Object.fromEntries(
    (Object.keys(KNOB_SHAPE) as Array<keyof typeof KNOB_SHAPE>).map((key) => {
      const group = isRecord(knobsRaw) ? knobsRaw[key] : undefined
      if (group !== undefined && group !== null && !isRecord(group)) errors[`knobs.${key}`] = `${KNOB_LABELS[key]} 손잡이는 칸별 내용으로 보내 주세요.`
      const fields = KNOB_SHAPE[key].map((field) => {
        const value = isRecord(group) ? group[field] : undefined
        return [field, readOptionalText(value, `knobs.${key}.${field}`, `${KNOB_LABELS[key]} ${KNOB_FIELD_LABELS[field]}`, longTextMax, errors)] as const
      })
      return [key, Object.fromEntries(fields)] as const
    })
  ) as unknown as OpsPatternInputKnobs

  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors }
  return { ok: true, value: { name, principle, userExperience, menus, samples, cardShapes, knobs, pitfalls } }
}


// ── 취향 신호·공통 규칙 (티켓 20261008_1712 ⑩b-1, ⑩b-2 화면이 같은 검사를 쓴다) ─────────────────────────────

export const TASTE_EVIDENCE_INVALID_MESSAGE = '이 패턴의 반려 기록만 근거로 붙일 수 있어요.'
export const TASTE_BASIS_REVERT_MESSAGE = '확정한 취향 신호는 추정으로 되돌릴 수 없어요.'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** `ops_pattern_common_rules.rule_no`는 INTEGER다. */
const INTEGER_MAX = 2_147_483_647

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** 경로의 공통 규칙 번호(`"3"` → 3). 양의 정수 글자가 아니면 null이다. */
export function parseCommonRuleNo(raw: string): number | null {
  if (!/^[1-9][0-9]*$/.test(raw)) return null
  const value = Number(raw)
  return value <= INTEGER_MAX ? value : null
}

/** 근거 후보 읽기의 `offset`: 없으면 0, 0 이상 정수 글자이고 상한 이하여야 한다. 아니면 null이다. */
export function parseRejectionOffset(raw: string | null): number | null {
  if (raw === null) return 0
  if (!/^[0-9]+$/.test(raw)) return null
  const value = Number(raw)
  return value <= OPS_REJECTION_OFFSET_MAX ? value : null
}

export interface OpsTasteSignalInput {
  /** 앞뒤 공백을 뗀 이유(1~500자). */
  reason: string
  /** 근거로 붙일 반려 기록의 ID. `null`이면 근거 없이 확정한다(근거를 비운다). */
  evidenceDecisionId: string | null
}

/**
 * 취향 신호 확정·고치기 입력 검사. 저장하면 항상 확정이라 `basis` 칸은 받지 않는다 — 보내면 `confirmed`만 허용하고 `estimate`(되돌리기)는 400이다.
 * `evidenceDecisionId`는 `null`·없음(근거 없이) 또는 UUID다. 근거가 이 패턴의 반려 기록인지는 서버가 읽어서 본다(`tasteWrite.ts`).
 */
export function validateTasteSignalInput(raw: unknown): { ok: true; value: OpsTasteSignalInput } | { ok: false; fieldErrors: OpsPatternFieldErrors } {
  if (!isRecord(raw)) return { ok: false, fieldErrors: { reason: '이유를 적어 주세요.' } }
  const errors: OpsPatternFieldErrors = {}
  const reason = readRequiredText(raw.reason, 'reason', '이유', OPS_TASTE_LIMITS.reasonMax, errors)
  if (raw.basis !== undefined && raw.basis !== 'confirmed') errors.basis = TASTE_BASIS_REVERT_MESSAGE
  const evidence = raw.evidenceDecisionId
  if (evidence !== undefined && evidence !== null && !isUuid(evidence)) errors.evidenceDecisionId = TASTE_EVIDENCE_INVALID_MESSAGE
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors }
  return { ok: true, value: { reason, evidenceDecisionId: isUuid(evidence) ? evidence : null } }
}

export interface OpsCommonRuleInput {
  title: string
  body: string
}

/** 공통 규칙 고치기 입력 검사: 제목 1~60자, 본문 1~2,000자(앞뒤 공백을 뗀 뒤). */
export function validateCommonRuleInput(raw: unknown): { ok: true; value: OpsCommonRuleInput } | { ok: false; fieldErrors: OpsPatternFieldErrors } {
  if (!isRecord(raw)) return { ok: false, fieldErrors: { title: '제목을 적어 주세요.', body: '본문을 적어 주세요.' } }
  const errors: OpsPatternFieldErrors = {}
  const title = readRequiredText(raw.title, 'title', '제목', OPS_TASTE_LIMITS.ruleTitleMax, errors)
  const body = readRequiredText(raw.body, 'body', '본문', OPS_TASTE_LIMITS.ruleBodyMax, errors)
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors }
  return { ok: true, value: { title, body } }
}
