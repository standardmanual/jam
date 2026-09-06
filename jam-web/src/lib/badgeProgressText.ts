import { formatPaceSecPerKm } from '@/types/strava'
import {
  LOWER_IS_BETTER_KEYS,
  type BadgeProgress,
  type BadgeProgressAxis,
  type RegretLineData,
} from '@/lib/badge-engine/badgeProgress'
import { RARITY_LABEL } from '@/lib/rarity'
import { REST_CONDITION_KEYS } from '@/lib/badge-engine/activityFilters'
import {
  CONDITION_FIELDS,
  getConditionField,
  type AnyConditionFieldMeta,
} from '@/lib/badge-engine/conditionRegistry'
import type { BadgeCondition, BadgeRarity } from '@/types/database'
import type { BadgeStopStatus } from '@/lib/badgeTreeConditionStatus'
import { NEAR_THRESHOLD as DS_NEAR_THRESHOLD } from '@ds/components/patterns/BadgeFamilyCardHeader'

/**
 * 「거의 다」로 넘어가는 임계값(0.8) — 티켓 20260906_2140 A.
 *
 * **정책 숫자라 색 토큰이 아니다.** CSS 변수로 두면 JS가 읽을 수 없고, 두 곳에 적으면
 * 색(램프)과 문구가 서로 다른 기준을 쓰게 된다. 단일 정의는 MODULAR
 * `BadgeFamilyCardHeader`에 있다 — 램프 색을 실제로 고르는 쪽이 거기이기 때문이다.
 * 서비스 계층은 이 이름으로 다시 내보내 「어디를 봐야 하나」를 한 군데로 모은다.
 */
export const NEAR_THRESHOLD = DS_NEAR_THRESHOLD

/**
 * ## 3b 추가분 (티켓 20260904_1425) — `pickSyncComparisonCandidate()`/`formatSyncComparisonText()`
 * `RecentSyncBanner`(DS)의 "직전 상태값과의 비교" 문구 조립. `user_family_progress`
 * (티켓 20260904_1156, 계열별 `current`/`prev` jsonb 스냅샷)를 읽어 "직전 동기화 대비
 * {무엇이 얼마나} 가까워졌다" 문장을 만든다 — 다른 포맷 함수와 동일하게 숫자는 이미 계산된
 * 스냅샷 값을 그대로 쓰고(재계산 없음), 이 파일은 문장 조립만 담당한다.
 */

/**
 * `computeBadgeProgress()`/`computeRecordRegretLine()`(순수 계산, badge-engine/badgeProgress.ts)의
 * 결과를 화면에 그릴 한국어 문자열로 바꾸는 표시 전용 레이어 — 티켓 20260904_0921(2c).
 *
 * 계산 계층은 숫자만 돌려주고(2b 원칙 — "라벨 채우기는 이 함수 안에서 하지 않는다"와 같은
 * 이유로 문장 조립도 계산 계층 밖에 둔다), 이 파일이 그 숫자를 실제 문구로 조립한다.
 * `BadgeStageRail`(DS, 프레젠테이션 전용)·`BadgeTrophyGridCard`(서비스)는 이 파일이 만든
 * 완성 문자열만 prop으로 받는다 — 두 컴포넌트 모두 kind를 직접 분기하지 않는다.
 *
 * `formatDualAxisGaugeProps()`(2d, 티켓 20260904_1058)도 같은 원칙 — `DualAxisGauge`(DS
 * 신규 패턴)에 완성 문자열/숫자만 넘기고, 그 컴포넌트는 kind를 모른다.
 */

/** "진행 표시 준비 중" — §08 H, computeBadgeProgress가 'unsupported'를 반환할 때 공통으로 쓴다. */
const UNSUPPORTED_TEXT = '진행 표시 준비 중'

// ── 조건값 표기 (티켓 20260906_1323 §7·§9) ────────────────────────────────

/**
 * 조건값 한 줄에 잇는 필드 최대 개수. 레일 눈금 캡션의 폭이 92px이라 넷을 넘기면 카드를
 * 밀어낸다 — 조건이 더 길면 「자세히」를 펼쳐 전체 설명을 본다.
 */
const MAX_CONDITION_VALUE_PARTS = 3

/**
 * 필드 하나의 조건값 문구. **`conditionRegistry`의 `chip()`을 그대로 쓴다** — 조건 어휘의
 * 단일 출처를 늘리지 않는다.
 *
 * `{값}{unit}`만 적는 방식을 쓰지 않는 이유(실측): 「완전한 하루」의 조건은
 * `{streak_days: 6, rest_after_streak: 1, repeat_count: 5}`라 단위만 붙이면
 * 「6일 · 1일 · 5회」가 되어 무엇의 숫자인지 사라진다. registry의 `chip`은 개념을 달고 있고
 * (「6일 연속」·「연속 후 휴식 1일」·「5회」) 이미 압축형이라 이 자리에 맞다.
 *
 * `condition_json`은 jsonb라 형태 보장이 없다 — `chip`이 내부를 파다 터지거나
 * `undefined`/`NaN`을 뱉으면 그 필드만 조용히 건너뛴다(`conditionRegistry.safeFormat`과 같은
 * 태도지만, 여기서는 「형태 오류」를 유저 화면에 내보내지 않고 생략한다).
 */
function conditionFieldValueText(meta: AnyConditionFieldMeta, condition: BadgeCondition): string | null {
  const value = condition[meta.key]
  if (value === undefined || value === null) return null
  if (meta.chip) {
    try {
      const text = meta.chip(condition)
      if (text && !text.includes('undefined') && !text.includes('NaN')) return text
    } catch {
      // 형태가 깨진 필드 — 아래 폴백으로 내려간다
    }
  }
  // `chip`이 없는 필드만 폴백. 숫자가 아닌 값(객체·목록)은 단위를 붙일 수 없어 생략한다.
  if (typeof value !== 'number') return null
  // `unit`이 null인 축(페이스)은 원값이 「초」라 그대로 적으면 의미가 없다.
  if (meta.key === 'max_pace_sec_per_km') return formatPaceSecPerKm(value)
  return `${value}${meta.unit ?? ''}`
}

/**
 * 「이 배지를 받으려면 무엇이 얼마나 필요한가」 한 줄 — 티켓 20260906_1323.
 *
 * **값의 출처는 `condition_json`뿐이다.** 유저 지표를 읽지 않으므로 630종 전부에 대해
 * 계산해도 추가 쿼리가 없고, 프런티어만 진행 계산하는 성능 구조를 깨지 않는다.
 * 진행값(`현재/목표`)을 만들지 않는다 — 그건 `formatFrontierProgressText`의 몫이다.
 *
 * `role === 'measurable'`인 필드만 고른다. `formatConditionChips`(registry)를 그대로 쓰지
 * 않는 이유가 이것이다 — 그 함수는 filter·meta 역할 필드까지 전부 포함해 어드민 목록용으로 길다.
 *
 * measurable이 하나도 없으면(미션 보상·수동 발급 등) `null` — 호출부가 기존 폴백
 * (레일은 `'—'`, 캡션은 「진행 표시 준비 중」)으로 떨어진다.
 */
export function formatStopConditionValue(condition: BadgeCondition | null | undefined): string | null {
  if (!condition) return null
  const parts: string[] = []
  for (const meta of CONDITION_FIELDS as readonly AnyConditionFieldMeta[]) {
    if (parts.length >= MAX_CONDITION_VALUE_PARTS) break
    if (meta.role !== 'measurable') continue
    const text = conditionFieldValueText(meta, condition)
    if (text) parts.push(text)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * 축 키별 소수점 자리 — 기존 관례를 그대로 따른다(`src/lib/missions/format.ts`의
 * "거리는 소수 1자리, 그 외는 정수" 원칙 + `badge-engine/index.ts`가 이미 `weekend_duration_hours`를
 * 소수 1자리로 표기하던 관례). `max_pace_sec_per_km`은 이 함수를 거치지 않고 별도 처리한다
 * (원값이 "초"라 그대로 보여주면 의미가 없다 — `formatPaceSecPerKm` 참고).
 */
const ONE_DECIMAL_KEYS = new Set(['distance_km', 'monthly_km', 'min_speed_kmh', 'weekend_duration_hours'])

function formatAxisNumber(key: string, value: number): string {
  if (ONE_DECIMAL_KEYS.has(key)) return value.toFixed(1)
  return String(Math.round(value))
}

/**
 * 측정값(current) 전용 반올림 — `met`은 원값 기준으로 판정되는데 표기가 반올림으로
 * 앞서가면 "이미 다 채운 것처럼" 보이면서 실제로는 미달인 경우가 생긴다(개선 리뷰 지적,
 * 티켓 20260904_0921 — 예: duration_minutes 44.6/45면 아직 미달인데 "45/45분"으로 보임).
 * higher-is-better 축은 내림, lower-is-better 축(페이스·최고기온)은 올림으로 "아직 못
 * 미친 쪽"에 붙인다 — `missions/format.ts`의 `Math.floor` 관례를 방향까지 맞춰 확장했다.
 * target은 고정 임계값이라 이 문제가 없어 그대로 `formatAxisNumber`(반올림)를 쓴다.
 */
function formatCurrentValue(key: string, current: number): string {
  const decimals = ONE_DECIMAL_KEYS.has(key) ? 1 : 0
  const factor = 10 ** decimals
  const rounded = LOWER_IS_BETTER_KEYS.has(key)
    ? Math.ceil(current * factor) / factor
    : Math.floor(current * factor) / factor
  return decimals === 1 ? rounded.toFixed(1) : String(rounded)
}

/** "{current}/{target}{unit}" — 페이스 축은 "7:45/km / 7:30/km"처럼 mm:ss 표기로 바꾼다. */
function formatAxisRange(axis: BadgeProgressAxis): string {
  if (axis.key === 'max_pace_sec_per_km') {
    return `${formatPaceSecPerKm(axis.current)} / ${formatPaceSecPerKm(axis.target)}`
  }
  const current = formatCurrentValue(axis.key, axis.current)
  const target = formatAxisNumber(axis.key, axis.target)
  return axis.unit ? `${current}/${target}${axis.unit}` : `${current}/${target}`
}

/**
 * 휴식·반복 축의 한 줄 (티켓 20260905_0031).
 *
 * ## 휴식 문구는 «중립적 상태 표기»다 (2026-09-05 스펙 소유자 확정)
 *
 * - ✅ 「휴식 2/5일」 — 상태만 표기한다
 * - ❌ 「3일 더 쉬면 획득」 — **운동을 권하는 서비스가 휴식을 재촉하는 모양**이 된다
 *
 * 그래서 이 파일의 다른 문구 패턴(「{label} 조건은 이미 채웠어요」·「{등급}까지 {N} 모자랐어요」)을
 * 휴식에 재사용하지 않는다. 다른 배지와 **같은 규칙으로 읽히되**(숫자 한 줄) 권유가 없다.
 *
 * 반복형도 같은 형태다 — 「3/5회」. 라벨을 앞에 붙이지 않는 이유는 레일 캡션이 이미 배지
 * 이름 아래에 놓이기 때문이다(누적·기록 축과 동일).
 */
function formatCounterAxisText(kind: BadgeProgress['kind'], axis: BadgeProgressAxis): string {
  const current = formatCurrentValue(axis.key, axis.current)
  const target = formatAxisNumber(axis.key, axis.target)
  const unit = axis.unit ?? ''
  // 「휴식」은 UX Writing 가이드 용어표의 고정 용어다. 휴식 조건 4종(연속 후·장거리 후·
  // 복귀 전·활동 간격) 모두 「쉰 일수」를 세므로 접두어 하나로 읽힌다.
  return kind === 'rest' ? `휴식 ${current}/${target}${unit}` : `${current}/${target}${unit}`
}

export type FrontierCaption = {
  /** 레일 프런티어 눈금의 상태 라벨(STATUS_LABEL)을 대체할 텍스트 */
  text: string
  /** 프런티어 앞 연결선 비례 채움 0~1 */
  fraction: number
  /** true면 §08 H(진행 미지원) — 앰버/라임 상태색 대신 중립색으로 그린다 */
  muted?: boolean
  /**
   * true면 텍스트가 **임시 상태 표기**(「진행 표시 준비 중」)다 — 기울임으로 그린다.
   *
   * `muted`와 갈라 둔 이유(티켓 20260906_1323 §9): 진행을 계산할 수 없을 때 그 자리에
   * **획득 조건**을 적게 되면서, 「중립색으로 그린다」와 「임시 표기라 기울인다」가 더 이상
   * 같은 조건이 아니게 됐다. 조건값은 중립색이지만 **사실 표기**라 기울이지 않는다.
   */
  pending?: boolean
}

/**
 * 레일(BadgeStageRail) 프런티어 캡션 — 단일 축 유형만 처리한다(2d 몫인 2축/다중은 null을
 * 반환해 호출부가 기존 상태 라벨을 그대로 쓰게 한다).
 *
 * 티켓 20260905_0031에서 `leveled`·`repeat`·`rest` 3종이 늘었다. 무한레벨형은 축 자체는
 * 기반 유형과 같게 계산되므로(`badgeProgress.ts` 참고) 레벨 접두어만 붙인다.
 *
 * `conditionText`(티켓 20260906_1323 §9) — 진행을 계산할 수 없을 때(`unsupported`) 그 자리에
 * 적을 **획득 조건**. 넘기지 않거나 조건도 만들 수 없으면 기존 「진행 표시 준비 중」이다.
 */
export function formatFrontierProgressText(
  progress: BadgeProgress,
  now: Date,
  conditionText?: string | null
): FrontierCaption | null {
  if (progress.kind === 'unsupported') {
    return conditionText
      ? { text: conditionText, fraction: 0, muted: true }
      : { text: UNSUPPORTED_TEXT, fraction: 0, muted: true, pending: true }
  }
  if (progress.kind === 'dual' || progress.kind === 'multi') return null

  const axis = progress.axes[0]
  if (!axis) return null

  if (progress.kind === 'periodic') {
    const periodNoun = axis.key === 'monthly_km' ? '이번 달' : '이번 주'
    const daysLeft = progress.periodEndsAt
      ? Math.max(0, Math.ceil((new Date(progress.periodEndsAt).getTime() - now.getTime()) / 86_400_000))
      : 0
    return { text: `${periodNoun} ${formatAxisRange(axis)} · ${daysLeft}일 남음`, fraction: progress.progress }
  }

  if (progress.kind === 'repeat' || progress.kind === 'rest') {
    return { text: formatCounterAxisText(progress.kind, axis), fraction: progress.progress }
  }

  if (progress.kind === 'leveled') {
    // 「레벨」은 UX Writing 가이드 용어표의 고정 용어. 레벨을 모르면(호출부가 안 넘김) 축만 쓴다.
    // 축이 여럿인 레벨형(조건이 2축형인 계열)은 그리드와 같은 규칙으로 병목 한 줄만 적는다 —
    // `DualAxisGauge`는 kind === 'dual'에만 붙기 때문이다.
    const prefix = progress.level != null ? `Lv.${progress.level} · ` : ''
    const target = progress.axes.find((a) => a.key === progress.bottleneck) ?? axis
    return { text: `${prefix}${formatAxisRange(target)}`, fraction: progress.progress }
  }

  // cumulative | record
  return { text: formatAxisRange(axis), fraction: progress.progress }
}

/** `BadgeStageRail.jsx`의 `STATUS_LABEL`/`STATUS_ARIA_LABEL`과 같은 어휘 — DS는 `@/lib`을
 * import하지 않으므로(서비스 비의존 원칙) 두 곳에 같은 문구가 각각 선언돼 있다. */
// 문구는 UX_WRITING_GUIDELINE.md 갱신분(커밋 00ead78f)을 따른다 — 「충족」은 전면 금지어다.
const GRID_CELL_STATUS_LABEL: Record<BadgeStopStatus, string> = {
  earned: '획득', ready: '조건을 다 채웠어요', locked: '잠김', 'not-reached': '—',
}
const GRID_CELL_STATUS_ARIA_LABEL: Record<BadgeStopStatus, string> = {
  earned: '획득', ready: '조건을 다 채웠어요', locked: '잠김', 'not-reached': '아직',
}

export type GridCellCaption = {
  /** BadgeProgressRingCard의 captionText로 그대로 넘긴다 */
  text: string
  /** 0~1 */
  fraction: number
  /** 진행 미지원(§08 H) — 링을 중립색으로 */
  muted: boolean
  /** text가 임시 상태 표기("진행 표시 준비 중")다 — 조건값·상태 라벨은 사실 표기라 false */
  pending: boolean
  /** aria-label 조립용 — not-reached만 화면 라벨('—')과 다르다('아직') */
  statusAriaText: string
  /**
   * true면 `text`가 상태 라벨을 넘어서는 정보(수치·조건값)를 담고 있다 — 호출부가 aria에
   * `statusAriaText`와 별도로 `text`를 이어붙일지 판단하는 데 쓴다. false(바닥 폴백)면
   * `text`가 `statusAriaText`와 사실상 같은 말이라("조건을 다 채웠어요") 이어붙이면 중복된다.
   */
  hasDetail: boolean
}

/**
 * `BadgeProgressRingCard`(그리드 셀, 눈금 1개 계열 전용) 캡션 — 티켓 20260906_1425.
 *
 * `formatFrontierProgressText`를 그대로 재사용한다 — 눈금 1개 계열도 프런티어(유일한 눈금)의
 * 진행 표시라는 점은 레일과 같다. 그 함수가 `null`을 돌려주는 두 경우(2축/다중 kind, 또는
 * `progress` 자체가 없음)만 이 함수가 추가로 받는다 — `BadgeStageRail`이 그 경우 상태
 * 라벨(`STATUS_LABEL`)로 폴백하는 것과 같은 순서: **조건값이 있으면 조건값, 없으면 상태
 * 라벨**("조건을 다 채웠어요"/"잠김"). `earned`/`not-reached`(조건값 없음)는 `formatFrontierProgressText`가
 * 이미 해결하므로(진행 앵커는 곧 프런티어 눈금이라 여기까지 오지 않거나, unsupported 분기가
 * 처리한다) 사실상 `ready`/`locked` 폴백만 실전에서 쓰인다.
 */
export function formatGridCellCaption(
  progress: BadgeProgress | undefined,
  status: BadgeStopStatus,
  conditionText: string | null
): GridCellCaption {
  const statusAriaText = GRID_CELL_STATUS_ARIA_LABEL[status]
  const frontier = progress ? formatFrontierProgressText(progress, new Date(), conditionText) : null
  if (frontier) {
    return {
      text: frontier.text,
      fraction: frontier.fraction,
      muted: !!frontier.muted,
      pending: !!frontier.pending,
      statusAriaText,
      hasDetail: true,
    }
  }
  if (status === 'not-reached' && conditionText) {
    return { text: conditionText, fraction: 0, muted: true, pending: false, statusAriaText, hasDetail: true }
  }
  return {
    text: GRID_CELL_STATUS_LABEL[status],
    fraction: 0,
    muted: true,
    pending: false,
    statusAriaText,
    hasDetail: false,
  }
}

/**
 * 트로피 그리드(BadgeTrophyGridCard) 캡션 — 전 유형을 kind-무관하게 "병목 축
 * current/target 한 줄"로 표현한다(§05 "다중 카운터는 병목만 적는다"). 레일과 달리 주기형
 * "D일 남음"·아쉬움 줄 같은 유형별 문구를 넣지 않는다 — 그리드는 계열이 없어 카드 자체가
 * 유일한 목표이므로 압축된 한 줄이면 충분하다.
 *
 * 예외는 휴식·반복 2종이다 — 「2/5일」만 적으면 무엇의 일수인지 알 수 없어 접두어를 남긴다.
 */
export function formatGridProgressLine(progress: BadgeProgress): FrontierCaption {
  if (progress.kind === 'unsupported') return { text: UNSUPPORTED_TEXT, fraction: 0, muted: true, pending: true }
  const axis = progress.axes.find((a) => a.key === progress.bottleneck) ?? progress.axes[0]
  if (progress.kind === 'repeat' || progress.kind === 'rest') {
    return { text: formatCounterAxisText(progress.kind, axis), fraction: progress.progress }
  }
  return { text: formatAxisRange(axis), fraction: progress.progress }
}

/**
 * 「N 남음」 한 줄 — 티켓 20260905_0037.
 *
 * 유저가 `178 / 210km`를 보고 32를 암산하게 두지 않는다. **재계산하지 않는다** —
 * `axis.remaining`은 계산 계층이 방향(작을수록 좋음 축)까지 흡수해 둔 값이라
 * `target - current`로 다시 구하면 페이스·한파 축에서 부호가 뒤집힌다.
 *
 * `null`을 돌려주는 세 경우:
 *  - 이미 채웠다(`met`) — 「0 남음」은 다 채운 것을 덜 채운 것처럼 보이게 한다
 *  - 남은 양을 말할 수 없다(`remaining === null`, 측정값 자체가 없음)
 *  - **휴식 축** — 「3일 남음」은 운동을 권하는 서비스가 휴식을 재촉하는 문장이 된다
 *    (티켓 20260905_0031이 확정한 「권유형 문구 금지」). 값 행은 「휴식 2/5일」로 충분하다
 */
export function formatRemainingText(kind: BadgeProgress['kind'], axis: BadgeProgressAxis): string | null {
  if (kind === 'rest') return null
  if (axis.met || axis.remaining == null || axis.remaining <= 0) return null
  if (axis.key === 'max_pace_sec_per_km') return `${Math.ceil(axis.remaining)}초 남음`
  const decimals = ONE_DECIMAL_KEYS.has(axis.key) ? 1 : 0
  const factor = 10 ** decimals
  // 남은 양은 항상 올림 — 반올림으로 0이 되면 실제로 남았는데 「0 남음」이 된다
  // (`formatRegretLineText`와 같은 원칙).
  const rounded = Math.ceil(axis.remaining * factor) / factor
  const text = decimals === 1 ? rounded.toFixed(1) : String(rounded)
  return `${text}${axis.unit ?? ''} 남음`
}

/**
 * 계열 한 줄(`BadgeLevelGauge`·`BadgeStampRow`)의 값 행 — 티켓 20260905_0037.
 *
 * 다른 포맷 함수와 같은 원칙: 숫자는 계산 계층 결과를 그대로 쓰고 이 파일은 문자열만 만든다.
 * 축이 여럿이면 **병목 축 하나만** 적는다(§05 "다중 카운터는 병목만").
 */
export type FamilyRowValues = {
  /**
   * 현재값(단위 없음 — 「/」 앞자리). 진행을 계산할 수 없는 계열은 **`null`**이다 —
   * 예전에는 「—」 글리프를 넣었는데, 아무 사실도 말하지 않으면서 레벨칩 자리를 밀어냈다
   * (티켓 20260906_2344). DS(`BadgeLevelGauge`)가 null이면 그 칸 자체를 그리지 않는다.
   */
  current: string | null
  /** 목표값 + 단위 */
  next: string
  /** 「N 남음」. 다 채웠거나 말할 수 없으면 null */
  left: string | null
  /** 0~1 */
  fraction: number
}

/**
 * `conditionText`(티켓 20260906_1323 §9) — 진행을 계산할 수 없을 때 **목표값 자리**에 적을
 * 획득 조건. 현재값은 `'—'` 그대로 둔다(진행값을 만들 수 없다는 사실은 바뀌지 않았다).
 */
export function formatFamilyRowValues(
  progress: BadgeProgress,
  conditionText?: string | null
): FamilyRowValues | null {
  if (progress.kind === 'unsupported') {
    return conditionText ? { current: null, next: conditionText, left: null, fraction: 0 } : null
  }
  const axis = progress.axes.find((a) => a.key === progress.bottleneck) ?? progress.axes[0]
  if (!axis) return null
  if (axis.key === 'max_pace_sec_per_km') {
    return {
      current: formatPaceSecPerKm(axis.current),
      next: formatPaceSecPerKm(axis.target),
      left: formatRemainingText(progress.kind, axis),
      fraction: progress.progress,
    }
  }
  const unit = axis.unit ?? ''
  return {
    current: formatCurrentValue(axis.key, axis.current),
    next: `${formatAxisNumber(axis.key, axis.target)}${unit}`,
    left: formatRemainingText(progress.kind, axis),
    fraction: progress.progress,
  }
}

/**
 * 반복형 계열 행(`BadgeStampRow`)의 보조 한 줄 — 「12/26회 · 14회 남음」.
 * 진행을 계산할 수 없으면 `conditionText`(획득 조건) → 없으면 「진행 표시 준비 중」이다
 * (티켓 20260906_1323 §9).
 */
export function formatStampCaption(progress: BadgeProgress, conditionText?: string | null): string | null {
  if (progress.kind === 'unsupported') return conditionText ?? UNSUPPORTED_TEXT
  const axis = progress.axes.find((a) => a.key === progress.bottleneck) ?? progress.axes[0]
  if (!axis) return null
  const range =
    progress.kind === 'repeat' || progress.kind === 'rest'
      ? formatCounterAxisText(progress.kind, axis)
      : formatAxisRange(axis)
  const left = formatRemainingText(progress.kind, axis)
  return left ? `${range} · ${left}` : range
}

/**
 * 계열 카드 헤더 2행(메타 줄) — 「다음 Epic · 4km」 (티켓 20260906_2140 B).
 *
 * 조각을 잇기만 한다. 조건을 해석하지 않고, 없는 조각은 그냥 뺀다 — 전부 없으면 `null`
 * 이라 헤더가 2행 자체를 만들지 않는다(빈 줄이 남아 카드 높이가 흔들리지 않게).
 */
export function formatFamilyMetaLine(
  nextRarityLabel: string | null,
  conditionText: string | null
): string | null {
  const parts = [nextRarityLabel ? `다음 ${nextRarityLabel}` : null, conditionText].filter(
    (part): part is string => part != null && part.length > 0
  )
  return parts.length > 0 ? parts.join(' · ') : null
}

export type DualAxisLine = {
  /** BadgeProgressAxis.key와 동일 네임스페이스 */
  key: string
  label: string
  /** "{current}/{target}{unit}" — formatAxisRange와 동일 규칙(페이스 축은 mm:ss) */
  rangeText: string
  /** 이 축 하나의 DS ProgressBar percent 계산용(0~1) — BadgeProgressAxis.fraction 그대로 */
  fraction: number
  met: boolean
}

export type DualAxisGaugeProps = {
  /** 항상 2개(현재 카탈로그 dual은 전부 2축) */
  axes: [DualAxisLine, DualAxisLine]
  /** "각각 다른 활동에서 채워도 돼요"/"한 번의 활동에서 동시에 채워야 해요" — sameActivity로 결정 */
  ruleText: string
  /** met:true인 축이 정확히 하나일 때만("그 축은 이미 채웠으니 남은 축에 집중하라") — 그 외(0개·2개 met)엔 null */
  bottleneckNote: string | null
}

/**
 * 레일(BadgeStageRail) 2축형(dual) 프런티어 전용 — `DualAxisGauge`(DS, 티켓 20260904_1058)에
 * 넘길 완성 props를 조립한다. 다른 포맷 함수와 동일 원칙 — `DualAxisGauge` 자체는 kind를
 * 모른 채 이 결과만 그린다. dual이 아니면 null(호출부가 kind==='dual'일 때만 부르는 것이
 * 기본 사용법이지만, 다른 포맷 함수들처럼 방어적으로도 null을 반환한다).
 */
export function formatDualAxisGaugeProps(progress: BadgeProgress): DualAxisGaugeProps | null {
  if (progress.kind !== 'dual') return null
  if (progress.axes.length !== 2) return null // 방어적 — 현재 카탈로그는 항상 2축

  const axes = progress.axes.map((axis) => ({
    key: axis.key,
    label: axis.label,
    rangeText: formatAxisRange(axis),
    fraction: axis.fraction,
    met: axis.met,
  })) as [DualAxisLine, DualAxisLine]

  const ruleText = progress.sameActivity
    ? '한 번의 활동에서 두 조건을 동시에 채워야 해요.'
    : '두 조건은 각각 다른 활동에서 채워도 돼요.'

  const metAxes = axes.filter((a) => a.met)
  // 정확히 하나만 met일 때만 "병목"이 성립한다 — 0개(아직 둘 다 남음)·2개(이미 둘 다 채움,
  // 게이트만 대기)는 지목할 대상이 없어 null(§05 "또는 사용 안 함").
  const bottleneckNote = metAxes.length === 1 ? `${metAxes[0].label} 조건은 이미 채웠어요.` : null

  return { axes, ruleText, bottleneckNote }
}

/**
 * 기록형 "아쉬움 줄" 최종 문장 — §07 "과거형으로 닫아 재촉하지 않는다"를 따르되, 활동
 * 유형마다 다른 동사("걸으면"/"뛰면"/"타면"/"오르면")를 요구하지 않는 "모자랐어요" 서술로
 * 통일했다(온도·페이스처럼 "채우다" 계열 동사가 안 맞는 축도 있어 전 축 공통 표현이 필요
 * 했다 — 활동별 동사 사전은 스펙에 없어 새로 만들지 않았다, confidence 참고).
 */
export function formatRegretLineText(regret: RegretLineData, rarity: BadgeRarity): string {
  const rarityLabel = RARITY_LABEL[rarity] ?? rarity

  if (regret.key === 'max_pace_sec_per_km') {
    // 남은 양은 항상 올림 — 반올림으로 0이 되면 실제로 남았는데 "0초 모자랐어요"가 된다
    // (개선 리뷰 지적, 티켓 20260904_0921).
    const diffSec = Math.max(0, Math.ceil(regret.current - regret.target))
    return `지난 활동 페이스는 ${formatPaceSecPerKm(regret.current)}. ${rarityLabel}까지 ${diffSec}초 모자랐어요.`
  }

  const lowerBetter = LOWER_IS_BETTER_KEYS.has(regret.key)
  const diffRaw = lowerBetter ? regret.current - regret.target : regret.target - regret.current
  const decimals = ONE_DECIMAL_KEYS.has(regret.key) ? 1 : 0
  const factor = 10 ** decimals
  // 남은 양은 항상 올림(위 페이스 분기와 같은 이유) — current 표기는 formatCurrentValue와
  // 같은 "아직 못 미친 쪽" 원칙을 공유한다.
  const diffRounded = Math.ceil(Math.max(0, diffRaw) * factor) / factor
  const diff = decimals === 1 ? diffRounded.toFixed(1) : String(diffRounded)
  const current = formatCurrentValue(regret.key, regret.current)
  const unit = regret.unit ?? ''
  // regret.label을 문장에 포함 — 없으면 단위만으로 "기록"이 뭘 가리키는지 유추해야 했다
  // (개선 리뷰 지적, 티켓 20260904_0921).
  return `지난 활동 ${regret.label} 기록은 ${current}${unit}. ${rarityLabel}까지 ${diff}${unit} 모자랐어요.`
}

// ── 3b. 직전 동기화 비교(RecentSyncBanner) — 티켓 20260904_1425 ────────────────

export type FamilyProgressAxisSnapshot = {
  /** user_family_progress.current(jsonb) — BadgeProgressAxis[] 그대로 */
  current: BadgeProgressAxis[]
  /** user_family_progress.prev(jsonb) — 최초 싱크 전이면 null */
  prev: BadgeProgressAxis[] | null
}

export type SyncComparisonCandidate = {
  axisKey: string
  prevValue: number
  currentValue: number
}

/**
 * `user_family_progress` 전 계열의 current/prev 스냅샷에서 "가장 눈에 띄는 진전"(fraction
 * 증가폭이 가장 큰 축) 하나를 고른다. "가장 최근에 갱신된 계열"(updated_at) 대신 이 기준을
 * 쓴 이유 — 한 번의 싱크가 여러 계열을 동시에 갱신하면(같은 트랜잭션의 일괄 upsert,
 * 티켓 20260904_1156 C절) updated_at만으로는 어느 쪽이 더 체감되는 진전인지 가릴 수 없다.
 * `fraction`은 축 종류(높을수록/낮을수록 좋음)와 무관하게 이미 0~1로 정규화돼 있어, 계열·축을
 * 가로질러 직접 비교할 수 있는 유일한 값이다(재계산 없이 스냅샷에 저장된 값 그대로 사용).
 *
 * fraction이 실제로 늘어난(양수) 축만 후보로 본다 — 0 이하(변화 없음, 또는 주기 리셋으로
 * 감소)는 "가까워졌다"고 말할 수 없어 제외한다. 전부 제외되면(진전 없음) null — 호출부가
 * 기존 문구("최근 활동이 동기화됐어요")로 폴백한다.
 */
export function pickSyncComparisonCandidate(rows: FamilyProgressAxisSnapshot[]): SyncComparisonCandidate | null {
  let best: SyncComparisonCandidate | null = null
  let bestFractionDelta = 0

  for (const row of rows) {
    if (!row.prev || row.prev.length === 0) continue
    const prevByKey = new Map(row.prev.map((axis) => [axis.key, axis]))
    for (const currentAxis of row.current) {
      // ⚠️ 휴식 축은 이 배너의 후보가 아니다.
      //    이 문구는 「직전 동기화보다 {라벨} {델타} 가까워졌어요」 형태라, 휴식 축이 뽑히면
      //    「복귀 전 휴식일 2일 가까워졌어요」가 되어 **서비스가 휴식을 재촉하는 모양**이 된다.
      //    티켓 20260905_0031이 확정한 「권유형 문구 금지」의 직접 위반이다(개선 리뷰 지적).
      //    진행 캡션(「휴식 2/5일」)은 중립적 상태 표기라 그대로 두고, 이 «권유형 문장»만 막는다.
      if (REST_CONDITION_KEYS.includes(currentAxis.key as (typeof REST_CONDITION_KEYS)[number])) continue
      const prevAxis = prevByKey.get(currentAxis.key)
      // 계열 정합성 트리거(마이그레이션 128, badges_family_consistency)가 같은 계열의 등급
      // 간 측정 조건 필드 조합을 항상 동일하게 강제하므로 정상 상황에선 항상 찾아야 하지만,
      // 방어적으로 스킵한다(예상 밖 데이터 형태로 화면이 죽지 않게).
      if (!prevAxis) continue
      const fractionDelta = currentAxis.fraction - prevAxis.fraction
      if (fractionDelta <= bestFractionDelta) continue
      bestFractionDelta = fractionDelta
      best = { axisKey: currentAxis.key, prevValue: prevAxis.current, currentValue: currentAxis.current }
    }
  }
  return best
}

/**
 * `pickSyncComparisonCandidate()` 결과를 "직전 동기화보다 {라벨} {델타}{단위} 가까워졌어요"
 * 문장으로 조립한다. 라벨/단위는 스냅샷에 저장된 값이 아니라 호출부가 새로 조회한 labelMap을
 * 쓴다 — 저장 시점(sync.ts의 updateFamilyProgressSnapshots)엔 빈 Map을 넘겨 라벨이 원문
 * key로만 채워져 있다(티켓 20260904_1156 의사결정, 라벨을 나중에 고쳐도 과거 스냅샷 표시가
 * 자동으로 최신화되는 부수 이점).
 *
 * 델타 표기는 `formatCurrentValue`와 같은 원칙 — 방향(높을수록/낮을수록 좋음)에 맞춰 항상
 * "아직 못 미친 쪽"으로 내림해 실제보다 부풀리지 않는다. 내림 결과가 0 이하면(표시 단위로는
 * 구분 안 되는 미세 변화) 빈 비교문("0km 가까워졌어요")을 보여주지 않도록 null을 반환한다 —
 * 호출부가 기존 문구로 폴백한다. 페이스(max_pace_sec_per_km)는 `formatRegretLineText`와
 * 동일하게 델타를 정수 초 단위로 표기한다(라벨 테이블의 unit_ko가 이 축만 NULL — mm:ss
 * 절대값과 달리 델타는 애초에 "초" 단위가 자연스러워 라벨 테이블 unit을 쓰지 않는다).
 */
export function formatSyncComparisonText(
  candidate: SyncComparisonCandidate,
  labelMap: Map<string, { label: string; unit: string | null }>
): string | null {
  const { axisKey, prevValue, currentValue } = candidate
  // 라벨 폴백은 두 단계다.
  //  1) `badge_metric_labels`(런타임 출처, 어드민이 편집한다)
  //  2) **`conditionRegistry`(선언 출처)** — 시드가 아직 없는 신규 축이 여기서 걸린다.
  //     이 단계가 없으면 `rest_after_streak` 같은 **내부 키가 유저 문장에 그대로** 나간다
  //     (`sync.ts`가 빈 labelMap으로 저장하고 표시 시점에 다시 조회하는 구조라, 이 경로만
  //      폴백을 못 받고 있었다 — 개선 리뷰 지적).
  //  3) 그래도 없으면 key 원문(최후)
  const found = labelMap.get(axisKey)
  const registryField = found ? undefined : getConditionField(axisKey)
  const label = found?.label ?? registryField?.label ?? axisKey
  const unit = found?.unit ?? registryField?.unit ?? null
  const lowerBetter = LOWER_IS_BETTER_KEYS.has(axisKey)
  const deltaRaw = lowerBetter ? prevValue - currentValue : currentValue - prevValue

  if (axisKey === 'max_pace_sec_per_km') {
    const deltaSec = Math.floor(deltaRaw)
    if (deltaSec <= 0) return null
    return `직전 동기화보다 ${label} ${deltaSec}초 가까워졌어요`
  }

  const decimals = ONE_DECIMAL_KEYS.has(axisKey) ? 1 : 0
  const factor = 10 ** decimals
  const deltaRounded = Math.floor(deltaRaw * factor) / factor
  if (deltaRounded <= 0) return null
  const deltaText = decimals === 1 ? deltaRounded.toFixed(1) : String(deltaRounded)
  const unitSuffix = unit ?? ''
  return `직전 동기화보다 ${label} ${deltaText}${unitSuffix} 가까워졌어요`
}
