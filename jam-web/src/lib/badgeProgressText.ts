import { formatPaceSecPerKm } from '@/types/strava'
import {
  LOWER_IS_BETTER_KEYS,
  type BadgeProgress,
  type BadgeProgressAxis,
  type RegretLineData,
} from '@/lib/badge-engine/badgeProgress'
import type { BadgeRarity } from '@/types/database'

/**
 * `computeBadgeProgress()`/`computeRecordRegretLine()`(순수 계산, badge-engine/badgeProgress.ts)의
 * 결과를 화면에 그릴 한국어 문자열로 바꾸는 표시 전용 레이어 — 티켓 20260904_0921(2c).
 *
 * 계산 계층은 숫자만 돌려주고(2b 원칙 — "라벨 채우기는 이 함수 안에서 하지 않는다"와 같은
 * 이유로 문장 조립도 계산 계층 밖에 둔다), 이 파일이 그 숫자를 실제 문구로 조립한다.
 * `BadgeStageRail`(DS, 프레젠테이션 전용)·`BadgeTrophyGridCard`(서비스)는 이 파일이 만든
 * 완성 문자열만 prop으로 받는다 — 두 컴포넌트 모두 kind를 직접 분기하지 않는다.
 */

const RARITY_LABEL: Record<BadgeRarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', mystic: 'Mystic' }

/** "진행 표시 준비 중" — §08 H, computeBadgeProgress가 'unsupported'를 반환할 때 공통으로 쓴다. */
const UNSUPPORTED_TEXT = '진행 표시 준비 중'

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

/** "{current}/{target}{unit}" — 페이스 축은 "7:45/km / 7:30/km"처럼 mm:ss 표기로 바꾼다. */
function formatAxisRange(axis: BadgeProgressAxis): string {
  if (axis.key === 'max_pace_sec_per_km') {
    return `${formatPaceSecPerKm(axis.current)} / ${formatPaceSecPerKm(axis.target)}`
  }
  const current = formatAxisNumber(axis.key, axis.current)
  const target = formatAxisNumber(axis.key, axis.target)
  return axis.unit ? `${current}/${target}${axis.unit}` : `${current}/${target}`
}

export type FrontierCaption = {
  /** 레일 프런티어 눈금의 상태 라벨(STATUS_LABEL)을 대체할 텍스트 */
  text: string
  /** 프런티어 앞 연결선 비례 채움 0~1 */
  fraction: number
  /** true면 §08 H(진행 미지원) — 앰버/라임 상태색 대신 중립색으로 그린다 */
  muted?: boolean
}

/**
 * 레일(BadgeStageRail) 프런티어 캡션 — 누적/기록/주기 3종만 처리한다(2d 몫인 2축/다중은
 * null을 반환해 호출부가 기존 상태 라벨을 그대로 쓰게 한다).
 */
export function formatFrontierProgressText(progress: BadgeProgress, now: Date): FrontierCaption | null {
  if (progress.kind === 'unsupported') return { text: UNSUPPORTED_TEXT, fraction: 0, muted: true }
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

  // cumulative | record
  return { text: formatAxisRange(axis), fraction: progress.progress }
}

/**
 * 트로피 그리드(BadgeTrophyGridCard) 캡션 — 다섯 유형 전부를 kind-무관하게 "병목 축
 * current/target 한 줄"로 표현한다(§05 "다중 카운터는 병목만 적는다"). 레일과 달리 주기형
 * "D일 남음"·아쉬움 줄 같은 유형별 문구를 넣지 않는다 — 그리드는 계열이 없어 카드 자체가
 * 유일한 목표이므로 압축된 한 줄이면 충분하다.
 */
export function formatGridProgressLine(progress: BadgeProgress): FrontierCaption {
  if (progress.kind === 'unsupported') return { text: UNSUPPORTED_TEXT, fraction: 0, muted: true }
  const axis = progress.axes.find((a) => a.key === progress.bottleneck) ?? progress.axes[0]
  return { text: formatAxisRange(axis), fraction: progress.progress }
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
    const diffSec = Math.max(0, Math.round(regret.current - regret.target))
    return `지난 활동 페이스는 ${formatPaceSecPerKm(regret.current)}. ${rarityLabel}까지 ${diffSec}초 모자랐어요.`
  }

  const lowerBetter = LOWER_IS_BETTER_KEYS.has(regret.key)
  const diffRaw = lowerBetter ? regret.current - regret.target : regret.target - regret.current
  const diff = formatAxisNumber(regret.key, Math.max(0, diffRaw))
  const current = formatAxisNumber(regret.key, regret.current)
  const unit = regret.unit ?? ''
  return `지난 활동 기록은 ${current}${unit}. ${rarityLabel}까지 ${diff}${unit} 모자랐어요.`
}
