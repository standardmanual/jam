/**
 * 운영툴 받은 기획함 화면 이름표와 표기 함수 (티켓 20260930_1817, 순수 함수).
 *
 * `constants.ts`는 proxy(Edge)가 불러오므로 화면 글자는 여기 둔다. 클라이언트 화면과 서버 화면이 함께 쓴다.
 * 시각은 모두 KST로 그린다(서버·브라우저의 시스템 시간대와 무관하게 같은 글자가 나온다).
 */
import { KST_OFFSET_MS } from '@/lib/notifications/kst'
import type { OpsItemStatus } from '@/lib/admin/opsInbox/constants'
import type { OpsPatternKnobKey } from '@/lib/admin/opsPatterns/constants'
import type { OpsBundleStage, OpsInboxTab, OpsStage } from '@/lib/admin/opsInbox/bundleStatus'

// ── 종류·상태·단계·탭 이름표 ───────────────────────────────────────────────────────────────────────

export const OPS_ITEM_KIND_LABELS: Record<string, string> = {
  home_feed_card: '홈피드 카드',
  mission: '미션',
  drop_schedule: '드랍 일정',
  recipe: '믹스 레시피',
  jam_badge: 'JAM! 배지',
  collection_launch: '컬렉션 런칭',
  pattern_proposal: '패턴 제안',
}

export const OPS_KIND_UNKNOWN_LABEL = '종류 확인 필요'

/** 허용값 밖이거나 비어 있으면 「종류 확인 필요」다. */
export function kindLabel(kind: string | null | undefined): string {
  if (kind && Object.prototype.hasOwnProperty.call(OPS_ITEM_KIND_LABELS, kind)) return OPS_ITEM_KIND_LABELS[kind]
  return OPS_KIND_UNKNOWN_LABEL
}

/** 항목 상태 칩 글자. 「도착」은 화면에서 「새로 도착」이다. */
export const OPS_ITEM_STATUS_LABELS: Record<OpsItemStatus, string> = {
  arrived: '새로 도착',
  reviewing: '검토중',
  approved: '승인됨',
  preparing: '준비중',
  scheduled: '예약됨',
  live: '게재중',
  ended: '종료',
  rejected: '반려',
  cancelled: '취소',
  failed: '실패',
}

/** 묶음 단계 칩 글자(S2 상태 열). 항목 상태 칩과 같은 말을 쓴다. */
export const OPS_BUNDLE_STAGE_LABELS: Record<OpsBundleStage, string> = {
  arrived: '새로 도착',
  review: '검토중',
  prepare: '준비중',
  scheduled: '예약됨',
  live: '게재중',
  ended: '종료',
  rejected: '반려',
  cancelled: '취소',
  failed: '실패',
}

/** 단계 표시줄의 6단계 글자. */
export const OPS_STAGE_BAR_LABELS: Record<OpsStage, string> = {
  arrived: '도착',
  review: '검토',
  prepare: '준비',
  scheduled: '예약',
  live: '게재',
  ended: '종료',
}

export const OPS_INBOX_TAB_LABELS: Record<OpsInboxTab, string> = {
  all: '전체',
  decide: '결정할 것',
  progress: '진행 중',
  closed: '끝남·멈춤',
}

// ── 형식 오류 문장 ───────────────────────────────────────────────────────────────────────────────

/** 「경로: 사유」 문장을 첫 「: 」에서 자른다. 「: 」가 없으면 경로는 빈 값이고 문장 전체가 사유다. */
export function splitFormatError(message: string): { path: string; reason: string } {
  const at = message.indexOf(': ')
  if (at < 0) return { path: '', reason: message }
  return { path: message.slice(0, at), reason: message.slice(at + 2) }
}

const FORMAT_ERROR_PATH_LABELS: Record<string, string> = {
  starts_at: '공개 시각',
  ends_at: '종료 시각',
  item_key: '항목 키',
  kind: '종류',
  pattern_no: '패턴 번호',
  links: '연결',
  user_experience: '유저가 겪는 것',
  world_review: '세계관 검수',
  world_related: '세계관 관련 여부',
  winter_reviewed: '윈터 검수 여부',
  reason: '검수 이유',
  week: '주차',
  hypothesis: '가설',
  routine_run: '루틴 실행 기록',
  color_rationale_link: '색 근거 링크',
  segment: '대상',
  copy: '문안',
  colors: '색',
  items: '항목 목록',
  shape: '카드 모양',
  exposure_tags: '노출 대상',
  tribe_id: '트라이브',
  color_pending: '색 대기',
  excluded_items: '뺀 항목',
  place_category: '장소 카테고리',
}

// 뺀 항목(`excluded_items[n].<키>`)의 원소 칸. `reason`·`kind`·`item_key`는 다른 곳에서 쓰는 이름표(검수 이유·종류·항목 키)와 헷갈리지
// 않게 「뺀 항목」을 붙인다.
const EXCLUDED_ITEM_FIELD_LABELS: Record<string, string> = {
  reason: '뺀 항목 사유',
  item_key: '뺀 항목 키',
  kind: '뺀 항목 종류',
  stage: '뺀 단계',
}
const EXCLUDED_ITEM_PATH = /^excluded_items\[\d+\]\.([^.[\]]+)$/

// 패턴 제안의 내용 칸(`resource.pattern…`). 항목의 `user_experience`(「유저가 겪는 것」)·`kind` 같은 이름과 마지막 키가 겹치므로 「제안 패턴」을
// 앞에 붙여 따로 부른다. 칸 이름은 패턴 원고(`OPS_PATTERNS.md`)의 용어를 따른다.
const PATTERN_PROPOSAL_PATH = /^resource\.pattern(?:\.(.+))?$/
const PATTERN_PROPOSAL_LABEL = '제안 패턴'
const PATTERN_PROPOSAL_FIELD_LABELS: Record<string, string> = {
  name: '이름',
  principle: '작동 원리',
  user_experience: '유저가 겪는 것',
  menus: '쓰는 메뉴',
  samples: '샘플',
  'samples.no': '샘플 번호',
  'samples.name': '샘플 이름',
  'samples.role': '샘플 역할',
  'samples.impl': '샘플 구현',
  card_shapes: '카드 모양',
  'card_shapes.shape': '카드 모양',
  'card_shapes.note': '카드 모양 설명',
  knobs: '손잡이',
  pitfalls: '주의점',
}

/** 손잡이 5종의 이름. 「제안 패턴 손잡이(장소) …」 이름표와 `validate.ts`의 오류 문장이 함께 쓴다. */
export const OPS_PATTERN_KNOB_LABELS: Record<OpsPatternKnobKey, string> = {
  condition: '조건',
  place: '장소',
  time: '시간',
  reward: '보상',
  tribe: '트라이브',
}

/** 손잡이 안쪽 칸의 이름: 조건·장소·시간·보상은 연 값·닫은 값, 트라이브는 규칙·예시. */
export const OPS_PATTERN_KNOB_VALUE_LABELS: Record<string, string> = {
  open: '연 값',
  closed: '닫은 값',
  rule: '규칙',
  example: '예시',
}

const PATTERN_PROPOSAL_KNOB_PATH = /^knobs\.([^.]+)(?:\.([^.]+))?$/

/** `resource.pattern` 아래 경로(`samples[2].role`·`knobs.place.closed`)를 「제안 패턴 …」 이름표로 바꾼다. 모르는 경로는 그대로 붙인다. */
function patternProposalLabel(sub: string | undefined): string {
  if (!sub) return PATTERN_PROPOSAL_LABEL
  const normalized = sub.replace(/\[\d+\]/g, '')
  const has = (table: Record<string, string>, key: string) => Object.prototype.hasOwnProperty.call(table, key)
  if (has(PATTERN_PROPOSAL_FIELD_LABELS, normalized)) return `${PATTERN_PROPOSAL_LABEL} ${PATTERN_PROPOSAL_FIELD_LABELS[normalized]}`
  const knob = PATTERN_PROPOSAL_KNOB_PATH.exec(normalized)
  if (knob && has(OPS_PATTERN_KNOB_LABELS, knob[1])) {
    const knobLabel = OPS_PATTERN_KNOB_LABELS[knob[1] as OpsPatternKnobKey]
    if (!knob[2]) return `${PATTERN_PROPOSAL_LABEL} 손잡이(${knobLabel})`
    // 트라이브는 「손잡이」 없이 「트라이브 규칙·예시」로 부른다(원고의 「손잡이: …」 아래 항목 이름).
    if (has(OPS_PATTERN_KNOB_VALUE_LABELS, knob[2])) {
      const valueLabel = OPS_PATTERN_KNOB_VALUE_LABELS[knob[2]]
      return knob[1] === 'tribe'
        ? `${PATTERN_PROPOSAL_LABEL} ${knobLabel} ${valueLabel}`
        : `${PATTERN_PROPOSAL_LABEL} 손잡이(${knobLabel}) ${valueLabel}`
    }
  }
  return `${PATTERN_PROPOSAL_LABEL} ${sub}`
}

const ITEM_PATH_PREFIX = /^items\[(\d+)\]\.?/

/**
 * 오류 경로를 사람이 읽는 이름표로 바꾼다. `items[n].` 앞부분은 떼고(몇 번째 항목인지는 `itemPosition`에 담는다)
 * 마지막 키를 이름표로 바꾼다. 모르는 경로는 그대로 둔다.
 * 항목 전체에 걸린 오류(`items[3]`)는 이름표가 「항목」이다.
 */
export function parseFormatErrorPath(path: string): { itemPosition: number | null; label: string } {
  let itemPosition: number | null = null
  let rest = path
  const match = ITEM_PATH_PREFIX.exec(path)
  if (match) {
    itemPosition = Number(match[1])
    rest = path.slice(match[0].length)
    if (rest === '') return { itemPosition, label: '항목' }
  }
  const excluded = EXCLUDED_ITEM_PATH.exec(rest)
  if (excluded && Object.prototype.hasOwnProperty.call(EXCLUDED_ITEM_FIELD_LABELS, excluded[1])) {
    return { itemPosition, label: EXCLUDED_ITEM_FIELD_LABELS[excluded[1]] }
  }
  const proposal = PATTERN_PROPOSAL_PATH.exec(rest)
  if (proposal) return { itemPosition, label: patternProposalLabel(proposal[1]) }
  const lastKey = rest.split('.').pop()?.replace(/\[\d+\]$/, '') ?? ''
  if (lastKey && Object.prototype.hasOwnProperty.call(FORMAT_ERROR_PATH_LABELS, lastKey)) {
    return { itemPosition, label: FORMAT_ERROR_PATH_LABELS[lastKey] }
  }
  return { itemPosition, label: rest }
}

export function formatErrorPathLabel(path: string): string {
  return parseFormatErrorPath(path).label
}

// ── 주차 ─────────────────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/

/** ISO 주차의 첫 주 월요일(UTC 자정 epoch). 그 해 1월 4일이 든 주가 1주차다. */
function isoWeek1Monday(year: number): number {
  const jan4 = Date.UTC(year, 0, 4)
  const dayFromMonday = (new Date(jan4).getUTCDay() + 6) % 7
  return jan4 - dayFromMonday * DAY_MS
}

/** 그 해의 ISO 주차 수(52 또는 53). 12월 28일은 언제나 마지막 주차에 든다. */
function isoWeeksInYear(year: number): number {
  return Math.floor((Date.UTC(year, 11, 28) - isoWeek1Monday(year)) / (7 * DAY_MS)) + 1
}

/**
 * `YYYY-Www`를 ISO 주차로 풀어 월~일 범위를 돌려준다(2026-W41 → `{ label: '41주차', range: '10/5~10/11' }`).
 * 형식이 틀리거나 그 해에 없는 주차(예: 2025-W53)면 null이다 — 화면은 「주차 없음」으로 그린다.
 */
export function formatWeekRange(week: string | null | undefined): { label: string; range: string } | null {
  if (!week) return null
  const match = WEEK_PATTERN.exec(week)
  if (!match) return null
  const year = Number(match[1])
  const weekNo = Number(match[2])
  if (weekNo < 1 || weekNo > isoWeeksInYear(year)) return null
  const monday = isoWeek1Monday(year) + (weekNo - 1) * 7 * DAY_MS
  const sunday = monday + 6 * DAY_MS
  const md = (epoch: number) => `${new Date(epoch).getUTCMonth() + 1}/${new Date(epoch).getUTCDate()}`
  return { label: `${weekNo}주차`, range: `${md(monday)}~${md(sunday)}` }
}

/**
 * `YYYY-Www`의 월요일 날짜(`YYYY-MM-DD`). 홈피드 미리보기가 공개일을 모를 때 그 주부터 보여주려고 쓴다(티켓 20261026_2025 2회차).
 * 형식이 틀리거나 그 해에 없는 주차면 null이다.
 */
export function weekMondayDate(week: string | null | undefined): string | null {
  if (!week) return null
  const match = WEEK_PATTERN.exec(week)
  if (!match) return null
  const year = Number(match[1])
  const weekNo = Number(match[2])
  if (weekNo < 1 || weekNo > isoWeeksInYear(year)) return null
  return new Date(isoWeek1Monday(year) + (weekNo - 1) * 7 * DAY_MS).toISOString().slice(0, 10)
}

// ── KST 시각 표기 ────────────────────────────────────────────────────────────────────────────────

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: string
}

/** ISO 문자열을 KST 필드로 푼다. 읽을 수 없는 값이면 null이다. */
function kstParts(iso: string | null | undefined): KstParts | null {
  if (!iso) return null
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  const kst = new Date(time + KST_OFFSET_MS)
  return {
    year: kst.getUTCFullYear(),
    month: kst.getUTCMonth() + 1,
    day: kst.getUTCDate(),
    hour: kst.getUTCHours(),
    minute: kst.getUTCMinutes(),
    weekday: WEEKDAYS[kst.getUTCDay()],
  }
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** KST 날짜 키 `YYYY-MM-DD`(날짜별 묶음의 기준). 읽을 수 없으면 null. */
export function kstDateKey(iso: string | null | undefined): string | null {
  const p = kstParts(iso)
  return p ? `${p.year}-${pad2(p.month)}-${pad2(p.day)}` : null
}

/** 「10/6(월)」 */
export function formatKstDay(iso: string | null | undefined): string | null {
  const p = kstParts(iso)
  return p ? `${p.month}/${p.day}(${p.weekday})` : null
}

/** 「09:00」 */
export function formatKstClock(iso: string | null | undefined): string | null {
  const p = kstParts(iso)
  return p ? `${pad2(p.hour)}:${pad2(p.minute)}` : null
}

/** 「10/1(수) 09:12」 */
export function formatKstDayTime(iso: string | null | undefined): string | null {
  const p = kstParts(iso)
  return p ? `${p.month}/${p.day}(${p.weekday}) ${pad2(p.hour)}:${pad2(p.minute)}` : null
}

// ── 직접 수정 이름표 (티켓 20260930_1818) ─────────────────────────────────────────────────────────

const EDIT_PATH_LABELS: Record<string, string> = {
  starts_at: '공개 시각',
  ends_at: '종료 시각',
  segment: '대상',
  user_experience: '유저가 겪는 것',
  color_pending: '색 대기',
  'image_spec.bg': '이미지 시작색',
  'image_spec.end': '이미지 끝색',
}

/** 고친 칸의 이름표. `copy.body` → 「문안 · body」, `colors.background` → 「색 · background」. 모르는 경로는 그대로 둔다. */
export function editPathLabel(path: string): string {
  if (Object.prototype.hasOwnProperty.call(EDIT_PATH_LABELS, path)) return EDIT_PATH_LABELS[path]
  if (path.startsWith('copy.')) return `문안 · ${path.slice('copy.'.length)}`
  if (path.startsWith('colors.')) return `색 · ${path.slice('colors.'.length)}`
  return path
}

/** 수정 전후 차이에 보일 값. 비어 있으면 「(없음)」, 시각은 KST 「10/5(월) 09:00」다. */
export function formatDiffValue(path: string, value: string | null): string {
  if (value === null || value === '') return '(없음)'
  if (path === 'starts_at' || path === 'ends_at') return formatKstDayTime(value) ?? value
  return value
}
