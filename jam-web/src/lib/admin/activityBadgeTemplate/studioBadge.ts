/**
 * 배지 행에서 제작 화면용 분류·값을 뽑는 순수 함수 (티켓 20261116_0535).
 */
import type { BadgeCondition } from '@/types/database'
import { parseTemplateBadgeParams, type TemplateBadgeParams } from './templateParams'
import { BADGE_TEMPLATE_CLASS_LABEL, resolveBadgeTemplateText, type BadgeTemplateClassKey } from './resolveTemplateText'

export interface StudioBadgeFields {
  templateClass: BadgeTemplateClassKey | null
  templateClassLabel: string | null
  templateValue: string | null
  familyKey: string | null
  /** 저장된 템플릿 조정값. 옛 생성기 값이거나 없으면 null */
  templateParams: TemplateBadgeParams | null
}

export function toStudioBadgeFields(row: {
  condition_json: BadgeCondition | null | undefined
  is_hidden?: boolean | null
  family_key?: string | null
  image_gen_params?: unknown
}): StudioBadgeFields {
  const text = resolveBadgeTemplateText({ condition_json: row.condition_json, is_hidden: row.is_hidden })
  return {
    templateClass: text?.classKey ?? null,
    templateClassLabel: text ? BADGE_TEMPLATE_CLASS_LABEL[text.classKey] : null,
    templateValue: text?.value ?? null,
    familyKey: row.family_key ?? null,
    templateParams: parseTemplateBadgeParams(row.image_gen_params),
  }
}
