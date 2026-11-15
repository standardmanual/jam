'use client'

/**
 * 고른 배지와 그 분류의 템플릿으로 미리보기를 그린다 (티켓 20261116_0555).
 * 상태: 배지 선택 전 / 분류 없음 / 템플릿 없음 / 정상.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/admin/ui/alert'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { slotLabelOf } from '@/lib/admin/badge-families'
import { stripSlotText } from '@/lib/admin/activityBadgeTemplate/composeTemplate'
import { extractSvgColors } from '@/lib/admin/activityBadgeTemplate/templateColors'
import type { TemplateBadgeParams } from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import type { StudioSearchBadge } from './BadgePicker'
import BadgeAdjustPanel from './BadgeAdjustPanel'
import { renderTemplateBadge, type RenderTemplateBadgeResult } from './renderTemplateBadge'

const WRAP = 'break-keep wrap-break-word'
const SLOT_LABEL = { name: '이름', value: '값' } as const

export function previewNotes(r: RenderTemplateBadgeResult): string[] {
  const notes: string[] = []
  for (const f of r.fontFallbacks) {
    notes.push(
      f.requestedFamily
        ? `${SLOT_LABEL[f.slot]} 자리의 글꼴 ${f.requestedFamily}를 구글 폰트에서 찾지 못해 기본 글꼴로 보여요.`
        : `${SLOT_LABEL[f.slot]} 자리에 글꼴 정보가 없어 기본 글꼴로 보여요.`
    )
  }
  for (const s of r.shrunk) notes.push(`${SLOT_LABEL[s]}이 길어서 글자 크기를 줄였어요.`)
  for (const s of r.skipped) {
    notes.push(`${SLOT_LABEL[s]} 자리의 위치를 읽지 못해 글자를 그리지 못했어요. 템플릿을 다시 올려 주세요.`)
  }
  return notes
}

export function PreviewMessage({ children }: { children: React.ReactNode }) {
  return <p className={`text-sm text-muted-foreground ${WRAP}`}>{children}</p>
}

interface AdjustProps {
  params: TemplateBadgeParams
  onParamsChange: (next: TemplateBadgeParams) => void
  onParamsReset: () => void
}

export interface RegisterProps {
  /** 등록·일괄 등록 중이면 버튼과 조정 패널을 잠근다 */
  busy: boolean
  /** 일괄 등록 진행: {i} / {n} */
  progress: { index: number; total: number } | null
  failures: { name: string; error: string }[]
  /** 조정값을 저장된 값에서 불러왔을 때 */
  loadedNotice: boolean
  onRegister: () => void
  onRegisterFamily: () => void
}

function ReadyPreview({
  badge,
  template,
  params,
  onParamsChange,
  onParamsReset,
  busy,
  progress,
  failures,
  loadedNotice,
  onRegister,
  onRegisterFamily,
}: { badge: StudioSearchBadge; template: TemplateItem } & AdjustProps & RegisterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [failed, setFailed] = useState(false)
  const colors = useMemo(() => (template.svg ? extractSvgColors(stripSlotText(template.svg)) : []), [template.svg])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !template.svg || !template.slots) return
    let cancelled = false
    setFailed(false)
    renderTemplateBadge(canvas, {
      svg: template.svg,
      slots: template.slots,
      name: badge.name,
      value: badge.templateValue ?? '',
      longSidePx: 1024,
      params,
    })
      .then((r) => {
        if (!cancelled) setNotes(previewNotes(r))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [badge.name, badge.templateValue, template.svg, template.slots, params])

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,480px)_minmax(0,1fr)]">
      <div className="space-y-3">
        {loadedNotice && <PreviewMessage>이 배지에 저장된 조정값을 불러왔어요</PreviewMessage>}
        {failed && <PreviewMessage>미리보기를 그리지 못했어요. 템플릿을 다시 올린 뒤 시도해 주세요.</PreviewMessage>}
        {/* 실패해도 캔버스를 남겨 둔다. 지우면 템플릿을 다시 올렸을 때 다시 그릴 자리가 없다. */}
        <canvas ref={canvasRef} className={failed ? 'hidden' : 'w-full max-w-[480px] h-auto rounded-md border'} />
        <dl className={`space-y-1 text-sm ${WRAP}`}>
          <div className="flex gap-2">
            <dt className="w-10 text-muted-foreground">이름</dt>
            <dd>{badge.name}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-10 text-muted-foreground">값</dt>
            <dd>{badge.templateValue ?? '-'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-10 text-muted-foreground">분류</dt>
            <dd>{badge.templateClassLabel}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy || failed} onClick={onRegister}>
            등록
          </Button>
          {badge.familyKey && (
            <Button size="sm" variant="outline" disabled={busy || failed} onClick={onRegisterFamily}>
              같은 계열 모두 등록
            </Button>
          )}
        </div>
        {progress && (
          <PreviewMessage>
            {progress.index} / {progress.total} 등록하는 중이에요
          </PreviewMessage>
        )}
        {failures.length > 0 && (
          <Alert variant="destructive">
            <AlertTitle className={WRAP}>등록하지 못한 배지</AlertTitle>
            <AlertDescription>
              <ul className={`space-y-1 ${WRAP}`}>
                {failures.map((f, index) => (
                  <li key={index}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {!failed && notes.length > 0 && (
          <ul className={`space-y-1 text-xs text-muted-foreground ${WRAP}`}>
            {notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      {template.slots && (
        // 등록하는 동안 조정을 잠근다(슬라이더 등 버튼이 아닌 입력도 막으려고 inert를 쓴다).
        <div inert={busy} className={busy ? 'opacity-60' : undefined}>
          <BadgeAdjustPanel
            params={params}
            onChange={onParamsChange}
            onReset={onParamsReset}
            colors={colors}
            slots={template.slots}
          />
        </div>
      )}
    </div>
  )
}

export default function BadgePreview({
  badge,
  templates,
  onGoToTemplates,
  params,
  onParamsChange,
  onParamsReset,
  ...register
}: {
  badge: StudioSearchBadge | null
  templates: TemplateItem[]
  onGoToTemplates: () => void
} & AdjustProps &
  RegisterProps) {
  let body: React.ReactNode
  if (!badge) {
    body = <PreviewMessage>배지를 검색해서 골라 주세요</PreviewMessage>
  } else {
    const template = badge.templateClass ? templates.find((t) => t.classKey === badge.templateClass) : undefined
    let state: React.ReactNode
    if (!badge.templateClass) {
      state = (
        <PreviewMessage>
          이 배지는 분류를 정하지 못했어요. 획득 조건이 템플릿 규칙에 없는 종류예요. 규칙을 더해야 하니 개발 요청을 남겨 주세요.
        </PreviewMessage>
      )
    } else if (!template?.svg || !template.slots) {
      state = (
        <div className="space-y-3">
          <PreviewMessage>
            {badge.templateClassLabel} 템플릿이 아직 없어요. 템플릿 탭에서 SVG를 올려 주세요.
          </PreviewMessage>
          <Button size="sm" variant="outline" onClick={onGoToTemplates}>
            템플릿 탭으로 가기
          </Button>
        </div>
      )
    } else {
      state = <ReadyPreview
          key={badge.id}
          badge={badge}
          template={template}
          params={params}
          onParamsChange={onParamsChange}
          onParamsReset={onParamsReset}
          {...register}
        />
    }
    body = (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-medium ${WRAP}`}>{badge.name}</span>
          <Badge variant="outline">{slotLabelOf(badge)}</Badge>
          {badge.templateClassLabel && <Badge variant="secondary">{badge.templateClassLabel}</Badge>}
        </div>
        {state}
      </div>
    )
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className={WRAP}>미리보기</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
