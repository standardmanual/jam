import type { BadgeTemplateClassKey } from '../resolveTemplateText'
import type { BadgeTemplateDef } from '../templateDef'
import { COUNT_TEMPLATE } from './count'
import { DAYS_TEMPLATE } from './days'
import { ETC_TEMPLATE } from './etc'
import { METRIC_TEMPLATE } from './metric'
import { STREAK_TEMPLATE } from './streak'

export const BADGE_TEMPLATE_DEFS: Partial<Record<BadgeTemplateClassKey, BadgeTemplateDef>> = {
  count: COUNT_TEMPLATE,
  metric: METRIC_TEMPLATE,
  days: DAYS_TEMPLATE,
  streak: STREAK_TEMPLATE,
  etc: ETC_TEMPLATE,
}

export function getBadgeTemplateDef(classKey: BadgeTemplateClassKey): BadgeTemplateDef | null {
  return BADGE_TEMPLATE_DEFS[classKey] ?? null
}
