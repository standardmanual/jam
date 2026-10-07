'use client'

import { useState } from 'react'
import BackgroundColorField from '@/components/admin/BackgroundColorField'
import { HEX_COLOR_PATTERN } from '@/components/admin/BackgroundColorField'
import { Button } from '@/components/admin/ui/button'
import { OPS_FIELD_UNKNOWN, readOpsItemColorPending, readOpsItemTribeId } from '@/lib/admin/opsInbox/fields'
import type { OpsItemRecord } from '@/lib/admin/opsInbox/query'
import { validateEditedColor } from '@/lib/admin/opsInbox/validate'
import { approvedPairsOf, findApprovedPair } from '@/lib/admin/opsInbox/tribePalettes'
import { postDecision } from './decisionClient'
import type { OpsWorkspaceContext } from './OpsBundleWorkspace'

/**
 * 색 대기 카드의 색 쌍 고르기 (티켓 20261007_1146 ④-b, 상위 20261006_1804).
 *
 * 검토중이고 「색 대기」인 카드에만 그린다. 승인 쌍 목록(`approvedPairsOf`)에서 하나를 고르거나 시작색·끝색을 직접 적는다.
 * 고른 값은 저장 전이라 `ctx.colorPick`에만 두고, 미리보기는 `withColorPick`으로 `colors.bg`·`colors.end`를 덮어 보인다
 * (수정 초안 `draft`와 달리 「수정 중」 상태를 만들지 않아 승인·반려 버튼이 막히지 않는다). [적용하기]가 `fill_color`로 저장한다.
 * 서버는 되돌리기·승인 쌍 강제가 없다(다른 쌍을 다시 고르면 된다). 승인 쌍 밖의 값은 직접 입력일 때만 들어온다.
 */

/** 저장 전에 고른 색 쌍. 어느 항목의 것인지(`itemId`)와 시작색·끝색 글자(직접 입력 중이면 아직 틀린 값일 수 있다). */
export interface OpsColorPick {
  itemId: string
  bg: string
  end: string
}

/** 미리보기용 초안: 수정 초안 위에 고른 색 쌍(올바른 hex인 것만)을 `colors.bg`·`colors.end`로 덮는다. 덮을 것이 없으면 초안 그대로다. */
export function withColorPick(
  itemId: string,
  draft: { itemId: string; values: Record<string, unknown> } | null,
  pick: OpsColorPick | null | undefined
): Record<string, unknown> | undefined {
  const base = draft?.itemId === itemId ? draft.values : undefined
  if (!pick || pick.itemId !== itemId) return base
  const overlay: Record<string, unknown> = {}
  if (HEX_COLOR_PATTERN.test(pick.bg)) overlay['colors.bg'] = pick.bg
  if (HEX_COLOR_PATTERN.test(pick.end)) overlay['colors.end'] = pick.end
  return Object.keys(overlay).length === 0 ? base : { ...base, ...overlay }
}

/** 이 항목에 색 고르기를 보일지: 검토중이고 「색 대기」가 참이다(값이 틀려 「모름」이면 보이지 않는다). */
export function canPickColor(item: Pick<OpsItemRecord, 'status' | 'original' | 'edited'>): boolean {
  return item.status === 'reviewing' && readOpsItemColorPending(item) === true
}

/** [적용하기]를 누를 수 있는지: 시작색·끝색이 모두 `#rrggbb`다(서버 `validateEditedColor`와 같은 식). */
export function canApplyColorPick(bg: string, end: string): boolean {
  return validateEditedColor(bg) === null && validateEditedColor(end) === null
}

function Swatch({ text }: { text: string }) {
  const isHex = HEX_COLOR_PATTERN.test(text)
  return (
    <>
      {isHex && (
        <span aria-hidden="true" className="inline-block size-5 shrink-0 rounded border border-border" style={{ backgroundColor: text }} />
      )}
    </>
  )
}

interface OpsColorPairPickerProps {
  bundleId: string
  item: OpsItemRecord
  ctx: OpsWorkspaceContext
  /** 적용이 끝났다(고른 값은 이미 비웠다). 토스트와 화면 새로 읽기는 호출한 쪽이 한다. */
  onFilled: (itemId: string) => void
  /** 그 사이 다른 곳에서 바뀐 항목이라 409를 받았다(화면을 새로 읽는다). */
  onConflict: () => void
}

export function OpsColorPairPicker({ bundleId, item, ctx, onFilled, onConflict }: OpsColorPairPickerProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  if (!canPickColor(item) || ctx.draft?.itemId === item.id) return null

  const tribeId = readOpsItemTribeId(item)
  const pairs = tribeId === OPS_FIELD_UNKNOWN ? [] : approvedPairsOf(tribeId)
  const mine = ctx.colorPick?.itemId === item.id ? ctx.colorPick : null
  const bg = mine?.bg ?? ''
  const end = mine?.end ?? ''
  const selected = tribeId === OPS_FIELD_UNKNOWN ? null : findApprovedPair(tribeId, bg, end)
  const canApply = canApplyColorPick(bg, end) && !pending
  // 값이 적혀 있는데 형식이 틀린 칸만 문장을 보인다(비어 있는 칸은 아직 안 적은 것이다).
  const bgError = (bg !== '' ? validateEditedColor(bg) : null) ?? fieldErrors.bg
  const endError = (end !== '' ? validateEditedColor(end) : null) ?? fieldErrors.end

  const setPick = (next: { bg: string; end: string }) => {
    setError(null)
    setFieldErrors({})
    ctx.setColorPick?.({ itemId: item.id, ...next })
  }

  const apply = async () => {
    setPending(true)
    setError(null)
    setFieldErrors({})
    const result = await postDecision(bundleId, { action: 'fill_color', itemId: item.id, bg, end, expectedUpdatedAt: item.updatedAt })
    setPending(false)
    if (result.ok) {
      ctx.setColorPick?.(null)
      onFilled(item.id)
      return
    }
    setFieldErrors(result.fieldErrors)
    setError(result.error)
    if (result.status === 409) onConflict()
  }

  return (
    <section aria-label="색 고르기" className="mb-4 space-y-3 rounded-md border border-border p-3">
      <div className="space-y-0.5">
        <h4 className="text-sm font-semibold text-foreground">색을 골라 주세요</h4>
        <p className="text-xs text-muted-foreground">색을 채우면 이미지 제작에 쓰여요. 승인 전에 채워 주세요</p>
      </div>

      {pairs.length > 0 ? (
        <ul className="space-y-1.5" aria-label="승인된 색 쌍">
          {pairs.map((pair) => {
            const active = selected === pair
            return (
              <li key={pair.name}>
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={pending}
                  onClick={() => setPick({ bg: pair.bg, end: pair.end })}
                  className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 ${
                    active ? 'border-foreground bg-muted' : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <Swatch text={pair.bg} />
                  <Swatch text={pair.end} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words font-medium text-foreground">{pair.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {pair.bg} → {pair.end}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">승인된 색 쌍이 아직 없어요. 아래에 직접 적어 주세요</p>
      )}

      <div className="space-y-3">
        <div className="space-y-1">
          <BackgroundColorField
            label="시작색"
            value={bg}
            onChange={(next) => setPick({ bg: next, end })}
            helperText="#rrggbb 형식으로 적어 주세요. 예: #1a2b3c"
            compact
          />
          {bgError && (
            <p role="alert" className="break-words text-xs font-medium text-destructive">
              {bgError}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <BackgroundColorField
            label="끝색"
            value={end}
            onChange={(next) => setPick({ bg, end: next })}
            helperText="#rrggbb 형식으로 적어 주세요. 예: #1a2b3c"
            compact
          />
          {endError && (
            <p role="alert" className="break-words text-xs font-medium text-destructive">
              {endError}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="break-words text-xs font-medium text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button type="button" disabled={!canApply} onClick={() => void apply()}>
          {pending ? '적용하는 중' : '적용하기'}
        </Button>
      </div>
    </section>
  )
}
