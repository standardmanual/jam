/**
 * 액티비티 배지 템플릿 카드 — 표시만 한다 (티켓 20261116_0426).
 * 상태와 동작은 모두 props로 받는다. 템플릿 SVG는 <img>로만 그린다(문서에 직접 끼우지 않는다).
 */
import { useRef } from 'react'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { formatKstYmdHm } from '@/lib/admin/kst-format'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import type { TemplateSlot, TemplateSlots } from '@/lib/admin/activityBadgeTemplate/templateSvg'

export type TemplatePending =
  | { kind: 'ready'; fileName: string; svg: string; rawSvg: string; removed: string[]; slots: TemplateSlots }
  | { kind: 'invalid'; fileName: string; error: string }

export interface TemplateCardProps {
  item: TemplateItem
  pending: TemplatePending | null
  busy: boolean
  onPickFile: (file: File) => void
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}

const VALUE_EXAMPLE: Record<TemplateItem['classKey'], string> = {
  metric: '값의 예: 21.1km, 1,947m, 1시간 30분',
  days: '값의 예: 100일, 5주, 3년',
  streak: '값의 예: 14일 연속, 4주 연속, 7일 만에',
  count: '값의 예: 5회, 50개, 잼 1,250, 챕터 10',
}

const WRAP = 'break-keep wrap-break-word'

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function describeSlot(slot: TemplateSlot): string {
  const parts = [
    slot.placeholder ? `“${slot.placeholder}”` : null,
    slot.fontFamily,
    slot.fontSize !== null ? `${slot.fontSize}px` : null,
    slot.fill,
  ]
  return parts.filter((p): p is string => !!p).join(' · ')
}

export default function TemplateCard({ item, pending, busy, onPickFile, onSave, onCancel, onDelete }: TemplateCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const ready = pending?.kind === 'ready' ? pending : null
  const invalid = pending?.kind === 'invalid' ? pending : null
  const registered = item.svg !== null
  const shownSvg = ready ? ready.svg : item.svg
  const shownSlots = ready ? ready.slots : item.slots
  const openPicker = () => inputRef.current?.click()

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className={`text-base ${WRAP}`}>{item.label}</CardTitle>
        <Badge variant={registered ? 'default' : 'secondary'}>{registered ? '등록됨' : '없음'}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className={`text-sm text-muted-foreground ${WRAP}`}>{VALUE_EXAMPLE[item.classKey]}</p>

        <div className="max-w-xs">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-muted">
            {shownSvg ? (
              // eslint-disable-next-line @next/next/no-img-element -- data URL 미리보기라 next/image가 맞지 않음
              <img src={svgToDataUrl(shownSvg)} alt={`${item.label} 템플릿 미리보기`} className="h-full w-full object-contain" />
            ) : (
              <p className={`text-sm text-muted-foreground ${WRAP}`}>아직 템플릿이 없어요</p>
            )}
          </div>
          <p className={`mt-1 text-xs text-muted-foreground ${WRAP}`}>미리보기의 글자는 이 컴퓨터에 설치된 글꼴로 보여요.</p>
        </div>

        {shownSlots && (
          <dl className="space-y-1 text-sm">
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground whitespace-nowrap">이름 자리</dt>
              <dd className={WRAP}>{describeSlot(shownSlots.name)}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-muted-foreground whitespace-nowrap">값 자리</dt>
              <dd className={WRAP}>{describeSlot(shownSlots.value)}</dd>
            </div>
            {shownSlots.viewBoxWidth !== null && shownSlots.viewBoxHeight !== null && (
              <div className="flex gap-2">
                <dt className="w-16 shrink-0 text-muted-foreground whitespace-nowrap">크기</dt>
                <dd>{`${shownSlots.viewBoxWidth} × ${shownSlots.viewBoxHeight}`}</dd>
              </div>
            )}
          </dl>
        )}

        {registered && !ready && item.updatedAt && (
          <p className={`text-xs text-muted-foreground ${WRAP}`}>
            {formatKstYmdHm(item.updatedAt)} · {item.updatedBy}
          </p>
        )}

        {ready && (
          <div className="space-y-2 rounded-md border p-3">
            <p className={`text-sm font-medium ${WRAP}`}>저장하기 전에 확인해 주세요</p>
            <p className={`text-xs text-muted-foreground ${WRAP}`}>{ready.fileName}</p>
            {ready.removed.length > 0 && (
              <div className={`text-xs ${WRAP}`}>
                <p>안전을 위해 {ready.removed.length}가지를 걷어 냈어요</p>
                <ul className="list-disc pl-4 text-muted-foreground">
                  {ready.removed.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {invalid && (
          <Alert variant="destructive">
            <AlertDescription className={WRAP}>{invalid.error}</AlertDescription>
          </Alert>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".svg,image/svg+xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onPickFile(file)
          }}
        />

        <div className="flex flex-wrap gap-2">
          {ready ? (
            <>
              <Button disabled={busy} onClick={onSave}>저장</Button>
              <Button variant="outline" disabled={busy} onClick={onCancel}>취소</Button>
            </>
          ) : invalid ? (
            <>
              <Button disabled={busy} onClick={openPicker}>다른 파일 고르기</Button>
              <Button variant="outline" disabled={busy} onClick={onCancel}>취소</Button>
            </>
          ) : registered ? (
            <>
              <Button variant="outline" disabled={busy} onClick={openPicker}>바꾸기</Button>
              <Button variant="outline" disabled={busy} onClick={onDelete}>지우기</Button>
            </>
          ) : (
            <Button disabled={busy} onClick={openPicker}>SVG 올리기</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
