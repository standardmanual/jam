/**
 * 기획을 열면 이미지를 미리 만드는 대상 고르기 (티켓 20261120_1416).
 *
 * 도착·검토중 항목 가운데 이미지가 아직 없고 제작 인자가 완성된 항목의 ID만 돌려주는 순수 함수다. 만들기·저장은 `useItemImageProduction`이 한다.
 * 승인 이후 상태(`OPS_IMAGE_PRODUCTION_STATUSES`)는 승인·예약 때의 자동 제작과 [이미지 만들기]가 맡으므로 여기서 보지 않는다.
 * 색(`bg`·`end`)이 비었거나 `color_pending`이면 만들지 않는다 — 승인 전 미리보기가 임시 색으로 그리는 동작은 그대로다.
 */
import { hasResourceImage, imageKeyOfKind, imageSpecToRenderArgs, readImageSpec, usesMissionImage } from './imageSpec'
import { readOpsItemColorPending } from './fields'
import type { OpsItemRecord } from './query'

/** 기획 단계에서 미리 만들 수 있는 항목 상태. */
const AUTO_IMAGE_STATUSES: readonly string[] = ['arrived', 'reviewing']

interface PickOptions {
  /** 시험 묶음이면 아무것도 고르지 않는다(시험 묶음은 이미지를 저장하지 않는다). */
  isSample: boolean
  /** 이 화면 세션에서 이미 시도한 항목 ID. 실패해도 다시 고르지 않는다. */
  attempted: ReadonlySet<string>
}

/** 미리 만들 항목의 ID를 `items` 순서대로 돌려준다. */
export function pickAutoImageItemIds(items: readonly OpsItemRecord[], { isSample, attempted }: PickOptions): string[] {
  if (isSample) return []
  const ids: string[] = []
  for (const item of items) {
    if (attempted.has(item.id)) continue
    if (!AUTO_IMAGE_STATUSES.includes(item.status)) continue
    if (imageKeyOfKind(item.kind) === null) continue
    // 미션 소개 카드는 미션 대표 이미지를 쓰므로 카드 이미지를 만들지 않는다(티켓 20261120_1825)
    if (usesMissionImage(item)) continue
    if (hasResourceImage(item)) continue
    if (readOpsItemColorPending(item) !== false) continue
    const args = imageSpecToRenderArgs(readImageSpec(item), 0)
    if (!args || args.bg.trim() === '' || args.end.trim() === '') continue
    ids.push(item.id)
  }
  return ids
}

/**
 * 미리 만들 항목을 고르고 `attempted`에 더한다. 화면이 새로 읽혀 `items`가 바뀌어도 한 항목은 한 번만 돌려준다(티켓 20261120_1416).
 */
export function claimAutoImageItemIds(items: readonly OpsItemRecord[], isSample: boolean, attempted: Set<string>): string[] {
  const ids = pickAutoImageItemIds(items, { isSample, attempted })
  for (const id of ids) attempted.add(id)
  return ids
}
