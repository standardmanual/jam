'use client'

import { IconPhoto } from '@tabler/icons-react'
import { Button } from '@/components/admin/ui/button'
import { asRecord, itemField } from '@/lib/admin/opsInbox/itemView'
import { imageKeyOfKind, imageSpecToRenderArgs, readImageSpec } from '@/lib/admin/opsInbox/imageSpec'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { OPS_IMAGE_PRODUCTION_STATUSES } from '@/lib/admin/opsSignals/composition'
import type { ItemImageProduction } from './useItemImageProduction'

/**
 * 승인됨 항목의 [이미지 만들기]·다시 만들기 (티켓 20261007_1032 ③-b2, 상위 20261007_0946).
 *
 * 서랍(`ReadyItemBody`)과 기획 상세(`OpsDecisionWorkspace`)가 카드 미리보기 바로 아래에 같은 부품을 놓는다. 결정 줄(`OpsItemFooter`)은 승인됨에서 안내 글이 대신하므로 그 밖에 둔다.
 * 이미지가 없으면 [이미지 만들기], 있으면 [이미지 다시 만들기](새 시드)다. 만드는 중에는 버튼이 잠기고 「만드는 중」을 보인다.
 * 아무것도 그리지 않는 경우: 시험 묶음, 승인됨·준비중이 아닌 항목(게재중·예약됨 포함), 이미지 칸이 없는 종류, 만들 지시(`image_spec.preset_id`)가 없는 항목.
 */

export const IMAGE_MAKE_LABEL = '이미지 만들기'
export const IMAGE_REMAKE_LABEL = '이미지 다시 만들기'
export const IMAGE_MAKING_TEXT = '만드는 중'

function hasResourceImage(item: OpsItemRecord, imageKey: string): boolean {
  const value = asRecord(itemField(item, 'resource'))?.[imageKey]
  return typeof value === 'string' && value.trim() !== ''
}

interface OpsImageProductionProps {
  item: OpsItemRecord
  items: readonly OpsItemRecord[]
  isSample: boolean
  production: ItemImageProduction
}

export function OpsImageProduction({ item, items, isSample, production }: OpsImageProductionProps) {
  const imageKey = imageKeyOfKind(item.kind)
  if (isSample || imageKey === null || !OPS_IMAGE_PRODUCTION_STATUSES.includes(item.status)) return null
  if (imageSpecToRenderArgs(readImageSpec(item), 0) === null) return null

  const making = production.making.has(item.id)
  const label = hasResourceImage(item, imageKey) ? IMAGE_REMAKE_LABEL : IMAGE_MAKE_LABEL
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        className="h-11 @[40rem]:h-10"
        disabled={making}
        onClick={() => void production.start(item.id, items)}
      >
        <IconPhoto aria-hidden="true" />
        {making ? IMAGE_MAKING_TEXT : label}
      </Button>
    </div>
  )
}
