import type { BadgeTemplateClassKey } from '../resolveTemplateText'
import type { BadgeTemplateDef } from '../templateDef'
import { COUNT_TEMPLATE } from './count'
import { METRIC_TEMPLATE } from './metric'
import { STREAK_TEMPLATE } from './streak'

export const BADGE_TEMPLATE_DEFS: Partial<Record<BadgeTemplateClassKey, BadgeTemplateDef>> = {
  count: COUNT_TEMPLATE,
  metric: METRIC_TEMPLATE,
  streak: STREAK_TEMPLATE,
}

export function getBadgeTemplateDef(classKey: BadgeTemplateClassKey): BadgeTemplateDef | null {
  return BADGE_TEMPLATE_DEFS[classKey] ?? null
}
