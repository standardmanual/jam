'use client'

/**
 * 승인 직후 항목 이미지 자동 제작 (티켓 20261007_1031 ③-b1-b, 상위 20261007_0946).
 *
 * 항목 하나를 승인하면 `image_spec`으로 브라우저에서 PNG를 만들어 항목 이미지 API에 올린다(예약된 뒤라면 서버가 자원에도 붙인다).
 * 실패해도 승인은 그대로다 — 「이미지 제작 필요」는 이 훅의 상태가 아니라 항목 데이터(승인됨·준비중인데 이미지 칸이 빔)로 계산하니 새로 고쳐도 남는다.
 * 상태는 「만드는 중」 표시와 중복 시작 방지에만 쓴다. 시험 묶음은 렌더도 저장도 하지 않는다. 일괄 승인은 이 훅을 부르지 않는다.
 * `start`는 던지지 않는다. 시드는 매번 새로 뽑는다.
 */
import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { imageSpecToRenderArgs, imageKeyOfKind, readImageSpec } from '@/lib/admin/opsInbox/imageSpec'
import { renderPresetToPngBlob } from '@/lib/admin/opsInbox/imageRender.client'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { postItemImage } from './imageClient'

export const IMAGE_FAILED_TOAST = '승인은 유지했어요. 이미지를 만들지 못해 「이미지 제작 필요」로 남겨 뒀어요.'

export interface ItemImageProduction {
  /** 지금 이미지를 만드는 중인 항목 ID. */
  making: ReadonlySet<string>
  /** 항목의 이미지를 만든다. 시험 묶음이거나 만들 지시가 없으면 아무것도 하지 않는다. 던지지 않는다. */
  start: (itemId: string, items: readonly OpsItemRecord[]) => Promise<void>
}

interface Options {
  bundleId: string
  isSample: boolean
  /** 끝난 뒤 화면을 다시 읽는다. */
  onDone?: () => void
}

function newSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

export type ProduceResult = 'skipped' | 'done' | 'failed'

/**
 * 이미지 한 장을 만들어 올린다(훅과 분리해 단독으로 시험한다). 시험 묶음·이미지 칸이 없는 종류·`preset_id`가 없는 항목은 아무것도 하지 않고 `skipped`다.
 * 렌더나 업로드가 실패하면 `failed`다. 던지지 않는다.
 */
export async function produceItemImage(
  bundleId: string,
  item: OpsItemRecord,
  isSample: boolean,
  seed: number = newSeed()
): Promise<ProduceResult> {
  if (isSample || imageKeyOfKind(item.kind) === null) return 'skipped'
  const args = imageSpecToRenderArgs(readImageSpec(item), seed)
  if (!args) return 'skipped'
  try {
    const blob = await renderPresetToPngBlob(args)
    const result = await postItemImage(bundleId, item.id, blob)
    return result.ok ? 'done' : 'failed'
  } catch {
    return 'failed'
  }
}

export function useItemImageProduction({ bundleId, isSample, onDone }: Options): ItemImageProduction {
  const [making, setMaking] = useState<ReadonlySet<string>>(new Set())
  const inFlight = useRef(new Set<string>())

  const start = useCallback(
    async (itemId: string, items: readonly OpsItemRecord[]) => {
      if (isSample || inFlight.current.has(itemId)) return
      const item = items.find((entry) => entry.id === itemId)
      if (!item) return
      inFlight.current.add(itemId)
      setMaking(new Set(inFlight.current))
      try {
        const result = await produceItemImage(bundleId, item, isSample)
        if (result === 'failed') toast.warning(IMAGE_FAILED_TOAST)
      } finally {
        inFlight.current.delete(itemId)
        setMaking(new Set(inFlight.current))
        onDone?.()
      }
    },
    [bundleId, isSample, onDone]
  )

  return { making, start }
}
