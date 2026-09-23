/**
 * 특일 → 노출 태그 분리 (티켓 20260924_0805)
 * 대상 목록 원본: jam-doc/planning/content/SPECIAL_DAYS.md 「확정 내용」.
 * 절기·음력 날짜는 해마다 바뀌므로 날짜가 아니라 이름으로 고른다.
 */
import type { SpecialDay } from './holidays'

export type SpecialDayTag = 'holiday_today' | 'seasonal_today' | 'anniversary_today'

/** 쉬는 날이지만 holiday_today에서 뺀다 (이름에 포함되면 제외) */
export const HOLIDAY_EXCLUDED_NAMES: readonly string[] = ['전국동시지방선거', '제헌절']

/** seasonal_today: 24절기 8개 + 잡절 3개 (잡절은 계절 풍습이라 이 태그에 합쳤다) */
export const SEASONAL_ALLOWED_NAMES: readonly string[] = [
  '입춘', '경칩', '대서', '입추', '처서', '입동', '대설', '동지',
  '정월대보름', '말복', '칠석',
]

/** anniversary_today: 기념일 10개 (공백을 없앤 표기로 비교한다) */
export const ANNIVERSARY_ALLOWED_NAMES: readonly string[] = [
  '식목일', '근로자의날', '어린이날', '어버이날', '부부의날',
  '환경의날', '섬의날', '푸른하늘의날', '청년의날', '스포츠의날',
]

/** API 표기 차이("어린이 날" / "어린이날")를 흡수하려고 공백을 없앤다 */
function normalizeName(name: string): string {
  return name.replace(/\s+/g, '')
}

/**
 * 오늘의 특일 목록에서 켤 태그를 고른다. 한 날이 여러 태그를 켤 수 있다
 * (노동절·어린이날은 holiday_today와 anniversary_today가 함께 켜진다). 순수 함수.
 */
export function specialDayTags(days: readonly SpecialDay[]): SpecialDayTag[] {
  const tags = new Set<SpecialDayTag>()
  for (const { name, type } of days) {
    const n = normalizeName(name)
    if (type === 'holiday' && !HOLIDAY_EXCLUDED_NAMES.some((ex) => n.includes(ex))) {
      tags.add('holiday_today')
    }
    if ((type === 'seasonal' || type === 'sundry') && SEASONAL_ALLOWED_NAMES.includes(n)) {
      tags.add('seasonal_today')
    }
    if (type === 'anniversary' && ANNIVERSARY_ALLOWED_NAMES.includes(n)) {
      tags.add('anniversary_today')
    }
  }
  return [...tags]
}
