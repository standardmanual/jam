'use client'

/**
 * 「카드 모양」 섹션의 목록 항목 입력 칸(목록형 `gallery_list` 전용) — 홈피드 개편 5회차-3 (티켓 20261121_1317, 상위 20261120_2026).
 *
 * 항목 1~3개(`FEED_GALLERY.maxItems`)의 이름·링크·이미지 주소와 «→» 칸의 대표 페이지 주소를 입력한다. 항목은 추가·삭제·위아래 이동을
 * 버튼으로 하고 버튼 이름에 몇 번째 항목인지 들어 있어 키보드·스크린리더로 조작할 수 있다.
 * 값 모양·검증은 5-1(`lib/admin/feedCardFields.ts`)이 정본이다. 주소 규칙은 서비스 카드가 쓰는 `isSafeListHref`와 같다.
 * 이미지는 기존 이미지 입력 부품이 없어(커버 이미지 올리기는 `TodayCardForm` 안의 코드) 주소를 직접 적는다.
 */
import { Button } from '@/components/admin/ui/button'
import { Input } from '@/components/admin/ui/input'
import { FieldLabel, FieldMessage } from '@/app/admin/badges/BadgeFormControls'
import { FIELD_GRID_CLASS } from '@/components/admin/today/TodayEditorLayout'
import { isSafeListHref } from '@/components/today/feed/FeedGalleryListCard'
import {
  buildFeedCardColumns,
  EMPTY_FEED_CARD_FORM_VALUES,
  validateFeedCardColumns,
  type FeedCardFormValues,
  type FeedCardValidation,
  type FeedListItemFormValue,
} from '@/lib/admin/feedCardFields'
import { FEED_GALLERY } from '@/lib/today/feedConstants'
import { cn } from '@/lib/utils'

const TEXT_CLASS = 'break-keep wrap-break-word'

/** 항목 이름 글자 수 권장 상한. PRD 목록형 절에 숫자로 정한 값이 없어(이름 12px 굵게 두 줄까지) 넘으면 경고만 한다. */
export const LIST_ITEM_NAME_WARN_LENGTH = 20

// ── 순수 함수 ──────────────────────────────────────────────────

export function blankListItem(): FeedListItemFormValue {
  return { name: '', href: '', imageUrl: '' }
}

/** 항목을 더한 목록. 상한(`FEED_GALLERY.maxItems`)이 차 있으면 그대로다. */
export function listItemsWithAdded(items: readonly FeedListItemFormValue[]): FeedListItemFormValue[] {
  const copy = items.map((item) => ({ ...item }))
  return copy.length >= FEED_GALLERY.maxItems ? copy : [...copy, blankListItem()]
}

export function listItemsWithout(items: readonly FeedListItemFormValue[], index: number): FeedListItemFormValue[] {
  return items.filter((_, i) => i !== index).map((item) => ({ ...item }))
}

/** 항목 `index`를 `delta`칸(−1 위, +1 아래) 옮긴 목록. 범위를 벗어나면 그대로다. */
export function listItemsMoved(items: readonly FeedListItemFormValue[], index: number, delta: -1 | 1): FeedListItemFormValue[] {
  const copy = items.map((item) => ({ ...item }))
  const target = index + delta
  if (index < 0 || index >= copy.length || target < 0 || target >= copy.length) return copy
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  return copy
}

export function listItemsWithPatch(items: readonly FeedListItemFormValue[], index: number, patch: Partial<FeedListItemFormValue>): FeedListItemFormValue[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : { ...item }))
}

/** 이름이 권장 글자 수를 넘으면 경고 문구, 아니면 null. 막지 않는다. */
export function listItemNameWarning(name: string): string | null {
  const length = [...name.trim()].length
  return length > LIST_ITEM_NAME_WARN_LENGTH
    ? `이름이 ${length}자로 길어요. ${LIST_ITEM_NAME_WARN_LENGTH}자 이내일 때 두 줄 안에 들어가요. 더 짧게 줄여 주세요.`
    : null
}

/** 주소 칸이 막히는 값인가. 저장 검증(`validateFeedCardColumns`)과 같은 규칙(`isSafeListHref`)이다. 항목 주소는 비워도 막히고, 대표 주소는 비우면 «없음»이다. */
export function listHrefInvalid(href: string, required: boolean): boolean {
  const trimmed = href.trim()
  if (trimmed.length === 0) return required
  return !isSafeListHref(trimmed)
}

/** 세 칸이 모두 비어 있는 항목. 저장할 때 떨어지므로(`buildFeedCardColumns`) 오류로 보지 않는다. */
export function isBlankListItem(item: FeedListItemFormValue): boolean {
  return [item.name, item.href, item.imageUrl].every((text) => text.trim().length === 0)
}

/** 목록 칸에 보일 검증 결과. 저장 때 쓰는 `validateFeedCardColumns`를 목록 칸만 넣어 호출하므로 문구가 저장 오류와 같다. */
export function listValidation(items: readonly FeedListItemFormValue[], moreHref: string): FeedCardValidation {
  const columns = buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'gallery_list', listItems: [...items], listMoreHref: moreHref })
  return validateFeedCardColumns({ feed_type: columns.feed_type, list_items: columns.list_items, list_more_href: columns.list_more_href }, { title: '' })
}

// ── 편집기 ─────────────────────────────────────────────────────

export interface FeedListItemsEditorProps {
  items: FeedListItemFormValue[]
  moreHref: string
  /** 바꾼 칸만 넘긴다 */
  onChange: (patch: Partial<Pick<FeedCardFormValues, 'listItems' | 'listMoreHref'>>) => void
}

export default function FeedListItemsEditor({ items, moreHref, onChange }: FeedListItemsEditorProps) {
  const validation = listValidation(items, moreHref)
  const full = items.length >= FEED_GALLERY.maxItems
  const moreInvalid = listHrefInvalid(moreHref, false)

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="feed-list-items-editor">
      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel id="feed-card-list-items-label" className={TEXT_CLASS}>
          목록 항목
        </FieldLabel>
        <FieldMessage className={TEXT_CLASS}>
          항목은 {FEED_GALLERY.maxItems}개까지 둘 수 있어요. 항목마다 이름과 이동할 주소를 적어요.
        </FieldMessage>
      </div>

      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-labelledby="feed-card-list-items-label">
        {items.map((item, index) => {
          const no = index + 1
          const idBase = `feed-card-list-item-${no}`
          const nameWarning = listItemNameWarning(item.name)
          const hrefInvalid = !isBlankListItem(item) && listHrefInvalid(item.href, true)
          return (
            <li key={idBase} className="flex min-w-0 flex-col gap-3 rounded-md border border-border p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <span className={cn('text-[13px] font-medium text-foreground', TEXT_CLASS)}>{no}번째 항목</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${no}번째 항목 위로 이동`}
                    disabled={index === 0}
                    onClick={() => onChange({ listItems: listItemsMoved(items, index, -1) })}
                  >
                    위로
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${no}번째 항목 아래로 이동`}
                    disabled={index === items.length - 1}
                    onClick={() => onChange({ listItems: listItemsMoved(items, index, 1) })}
                  >
                    아래로
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`${no}번째 항목 삭제`}
                    onClick={() => onChange({ listItems: listItemsWithout(items, index) })}
                  >
                    삭제
                  </Button>
                </div>
              </div>

              <div className={FIELD_GRID_CLASS}>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <FieldLabel htmlFor={`${idBase}-name`} className={TEXT_CLASS}>
                    {no}번째 항목 이름
                  </FieldLabel>
                  <Input
                    id={`${idBase}-name`}
                    value={item.name}
                    onChange={(e) => onChange({ listItems: listItemsWithPatch(items, index, { name: e.target.value }) })}
                    autoComplete="off"
                    aria-describedby={nameWarning ? `${idBase}-name-help` : undefined}
                  />
                  {nameWarning && (
                    <FieldMessage id={`${idBase}-name-help`} className={TEXT_CLASS}>
                      {nameWarning}
                    </FieldMessage>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <FieldLabel htmlFor={`${idBase}-href`} className={TEXT_CLASS}>
                    {no}번째 항목 주소
                  </FieldLabel>
                  <Input
                    id={`${idBase}-href`}
                    value={item.href}
                    onChange={(e) => onChange({ listItems: listItemsWithPatch(items, index, { href: e.target.value }) })}
                    autoComplete="off"
                    placeholder="/missions/…  또는  https://…"
                    aria-invalid={hrefInvalid ? true : undefined}
                    aria-describedby={`${idBase}-href-help`}
                    className="aria-invalid:border-destructive"
                  />
                  <FieldMessage id={`${idBase}-href-help`} tone={hrefInvalid ? 'error' : 'help'} className={TEXT_CLASS}>
                    {hrefInvalid ? '「/」로 시작하는 앱 안 경로나 「https://」로 시작하는 주소를 적어 주세요' : '앱 안 경로(「/」로 시작)나 「https://」 주소예요'}
                  </FieldMessage>
                </div>

                <div className="flex min-w-0 flex-col gap-1.5">
                  <FieldLabel htmlFor={`${idBase}-image`} className={TEXT_CLASS}>
                    {no}번째 항목 이미지 주소
                  </FieldLabel>
                  <Input
                    id={`${idBase}-image`}
                    value={item.imageUrl}
                    onChange={(e) => onChange({ listItems: listItemsWithPatch(items, index, { imageUrl: e.target.value }) })}
                    autoComplete="off"
                    placeholder="https://…"
                    aria-describedby={`${idBase}-image-help`}
                  />
                  <FieldMessage id={`${idBase}-image-help`} className={TEXT_CLASS}>
                    선택이에요. 비워 두면 그림 없이 이름만 보여요
                  </FieldMessage>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => onChange({ listItems: listItemsWithAdded(items) })}>
          항목 추가
        </Button>
        <FieldMessage className={TEXT_CLASS}>{full ? `항목은 ${FEED_GALLERY.maxItems}개까지만 둘 수 있어요` : `${items.length}/${FEED_GALLERY.maxItems}개`}</FieldMessage>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel htmlFor="feed-card-list-more-href" className={TEXT_CLASS}>
          대표 페이지 주소 («→» 칸)
        </FieldLabel>
        <Input
          id="feed-card-list-more-href"
          value={moreHref}
          onChange={(e) => onChange({ listMoreHref: e.target.value })}
          autoComplete="off"
          placeholder="/missions  또는  https://…"
          aria-invalid={moreInvalid ? true : undefined}
          aria-describedby="feed-card-list-more-href-help"
          className="aria-invalid:border-destructive"
        />
        <FieldMessage id="feed-card-list-more-href-help" tone={moreInvalid ? 'error' : 'help'} className={TEXT_CLASS}>
          {moreInvalid
            ? '「/」로 시작하는 앱 안 경로나 「https://」로 시작하는 주소를 적어 주세요'
            : '이 목록을 대표하는 페이지예요. 비워 두면 «→» 칸을 그리지 않아요'}
        </FieldMessage>
      </div>

      {(validation.errors.length > 0 || validation.warnings.length > 0) && (
        <ul role="status" className="m-0 flex list-none flex-col gap-1 p-0" data-testid="feed-list-messages">
          {validation.errors.map((message) => (
            <li key={message} className={cn('text-xs text-destructive', TEXT_CLASS)}>
              {message}
            </li>
          ))}
          {validation.warnings.map((message) => (
            <li key={message} className={cn('text-xs text-amber-700', TEXT_CLASS)}>
              {message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
