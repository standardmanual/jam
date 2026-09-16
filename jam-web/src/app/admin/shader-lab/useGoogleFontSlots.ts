'use client'

/**
 * 쉐이더 랩 — 텍스트 레이어 ↔ 구글 폰트 슬롯 배정 (티켓 20260916_2001)
 *
 * 미사용 슬롯 11개(`GOOGLE_FONT_SLOT_IDS`)는 "한 시점에 슬롯 하나 = CSS 변수 하나 = 폰트
 * 하나"다. 그래서 한 컴포지션 안에서 동시에 쓸 수 있는 서로 다른 구글 폰트 수는 11개로
 * 제한된다. 같은 폰트를 쓰는 텍스트 레이어끼리는 슬롯을 공유하고(재사용), 슬롯이 이미 11개
 * 전부 차 있으면 배정을 거부한다.
 *
 * 배정 상태는 별도 state로 들고 있지 않고, 매 렌더마다 `layers`(각 레이어의
 * `params.fontFamily`/`params.googleFontFamily`)에서 파생한다 — 레이어가 삭제되거나 다른
 * 폰트로 바뀌면 그 레이어가 점유하던 슬롯은 다음 렌더에서 자동으로 "빈 슬롯" 후보에 들어간다.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { ShaderLabLayerConfig } from '@basementstudio/shader-lab'
import {
  GOOGLE_FONT_SLOT_CSS_VARIABLES,
  GOOGLE_FONT_SLOT_IDS,
  isGoogleFontSlotId,
  type GoogleFontSlotId,
} from '@/lib/admin/shaderLab/textFontOptions'
import {
  applyGoogleFontToSlot,
  ensureGoogleFontLoaded,
  waitForGoogleFontLoaded,
} from '@/lib/admin/shaderLab/googleFonts'

export interface GoogleFontAssignResult {
  ok: boolean
  slotValue?: GoogleFontSlotId
  errorMessage?: string
}

interface GoogleFontAssignment {
  slotValue: GoogleFontSlotId
  family: string
}

export function useGoogleFontSlots(
  layers: readonly ShaderLabLayerConfig[],
  /** 폰트 다운로드가 실제로 완료된 뒤 호출된다 — `page.tsx`가 이 레이어의 params 시그니처를
   *  다시 한번 바꿔(`bumpGoogleFontRevision`) `TextPass`가 재렌더링하도록 만드는 데 쓴다
   *  (티켓 20260916_2118, 파일 상단 주석 참고). */
  onFontLoaded?: (layerId: string) => void
) {
  const assignments = useMemo(() => {
    const map = new Map<string, GoogleFontAssignment>()
    for (const layer of layers) {
      if (layer.type !== 'text') continue
      const fontFamily = layer.params.fontFamily
      const googleFontFamily = layer.params.googleFontFamily
      if (
        typeof fontFamily === 'string' &&
        isGoogleFontSlotId(fontFamily) &&
        typeof googleFontFamily === 'string' &&
        googleFontFamily.length > 0
      ) {
        map.set(layer.id, { slotValue: fontFamily, family: googleFontFamily })
      }
    }
    return map
  }, [layers])

  const slotUsers = useMemo(() => {
    const map = new Map<GoogleFontSlotId, string[]>()
    for (const [layerId, assignment] of assignments) {
      const users = map.get(assignment.slotValue) ?? []
      users.push(layerId)
      map.set(assignment.slotValue, users)
    }
    return map
  }, [assignments])

  const occupiedSlots = useMemo(() => new Set(slotUsers.keys()), [slotUsers])

  // 이 세션에서 "레이어 id + 폰트명" 조합별로 다운로드 완료를 이미 기다린 적 있는지 기록한다 —
  // 같은 조합에 대해 매 렌더마다(예: 다른 레이어 편집으로 `layers`가 바뀔 때) 중복으로
  // `onFontLoaded`를 호출해 불필요하게 재렌더링을 트리거하지 않기 위해서다.
  const notifiedRef = useRef(new Set<string>())

  // 컴포지션 불러오기(`ShaderLabSavePanel`) 직후에는 레이어 params에 배정 정보(fontFamily=
  // 슬롯 id, googleFontFamily=폰트명)가 있어도 CSS 변수·구글 폰트 `<link>`는 아직 이 세션에
  // 반영되지 않은 상태다 — assignments가 바뀔 때마다(불러오기 포함) 실제 반영까지 동기화한다.
  //
  // 또한 `<link>` 삽입은 다운로드 완료를 보장하지 않으므로(티켓 20260916_2118), 다운로드가
  // 실제로 끝난 뒤 `onFontLoaded`로 해당 레이어의 재렌더링을 트리거한다.
  useEffect(() => {
    for (const [layerId, assignment] of assignments) {
      applyGoogleFontToSlot(GOOGLE_FONT_SLOT_CSS_VARIABLES[assignment.slotValue], assignment.family)
      ensureGoogleFontLoaded(assignment.family)

      const notifyKey = `${layerId}:${assignment.family}`
      if (notifiedRef.current.has(notifyKey)) continue
      notifiedRef.current.add(notifyKey)
      void waitForGoogleFontLoaded(assignment.family).then(() => {
        onFontLoaded?.(layerId)
      })
    }
  }, [assignments, onFontLoaded])

  const assignFont = useCallback(
    (layerId: string, family: string): GoogleFontAssignResult => {
      // 이미 같은 폰트를 쓰는 다른 레이어가 있으면 그 슬롯을 그대로 공유한다.
      for (const [otherLayerId, assignment] of assignments) {
        if (otherLayerId !== layerId && assignment.family === family) {
          applyGoogleFontToSlot(GOOGLE_FONT_SLOT_CSS_VARIABLES[assignment.slotValue], family)
          ensureGoogleFontLoaded(family)
          return { ok: true, slotValue: assignment.slotValue }
        }
      }

      // 이 레이어가 이미 슬롯 하나를 독점하고 있었으면(다른 구글 폰트로 바꾸는 경우) 그 슬롯을
      // 그대로 재사용한다 — 단, 다른 레이어와 공유 중인 슬롯이면 그 레이어의 폰트가 깨지므로
      // 재사용하지 않고 새 빈 슬롯을 찾는다.
      const currentAssignment = assignments.get(layerId)
      const ownsSlotExclusively =
        currentAssignment && (slotUsers.get(currentAssignment.slotValue)?.length ?? 0) === 1
      const reusableSlot = ownsSlotExclusively ? currentAssignment?.slotValue : undefined

      const freeSlot = reusableSlot ?? GOOGLE_FONT_SLOT_IDS.find((slot) => !occupiedSlots.has(slot))
      if (!freeSlot) {
        return {
          ok: false,
          errorMessage:
            '동시에 쓸 수 있는 구글 폰트가 11종을 넘었어요. 다른 텍스트 레이어의 폰트를 정리한 뒤 다시 시도해 주세요.',
        }
      }

      applyGoogleFontToSlot(GOOGLE_FONT_SLOT_CSS_VARIABLES[freeSlot], family)
      ensureGoogleFontLoaded(family)
      return { ok: true, slotValue: freeSlot }
    },
    [assignments, slotUsers, occupiedSlots]
  )

  return { assignFont, occupiedSlots, assignments }
}
