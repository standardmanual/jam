/**
 * 알림(소식) 문구 렌더러 — 티켓 20260824_021
 * 스펙: Specs/PRD/Notification/PRD.md §3(26종 표) · §5(강조 규칙)
 *
 * ## 규칙 하나로 26종을 일관되게
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
 * 2. **`payload.count`를 믿지 않는다.** #1·#3·#4는 `badge_ids`가 append로 누적되는데
 *    `count`는 얕은 병합이라 "이번 이벤트분"만 남는다 — 개수는 **항상 배열 길이**로 센다.
 * 3. **#44의 `reason`은 코드다.** 반드시 `userFacingReasonLabel()`을 경유한다
 *    (어드민 원장 라벨과 분리된 유저 노출용 매핑 — PRD §3 ⑧).
 * 4. **조사는 볼드가 아니다.** `{을/를}` 마커를 바로 앞 슬롯 값의 받침으로 치환한다.
 *
 * 클라이언트 컴포넌트가 직접 import하므로 서버 전용 모듈(`./index`)에 의존하지 않는다.
 */
import type { NotificationType } from '@/types/database'
import { d, t } from '@/lib/i18n'
import { RARITY_LABEL } from '@/lib/rarity'
import { userFacingReasonLabel } from '@/lib/points/reasons'

// ─────────────────────────────────────────────────────────────────────────────
// 뷰 모델 — 서버(feed.ts)가 조인·재평가를 마친 뒤 넘기는 형태
// ─────────────────────────────────────────────────────────────────────────────

/** 렌더 시점에 조인해 읽는 유저 정보 (payload에 박제하지 않는다) */
export interface NotificationActor {
  id: string
  username: string | null
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
// 토크나이저 — 이 함수 하나가 26종의 강조를 결정한다
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

/** 배열 payload 필드. 개수 렌더의 유일한 근거다(`payload.count`는 병합 후 신뢰할 수 없다) */
export function idList(payload: Record<string, unknown>, key: string): string[] {
  const v = payload[key]
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string' && x !== '')
}

function nameOf(actor: NotificationActor | null): string {
  return actor?.username ?? d.profile.anonymous
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

// ─────────────────────────────────────────────────────────────────────────────
// 26종 문구 — PRD §3 표가 이 함수의 명세다
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationMessage {
  template: string
  vars: Record<string, string>
}

export function buildNotificationMessage(view: NotificationView): NotificationMessage {
  const p = view.payload
  const n = d.notifications

  switch (view.type) {
    // ── ① 보상 획득 ────────────────────────────────────────────────────────
    case 'badge_earned': {
      const count = idList(p, 'badge_ids').length
      return {
        template: n.msgBadgeEarned,
        vars: { badgeCount: t(n.slotBadgeCount, { count }) },
      }
    }
    case 'rare_badge_earned': {
      // 등급 라벨도 payload(rarity)에서 오는 값이므로 §5 "슬롯=볼드" 규칙대로 슬롯으로 넘긴다.
      // 템플릿에 합쳐 고정 텍스트로 두면 26종 중 이 2종만 규칙의 예외가 된다(20260825 정정).
      return {
        template: n.msgRareBadgeEarned,
        vars: {
          rarity: RARITY_LABEL[str(p, 'rarity')] ?? '',
          badgeName: str(p, 'badge_name'),
        },
      }
    }
    case 'item_badge_earned': {
      const count = idList(p, 'inventory_item_ids').length
      return {
        template: n.msgItemBadgeEarned,
        vars: { itemCount: t(n.slotItemBadgeCount, { count }) },
      }
    }
    case 'poi_badge_earned': {
      const names = [...new Set(idList(p, 'poi_names'))]
      const single = str(p, 'poi_name') || names[0] || ''
      const poiName =
        names.length > 1
          ? t(n.slotPlaceMore, { name: names[0], count: names.length - 1 })
          : single
      return { template: n.msgPoiBadgeEarned, vars: { poiName } }
    }
    case 'points_earned':
      return { template: n.msgPointsEarned, vars: { points: points(num(p, 'amount')) } }
    case 'first_badge':
      return { template: n.msgFirstBadge, vars: { firstBadge: n.slotFirstBadge } }

    // ── ② 컬렉션 ──────────────────────────────────────────────────────────
    case 'collection_slottable':
      return {
        template: n.msgCollectionSlottable,
        vars: {
          bookName: str(p, 'book_name'),
          count: t(n.slotCount, { count: num(p, 'count') }),
        },
      }
    case 'collection_near_complete':
      return { template: n.msgCollectionNearComplete, vars: { bookName: str(p, 'book_name') } }
    case 'collection_completable':
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
      return {
        template: n.msgDropPickedUpMany,
        vars: {
          me: nameOf(view.me),
          itemCount: t(n.slotItemBadgeCount, { count: badgeCount }),
        },
      }
    }
    case 'drop_spot_active':
      return {
        template: n.msgDropSpotActive,
        vars: {
          me: nameOf(view.me),
          visitors: t(n.slotPeopleCount, { count: num(p, 'visitor_count') }),
        },
      }

    // ── ④ 미션 ────────────────────────────────────────────────────────────
    case 'mission_milestone': {
      const current = num(p, 'current')
      const target = num(p, 'target')
      // milestone 키가 없으면 current/target 비율에서 파생한다 — 없다고 그냥 50% 문구로
      // 떨어뜨리면 80% 소식이 "절반을 넘었어요"로 나가는 조용한 실패가 된다.
      const milestone = num(p, 'milestone') || (target > 0 ? (current / target) * 100 : 0)
      const template = milestone >= 80 ? n.msgMissionMilestone80 : n.msgMissionMilestone50
      return { template, vars: { missionTitle: str(p, 'mission_title') } }
    }
    case 'mission_deadline':
      return {
        template: n.msgMissionDeadline,
        vars: {
          missionTitle: str(p, 'mission_title'),
          days: dayWord(num(p, 'days')),
          remaining: `${num(p, 'remaining')}${str(p, 'unit')}`,
        },
      }
    case 'mission_completed': {
      const badgeCount = num(p, 'reward_badge_count')
      const rewardPoints = num(p, 'reward_points')
      const vars: Record<string, string> = { missionTitle: str(p, 'mission_title') }
      if (badgeCount > 0) vars.badgeCount = t(n.slotCount, { count: badgeCount })
      if (rewardPoints > 0) vars.points = points(rewardPoints)
      const template =
        badgeCount > 0 && rewardPoints > 0 ? n.msgMissionCompleted
        : badgeCount > 0 ? n.msgMissionCompletedBadgeOnly
        : rewardPoints > 0 ? n.msgMissionCompletedPointsOnly
        : n.msgMissionCompletedNoReward
      return { template, vars }
    }
    case 'mission_rank_up':
      return {
        template: n.msgMissionRankUp,
        vars: {
          missionTitle: str(p, 'mission_title'),
          rank: t(n.slotRank, { rank: num(p, 'rank') }),
        },
      }
    case 'mission_ended':
      return { template: n.msgMissionEnded, vars: { missionTitle: str(p, 'mission_title') } }

    // ── ⑤ 소셜 — 나에게 ───────────────────────────────────────────────────
    case 'followed': {
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      const me = nameOf(view.me)
      if (count <= 1) {
        return { template: n.msgFollowedOne, vars: { actor: nameOf(view.actor), me } }
      }
      if (count === 2 && view.actor2) {
        return {
          template: n.msgFollowedTwo,
          vars: { actor: nameOf(view.actor), actor2: nameOf(view.actor2), me },
        }
      }
      return {
        template: n.msgFollowedMany,
        vars: {
          actor: nameOf(view.actor),
          others: t(n.slotPeopleCount, { count: count - 1 }),
          me,
        },
      }
    }
    case 'mutual_follow':
      return { template: n.msgMutualFollow, vars: { actor: nameOf(view.actor) } }

    // ── ⑥ 소셜 — 팔로우한 사람의 활동 ──────────────────────────────────────
    case 'following_rare_badge': {
      return {
        template: `${n.msgFollowingActorPrefix}${n.msgRareBadgeEarned}`,
        vars: {
          actor: nameOf(view.actor),
          rarity: RARITY_LABEL[str(p, 'rarity')] ?? '',
          badgeName: str(p, 'badge_name'),
        },
      }
    }
    case 'following_collection_complete':
      return {
        template: n.msgFollowingCollectionComplete,
        vars: { actor: nameOf(view.actor), bookName: str(p, 'book_name') },
      }
    case 'following_mission_complete': {
      const count = Math.max(view.actorCount, idList(p, 'actor_ids').length, 1)
      const missionTitle = str(p, 'mission_title')
      if (count <= 1) {
        return {
          template: n.msgFollowingMissionCompleteOne,
          vars: { actor: nameOf(view.actor), missionTitle },
        }
      }
      return {
        template: n.msgFollowingMissionCompleteMany,
        vars: {
          actor: nameOf(view.actor),
          others: t(n.slotPeopleCount, { count: count - 1 }),
          missionTitle,
        },
      }
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
