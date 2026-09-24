/**
 * 어드민 메인 캘린더의 크론 일정 계산 (티켓 20260924_0904)
 *
 * `vercel.json`의 `crons`가 유일한 원천이다 — 크론 이름·주기를 이 파일에 따로 적지 않고
 * 그 배열을 그대로 읽어 파싱한다. 표시용 한국어 이름만 경로를 키로 별도 매핑해 둔다.
 *
 * cron 식은 "분 시 일 월 요일" 5필드 표준을 따른다. 이 함수는 분·시(1·2번째 필드)와
 * 요일(5번째 필드)만 해석한다 — 일·월(3·4번째 필드)은 현재 4개 크론이 모두 '*'라 검사하지
 * 않는다. 둘 중 하나라도 '*'가 아닌 크론이 추가되면 이 함수를 확장해야 한다.
 *
 * 표시 시각은 KST다. Vercel 크론은 UTC로 실행되므로 시(hour)에 9시간을 더해 KST로
 * 바꾸는데, 더한 값이 24 이상이면 실제로는 다음 날 KST에 실행된 것이라 요일도 하루
 * 밀어야 한다("날짜 경계 넘김" — external-inputs `0 21 * * *`가 그 예: UTC 21시는
 * KST로 다음날 06시다). KST는 서머타임이 없어 이 덧셈만으로 항상 정확하다
 * (`lib/notifications/kst.ts`와 동일 근거).
 */
import vercelConfig from '../../../vercel.json'
import { normalizeDateParam, shiftDateStr } from './today-calendar'

export interface CronDef {
  path: string
  schedule: string
}

export interface CronOccurrence {
  path: string
  label: string
  /** KST 기준 요일 — cron 표준과 동일하게 0=일 1=월 ... 6=토 */
  weekday: number
  /** KST 기준 시(0~23). hourly가 true면 의미 없음(항상 0) */
  hour: number
  /** KST 기준 분(0~59). hourly가 true면 의미 없음(항상 0) */
  minute: number
  /** 매시간 실행되는 크론(시 필드가 '*') — 캘린더 칸에는 시각을 나열하지 않고 한 줄로 묶는다 */
  hourly: boolean
}

const CRON_LABELS: Record<string, string> = {
  '/api/cron/poi-cleanup': 'POI 정리',
  '/api/cron/notifications': '알림 발송',
  '/api/cron/ambient-drop': '앰비언트 드랍',
  '/api/cron/external-inputs': '외부 입력 동기화',
}

/**
 * cron 필드 하나를 파싱한다. `'*'`는 그대로, 콤마 목록(`0,30`)은 숫자 배열로 바꾼다.
 * 범위·스텝(`1-5`, `*​/15`) 표기는 지원하지 않는다 — 해석할 수 없으면 `null`을 반환해
 * 호출부가 잘못된 값을 화면에 내보내지 않고 그 크론을 건너뛰게 한다.
 */
function parseCronField(field: string): number[] | '*' | null {
  if (field === '*') return '*'
  const nums = field.split(',').map((s) => Number(s.trim()))
  return nums.some((n) => Number.isNaN(n)) ? null : nums
}

/**
 * cron 식 하나를 KST 기준 주간 발생 목록으로 바꾼다.
 * 표준 5필드 형식이 아니거나 분·시·요일 필드를 해석할 수 없으면 빈 배열을 반환한다.
 */
export function cronToWeeklyOccurrences(path: string, schedule: string): CronOccurrence[] {
  const parts = schedule.trim().split(/\s+/)
  if (parts.length !== 5) return []
  const [minuteField, hourField, , , weekdayField] = parts
  const label = CRON_LABELS[path] ?? path

  const weekdaysParsed = parseCronField(weekdayField)
  if (weekdaysParsed === null) return []
  const weekdays = weekdaysParsed === '*' ? [0, 1, 2, 3, 4, 5, 6] : weekdaysParsed

  if (hourField === '*') {
    // 매시간 실행 — 시각을 나열하지 않고 요일마다 한 줄로 묶는다
    return weekdays.map((w) => ({ path, label, weekday: w, hour: 0, minute: 0, hourly: true }))
  }

  const hoursParsed = parseCronField(hourField)
  const minutesParsed = parseCronField(minuteField)
  if (hoursParsed === null || hoursParsed === '*' || minutesParsed === null) return []
  const minutes = minutesParsed === '*' ? [0] : minutesParsed

  const occurrences: CronOccurrence[] = []
  for (const w of weekdays) {
    for (const h of hoursParsed) {
      for (const m of minutes) {
        const kstHour = (h + 9) % 24
        const dayShift = h + 9 >= 24 ? 1 : 0
        occurrences.push({ path, label, weekday: (w + dayShift) % 7, hour: kstHour, minute: m, hourly: false })
      }
    }
  }
  return occurrences
}

/** `vercel.json`의 crons 전체를 KST 주간 발생 목록으로 변환한다. */
export function getWeeklyCronOccurrences(defs: CronDef[] = vercelConfig.crons): CronOccurrence[] {
  return defs.flatMap((c) => cronToWeeklyOccurrences(c.path, c.schedule))
}

/** 캘린더 칸에 표시할 시각 문자열("09:00" 또는 "매시간") */
export function formatOccurrenceTime(occ: CronOccurrence): string {
  if (occ.hourly) return '매시간'
  return `${String(occ.hour).padStart(2, '0')}:${String(occ.minute).padStart(2, '0')}`
}

/**
 * 캘린더 항목 id. 시 필드가 쉼표로 여러 값을 가지면(예: `0 6,18 * * *`) 같은 날짜에 같은
 * path로 시각이 다른 occurrence가 여러 개 생기므로, 시각을 포함해 겹치지 않게 한다
 * (티켓 20260924_0930).
 */
export function cronOccurrenceId(occ: CronOccurrence, date: string): string {
  return `${occ.path}-${date}-${formatOccurrenceTime(occ)}`
}

/** 'YYYY-MM-DD'가 속한 주의 월요일 날짜를 반환한다(KST 달력 기준) */
export function mondayOfWeek(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=일 ... 6=토
  const diffFromMonday = (weekday + 6) % 7 // 월요일까지 며칠 지났는지(월=0, 화=1, ..., 일=6)
  return shiftDateStr(dateStr, -diffFromMonday)
}

/** 주간 이동 쿼리(`?week=`) 값을 검증하고 그 주의 월요일로 정규화한다. 비었거나 잘못되면 이번 주 월요일. */
export function normalizeWeekParam(raw: string | undefined, now: Date = new Date()): string {
  return mondayOfWeek(normalizeDateParam(raw, now))
}

/** 월요일 날짜 문자열 → "2026년 9월 22일 ~ 9월 28일" 주간 범위 라벨 */
export function formatWeekRangeLabel(mondayStr: string): string {
  const sundayStr = shiftDateStr(mondayStr, 6)
  const [y1, m1, d1] = mondayStr.split('-').map(Number)
  const [, m2, d2] = sundayStr.split('-').map(Number)
  return `${y1}년 ${m1}월 ${d1}일 ~ ${m2}월 ${d2}일`
}
