/**
 * 앰비언트 드랍 날짜 예약 — 등록 전 미리 확인 (서버, 티켓 20261001_2052)
 *
 * 등록과 같은 입력 검증(`parseAmbientDropScheduleInput`)·같은 대상 판정(`loadScheduleTargets`, 기준 = 예정 시각)을
 * 돌려 보고 결과만 요약한다. **DB에 쓰지 않는다.** 지점 직접 모드는 「이미 드랍이 있는 지점 N곳」을 함께 알려 준다
 * (겹쳐서 놓인다 — 상위 티켓 20260930_1457 Q3).
 *
 * 입력 오류(400)와 달리 대상 문제(예정 시각에 놓을 수 없는 대상)는 200 응답의 `problem`에 담는다 — 화면이
 * 등록 버튼을 막고 같은 문장을 보여 준다.
 */
import type { createServiceClient } from '@/lib/supabase/server'
import { parseAmbientDropScheduleInput, type AmbientDropScheduleSpec } from './scheduleSpec'
import { describeScheduleTargetProblems, loadScheduleTargets, type ScheduleTargets } from './scheduleTargets'
import { scheduleRequestedCount, type AmbientDropSchedulePreview } from './scheduleView'

type ServiceClient = ReturnType<typeof createServiceClient>

export type PreviewAmbientDropScheduleResult =
  | { ok: true; preview: AmbientDropSchedulePreview }
  | { ok: false; status: 400 | 500; error: string }

// 아래 두 문장은 `createAmbientDropSchedule`(scheduleStore.ts)과 같다 — 등록과 미리 확인이 다른 말을 하지 않게 한다
const TARGET_CHECK_FAILED = '예약 대상을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
const CATEGORY_NOT_FOUND =
  '지점 종류를 찾을 수 없어요. 선택한 종류가 지워졌거나 잘못된 값이에요. 지점 종류를 다시 선택해 주세요.'

/** 대상 판정 결과를 화면용 요약으로 줄인다(순수 함수) */
export function summarizeSchedulePreview(
  spec: AmbientDropScheduleSpec,
  scheduledAt: string,
  targets: ScheduleTargets
): AmbientDropSchedulePreview {
  // 겹침은 지점 직접 모드의 이야기다. 종류+개수 모드는 활성 드랍이 없는 지점부터 흩어 놓아 겹치지 않는다
  const overlappedPoiCount =
    spec.poiMode === 'list' ? targets.pois.filter((poi) => poi.activeSystemCount > 0).length : 0
  return {
    scheduledAt,
    requested: scheduleRequestedCount(spec),
    poiMode: spec.poiMode,
    eligiblePoiCount: targets.pois.length,
    overlappedPoiCount,
    overlapNotice:
      overlappedPoiCount > 0
        ? `이미 드랍이 있는 지점이 ${overlappedPoiCount}곳이에요. 이 지점에는 있던 드랍 위에 겹쳐서 놓여요.`
        : null,
    candidateBadgeCount: targets.badgePool.length,
    problem: describeScheduleTargetProblems(targets),
  }
}

/** 입력 검증 → 지점 종류 확인 → 예정 시각 기준 대상 판정 → 요약. 읽기만 한다 */
export async function previewAmbientDropSchedule(
  supabase: ServiceClient,
  body: unknown,
  now: Date = new Date()
): Promise<PreviewAmbientDropScheduleResult> {
  const parsed = parseAmbientDropScheduleInput(body, now)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const { spec } = parsed
  const scheduledAt = parsed.scheduledAt as string // allowNow가 아니면 항상 값이 있다

  if (spec.poiMode === 'category' && spec.poiCategory) {
    const { data, error } = await supabase.from('poi_categories').select('slug').eq('slug', spec.poiCategory).maybeSingle()
    if (error) {
      console.error('[ambient-drop-schedule] 미리 확인: 지점 종류 확인 실패:', error.message)
      return { ok: false, status: 500, error: TARGET_CHECK_FAILED }
    }
    if (!data) return { ok: false, status: 400, error: CATEGORY_NOT_FOUND }
  }

  let targets: ScheduleTargets
  try {
    targets = await loadScheduleTargets(supabase, spec, scheduledAt)
  } catch (err) {
    console.error('[ambient-drop-schedule] 미리 확인: 대상 판정 실패:', err)
    return { ok: false, status: 500, error: TARGET_CHECK_FAILED }
  }
  return { ok: true, preview: summarizeSchedulePreview(spec, scheduledAt, targets) }
}
