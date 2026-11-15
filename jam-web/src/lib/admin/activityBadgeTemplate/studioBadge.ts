/**
 * 배지 행에서 제작 화면용 분류·값을 뽑는 순수 함수 (티켓 20261116_0535).
 */
import type { BadgeCondition } from '@/types/database'
import { BADGE_TEMPLATE_CLASS_LABEL, resolveBadgeTemplateText, type BadgeTemplateClassKey } from './resolveTemplateText'

export interface StudioBadgeFields {
  templateClass: BadgeTemplateClassKey | null
  templateClassLabel: string | null
  templateValue: string | null
  familyKey: string | null
}

export function toStudioBadgeFields(row: {
  condition_json: BadgeCondition | null | undefined
  is_hidden?: boolean | null
  family_key?: string | null
}): StudioBadgeFields {
  const text = resolveBadgeTemplateText({ condition_json: row.condition_json, is_hidden: row.is_hidden })
  return {
    templateClass: text?.classKey ?? null,
    templateClassLabel: text ? BADGE_TEMPLATE_CLASS_LABEL[text.classKey] : null,
    templateValue: text?.value ?? null,
    familyKey: row.family_key ?? null,
  }
}
