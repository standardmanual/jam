import type { BadgeTemplateClassKey } from '../resolveTemplateText'
import type { BadgeTemplateDef } from '../templateDef'
import { METRIC_TEMPLATE } from './metric'

export const BADGE_TEMPLATE_DEFS: Partial<Record<BadgeTemplateClassKey, BadgeTemplateDef>> = {
  metric: METRIC_TEMPLATE,
}

export function getBadgeTemplateDef(classKey: BadgeTemplateClassKey): BadgeTemplateDef | null {
  return BADGE_TEMPLATE_DEFS[classKey] ?? null
}
