/**
 * 템플릿 배지 이미지 등록 도우미 (티켓 20261116_0748). 브라우저 전용.
 * 긴 변 1024px로 다시 그린 PNG와 조정값을 6-1의 등록 API로 보낸다. 예외를 던지지 않는다.
 */
import type { TemplateBadgeParams } from '@/lib/admin/activityBadgeTemplate/templateParams'
import type { TemplateItem } from '@/lib/admin/activityBadgeTemplate/templateItem'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'
import type { StudioSearchBadge } from './BadgePicker'
import { renderTemplateBadge } from './renderTemplateBadge'

const REGISTER_LONG_SIDE_PX = 1024
const REGISTER_FAIL = '이미지를 등록하지 못했어요. 잠시 후 다시 시도해 주세요.'
const SLOT_LABEL = { name: '이름', value: '값' } as const

export type RegisterResult = { ok: true; imageUrl: string } | { ok: false; error: string }

export async function registerTemplateBadge({
  badge,
  template,
  params,
}: {
  badge: StudioSearchBadge
  template: TemplateItem
  params: TemplateBadgeParams
}): Promise<RegisterResult> {
  try {
    if (!template.svg || !template.slots) return { ok: false, error: REGISTER_FAIL }
    const canvas = document.createElement('canvas')
    const rendered = await renderTemplateBadge(canvas, {
      svg: template.svg,
      slots: template.slots,
      name: badge.name,
      value: badge.templateValue ?? '',
      longSidePx: REGISTER_LONG_SIDE_PX,
      params,
    })
    if (rendered.skipped.length > 0) {
      const labels = rendered.skipped.map((s) => SLOT_LABEL[s]).join('|')
      return { ok: false, error: `${labels} 자리를 그리지 못해 등록할 수 없어요. 잠시 후 다시 시도해 주세요.` }
    }
    const blob = await canvasToBlob(canvas)
    const form = new FormData()
    form.append('badgeId', badge.id)
    form.append('params', JSON.stringify(params))
    form.append('image', blob, 'badge.png')
    const res = await fetch('/api/admin/activity-badge-templates/register', { method: 'POST', body: form })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data) return { ok: false, error: data?.error ?? REGISTER_FAIL }
    return { ok: true, imageUrl: String(data.imageUrl ?? '') }
  } catch {
    return { ok: false, error: REGISTER_FAIL }
  }
}

export interface BatchEntry {
  name: string
  result: RegisterResult
}

export function summarizeBatch(results: BatchEntry[]): {
  total: number
  okCount: number
  failed: { name: string; error: string }[]
} {
  const failed: { name: string; error: string }[] = []
  let okCount = 0
  for (const r of results) {
    if (r.result.ok) okCount += 1
    else failed.push({ name: r.name, error: r.result.error })
  }
  return { total: results.length, okCount, failed }
}
