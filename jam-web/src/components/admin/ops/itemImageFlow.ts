/**
 * 승인 직후 항목 이미지 제작 흐름 (티켓 20261007_0947 ③-b1, 운영툴 PRD §8.8). 순수 비동기 함수라 렌더와 업로드를 주입받는다.
 * **던지지 않는다.** 승인은 이미 끝났으므로 어떤 실패도 승인을 되돌리지 않고 결과 값으로만 알린다.
 */
import { readImageSpec, seedFromBundleId } from '@/lib/admin/opsInbox/imageTarget'
import type { ViewableItem } from '@/lib/admin/opsInbox/itemView'
import type { PostItemImageResult } from './imageClient'

export type ItemImageSkipReason = 'sample' | 'no_image_kind' | 'missing' | 'invalid'

export type ItemImageFlowResult =
  | { status: 'done'; url: string }
  | { status: 'skipped'; reason: ItemImageSkipReason; message: string }
  | { status: 'failed'; reason: 'render' | 'upload'; message: string }

export const SKIP_MESSAGES: Record<ItemImageSkipReason, string> = {
  sample: '시험 묶음이라 이미지는 만들지 않았어요',
  no_image_kind: '이미지를 쓰지 않는 종류라 이미지는 만들지 않았어요',
  missing: '이미지 지시가 없어서 이미지는 만들지 않았어요',
  invalid: '이미지 지시가 올바르지 않아 이미지는 만들지 않았어요',
}

export const RENDER_FAILED_MESSAGE = '이미지를 만들지 못했어요. 이미지 지시를 확인하고 다시 시도해 주세요'

export interface ItemImageRenderArgs {
  presetId: string
  bg: string
  end: string
  values: Record<string, string>
  seed: number
}

export interface MakeItemImageInput {
  bundleId: string
  itemId: string
  kind: string | null
  isSample: boolean
  item: ViewableItem
  render: (args: ItemImageRenderArgs) => Promise<Blob>
  post: (bundleId: string, itemId: string, blob: Blob) => Promise<PostItemImageResult>
}

export async function makeItemImage(input: MakeItemImageInput): Promise<ItemImageFlowResult> {
  const { bundleId, itemId, kind, isSample, item, render, post } = input
  if (isSample) return { status: 'skipped', reason: 'sample', message: SKIP_MESSAGES.sample }

  const read = readImageSpec({ original: item.original, edited: item.edited, kind })
  if (!read.ok) return { status: 'skipped', reason: read.reason, message: SKIP_MESSAGES[read.reason] }

  let blob: Blob
  try {
    blob = await render({ ...read.spec, seed: seedFromBundleId(bundleId) })
  } catch (error) {
    const message = error instanceof Error && error.message !== '' ? error.message : RENDER_FAILED_MESSAGE
    return { status: 'failed', reason: 'render', message }
  }

  try {
    const posted = await post(bundleId, itemId, blob)
    if (!posted.ok) return { status: 'failed', reason: 'upload', message: posted.message }
    return { status: 'done', url: posted.url }
  } catch {
    return { status: 'failed', reason: 'upload', message: RENDER_FAILED_MESSAGE }
  }
}
