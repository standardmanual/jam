/**
 * 알림(소식) 문구 렌더러 — 티켓 20260824_021
 * 스펙: Specs/PRD/Notification/PRD.md §3(20종 표) · §5(강조 규칙)
 *
 * ## 규칙 하나로 20종을 일관되게
 *
 * > **`payload`로 채워지는 변수 슬롯은 볼드, 고정 텍스트는 일반. 컬러 강조는 쓰지 않는다.**
 *
 * 소식 종류마다 강조 지점을 따로 정의하지 않는다. 이 파일은 type+payload에서
 * **템플릿 문자열 + 슬롯 값**만 만들고, 볼드 처리는 `tokenizeMessage()` 하나가 맡는다.
 * 새 소식을 추가할 때도 문구만 쓰면 강조가 따라온다.
 *
 * ## 이 파일이 지키는 4가지
 *
 * 1. **닉네임은 `payload`에 없다.** 호출부가 `actor_user_id`·`user_id`로 조인해
 *    `NotificationView.actor`·`me`에 실어준다(유저가 닉네임을 바꾸면 과거 소식도 따라온다).
 * 2. **`payload`의 개수 필드를 믿지 않는다.** 배열 필드는 append로 누적되는데 스칼라는
 *    얕은 병합이라 "이번 이벤트분"만 남는다 — 개수는 **항상 배열 길이**로 센다.
 * 3. **#44의 `reason`은 코드다.** 반드시 `userFacingReasonLabel()`을 경유한다
 *    (어드민 원장 라벨과 분리된 유저 노출용 매핑 — PRD §3 ⑧).
 * 4. **조사는 볼드가 아니다.** `{을/를}` 마커를 바로 앞 슬롯 값의 받침으로 치환한다.
 *
 * 클라이언트 컴포넌트가 직접 import하므로 서버 전용 모듈(`./index`)에 의존하지 않는다.
 */
import type { BadgeRarity, NotificationType } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { getDisplayName } from '@/lib/utils'
import { RARITY_LABEL } from '@/lib/rarity'
import { userFacingReasonLabel } from '@/lib/points/reasons'
import { unknownNotificationType } from './types'
import type { RecapActivityBadge, RecapCheckinBadge, RecapItemBadge } from './types'

// ─────────────────────────────────────────────────────────────────────────────
// 뷰 모델 — 서버(feed.ts)가 조인·재평가를 마친 뒤 넘기는 형태
// ─────────────────────────────────────────────────────────────────────────────

/** 렌더 시점에 조인해 읽는 유저 정보 (payload에 박제하지 않는다) */
export interface NotificationActor {
  id: string
  username: string | null
  /** 표시 이름(20260830_0113). 없으면 username으로 폴백해서 렌더한다 — nameOf() 참고.
   *  옵셔널인 이유: 이 타입을 리터럴로 만드는 기존 테스트들이 이 필드를 몰라도 되게 하기 위함. */
  displayName?: string | null
  avatarUrl: string | null
}

export interface NotificationView {
  id: string
  type: NotificationType
  payload: Record<string, unknown>
  /** 묶음 고유 인원 — `payload.actor_ids`의 중복 제거 후 개수와 일치한다 */
  actorCount: number
  /** 아바타 탭 대상 (대표 행위자). 없으면 null */
  actor: NotificationActor | null
  /** 2명까지 이름을 나열하는 소식(#26)에서 두 번째 행위자 */
  actor2: NotificationActor | null
  /** 받는 사람(본인) */
  me: NotificationActor
  /** 정렬·구분선 기준. created_at이 아니다 */
  updatedAt: string
  /**
   * ⑧ 경고 스타일 적용 여부. **저장값이 아니라 렌더 시점에 현재 상태를 조회해 판정한 결과**다
   * (PRD §6-2 — "인벤토리 비웠는데 아직 경고가 떠 있는" 상태를 막는다).
   */
  warning: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 조사 — 볼드가 아니다(변수가 아니라 문법이다)
// ─────────────────────────────────────────────────────────────────────────────

/** 지원하는 조사 마커. `{을/를}` 형태로 템플릿에 쓴다 */
const JOSA_MARKERS: Record<string, [withBatchim: string, withoutBatchim: string]> = {
  '을/를': ['을', '를'],
  '이/가': ['이', '가'],
  '은/는': ['은', '는'],
  '와/과': ['과', '와'],
  '으로/로': ['으로', '로'],
}

/** 숫자 음독의 받침 여부 — 0 영·1 일·3 삼·6 육·7 칠·8 팔만 받침이 있다 */
const DIGIT_HAS_BATCHIM: Record<string, boolean> = {
  '0': true, '1': true, '2': false, '3': true, '4': false,
  '5': false, '6': true, '7': true, '8': true, '9': false,
}

/**
 * 조사 판정에 쓸 마지막 "의미 있는" 글자.
 *
 * `'잃어버린 시간'을`처럼 슬롯 값이 따옴표·괄호로 감싸여 있으면 바로 앞 글자가 `'`라
 * 받침을 읽을 수 없다. 닫는 기호와 공백을 건너뛰고 실제 글자를 찾는다.
 */
function lastMeaningfulChar(text: string): string | null {
  for (let i = text.length - 1; i >= 0; i -= 1) {
    const ch = text[i]
    if (/[\s'"”’)\]}»〉》」』]/.test(ch)) continue
    return ch
  }
  return null
}

/**
 * 받침 유무 판정.
 *
 * 한글 음절과 숫자만 실제로 판정하고, 그 외(영문·기호)는 **받침 없음**으로 본다.
 * PRD §3의 `'한강 100km'가`가 이 규칙과 일치한다.
 */
export function hasBatchim(text: string): boolean {
  const ch = lastMeaningfulChar(text)
  if (!ch) return false
  if (ch >= '0' && ch <= '9') return DIGIT_HAS_BATCHIM[ch]
  const code = ch.charCodeAt(0)
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0
  return false
}

// ─────────────────────────────────────────────────────────────────────────────
// 토크나이저 — 이 함수 하나가 20종의 강조를 결정한다
// ─────────────────────────────────────────────────────────────────────────────

export interface MessageToken {
  text: string
  /** payload 슬롯이면 true → 볼드 */
  bold: boolean
}

/**
 * 템플릿의 `{슬롯}`을 값으로 치환하면서 **슬롯만 볼드로 표시**한다.
 * `{을/를}` 같은 조사 마커는 바로 앞까지 만들어진 텍스트의 받침으로 결정하며 볼드가 아니다.
 */
export function tokenizeMessage(template: string, vars: Record<string, string>): MessageToken[] {
  const tokens: MessageToken[] = []
  let plain = ''
  const parts = template.split(/(\{[^}]+\})/g)

  for (const part of parts) {
    if (part === '') continue
    const match = /^\{([^}]+)\}$/.exec(part)
    if (!match) {
      tokens.push({ text: part, bold: false })
      plain += part
      continue
    }
    const key = match[1]
    const josa = JOSA_MARKERS[key]
    if (josa) {
      const picked = hasBatchim(plain) ? josa[0] : josa[1]
      tokens.push({ text: picked, bold: false })
      plain += picked
      continue
    }
    // 값이 비어 있으면 슬롯을 통째로 버린다 — 유저에게 `{badgeName}`을 보이지 않는다
    const value = vars[key] ?? ''
    if (value === '') continue
    tokens.push({ text: value, bold: true })
    plain += value
  }

  return tokens
}

// ─────────────────────────────────────────────────────────────────────────────
// payload 접근 헬퍼 — payload는 JSONB라 어떤 값이든 들어올 수 있다
// ─────────────────────────────────────────────────────────────────────────────

function str(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  return typeof v === 'string' ? v : ''
}

function num(payload: Record<string, unknown>, key: string): number {
  const v = payload[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  return 0
}

/**
 * boolean payload 필드. `defaultValue`는 해당 키가 아예 없는 payload(결산 조각의
 * `checkin_badges[].first` 생략 등)를 위한 기본값이다.
 */
function boolField(payload: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const v = payload[key]
  return typeof v === 'boolean' ? v : defaultValue
}

/** 배열 payload 필드. 개수 렌더의 유일한 근거다(`payload.count`는 병합 후 신뢰할 수 없다) */
export function idList(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x !== '')
}

function nameOf(actor: NotificationActor | null): string {
  return (actor && getDisplayName({ username: actor.username, display_name: actor.displayName })) || d.profile.anonymous
}

function points(amount: number): string {
  return t(d.notifications.slotPoints, { amount: Math.abs(amount).toLocaleString('ko-KR') })
}

/** 1~3일은 하루·이틀·사흘 (가이드 §3 "사용자가 바로 체감하는 단위") */
function dayWord(days: number): string {
  if (days === 1) return d.notifications.slotDay1
  if (days === 2) return d.notifications.slotDay2
  if (days === 3) return d.notifications.slotDay3
  return t(d.notifications.slotDayN, { days })
}

/** R11 묶음 행인가 — 대상 2건 이상이라 한 행으로 접힌 소식 */
function isGrouped(payload: Record<string, unknown>): boolean {
  return num(payload, 'target_count') >= 2
}

/** 묶음 대상 수 슬롯 (「미션 2개」의 "2개") */
function targetCount(payload: Record<string, unknown>): string {
  return t(d.notifications.slotCount, { count: num(payload, 'target_count') })
}

// ─────────────────────────────────────────────────────────────────────────────
// ① 활동 결산 — RECAP_CASEBOOK A~F가 이 구획의 명세다 (20260827_014)
// ─────────────────────────────────────────────────────────────────────────────

/** 대표 선정용 희귀도 서열 (R8 — 첫 획득 순서가 아니다) */
const RARITY_RANK: Record<BadgeRarity, number> = { common: 0, rare: 1, epic: 2, mystic: 3 }

function rarityRank(rarity: string): number {
  return RARITY_RANK[rarity as BadgeRarity] ?? 0
}

/** payload의 객체 배열 필드 — JSONB라 무엇이든 들어올 수 있다 */
function objList(payload: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = payload[key]
  if (!Array.isArray(v)) return []
  return v.filter(
    (x): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
  )
}

function asRarity(value: string): BadgeRarity {
  return value === 'rare' || value === 'epic' || value === 'mystic' ? value : 'common'
}

/** 결산 payload를 문구·착지 판정이 쓰는 형태로 편다. 중복은 여기서 한 번만 제거한다 */
export interface RecapContent {
  /** 이 결산에 들어간 활동 수. 2건 이상이면 F2로 한 단계 올라간다 */
  activityCount: number
  activityBadges: RecapActivityBadge[]
  checkins: RecapCheckinBadge[]
  items: RecapItemBadge[]
  /** epic·mystic 중 최상위 활동배지 (E1·A3의 헤드라인) */
  rare: RecapActivityBadge | null
  firstBadgeId: string
  points: number
  /** 배지 총량 — 체크인·아이템도 모두 배지라 총량이 성립한다(R5) */
  totalBadges: number
  /** 배지 종류 수(활동·체크인·아이템). 2 이상이면 총량으로 말한다 */
  kinds: number
}

export function recapContent(payload: Record<string, unknown>): RecapContent {
  const activityIds = new Set(
    (Array.isArray(payload.activity_ids) ? payload.activity_ids : []).map((v) => String(v))
  )

  const seenActivity = new Set<string>()
  const activityBadges: RecapActivityBadge[] = []
  for (const raw of objList(payload, 'activity_badges')) {
    const id = str(raw, 'id')
    if (!id || seenActivity.has(id)) continue
    seenActivity.add(id)
    activityBadges.push({ id, name: str(raw, 'name'), rarity: asRarity(str(raw, 'rarity')) })
  }

  const seenCheckin = new Set<string>()
  const checkins: RecapCheckinBadge[] = []
  for (const raw of objList(payload, 'checkin_badges')) {
    const badgeId = str(raw, 'badge_id')
    if (!badgeId) continue
    // 같은 배지를 하루에 두 번 찍으면 visit이 달라 별개 항목이지만, **배지 개수는 하나**다.
    if (seenCheckin.has(badgeId)) continue
    seenCheckin.add(badgeId)
    checkins.push({
      badge_id: badgeId,
      poi_name: str(raw, 'poi_name'),
      first: boolField(raw, 'first', true),
      visit: num(raw, 'visit'),
    })
  }

  const seenItem = new Set<string>()
  const items: RecapItemBadge[] = []
  for (const raw of objList(payload, 'item_badges')) {
    const invId = str(raw, 'inventory_item_id')
    if (!invId || seenItem.has(invId)) continue
    seenItem.add(invId)
    items.push({
      inventory_item_id: invId,
      badge_id: str(raw, 'badge_id'),
      name: str(raw, 'name'),
      rarity: asRarity(str(raw, 'rarity')),
    })
  }

  // 희귀 헤드라인은 **활동배지**에서만 고른다 — 아이템 배지는 착지가 도감이 아니라
  // 인벤토리 인스턴스라(A6) 등급 문구로 승격하면 갈 곳이 어긋난다.
  let rare: RecapActivityBadge | null = null
  for (const b of activityBadges) {
    if (rarityRank(b.rarity) < RARITY_RANK.epic) continue
    if (!rare || rarityRank(b.rarity) > rarityRank(rare.rarity)) rare = b
  }

  const totalBadges = activityBadges.length + checkins.length + items.length
  const kinds =
    (activityBadges.length > 0 ? 1 : 0) + (checkins.length > 0 ? 1 : 0) + (items.length > 0 ? 1 : 0)

  return {
    activityCount: activityIds.size,
    activityBadges,
    checkins,
    items,
    rare,
    firstBadgeId: str(payload, 'first_badge_id'),
    points: num(payload, 'points'),
    totalBadges,
    kinds,
  }
}

/** 희귀도 최상위 대표 (R8). 동순위는 먼저 들어온 것 */
function topByRarity<T extends { rarity: BadgeRarity }>(list: T[]): T | null {
  let best: T | null = null
  for (const item of list) {
    if (!best || rarityRank(item.rarity) > rarityRank(best.rarity)) best = item
  }
  return best
}

/** 체크인 대표 — 최초 획득 쪽을 우선한다(F3, 20260826_001). 희귀도 축이 없다 */
function topCheckin(list: RecapCheckinBadge[]): RecapCheckinBadge | null {
  return list.find((c) => c.first) ?? list[0] ?? null
}

/**
 * ⑥ 사람 단위 묶음 꼬리 (R15) — 「… 소식이 N건 더 있어요」.
 * 대표 문장은 그대로 두고 꼬리만 붙인다(문형 9개를 두 배로 만들지 않는다).
 */
function withFollowingMore(
  payload: Record<string, unknown>,
  message: NotificationMessage
): NotificationMessage {
  const more = num(payload, 'more_count')
  if (more < 1) return message
  return {
    template: message.template + d.notifications.msgFollowingMoreSuffix,
    vars: { ...message.vars, moreCount: t(d.notifications.slotNewsCount, { count: more }) },
  }
}

/**
 * 결산 문구 — 사다리 A·B(구체) / C·D(총량) / E(승격) / F2(활동 묶음).
 *
 * 우선순위가 곧 사다리다.
 *   1. 첫 배지 — 평생 1회라 무엇과 섞이든 헤드라인을 가져간다 (A8·E3)
 *   2. 활동 2건 이상 — 종류·개수와 무관하게 F2로 올라간다 (R11)
 *   3. 희귀 배지 — 강한 신호가 헤드라인 (A3·E1)
 *   4. 1종 — 개체를 이름으로(A) / 대표 + 외 N(B)
 *   5. 2종 이상 — 총량 (C·D)
 * 포인트는 종류로 세지 않고 문장 꼬리로만 붙는다.
 */
function buildRecapMessage(payload: Record<string, unknown>): NotificationMessage {
  const n = d.notifications
  const c = recapContent(payload)
  const vars: Record<string, string> = {}
  const pointsSlot = c.points > 0 ? points(c.points) : ''

  // ── 1. 첫 배지 (A8·E3) ──────────────────────────────────────────────────
  if (c.firstBadgeId) {
    return {
      template: c.totalBadges > 1 ? n.msgRecapFirstBadgeMore : n.msgRecapFirstBadge,
      vars: { firstBadge: n.slotFirstBadge },
    }
  }

  // 보상이 하나도 없으면 문장을 만들 수 없다(F1은 애초에 소식을 만들지 않는다).
  // 활동 밖 적립만 있는 결산은 포인트만 말한다.
  if (c.totalBadges === 0) {
    if (c.points <= 0) return { template: n.unknown, vars: {} }
    return { template: n.recapHeadPointsOnly + n.recapTail, vars: { points: pointsSlot } }
  }

  const tail = pointsSlot ? n.recapTailPoints : n.recapTail
  if (pointsSlot) vars.points = pointsSlot

  // ── 2. 활동 2건 이상 (F2) ───────────────────────────────────────────────
  if (c.activityCount >= 2) {
    vars.activityCount = t(n.slotActivityCount, { count: c.activityCount })
    vars.badgeCount = t(n.slotBadgeCount, { count: c.totalBadges })
    return { template: n.recapHeadActivities + tail, vars }
  }

  // ── 3. 희귀 배지 승격 (A3·E1) ───────────────────────────────────────────
  if (c.rare) {
    vars.rarity = RARITY_LABEL[c.rare.rarity] ?? ''
    vars.badgeName = c.rare.name
    if (c.totalBadges === 1) return { template: n.recapHeadRareOne + tail, vars }
    vars.badgeCount = t(n.slotBadgeCount, { count: c.totalBadges - 1 })
    return { template: n.recapHeadRareMany + tail, vars }
  }

  // ── 4. 한 종류 (A·B) ────────────────────────────────────────────────────
  if (c.kinds === 1) {
    if (c.activityBadges.length > 0) {
      const rep = topByRarity(c.activityBadges)
      vars.badgeName = rep?.name ?? ''
      if (c.activityBadges.length === 1) return { template: n.recapHeadActivityOne + tail, vars }
      vars.badgeCount = t(n.slotBadgeCount, { count: c.activityBadges.length - 1 })
      return { template: n.recapHeadActivityMany + tail, vars }
    }

    if (c.items.length > 0) {
      const rep = topByRarity(c.items)
      vars.itemName = rep?.name ?? ''
      if (c.items.length === 1) return { template: n.recapHeadItemOne + tail, vars }
      vars.itemCount = t(n.slotItemBadgeCount, { count: c.items.length - 1 })
      return { template: n.recapHeadItemMany + tail, vars }
    }

    const rep = topCheckin(c.checkins)
    const single = rep?.poi_name ?? ''
    // A5 — 반복 획득 1건뿐이면 서술어가 다르다("~에 3번째 체크인 했어요").
    // 포인트가 섞이면 그 문형에 꼬리를 붙일 수 없어 획득 문형으로 되돌린다
    // (반복 체크인은 새 배지를 발급하지 않아 실제로는 포인트가 붙지 않는다).
    if (c.checkins.length === 1 && rep && !rep.first && rep.visit > 1 && !pointsSlot) {
      return {
        template: n.msgRecapCheckinRepeated,
        vars: { poiName: single, visitCount: String(rep.visit) },
      }
    }
    const names = [...new Set(c.checkins.map((x) => x.poi_name).filter(Boolean))]
    vars.poiName =
      names.length > 1 ? t(n.slotPlaceMore, { name: single, count: names.length - 1 }) : single
    return { template: n.recapHeadCheckin + tail, vars }
  }

  // ── 5. 두 종류 이상 — 총량 (C·D) ────────────────────────────────────────
  vars.badgeCount = t(n.slotBadgeCount, { count: c.totalBadges })
  // 배지만 있고 개수가 많으면(3개+) 숫자만으로는 뭘 받았는지 몰라 보러 가게 한다(C1).
  // 포인트가 섞이면 정보가 둘이라 서술로 충분하다(C3·D1).
  if (!pointsSlot && c.totalBadges >= 3) {
    return { template: n.recapHeadTotalConfirm + n.recapTailConfirm, vars }
  }
  return { template: n.recapHeadTotal + tail, vars }
}

// ─────────────────────────────────────────────────────────────────────────────
// 20종 문구 — PRD §3 표가 이 함수의 명세다
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationMessage {
  template: string
  vars: Record<string, string>
}

export function buildNotificationMessage(view: NotificationView): NotificationMessage {
  const p = view.payload
  const n = d.notifications

  switch (view.type) {
    // ── ① 활동 결산 (20260827_014) ─────────────────────────────────────────
    case 'activity_recap':
      return buildRecapMessage(p)

    // ── ② 컬렉션 ──────────────────────────────────────────────────────────
    case 'collection_slottable':
      // R11 묶음은 컬렉션이 아니라 **배지를 센다** — count가 전체 합계다
      if (isGrouped(p)) {
        return {
          template: n.msgCollectionSlottableGrouped,
          vars: { itemCount: t(n.slotItemBadgeCount, { count: num(p, 'count') }) },
        }
      }
      return {
        template: n.msgCollectionSlottable,
        vars: {
          bookName: str(p, 'book_name'),
          count: t(n.slotCount, { count: num(p, 'count') }),
        },
      }
    case 'collection_near_complete':
      if (isGrouped(p)) {
        return { template: n.msgCollectionNearCompleteGrouped, vars: { count: targetCount(p) } }
      }
      // R12 — 부족한 것을 이름으로 부른다. badge_name이 없는 과거 payload는 슬롯이
      // 통째로 버려져 문장이 깨지므로, 그때만 완성 문구(#11 형태)로 물러난다.
      return {
        template: str(p, 'badge_name')
          ? n.msgCollectionNearComplete
          : n.msgCollectionNearCompleteGrouped,
        vars: str(p, 'badge_name')
          ? { badgeName: str(p, 'badge_name'), bookName: str(p, 'book_name') }
          : { count: t(n.slotCount, { count: 1 }) },
      }
    case 'collection_completable':
      if (isGrouped(p)) {
        return { template: n.msgCollectionCompletableGrouped, vars: { count: targetCount(p) } }
      }
      return { template: n.msgCollectionCompletable, vars: { bookName: str(p, 'book_name') } }

    // ── ③ 내가 드랍한 아이템 배지 ──────────────────────────────────────────
    case 'drop_picked_up': {
      const badgeCount = idList(p, 'badge_ids').length
      if (badgeCount <= 1) {
        return {
          template: n.msgDropPickedUpOne,
          vars: { actor: nameOf(view.actor), badgeName: str(p, 'badge_name') },
        }
      }
      // R14 — 본인 닉네임을 부르지 않는다
      return {
        template: n.msgDropPickedUpMany,
        vars: { itemCount: t(n.slotItemBadgeCount, { count: badgeCount }) },
      }
    }
    case 'drop_spot_active': {
      const visitors = t(n.slotPeopleCount, { count: num(p, 'visitor_count') })
      if (isGrouped(p)) {
        return {
          template: n.msgDropSpotActiveGrouped,
          vars: { placeCount: t(n.slotPlaceCount, { count: num(p, 'target_count') }), visitors },
        }
      }
      return { template: n.msgDropSpotActive, vars: { visitors } }
    }

    // ── ④ 미션 ────────────────────────────────────────────────────────────
    case 'mission_milestone': {
      if (isGrouped(p)) {
        return { template: n.msgMissionMilestoneGrouped, vars: { count: targetCount(p) } }
      }
      const current = num(p, 'current')
      const target = num(p, 'target')
      // milestone 키가 없으면 current/target 비율에서 파생한다 — 없다고 그냥 50% 문구로
      // 떨어뜨리면 80% 소식이 "절반을 넘었어요"로 나가는 조용한 실패가 된다.
      const milestone = num(p, 'milestone') || (target > 0 ? (current / target) * 100 : 0)
      const template = milestone >= 80 ? n.msgMissionMilestone80 : n.msgMissionMilestone50
      return { template, vars: { missionTitle: str(p, 'mission_title') } }
    }
    case 'mission_deadline': {
      const days = dayWord(num(p, 'days'))
      // R11의 대가 — 묶으면 잔여량(12km·3일·2곳)이 사라진다. 단위가 달라 합칠 수도 없다
      if (isGrouped(p)) {
        return { template: n.msgMissionDeadlineGrouped, vars: { count: targetCount(p), days } }
      }
      return {
        template: n.msgMissionDeadline,
        vars: {
          missionTitle: str(p, 'mission_title'),
          days,
          remaining: `${num(p, 'remaining')}${str(p, 'unit')}`,
        },
      }
    }
    case 'mission_completed': {
      // R4 — 미션 소식은 「완료했다」만 말한다. 보상은 착지한 미션 상세에서 확인한다
      const missionTitle = str(p, 'mission_title')
      if (isGrouped(p)) {
        return {
          template: n.msgMissionCompletedGrouped,
          vars: {
            missionTitle,
            count: t(n.slotCount, { count: Math.max(num(p, 'target_count') - 1, 1) }),
          },
        }
      }
      return { template: n.msgMissionCompleted, vars: { missionTitle } }
    }
    case 'mission_rank_up':
      if (isGrouped(p)) {
        return { template: n.msgMissionRankUpGrouped, vars: { count: targetCount(p) } }
      }
      return {
        template: n.msgMissionRankUp,
        vars: {
          missionTitle: str(p, 'mission_title'),
          rank: t(n.slotRank, { rank: num(p, 'rank') }),
        },
      }
    case 'mission_ended':
      // 완료자만 축하한다. 묶음은 하나라도 미완료면 축하를 뺀다
      if (isGrouped(p)) {
        return {
          template: boolField(p, 'all_completed', false)
            ? n.msgMissionEndedDoneGrouped
            : n.msgMissionEndedGrouped,
          vars: { count: targetCount(p) },
        }
      }
      return {
        template: boolField(p, 'completed', false) ? n.msgMissionEndedDone : n.msgMissionEnded,
        vars: { missionTitle: str(p, 'mission_title') },
      }

    // ── ⑤ 소셜 — 나에게 ───────────────────────────────────────────────────
    case 'followed': {
      // R14 — 내 알림함이라 대상은 나로 확정돼 있다. 본인 닉네임을 부르지 않는다
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      if (count <= 1) {
        return { template: n.msgFollowedOne, vars: { actor: nameOf(view.actor) } }
      }
      if (count === 2 && view.actor2) {
        return {
          template: n.msgFollowedTwo,
          vars: { actor: nameOf(view.actor), actor2: nameOf(view.actor2) },
        }
      }
      return {
        template: n.msgFollowedMany,
        vars: {
          actor: nameOf(view.actor),
          others: t(n.slotPeopleCount, { count: count - 1 }),
        },
      }
    }

    // ── ⑥ 소셜 — 팔로우한 사람의 활동 ──────────────────────────────────────
    // R15 — 한 사람의 소식이 하루 2건 이상이면 대표 하나 + "소식이 N건 더 있어요"
    case 'following_rare_badge': {
      // 등급 라벨도 payload(rarity)에서 오는 값이므로 §5 "슬롯=볼드" 규칙대로 슬롯으로 넘긴다.
      // 템플릿에 합쳐 고정 텍스트로 두면 이 종만 규칙의 예외가 된다(20260825 정정).
      // `msgRareBadgeEarned`는 원래 ① 레거시 #2의 문구였고, 20260827_016에서 레거시 경로가
      // 사라진 뒤에는 **이 분기 전용**이다.
      return withFollowingMore(p, {
        template: `${n.msgFollowingActorPrefix}${n.msgRareBadgeEarned}`,
        vars: {
          actor: nameOf(view.actor),
          rarity: RARITY_LABEL[str(p, 'rarity') as BadgeRarity] ?? '',
          badgeName: str(p, 'badge_name'),
        },
      })
    }
    case 'following_collection_complete':
      return withFollowingMore(p, {
        template: n.msgFollowingCollectionComplete,
        vars: { actor: nameOf(view.actor), bookName: str(p, 'book_name') },
      })
    case 'following_mission_complete': {
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      const missionTitle = str(p, 'mission_title')
      if (count <= 1) {
        return withFollowingMore(p, {
          template: n.msgFollowingMissionCompleteOne,
          vars: { actor: nameOf(view.actor), missionTitle },
        })
      }
      return withFollowingMore(p, {
        template: n.msgFollowingMissionCompleteMany,
        vars: {
          actor: nameOf(view.actor),
          others: t(n.slotPeopleCount, { count: count - 1 }),
          missionTitle,
        },
      })
    }

    // ── ⑧ 계정·시스템 ─────────────────────────────────────────────────────
    case 'strava_disconnected':
      return { template: n.msgStravaDisconnected, vars: {} }
    case 'sync_stalled':
      return {
        template: n.msgSyncStalled,
        vars: { days: t(n.slotDaysOrdinal, { days: num(p, 'days') }) },
      }
    case 'inventory_full':
      return {
        template: n.msgInventoryFull,
        vars: { maxSlots: t(n.slotCount, { count: num(p, 'max_slots') }) },
      }
    case 'admin_points_changed': {
      const deduct = str(p, 'direction') === 'deduct'
      // reason은 **분류 코드**다 — 코드가 그대로 노출되면 가이드 위반이라 반드시 라벨을 경유한다.
      // 단 어드민 원장 라벨(`adminReasonLabel`)은 「지급」·「회수」를 담고 있어 유저 화면에
      // 쓸 수 없다(UX 가이드 §1-3). 유저 노출용 매핑을 쓰고, 보여줄 사유가 없으면
      // ('other'·미등록 코드·null) 괄호 자체를 뺀 템플릿을 쓴다 — PRD §3 ⑧.
      const reason = userFacingReasonLabel(str(p, 'reason') || null)
      const template = deduct
        ? (reason ? n.msgPointsOut : n.msgPointsOutNoReason)
        : (reason ? n.msgPointsIn : n.msgPointsInNoReason)
      const vars: Record<string, string> = { points: points(num(p, 'amount')) }
      if (reason) vars.reason = reason
      return { template, vars }
    }
    case 'announcement': {
      // 공지 제목은 어드민이 쓴 완성 문장이라 "고정 템플릿 안의 슬롯"이 아니다.
      // 슬롯으로 두면 한 줄 전체가 볼드가 되어 강조 규칙이 오히려 무의미해진다.
      const title = str(p, 'title')
      return { template: title || n.unknown, vars: {} }
    }
    default:
      // 20종 전수에 case가 있어 여기서 view.type은 never다. 종류를 추가하고 이 파일을
      // 빠뜨리면 아래 호출이 컴파일 에러가 난다(20260827_021).
      unknownNotificationType(view.type)
      return { template: n.unknown, vars: {} }
  }
}

/** 문구를 토큰 배열로 — 화면(NotificationText)이 이 결과만 그린다 */
export function notificationTokens(view: NotificationView): MessageToken[] {
  const { template, vars } = buildNotificationMessage(view)
  return tokenizeMessage(template, vars)
}

/** 스크린리더·aria-label용 평문 */
export function notificationPlainText(view: NotificationView): string {
  return notificationTokens(view)
    .map((tk) => tk.text)
    .join('')
}

/**
 * 값이 비어 **버려진** 슬롯 키 목록 (20260824_021 2차).
 *
 * `tokenizeMessage()`가 빈 슬롯을 통째로 버리는 건 유저에게 `{badgeName}`을 보이지
 * 않기 위한 안전장치지만, 그대로 두면 025 배치가 다른 키 이름으로 payload를 채웠을 때
 * `''에 넣을 수 있는 아이템 배지가 3개 있어요`처럼 **빈 따옴표만 남은 문장**이 나가고
 * 아무도 모른다. 서버 경로(`hydrateNotifications`)가 이 결과를 로그로 남긴다 —
 * 이 프로젝트의 원칙은 "삼키되 로그는 남긴다"다.
 *
 * 조사 마커는 슬롯이 아니므로 제외한다.
 */
export function missingMessageSlots(view: NotificationView): string[] {
  const { template, vars } = buildNotificationMessage(view)
  const keys = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])
  return keys.filter((key) => !JOSA_MARKERS[key] && (vars[key] ?? '') === '')
}
