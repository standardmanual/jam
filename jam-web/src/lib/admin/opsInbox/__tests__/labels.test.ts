/**
 * 받은 기획함 이름표·표기 함수 (티켓 20260930_1817)
 */
import { describe, it, expect } from 'vitest'
import { OPS_ITEM_KINDS, OPS_ITEM_STATUSES } from '@/lib/admin/opsInbox/constants'
import { OPS_INBOX_TABS, OPS_STAGES } from '@/lib/admin/opsInbox/bundleStatus'
import {
  OPS_BUNDLE_STAGE_LABELS,
  OPS_INBOX_TAB_LABELS,
  OPS_ITEM_KIND_LABELS,
  OPS_ITEM_STATUS_LABELS,
  OPS_STAGE_BAR_LABELS,
  editPathLabel,
  formatDiffValue,
  formatErrorPathLabel,
  formatKstClock,
  formatKstDay,
  formatKstDayTime,
  formatWeekRange,
  kindLabel,
  kstDateKey,
  parseFormatErrorPath,
  splitFormatError,
} from '@/lib/admin/opsInbox/labels'
import { validateOpsBundle } from '@/lib/admin/opsInbox/validate'

describe('이름표 표는 허용값을 빠짐없이 다룬다', () => {
  it('종류 7개', () => {
    for (const kind of OPS_ITEM_KINDS) expect(OPS_ITEM_KIND_LABELS[kind]).toBeTruthy()
  })

  it('항목 상태 10개(「도착」은 화면에서 「새로 도착」)', () => {
    for (const status of OPS_ITEM_STATUSES) expect(OPS_ITEM_STATUS_LABELS[status]).toBeTruthy()
    expect(OPS_ITEM_STATUS_LABELS.arrived).toBe('새로 도착')
  })

  it('표시줄 6단계와 묶음 단계·탭', () => {
    for (const stage of OPS_STAGES) {
      expect(OPS_STAGE_BAR_LABELS[stage]).toBeTruthy()
      expect(OPS_BUNDLE_STAGE_LABELS[stage]).toBeTruthy()
    }
    expect(OPS_BUNDLE_STAGE_LABELS.review).toBe('검토중')
    expect(OPS_BUNDLE_STAGE_LABELS.prepare).toBe('준비중')
    for (const tab of OPS_INBOX_TABS) expect(OPS_INBOX_TAB_LABELS[tab]).toBeTruthy()
  })
})

describe('kindLabel', () => {
  it('허용값은 이름표로 바꾼다', () => {
    expect(kindLabel('home_feed_card')).toBe('홈피드 카드')
    expect(kindLabel('jam_badge')).toBe('JAM! 배지')
  })

  it('허용값 밖·빈 값은 「종류 확인 필요」다', () => {
    expect(kindLabel('banner')).toBe('종류 확인 필요')
    expect(kindLabel(null)).toBe('종류 확인 필요')
    expect(kindLabel('')).toBe('종류 확인 필요')
    // 객체 기본 속성 이름이 이름표로 새지 않는다
    expect(kindLabel('constructor')).toBe('종류 확인 필요')
    expect(kindLabel('toString')).toBe('종류 확인 필요')
  })
})

describe('formatWeekRange', () => {
  it('2026-W41은 10/5~10/11이다(월~일)', () => {
    expect(formatWeekRange('2026-W41')).toEqual({ label: '41주차', range: '10/5~10/11' })
  })

  it('앞자리 0은 뗀다', () => {
    expect(formatWeekRange('2026-W07')?.label).toBe('7주차')
  })

  it('연도 경계: 1주차는 전 해 12월에서 시작할 수 있다', () => {
    expect(formatWeekRange('2025-W01')).toEqual({ label: '1주차', range: '12/30~1/5' })
    expect(formatWeekRange('2026-W01')).toEqual({ label: '1주차', range: '12/29~1/4' })
  })

  it('연도 경계: 마지막 주차는 다음 해 1월에서 끝날 수 있다', () => {
    // 2026년은 53주차가 있다(1월 1일이 목요일)
    expect(formatWeekRange('2026-W53')).toEqual({ label: '53주차', range: '12/28~1/3' })
    expect(formatWeekRange('2025-W52')).toEqual({ label: '52주차', range: '12/22~12/28' })
  })

  it('그 해에 없는 주차는 null이다', () => {
    expect(formatWeekRange('2025-W53')).toBeNull()
    expect(formatWeekRange('2026-W54')).toBeNull()
    expect(formatWeekRange('2026-W00')).toBeNull()
  })

  it('형식이 틀리거나 값이 없으면 null이다', () => {
    expect(formatWeekRange('2026-41')).toBeNull()
    expect(formatWeekRange('26-W41')).toBeNull()
    expect(formatWeekRange('2026-W4')).toBeNull()
    expect(formatWeekRange('')).toBeNull()
    expect(formatWeekRange(null)).toBeNull()
    expect(formatWeekRange(undefined)).toBeNull()
  })
})

describe('splitFormatError', () => {
  it('첫 「: 」에서 자른다', () => {
    expect(splitFormatError('items[2].kind: 허용되지 않는 종류예요(받은 값: "x"). 허용값: home_feed_card')).toEqual({
      path: 'items[2].kind',
      reason: '허용되지 않는 종류예요(받은 값: "x"). 허용값: home_feed_card',
    })
  })

  it('사유 안의 「: 」는 자르지 않는다', () => {
    expect(splitFormatError('week: 형식이어야 해요: YYYY-Www').reason).toBe('형식이어야 해요: YYYY-Www')
  })

  it('「: 」가 없으면 경로는 비고 문장 전체가 사유다', () => {
    expect(splitFormatError('알 수 없는 오류예요')).toEqual({ path: '', reason: '알 수 없는 오류예요' })
  })
})

describe('formatErrorPathLabel · parseFormatErrorPath', () => {
  it('items[n]. 앞부분을 떼고 마지막 키를 이름표로 바꾼다', () => {
    expect(formatErrorPathLabel('items[2].starts_at')).toBe('공개 시각')
    expect(formatErrorPathLabel('items[0].ends_at')).toBe('종료 시각')
    expect(formatErrorPathLabel('items[1].item_key')).toBe('항목 키')
    expect(formatErrorPathLabel('items[1].kind')).toBe('종류')
    expect(formatErrorPathLabel('items[1].pattern_no')).toBe('패턴 번호')
    expect(formatErrorPathLabel('items[1].user_experience')).toBe('유저가 겪는 것')
  })

  it('중첩 경로는 마지막 키를 쓴다', () => {
    expect(formatErrorPathLabel('items[0].world_review')).toBe('세계관 검수')
    expect(formatErrorPathLabel('items[0].world_review.world_related')).toBe('세계관 관련 여부')
    expect(formatErrorPathLabel('items[0].world_review.winter_reviewed')).toBe('윈터 검수 여부')
    expect(formatErrorPathLabel('items[0].world_review.reason')).toBe('검수 이유')
  })

  it('배열 칸(links[0])은 배열 이름표를 쓴다', () => {
    expect(formatErrorPathLabel('items[3].links[1]')).toBe('연결')
    expect(formatErrorPathLabel('items[3].links')).toBe('연결')
  })

  it('묶음 최상위 경로', () => {
    expect(formatErrorPathLabel('week')).toBe('주차')
    expect(formatErrorPathLabel('hypothesis')).toBe('가설')
    expect(formatErrorPathLabel('routine_run')).toBe('루틴 실행 기록')
    expect(formatErrorPathLabel('world_review.reason')).toBe('검수 이유')
  })

  it('나머지 안쪽 키 이름표(문안·색·대상·항목 목록)', () => {
    expect(formatErrorPathLabel('items[0].copy')).toBe('문안')
    expect(formatErrorPathLabel('items[0].colors')).toBe('색')
    expect(formatErrorPathLabel('items[0].segment')).toBe('대상')
    expect(formatErrorPathLabel('items')).toBe('항목 목록')
  })

  it('항목 전체에 걸린 오류(items[3])는 「항목」이고 몇 번째인지 담는다', () => {
    expect(parseFormatErrorPath('items[3]')).toEqual({ itemPosition: 3, label: '항목' })
    expect(parseFormatErrorPath('items[2].kind')).toEqual({ itemPosition: 2, label: '종류' })
    expect(parseFormatErrorPath('week')).toEqual({ itemPosition: null, label: '주차' })
  })

  it('모르는 경로는 그대로 둔다', () => {
    expect(formatErrorPathLabel('items[0].mystery')).toBe('mystery')
    expect(formatErrorPathLabel('something.else')).toBe('something.else')
    expect(formatErrorPathLabel('')).toBe('')
  })

  it('객체 기본 속성 이름이 이름표로 새지 않는다', () => {
    expect(formatErrorPathLabel('items[0].constructor')).toBe('constructor')
    expect(formatErrorPathLabel('__proto__')).toBe('__proto__')
  })

  it('validate.ts가 실제로 내는 경로는 모두 이름표가 있다(안 바뀌는 경로가 새로 생기면 여기서 잡는다)', () => {
    const result = validateOpsBundle({
      bundle_id: 'b',
      author: 'a',
      week: 'oops',
      hypothesis: 3,
      color_rationale_link: 3,
      routine_run: 3,
      items: [
        5,
        {
          item_key: '',
          kind: 'banner',
          pattern_no: {},
          starts_at: 'x',
          ends_at: 'y',
          links: ['nope'],
          world_review: { world_related: 'yes', winter_reviewed: 'no', reason: 3, extra: 1 },
        },
      ],
    })
    expect(result.errors.length).toBeGreaterThan(8)
    for (const message of result.errors) {
      const { path } = splitFormatError(message)
      const label = formatErrorPathLabel(path)
      expect(label, `경로 「${path}」`).not.toBe(path.replace(/^items\[\d+\]\./, ''))
    }
  })
})

describe('KST 시각 표기', () => {
  // 2026-10-01T00:12:00Z = KST 2026-10-01(목) 09:12
  it('「10/1(목) 09:12」', () => {
    expect(formatKstDayTime('2026-10-01T00:12:00Z')).toBe('10/1(목) 09:12')
  })

  it('UTC 자정 직전은 KST로 다음 날이다', () => {
    expect(formatKstDay('2026-10-05T15:30:00Z')).toBe('10/6(화)')
    expect(kstDateKey('2026-10-05T15:30:00Z')).toBe('2026-10-06')
    expect(formatKstClock('2026-10-05T15:30:00Z')).toBe('00:30')
  })

  it('시간대가 붙은 값도 KST로 맞춘다', () => {
    expect(formatKstDay('2026-10-06T09:00:00+09:00')).toBe('10/6(화)')
    expect(formatKstClock('2026-10-06T09:00:00+09:00')).toBe('09:00')
  })

  it('요일: 2026-10-05는 월요일이다', () => {
    expect(formatKstDay('2026-10-05T09:00:00+09:00')).toBe('10/5(월)')
  })

  it('읽을 수 없는 값은 null이다', () => {
    expect(kstDateKey(null)).toBeNull()
    expect(kstDateKey('')).toBeNull()
    expect(kstDateKey('not-a-date')).toBeNull()
    expect(formatKstDayTime('nope')).toBeNull()
    expect(formatKstClock(undefined)).toBeNull()
  })
})

describe('직접 수정 이름표 (티켓 20260930_1818)', () => {
  it('editPathLabel: 문안·색은 「종류 · 키」, 나머지는 쉬운 이름', () => {
    expect(editPathLabel('copy.body')).toBe('문안 · body')
    expect(editPathLabel('colors.background')).toBe('색 · background')
    expect(editPathLabel('starts_at')).toBe('공개 시각')
    expect(editPathLabel('ends_at')).toBe('종료 시각')
    expect(editPathLabel('segment')).toBe('대상')
    expect(editPathLabel('user_experience')).toBe('유저가 겪는 것')
    expect(editPathLabel('unknown.path')).toBe('unknown.path')
  })

  it('formatDiffValue: 비면 「(없음)」, 시각은 KST, 나머지는 그대로', () => {
    expect(formatDiffValue('copy.body', '')).toBe('(없음)')
    expect(formatDiffValue('starts_at', null)).toBe('(없음)')
    expect(formatDiffValue('starts_at', '2026-10-05T00:00:00.000Z')).toBe('10/5(월) 09:00')
    expect(formatDiffValue('copy.body', '오늘은 비가 와요')).toBe('오늘은 비가 와요')
  })
})
