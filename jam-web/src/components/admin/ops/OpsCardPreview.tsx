/**
 * 운영 항목의 카드 미리보기 (티켓 20261006_1802, 상위 20260930_1501 ②).
 *
 * 기획 상세 왼쪽 칸과 일정표·기획 상세 서랍이 같은 부품을 쓴다. 홈피드 카드는 공용 `TodayCardPreview`(기기 폭 360·430)에, 배지·컬렉션·미션은 `OpsKindPreview`(티켓 20261007_1400)에 표시 데이터를 넘긴다.
 * 표시 데이터에 계측 정보가 없어 노출·클릭 기록과 링크를 남기지 않는다. 저장 전 초안(`draft`)을 덮어 그려서 문안을 바꾸면 바로 바뀐다.
 * 색은 카드 틀에 반영하지 않는다(색은 이미지에 구워진다) — `colors.*` 값을 견본 칩으로만 보여 준다(결정 Q9).
 * 기기 폭 선택이 항목을 옮겨도 남도록 항목 ID로 `key`를 걸지 않는다.
 *
 * 승인 전(제작 대상 상태가 아닌) 카드에 저장된 이미지가 없고 `image_spec.preset_id`가 있으면 저장 없이 브라우저에서 바로 그려 보인다
 * (`useDraftImagePreview`, 티켓 20261101_2149). 시드는 항목 ID의 고정 시드라 승인 뒤 첫 제작 이미지와 같다. 카드 데이터는 바꾸지 않는다.
 */
'use client'

import { OpsKindPreview } from '@/components/admin/ops/OpsKindPreview'
import TodayCardPreview from '@/app/admin/today/TodayCardPreview'
import { previewOf } from '@/lib/admin/opsInbox/cardPreview'
import { applyDraftToItem } from '@/lib/admin/opsInbox/editDraft'
import { entriesOf, itemField } from '@/lib/admin/opsInbox/itemView'
import { bundleBadgeNamesOf } from '@/lib/admin/opsInbox/cardPreview'
import type { OpsPreviewNames } from '@/lib/admin/opsInbox/previewNames'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { OPS_IMAGE_PRODUCTION_STATUSES } from '@/lib/admin/opsSignals/composition'
import { isImageShape } from '@/lib/today/shape'
import { previewRenderArgs, readImageSpec } from '@/lib/admin/opsInbox/imageSpec'
import { useDraftImagePreview, type DraftImageRequest } from './useDraftImagePreview'

export const PREVIEW_NOT_CARD_TEXT = '이 종류의 미리보기는 곧 열려요'
export const PREVIEW_IMAGE_PENDING_TEXT = '이미지는 승인 뒤 만들어요'
export const PREVIEW_IMAGE_NEEDED_TEXT = '이미지 제작 필요'
export const PREVIEW_IMAGE_MAKING_TEXT = '이미지를 만드는 중이에요'
export const PREVIEW_COLOR_LABEL = '색 견본'
export const PREVIEW_IMAGE_DRAWING_TEXT = '이미지를 그리는 중이에요'
export const PREVIEW_IMAGE_DRAWN_TEXT = '승인하면 이 이미지로 만들어요'
export const PREVIEW_IMAGE_TEMP_COLOR_TEXT = '색이 정해지지 않아 임시 색으로 보여요'

export interface OpsCardPreviewProps {
  item: Pick<OpsItemRecord, 'id' | 'kind' | 'original' | 'edited'> & { status?: string; itemKey?: string | null }
  /** 저장 전 초안 값(경로 → 새 값). 이 항목의 초안일 때만 넘긴다. */
  draft?: Record<string, unknown>
  /** 이 항목의 이미지를 지금 만드는 중이면 이미지 자리의 안내를 「만드는 중」으로 바꾼다(티켓 20261007_1032). */
  making?: boolean
  /** 레시피·드랍이 가리키는 배지·지점·컬렉션 이름(서버가 읽어 내린다, 티켓 20261007_1401). 없으면 폴백 문구로 그린다. */
  previewNames?: OpsPreviewNames
  /** 같은 묶음의 항목 전부. 레시피에서 「이 묶음의 배지」를 찾는 데 쓴다. */
  bundleItems?: readonly (Pick<OpsItemRecord, 'kind' | 'original' | 'edited'> & { itemKey?: string | null })[]
}

export function OpsCardPreview({ item, draft, making = false, previewNames, bundleItems }: OpsCardPreviewProps) {
  const preview = previewOf(item, draft, {
    names: previewNames,
    bundleBadgeNames: item.kind === 'recipe' ? bundleBadgeNamesOf(item.itemKey, bundleItems ?? []) : [],
  })
  const merged = draft ? applyDraftToItem(item, draft) : item

  // 승인 전 홈피드 카드: 저장된 이미지가 없고 지시(`preset_id`)가 있을 때만 그린다. 그 밖에는 요청이 비어 렌더를 부르지 않는다.
  const storedMissing = preview?.type === 'card' && isImageShape(preview.view.shape) && 'imageUrl' in preview.view && !preview.view.imageUrl
  const beforeProduction = !item.status || !OPS_IMAGE_PRODUCTION_STATUSES.includes(item.status)
  const drawn = storedMissing && beforeProduction ? previewRenderArgs(readImageSpec(merged), item.id) : null
  const requests: DraftImageRequest[] = drawn ? [{ id: item.id, args: drawn.args, tempColor: drawn.tempColor }] : []
  const drafts = useDraftImagePreview(requests)

  if (!preview) return <p className="text-sm text-muted-foreground">{PREVIEW_NOT_CARD_TEXT}</p>

  const draftState = drawn ? drafts.get(item.id) : undefined
  const view = preview.type === 'card' && draftState?.url ? { ...preview.view, imageUrl: draftState.url } : null
  const colors = entriesOf(itemField(merged, 'colors')) ?? []
  const imageMissing =
    preview.type === 'card'
      ? storedMissing
      : preview.type === 'recipe' || preview.type === 'drop'
        ? false
        : !preview.imageUrl
  const drawnNotice = !drawn
    ? null
    : draftState?.status === 'failed'
      ? null
      : draftState?.status === 'ready'
        ? draftState.tempColor
          ? PREVIEW_IMAGE_TEMP_COLOR_TEXT
          : PREVIEW_IMAGE_DRAWN_TEXT
        : PREVIEW_IMAGE_DRAWING_TEXT

  return (
    <div className="space-y-2">
      {preview.type === 'card' ? <TodayCardPreview views={[view ?? preview.view]} /> : <OpsKindPreview preview={preview} />}
      {drawnNotice && <p className="text-xs text-muted-foreground break-keep wrap-break-word">{drawnNotice}</p>}
      {imageMissing && !drawnNotice && (
        <p className="text-xs text-muted-foreground">
          {item.status && OPS_IMAGE_PRODUCTION_STATUSES.includes(item.status)
            ? making
              ? PREVIEW_IMAGE_MAKING_TEXT
              : PREVIEW_IMAGE_NEEDED_TEXT
            : PREVIEW_IMAGE_PENDING_TEXT}
        </p>
      )}
      {colors.some(({ text }) => HEX_COLOR_PATTERN.test(text)) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label={PREVIEW_COLOR_LABEL}>
          <span>{PREVIEW_COLOR_LABEL}</span>
          {colors.map(({ key, text }) => {
            const isHex = HEX_COLOR_PATTERN.test(text)
            return (
              <span key={key} className="inline-flex items-center gap-1">
                {isHex && (
                  <span aria-hidden="true" className="inline-block size-4 shrink-0 rounded border border-border" style={{ backgroundColor: text }} />
                )}
                <span>{key}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
