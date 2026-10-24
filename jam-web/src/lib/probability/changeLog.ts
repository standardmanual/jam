/**
 * 확률 안내 «바뀐 날짜» 표 읽기 (티켓 20261022_1700, 채원 사전 판정 2026-10-23) — 서버 전용
 *
 * 어드민 «밸런스 설정»이 저장할 때 쓰는 변경 이력(`balance_setting_changes`, 마이그레이션 285)에서 `affects_disclosure = true`인 행만 읽어,
 * 표가 그대로 그리는 한 줄(`DisclosureRow`: 날짜 + 바뀐 내용 문장)로 바꾼다. 저장 한 번은 칸이 여럿이어도 한 줄이다.
 *
 * - **읽는 칸은 `section_key, changes, created_at`뿐이다.** 변경 메모(`note`)와 바꾼 사람(`changed_by`)은 읽지 않으므로 HTML에도 실리지 않는다.
 * - 이력 표는 RLS가 켜져 있고 정책이 없다. service_role 클라이언트로 서버에서만 읽는다.
 * - 읽기에 실패하면 `{ ok: false }`다. 이력이 없는 것(`ok: true`, 빈 배열)과 구분해야 페이지가 «처음 열었어요» 줄을 남긴 채 안내를 보일 수 있다.
 * - 날짜는 `created_at`을 한국 표준시로 바꿔 «2026년 10월 23일»로 쓴다(`capsule_policy.updated_at`은 갱신 트리거가 없어 날짜로 쓸 수 없다).
 *
 * 문구 틀은 «{이름}{을/를} {전}에서 {후}{로/으로} 바꿨어요»이고, 칸이 여럿이면 쉼표로 잇고 «바꿨어요»는 마지막에 한 번만 쓴다.
 * 방향어(올렸어요·낮췄어요 등)와 화살표는 쓰지 않는다(UX Writing 3.3, 다시 열기를 부추기지 않는다). 숫자 서식은 표 위쪽 숫자와 같은 함수를 쓴다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { AMBIENT_SECTION_ID } from '@/lib/admin/balance/ambient'
import { CAPSULE_SECTION_ID } from '@/lib/admin/balance/capsule'
import { parseChanges } from '@/lib/admin/balance/history'
import { SYNC_SECTION_ID } from '@/lib/admin/balance/sync'
import type { BalanceChange } from '@/lib/admin/balance/types'
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import type { Json } from '@/types/database.generated'
import {
  AMBIENT_COLUMNS,
  CAPSULE_COLUMNS,
  JAM_COLUMNS,
  formatFraction,
  formatPercentPoints,
  type DisclosureResult,
  type DisclosureRow,
} from './disclosure'

/** 값이 어떤 모양으로 저장돼 있고 어떻게 적는가 — 개수·횟수는 단위 글자를 붙이고, 확률은 표 위쪽과 같은 %로 쓴다 */
type ColumnValue =
  | { kind: 'count'; unit: '개' | '번' | '잼' }
  /** 0~1로 저장된 확률 칸 */
  | { kind: 'fraction' }
  /** 이력 값이 퍼센트인 등급 확률 칸(70). 시스템 드랍은 DB에 0~1로 저장하지만 이력에는 화면 값인 퍼센트를 남긴다 */
  | { kind: 'percent' }

interface ColumnLabel {
  /** 유저가 읽는 칸 이름. 운영 이름(«보정 1»)이나 내부 칸 이름을 쓰지 않는다 */
  name: string
  value: ColumnValue
}

const count = (name: string, unit: '개' | '번' | '잼'): ColumnLabel => ({ name, value: { kind: 'count', unit } })
const fraction = (name: string): ColumnLabel => ({ name, value: { kind: 'fraction' } })
const percent = (name: string): ColumnLabel => ({ name, value: { kind: 'percent' } })

/**
 * 동기화 구역(`jam_policy` 칸)의 칸 이름. 동기화와 캡슐이 한 값으로 쓰는 두 칸은 이름에 둘을 모두 적는다.
 * 같은 «Common 확률»이 동기화와 캡슐에 모두 있어 구역을 앞에 붙였다(둘이 같은 문장으로 읽히지 않게 한다).
 */
export const JAM_COLUMN_LABELS: Record<(typeof JAM_COLUMNS)[number], ColumnLabel> = {
  sync_item_guaranteed: count('동기화 확정 개수', '개'),
  sync_item_guaranteed_hiking: count('동기화 등산 확정 개수', '개'),
  sync_item_bonus_rolls: count('동기화 보너스 기회', '번'),
  sync_item_bonus_jam_divisor: count('동기화 보너스 확률을 나누는 값', '잼'),
  sync_item_bonus_max_probability: fraction('동기화 보너스 확률 상한'),
  sync_rarity_common: percent('동기화 Common 확률'),
  sync_rarity_rare: percent('동기화 Rare 확률'),
  sync_rarity_epic: percent('동기화 Epic 확률'),
  sync_rarity_mystic: percent('동기화 Mystic 확률'),
  common_streak_threshold: count('동기화와 캡슐의 Common 연속 보정 횟수', '번'),
  locked_roll_probability: fraction('동기화와 캡슐의 잠긴 채 나올 확률'),
}

/** 캡슐 구역(`capsule_policy` 칸)의 칸 이름 */
export const CAPSULE_COLUMN_LABELS: Record<(typeof CAPSULE_COLUMNS)[number], ColumnLabel> = {
  guaranteed_count: count('캡슐 확정 개수', '개'),
  bonus_count: count('캡슐 보너스 개수', '개'),
  bonus_probability: fraction('캡슐 보너스 확률'),
  other_tribe_probability: fraction('캡슐 다른 트라이브 확률'),
  rarity_common: percent('캡슐 Common 확률'),
  rarity_rare: percent('캡슐 Rare 확률'),
  rarity_epic: percent('캡슐 Epic 확률'),
  rarity_mystic: percent('캡슐 Mystic 확률'),
  pity_epic_threshold: count('캡슐 Epic 보정 횟수', '번'),
}

/**
 * 시스템 드랍 구역(`ambient_drop_config` 칸)의 칸 이름. 구역이 등급 비율을 화면 단위(퍼센트)로 이력에 남기므로(`lib/admin/balance/ambient.ts`) 값 종류는 `percent`다.
 * DB에는 0~1로 저장돼 있지만 이력의 `changes`는 DB 값이 아니라 화면 값이다.
 */
export const AMBIENT_COLUMN_LABELS: Record<(typeof AMBIENT_COLUMNS)[number], ColumnLabel> = {
  rarity_common: percent('시스템 드랍 Common 확률'),
  rarity_rare: percent('시스템 드랍 Rare 확률'),
  rarity_epic: percent('시스템 드랍 Epic 확률'),
  rarity_mystic: percent('시스템 드랍 Mystic 확률'),
}

interface SectionColumns {
  /** 문장에 쓰는 칸 순서 — `JAM_COLUMNS`·`CAPSULE_COLUMNS`·`AMBIENT_COLUMNS` 순서다 */
  columns: readonly string[]
  labels: Readonly<Record<string, ColumnLabel>>
}

/**
 * 구역 키 → 그 구역이 확률 안내에 반영하는 칸. 칸 이름만으로 찾지 않고 구역을 함께 본다:
 * 시스템 드랍(`ambient_drop_config`)에도 `rarity_common`이 있어, 구역 없이 칸 이름만 보면 캡슐 칸으로 잘못 읽는다(티켓 20261022_1134 3회에서 시스템 드랍 구역이 이력을 쓰기 시작했다).
 */
const SECTION_COLUMNS: Readonly<Record<string, SectionColumns>> = {
  [SYNC_SECTION_ID]: { columns: JAM_COLUMNS, labels: JAM_COLUMN_LABELS },
  [CAPSULE_SECTION_ID]: { columns: CAPSULE_COLUMNS, labels: CAPSULE_COLUMN_LABELS },
  [AMBIENT_SECTION_ID]: { columns: AMBIENT_COLUMNS, labels: AMBIENT_COLUMN_LABELS },
}

/** 표에 없는 칸만 있을 때의 문장(내부 칸 이름을 보이지 않는다) */
export const UNKNOWN_ONLY_SENTENCE = '확률 안내의 값을 바꿨어요'

/** 표에 있는 칸과 없는 칸이 함께 바뀌었을 때 끝에 붙이는 말 */
const UNKNOWN_TAIL = '그 밖의 값도'

const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
/** 종성 번호에서 ㄹ(받침 «ㄹ»은 «으로»가 아니라 «로»를 받는다) */
const FINAL_RIEUL = 8

/** 마지막 글자의 종성 번호(0은 받침 없음). 한글 음절이 아니면 null */
function finalConsonantOf(text: string): number | null {
  const code = text.charCodeAt(text.length - 1)
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return null
  return (code - HANGUL_FIRST) % 28
}

/** «을/를» — 이름 끝 글자의 받침으로 가른다 */
export function objectParticle(name: string): '을' | '를' {
  const final = finalConsonantOf(name)
  return final !== null && final !== 0 ? '을' : '를'
}

/** «로/으로» — 값 끝 글자의 받침으로 가른다. «%»는 «퍼센트»로 읽으므로 «로», ㄹ 받침도 «로»다 */
export function directionParticle(valueText: string): '로' | '으로' {
  if (valueText.endsWith('%')) return '로'
  const final = finalConsonantOf(valueText)
  return final === null || final === 0 || final === FINAL_RIEUL ? '로' : '으로'
}

function formatValue(label: ColumnLabel, n: number): string {
  switch (label.value.kind) {
    case 'count':
      return `${n}${label.value.unit}`
    case 'fraction':
      return formatFraction(n)
    case 'percent':
      return formatPercentPoints(n)
  }
}

function clauseOf(label: ColumnLabel, change: BalanceChange): string {
  const from = formatValue(label, change.from)
  const to = formatValue(label, change.to)
  return `${label.name}${objectParticle(label.name)} ${from}에서 ${to}${directionParticle(to)}`
}

/**
 * 저장 한 번의 바뀐 칸들을 문장 한 줄로 쓴다. 칸 순서는 구역의 칸 목록 순서다.
 * 표에 없는 칸(퀘스트 전 두 칸, 챕터별 채울 양 등)은 내부 이름을 보이지 않고, 전부 모르면 일반 문장, 일부만 모르면 끝에 «그 밖의 값도»를 붙인다.
 */
export function describeChanges(sectionKey: string, changes: readonly BalanceChange[]): string {
  const section = Object.hasOwn(SECTION_COLUMNS, sectionKey) ? SECTION_COLUMNS[sectionKey] : undefined
  const byField = new Map(changes.map((change) => [change.field, change]))
  const clauses: string[] = []
  const knownFields = new Set<string>()
  if (section) {
    for (const column of section.columns) {
      const change = byField.get(column)
      if (!change) continue
      knownFields.add(column)
      clauses.push(clauseOf(section.labels[column], change))
    }
  }
  if (clauses.length === 0) return UNKNOWN_ONLY_SENTENCE
  const hasUnknown = changes.some((change) => !knownFields.has(change.field))
  return `${[...clauses, ...(hasUnknown ? [UNKNOWN_TAIL] : [])].join(', ')} 바꿨어요`
}

/** `created_at`(UTC ISO)을 한국 표준시 «2026년 10월 23일»로. 읽을 수 없으면 null */
export function formatKstDate(createdAt: string): string | null {
  const time = new Date(createdAt).getTime()
  if (Number.isNaN(time)) return null
  const kst = new Date(time + KST_OFFSET_MS)
  return `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`
}

/** 이력 행 목록 → 표 한 줄씩(순서는 받은 그대로). 날짜를 읽을 수 없는 행은 로그만 남기고 건너뛴다 */
export function buildChangeLogRows(rows: readonly unknown[]): DisclosureRow[] {
  const out: DisclosureRow[] = []
  for (const row of rows) {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {}
    const date = typeof record.created_at === 'string' ? formatKstDate(record.created_at) : null
    if (date === null || typeof record.section_key !== 'string') {
      console.error('[probability-change-log] 날짜나 구역 키를 읽을 수 없는 이력 행을 건너뛴다')
      continue
    }
    out.push({ label: date, value: describeChanges(record.section_key, parseChanges(record.changes as Json)) })
  }
  return out
}

/**
 * 확률 안내에 반영된 변경 이력을 최신순으로 읽는다. 조회 오류·예외·클라이언트 생성 실패는 `{ ok: false }`이고 로그만 남긴다.
 *
 * @param client 이미 만들어 둔 Supabase 클라이언트. 생략하면 service_role 클라이언트를 새로 만든다.
 */
export async function loadProbabilityChangeLog(client?: SupabaseClient): Promise<DisclosureResult<DisclosureRow[]>> {
  let supabase: SupabaseClient
  try {
    supabase = client ?? createServiceClient()
  } catch (e) {
    console.error('[probability-change-log] 클라이언트 생성 실패:', e)
    return { ok: false }
  }
  try {
    const { data, error } = await supabase
      .from('balance_setting_changes')
      .select('section_key, changes, created_at')
      .eq('affects_disclosure', true)
      .order('created_at', { ascending: false })
    if (error) {
      console.error('[probability-change-log] 변경 이력 조회 실패:', error)
      return { ok: false }
    }
    if (!Array.isArray(data)) {
      console.error('[probability-change-log] 변경 이력 조회 결과가 목록이 아님')
      return { ok: false }
    }
    return { ok: true, data: buildChangeLogRows(data) }
  } catch (e) {
    console.error('[probability-change-log] 변경 이력 조회 예외:', e)
    return { ok: false }
  }
}
