/**
 * 액티비티 배지 이미지 생성기 — 저작 파라미터 정의·정규화 (티켓 20260902_1613)
 *
 * `badges.image_gen_params`(마이그레이션 126)에 저장/복원되는 값의 **단일 정의**다.
 * DOM·React에 의존하지 않는 순수 모듈이라 어드민 클라이언트(저작 화면)와 서버 라우트(저장 시
 * 검증)가 같은 코드를 쓴다 — 저장 형태가 두 곳에서 갈라지지 않게 하기 위함.
 *
 * 실제 캔버스 합성은 DOM이 필요해 `composeActivityBadgeImage.ts`에 따로 둔다.
 */
import {
  BLOB_ANIMATION_TYPE,
  BLOB_STILL_T,
  DEFAULT_BLOB_ANIMATION,
  parseBlobAnimation,
  type BlobAnimationParams,
} from '@/lib/blobAnimation'
import { getBadgeBlobPreset, hasBadgeBlobPreset } from '@/lib/badgeBlobPresets'
import type { BadgeRarity } from '@/types/database'

/** 현재 저장 포맷 버전. 형태가 바뀌면 올리고, 과거 값은 `parse`에서 마이그레이션한다. */
export const ACTIVITY_BADGE_IMAGE_PARAMS_VERSION = 1

/**
 * 피그마 원본 캔버스 크기(node 8:33). 모든 치수 상수는 이 좌표계에서 정의하고, 출력 해상도는
 * 배율 하나(`OUTPUT_SIZE / DESIGN_SIZE`)로만 환산한다 — 고정 px을 흩어 두면 해상도를 바꿀 때
 * 모양이 달라진다(티켓의 "라운드 변경 반영" 항목).
 */
export const DESIGN_SIZE = 540

/**
 * 굽는 PNG의 한 변(px). 피그마 원본이 540이고 서비스 Hero 카드가 화면폭 기준 ~360 CSS px이라
 * 고밀도 화면에서도 선명하도록 2배로 잡는다.
 */
export const OUTPUT_SIZE = 1080

/** 업로드 상한(바이트). 서버·클라이언트가 같은 값으로 판단한다. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/**
 * jsonb에 담길 문자열 상한. 저작 도구 입력이 그대로 DB로 들어가므로 무한정 길어지지 않게
 * 막아 둔다(운영자가 실수로 대용량 텍스트를 붙여넣는 경우 방어).
 */
export const MAX_NAME_LENGTH = 200
export const MAX_CONDITION_LENGTH = 500

const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

/**
 * 블롭 배경 파라미터 + **정지 위상**.
 *
 * `phase`는 `drawBlobFrame(ctx, w, h, params, t)`의 `t`, 즉 경과 시간이 아니라 애니메이션
 * 위상(rad)이다(20260902_0629). 운영자가 일시정지한 그 시점의 누적 위상을 그대로 저장해야
 * 재편집으로 다시 열었을 때 같은 프레임이 복원된다.
 */
export interface ActivityBadgeBackgroundParams extends BlobAnimationParams {
  phase: number
}

export interface ActivityBadgeImageParams {
  version: number
  rarity: BadgeRarity
  /** 이미지에 그릴 배지 이름. 여러 줄(개행 포함) 가능 — 운영자 수동 입력값이다. */
  name: string
  /** 이미지에 그릴 설명(피그마의 `condition`). 여러 줄 가능. */
  condition: string
  background: ActivityBadgeBackgroundParams
}

/**
 * `BLOB_STILL_T`를 초기 위상으로 쓴다 — 운영자가 재생·일시정지하기 전 첫 화면이 접근성
 * (`prefers-reduced-motion`) 모드의 서비스 화면과 같은 구도가 되도록 하기 위함.
 */
export const DEFAULT_ACTIVITY_BADGE_BACKGROUND: ActivityBadgeBackgroundParams = {
  ...DEFAULT_BLOB_ANIMATION,
  phase: BLOB_STILL_T,
}

function normalizeRarity(value: unknown, fallback: BadgeRarity): BadgeRarity {
  return typeof value === 'string' && (RARITIES as string[]).includes(value)
    ? (value as BadgeRarity)
    : fallback
}

function normalizeText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // 개행은 살린다(여러 줄 입력이 사양). \r\n만 \n으로 통일해 캔버스 줄바꿈 계산과 일치시킨다.
  return value.replace(/\r\n/g, '\n').slice(0, max)
}

function normalizePhase(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ACTIVITY_BADGE_BACKGROUND.phase
  // 위상은 상한이 없다(블롭 6개의 궤도 주파수가 서로 무리수 배라 하나의 주기로 접을 수 없다).
  // 음수만 막고 실수 그대로 보존한다.
  return Math.max(0, value)
}

/**
 * DB/요청 본문의 임의 값을 저장·렌더링 가능한 파라미터로 정규화한다.
 *
 * 관용적으로 동작한다 — 개별 필드가 깨져 있으면 기본값으로 메우고, 객체가 아니거나 블롭
 * 파라미터를 해석할 수 없을 때만 `null`을 돌려준다(= 재편집할 값이 없음).
 */
export function parseActivityBadgeImageParams(value: unknown): ActivityBadgeImageParams | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>

  const blob = parseBlobAnimation(raw.background)
  if (!blob) return null

  const rawBackground = raw.background as Record<string, unknown>
  return {
    version: ACTIVITY_BADGE_IMAGE_PARAMS_VERSION,
    rarity: normalizeRarity(raw.rarity, 'common'),
    name: normalizeText(raw.name, MAX_NAME_LENGTH),
    condition: normalizeText(raw.condition, MAX_CONDITION_LENGTH),
    background: { ...blob, phase: normalizePhase(rawBackground.phase) },
  }
}

/**
 * 아직 저작한 적 없는 배지의 초기 저작값 (티켓 20260905_0032 C-1)
 *
 * **무한레벨형(`rarity IS NULL`)에는 등급 기반 프리셋을 쓰지 않는다.** 블롭 색상 프리셋은
 * «활동 종목 × 등급» 조합표(`badgeBlobPresets.ts`)라 등급이 없는 배지에는 성립하지 않는다 —
 * 임의의 등급을 끼워 넣으면 그 배지의 등급인 것처럼 색이 정해진다. 그래서 레벨형은 기본
 * 배경으로 두고 운영자가 색상 톤을 직접 고르게 한다.
 *
 * `rarity`를 `common`으로 채우는 것은 «등급 칩을 그리지 않는다»는 뜻이다
 * (`composeActivityBadgeImage`가 common일 때 칩을 건너뛴다). 레벨형에 등급 칩을 그릴 방법은
 * 아직 없다 — 화면도 레벨형이면 등급 Select 대신 「Lv.N」을 읽기 전용으로 보여준다.
 */
export function buildInitialActivityBadgeImageParams(badge: {
  name: string
  description: string
  rarity: BadgeRarity | null
  activityTypes: string[]
}): ActivityBadgeImageParams {
  const activityType = badge.activityTypes[0]
  const presetColors =
    activityType && badge.rarity && hasBadgeBlobPreset(activityType)
      ? getBadgeBlobPreset(activityType, badge.rarity)
      : null

  return {
    version: ACTIVITY_BADGE_IMAGE_PARAMS_VERSION,
    rarity: badge.rarity ?? 'common',
    name: badge.name,
    condition: badge.description,
    background: presetColors
      ? { ...DEFAULT_ACTIVITY_BADGE_BACKGROUND, colors: presetColors }
      : DEFAULT_ACTIVITY_BADGE_BACKGROUND,
  }
}

/** 저장용 평문 객체. `parse`를 통과한 값만 넘긴다(라우트에서 검증한 뒤 호출). */
export function serializeActivityBadgeImageParams(params: ActivityBadgeImageParams) {
  return {
    version: ACTIVITY_BADGE_IMAGE_PARAMS_VERSION,
    rarity: params.rarity,
    name: params.name,
    condition: params.condition,
    background: {
      type: BLOB_ANIMATION_TYPE,
      colors: params.background.colors,
      bgColor: params.background.bgColor,
      speed: params.background.speed,
      seed: params.background.seed,
      blur: params.background.blur,
      scale: params.background.scale,
      phase: params.background.phase,
    },
  }
}
