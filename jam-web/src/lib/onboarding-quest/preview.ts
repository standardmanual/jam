/**
 * 관리자 전용 퀘스트 미리보기 쿠키 장치 (티켓 20260928_1335, 상위 20260927_2123 N5a)
 *
 * 관리자가 기능 스위치를 켜지 않고, 진행 행도 없이 실제 화면에서 퀘스트 연출을 확인할 수
 * 있게 한다. DB에는 아무것도 쓰지 않는다 — 쿠키 값만으로 문지기(`screen-gate.ts`)·홈 카드
 * (`status.ts`)·단계 기록(`step`)·건너뛰기(`skip`) 라우트가 판정을 덮어쓴다.
 *
 * 이중 방어(사용자 결정, 지적 20260928_0119 반영):
 * - **1차**: 쿠키는 관리자 전용 API(`POST /api/admin/onboarding-quest/preview`,
 *   `requireAdmin()`)와, 관리자가 이미 미리보기 중일 때의 `step`/`skip` 라우트에서만
 *   설정·갱신·삭제된다.
 * - **2차**: `getAdminQuestPreview()`가 쿠키 값이 있을 때만 `getAdminUser()`로 관리자
 *   여부를 다시 확인한다. 관리자가 아니면 무시(null)한다. **쿠키가 없으면 관리자 조회
 *   자체를 하지 않는다** — 일반 유저의 화면 진입 비용이 늘지 않는다.
 */
import { cookies } from 'next/headers'
import { getAdminUser } from '@/lib/admin/auth'
import type { OnboardingQuestStepKey } from '@/types/database'
import { ONBOARDING_QUEST_STEPS, STEP_SCREEN_MAP, type OnboardingQuestScreen } from './config'
import { resolveRealStepsView } from './real-view'
import type { OnboardingQuestCardState } from './status'

export const QUEST_PREVIEW_COOKIE = 'jam_quest_preview'

/** 단계 키 7종 또는 7단계를 모두 마친 상태. */
export type QuestPreviewValue = OnboardingQuestStepKey | 'done'

const DONE = 'done' as const

const QUEST_PREVIEW_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24, // 1일
}

function isStepKey(value: string): value is OnboardingQuestStepKey {
  return (ONBOARDING_QUEST_STEPS as readonly string[]).includes(value)
}

/** 쿠키 원문 값을 유효한 미리보기 값으로 해석한다. 그 밖의 값은 무시한다(null). */
export function parseQuestPreview(raw: string | undefined | null): QuestPreviewValue | null {
  if (!raw) return null
  if (raw === DONE) return DONE
  return isStepKey(raw) ? raw : null
}

/**
 * 미리보기 값 → 문지기 결과. `resolveOnboardingQuestGate`(screen-gate.ts)와 같은 모양으로
 * 맞춘다 — 미리보기 단계가 이 화면 소속이면 그 단계를, 아니면(다른 화면 소속이거나 done)
 * null을 돌려준다.
 */
export function resolvePreviewGate(
  preview: QuestPreviewValue,
  screen: OnboardingQuestScreen
): OnboardingQuestStepKey | null {
  if (preview === DONE) return null
  return STEP_SCREEN_MAP[preview] === screen ? preview : null
}

/**
 * 미리보기 값 → 홈 카드 상태. `resolveOnboardingQuestCard`(status.ts)와 같은 모양으로
 * 맞춘다 — 단계 키면 진행 중 카드(`done`은 그 단계 이전에 마친 단계 수), done이면 실제
 * `stravaConnected` 값을 그대로 실어 실제 구역 카드(`kind: 'real'`)를 돌려준다.
 *
 * 미리보기는 DB를 읽지 않으므로 실제 2단계는 «아무것도 안 했다»로 둔다(잠긴 개체·가진 포인트도 모름). 그래서 지금 할 차례는 늘 ① Strava 동기화다
 * (티켓 20261021_1248 — 새 카드의 연출 구역과 첫 실제 행을 운영자가 확인하는 용도).
 */
export function resolvePreviewCard(
  preview: QuestPreviewValue,
  { stravaConnected }: { stravaConnected: boolean }
): OnboardingQuestCardState {
  const real = resolveRealStepsView({
    steps: { sync: false, lockedOpened: false },
    stravaConnected,
    lockedTarget: null,
    pointBalance: null,
  })
  if (preview === DONE) {
    return { kind: 'real', real, preview: true }
  }
  return {
    kind: 'in_progress',
    done: ONBOARDING_QUEST_STEPS.indexOf(preview),
    total: ONBOARDING_QUEST_STEPS.length,
    nextStep: preview,
    real,
    preview: true,
  }
}

export type PreviewAdvanceResult =
  | { ok: true; value: QuestPreviewValue; alreadyDone: boolean }
  | { ok: false; status: 409 }

/**
 * 요청 단계 → 쿠키 전이. 실제 경로(`validateStepAdvance`, progress.ts)와 같은 의미:
 * - 미리보기가 이미 `done` → 더 진행할 단계가 없다(거부)
 * - 요청 단계가 현재 미리보기 단계 → 다음 단계(마지막이면 `done`)로 전이, `alreadyDone: false`
 * - 요청 단계가 이전 단계(이미 지난 단계) → 전이 없음, `alreadyDone: true`(멱등)
 * - 요청 단계가 이후 단계(아직 안 온 단계) → 거부(409) — 실제 경로의 순서 강제와 같은 의미
 */
export function advancePreviewStep(
  preview: QuestPreviewValue,
  step: OnboardingQuestStepKey
): PreviewAdvanceResult {
  if (preview === DONE) return { ok: false, status: 409 }

  const currentIndex = ONBOARDING_QUEST_STEPS.indexOf(preview)
  const stepIndex = ONBOARDING_QUEST_STEPS.indexOf(step)

  if (stepIndex < currentIndex) {
    return { ok: true, value: preview, alreadyDone: true }
  }
  if (stepIndex > currentIndex) {
    return { ok: false, status: 409 }
  }

  const nextIndex = currentIndex + 1
  const nextValue: QuestPreviewValue =
    nextIndex >= ONBOARDING_QUEST_STEPS.length ? DONE : ONBOARDING_QUEST_STEPS[nextIndex]
  return { ok: true, value: nextValue, alreadyDone: false }
}

/**
 * 서버 함수 — 쿠키 값이 있을 때만 관리자 여부를 다시 확인한다(2차 방어). **쿠키가 없으면
 * `getAdminUser()`를 호출하지 않는다** — 일반 유저 화면 진입 비용이 늘지 않는다.
 */
export async function getAdminQuestPreview(): Promise<QuestPreviewValue | null> {
  const cookieStore = await cookies()
  const preview = parseQuestPreview(cookieStore.get(QUEST_PREVIEW_COOKIE)?.value)
  if (!preview) return null

  const admin = await getAdminUser()
  return admin ? preview : null
}

/** 관리자 전용 API(`/api/admin/onboarding-quest/preview`)와 미리보기 중 step 라우트가 쓴다. */
export async function setQuestPreviewCookie(value: QuestPreviewValue): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(QUEST_PREVIEW_COOKIE, value, QUEST_PREVIEW_COOKIE_OPTIONS)
}

/** 관리자 전용 API의 `{ reset: true }`와 미리보기 중 skip 라우트가 쓴다. */
export async function clearQuestPreviewCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete(QUEST_PREVIEW_COOKIE)
}
