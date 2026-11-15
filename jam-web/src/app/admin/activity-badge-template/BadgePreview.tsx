'use client'

/**
 * 고른 배지와 그 분류의 템플릿으로 미리보기를 그린다 (티켓 20261116_0555).
 * 상태: 배지 선택 전 / 분류 없음 / 템플릿 없음 / 정상.
 */
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/admin/ui/badge'
import { Button } from '@/components/admin/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card'
import { slotLabelOf } from '@/lib/admin/badge-families'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import type { StudioSearchBadge } from './BadgePicker'
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

function ReadyPreview({ badge, template }: { badge: StudioSearchBadge; template: TemplateItem }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [notes, setNotes] = useState<string[]>([])
  const [failed, setFailed] = useState(false)

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
  }, [badge.name, badge.templateValue, template.svg, template.slots])

  return (
    <div className="space-y-3">
      {failed ? (
        <PreviewMessage>미리보기를 그리지 못했어요. 템플릿을 다시 올린 뒤 시도해 주세요.</PreviewMessage>
      ) : (
        <canvas ref={canvasRef} className="w-full max-w-[480px] h-auto rounded-md border" />
      )}
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
      {!failed && notes.length > 0 && (
        <ul className={`space-y-1 text-xs text-muted-foreground ${WRAP}`}>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function BadgePreview({
  badge,
  templates,
  onGoToTemplates,
}: {
  badge: StudioSearchBadge | null
  templates: TemplateItem[]
  onGoToTemplates: () => void
}) {
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
      state = <ReadyPreview key={badge.id} badge={badge} template={template} />
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
