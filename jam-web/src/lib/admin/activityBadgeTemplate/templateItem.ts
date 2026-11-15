/**
 * 템플릿 API 두 라우트가 함께 쓰는 분류 목록과 응답 항목 모양 (티켓 20261116_0234).
 */
import { BADGE_TEMPLATE_CLASS_LABEL, type BadgeTemplateClassKey } from './resolveTemplateText'

export const TEMPLATE_CLASS_KEYS: BadgeTemplateClassKey[] = ['metric', 'days', 'streak', 'count']

export function isTemplateClassKey(v: string): v is BadgeTemplateClassKey {
  return (TEMPLATE_CLASS_KEYS as string[]).includes(v)
}

export interface TemplateItem {
  classKey: BadgeTemplateClassKey
  label: string
  svg: string | null
  slots: Record<string, unknown> | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface TemplateRowLike {
  svg: string
  slots: unknown
  updated_at: string
  updated_by: string | null
}

export function toTemplateItem(classKey: BadgeTemplateClassKey, row: TemplateRowLike | null | undefined): TemplateItem {
  return {
    classKey,
    label: BADGE_TEMPLATE_CLASS_LABEL[classKey],
    svg: row?.svg ?? null,
    slots: row ? (row.slots as Record<string, unknown>) : null,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  }
}
