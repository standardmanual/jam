/**
 * 운영 홈·일정표의 이동 링크 (티켓 20261006_1339 ②-a)
 *
 * 지키는 것: `?sample=1` 읽기(서버 쿼리 객체·URLSearchParams 둘 다)와 이어 붙이기·빼기(다른 키·해시 유지, 중복 없음),
 * 이동 대상 판정(항목 → 기획 상세의 그 항목, 묶음만 → 기획 상세, 날짜만 → `/admin/today?date=`, 없으면 null), 켜져 있을 때 `sample=1` 이어 붙임.
 */
import { describe, expect, it } from 'vitest'
import {
  SAMPLE_PARAM,
  dayHref,
  inboxListHref,
  opsTargetHref,
  opsTargetKind,
  readIncludeSample,
  sampleToggleHref,
  scheduleHomeHref,
  scheduleHref,
  signalResultHref,
  withSampleParam,
} from '@/lib/admin/opsHome/links'

describe('readIncludeSample', () => {
  it('sample=1일 때만 켜진 것으로 읽는다(URLSearchParams)', () => {
    expect(readIncludeSample(new URLSearchParams('sample=1'))).toBe(true)
    expect(readIncludeSample(new URLSearchParams('week=2026-W41&sample=1'))).toBe(true)
    expect(readIncludeSample(new URLSearchParams(''))).toBe(false)
    expect(readIncludeSample(new URLSearchParams('sample=0'))).toBe(false)
    expect(readIncludeSample(new URLSearchParams('sample=true'))).toBe(false)
    expect(readIncludeSample(new URLSearchParams('sample='))).toBe(false)
  })

  it('서버 페이지의 쿼리 객체도 읽는다(배열이면 첫 값)', () => {
    expect(readIncludeSample({ sample: '1' })).toBe(true)
    expect(readIncludeSample({ sample: ['1', '0'] })).toBe(true)
    expect(readIncludeSample({ sample: ['0', '1'] })).toBe(false)
    expect(readIncludeSample({ sample: undefined })).toBe(false)
    expect(readIncludeSample({})).toBe(false)
  })

  it('쿼리가 없으면 꺼짐이다', () => {
    expect(readIncludeSample(null)).toBe(false)
    expect(readIncludeSample(undefined)).toBe(false)
  })
})

describe('withSampleParam', () => {
  it('쿼리가 없는 경로에는 ?sample=1을 붙인다', () => {
    expect(withSampleParam('/admin/ops-inbox', true)).toBe(`/admin/ops-inbox?${SAMPLE_PARAM}=1`)
  })

  it('다른 쿼리 키를 유지하고 sample만 더한다', () => {
    expect(withSampleParam('/admin/today?date=2026-10-07', true)).toBe('/admin/today?date=2026-10-07&sample=1')
    expect(withSampleParam('/admin?trend=week&view=month', true)).toBe('/admin?trend=week&view=month&sample=1')
  })

  it('이미 있으면 한 번만 둔다', () => {
    expect(withSampleParam('/admin?sample=1', true)).toBe('/admin?sample=1')
    expect(withSampleParam('/admin?sample=0&trend=week', true)).toBe('/admin?sample=1&trend=week')
  })

  it('해시는 그대로 둔다', () => {
    expect(withSampleParam('/admin/ops-inbox/b1?item=i1#detail', true)).toBe('/admin/ops-inbox/b1?item=i1&sample=1#detail')
  })

  it('끄면 sample 키만 지우고 다른 키는 유지한다(키가 남지 않는다)', () => {
    expect(withSampleParam('/admin?sample=1', false)).toBe('/admin')
    expect(withSampleParam('/admin?trend=week&sample=1', false)).toBe('/admin?trend=week')
    expect(withSampleParam('/admin?trend=week', false)).toBe('/admin?trend=week')
  })
})

describe('dayHref', () => {
  it('날짜 링크는 /admin/today?date=다(일정표가 생기기 전까지)', () => {
    expect(dayHref('2026-10-07')).toBe('/admin/today?date=2026-10-07')
  })

  it('시험 묶음을 포함하는 중이면 sample=1을 이어 붙인다', () => {
    expect(dayHref('2026-10-07', { includeSample: true })).toBe('/admin/today?date=2026-10-07&sample=1')
    expect(dayHref('2026-10-07', { includeSample: false })).toBe('/admin/today?date=2026-10-07')
  })
})

describe('opsTargetHref', () => {
  it('항목이 있으면 기획 상세의 그 항목이다', () => {
    expect(opsTargetHref({ bundleId: 'b1', itemId: 'i1', date: '2026-10-07' })).toBe('/admin/ops-inbox/b1?item=i1')
  })

  it('묶음만 있으면 기획 상세다', () => {
    expect(opsTargetHref({ bundleId: 'b1', itemId: null, date: null })).toBe('/admin/ops-inbox/b1')
  })

  it('묶음과 날짜가 함께 있고 항목이 없으면 기획 상세가 먼저다', () => {
    expect(opsTargetHref({ bundleId: 'b1', date: '2026-10-07' })).toBe('/admin/ops-inbox/b1')
  })

  it('날짜만 있으면 그날 링크다', () => {
    expect(opsTargetHref({ bundleId: null, itemId: null, date: '2026-10-07' })).toBe('/admin/today?date=2026-10-07')
  })

  it('묶음 없이 항목만 있으면 열 수 없어 날짜로 넘어가고, 날짜도 없으면 null이다', () => {
    expect(opsTargetHref({ itemId: 'i1', date: '2026-10-07' })).toBe('/admin/today?date=2026-10-07')
    expect(opsTargetHref({ itemId: 'i1' })).toBeNull()
  })

  it('아무것도 없거나 빈 글자뿐이면 null이다', () => {
    expect(opsTargetHref({})).toBeNull()
    expect(opsTargetHref({ bundleId: '', itemId: '  ', date: '' })).toBeNull()
  })

  it('켜져 있으면 모든 링크에 sample=1이 이어 붙는다', () => {
    const on = { includeSample: true }
    expect(opsTargetHref({ bundleId: 'b1', itemId: 'i1' }, on)).toBe('/admin/ops-inbox/b1?item=i1&sample=1')
    expect(opsTargetHref({ bundleId: 'b1' }, on)).toBe('/admin/ops-inbox/b1?sample=1')
    expect(opsTargetHref({ date: '2026-10-07' }, on)).toBe('/admin/today?date=2026-10-07&sample=1')
    expect(opsTargetHref({}, on)).toBeNull()
  })
})

describe('signalResultHref', () => {
  it('신호 결과의 bundleId·itemId·date로 같은 규칙을 쓴다', () => {
    expect(signalResultHref({ bundleId: 'b1', itemId: 'i1', date: '2026-10-07' })).toBe('/admin/ops-inbox/b1?item=i1')
    expect(signalResultHref({ bundleId: null, itemId: null, date: '2026-10-07' })).toBe('/admin/today?date=2026-10-07')
    expect(signalResultHref({ bundleId: null, itemId: null, date: null })).toBeNull()
  })

  it('시험 묶음을 포함하는 중이면 sample=1을 이어 붙인다', () => {
    expect(signalResultHref({ bundleId: 'b1', itemId: 'i1', date: null }, { includeSample: true })).toBe(
      '/admin/ops-inbox/b1?item=i1&sample=1'
    )
  })
})

describe('sampleToggleHref — 시험 스위치가 이동하는 주소', () => {
  it('켜면 sample=1만 붙이고 다른 키를 유지한다', () => {
    expect(sampleToggleHref('/admin', '', true)).toBe('/admin?sample=1')
    expect(sampleToggleHref('/admin', 'trend=week', true)).toBe('/admin?trend=week&sample=1')
    expect(sampleToggleHref('/admin', '?trend=week', true)).toBe('/admin?trend=week&sample=1')
  })

  it('끄면 sample만 빼고 다른 키를 유지한다(키가 남지 않는다)', () => {
    expect(sampleToggleHref('/admin', 'sample=1', false)).toBe('/admin')
    expect(sampleToggleHref('/admin', 'sample=1&trend=week', false)).toBe('/admin?trend=week')
    expect(sampleToggleHref('/admin/ops-schedule', 'view=month&date=2026-10-07&sample=1', false)).toBe(
      '/admin/ops-schedule?view=month&date=2026-10-07'
    )
  })
})

describe('inboxListHref — 받은 기획함 목록(운영 홈 링크, 티켓 20261006_1340)', () => {
  it('탭 없이 목록, 탭을 주면 그 탭이 열린다', () => {
    expect(inboxListHref()).toBe('/admin/ops-inbox')
    expect(inboxListHref({ tab: 'decide' })).toBe('/admin/ops-inbox?tab=decide')
  })

  it('시험 묶음을 포함하는 중이면 sample=1을 이어 붙이고 다른 키는 유지한다', () => {
    expect(inboxListHref({ includeSample: true })).toBe('/admin/ops-inbox?sample=1')
    expect(inboxListHref({ tab: 'decide', includeSample: true })).toBe('/admin/ops-inbox?tab=decide&sample=1')
    expect(inboxListHref({ tab: 'decide', includeSample: false })).toBe('/admin/ops-inbox?tab=decide')
  })
})

describe('opsTargetKind', () => {
  it('묶음이 있으면 기획 상세, 날짜만 있으면 그날, 없으면 null이다', () => {
    expect(opsTargetKind({ bundleId: 'b1', itemId: 'i1', date: '2026-10-07' })).toBe('inbox')
    expect(opsTargetKind({ bundleId: 'b1' })).toBe('inbox')
    expect(opsTargetKind({ date: '2026-10-07' })).toBe('day')
    expect(opsTargetKind({ itemId: 'i1' })).toBeNull()
    expect(opsTargetKind({})).toBeNull()
  })
})

describe('scheduleHref — 일정표 링크(티켓 20261006_1536 ③-a)', () => {
  it('값이 없으면 일정표 첫 화면이다', () => {
    expect(scheduleHref()).toBe('/admin/ops-schedule')
    expect(scheduleHomeHref()).toBe('/admin/ops-schedule')
  })

  it('보기와 기준일을 쿼리로 담는다', () => {
    expect(scheduleHref({ view: 'week', date: '2026-10-07' })).toBe('/admin/ops-schedule?view=week&date=2026-10-07')
    expect(scheduleHref({ view: 'timeline', date: null })).toBe('/admin/ops-schedule?view=timeline')
  })

  it('거르기는 같은 키를 반복해 담고, 서랍은 drawer·item으로 담는다', () => {
    expect(
      scheduleHref({
        view: 'month',
        date: '2026-10-07',
        kinds: ['mission', 'home_feed_card'],
        tribes: ['runner'],
        patterns: ['P01', 'P02'],
        drawer: 'item',
        item: 'card:3f2b8c1e-0000-4000-8000-000000000001',
      })
    ).toBe(
      '/admin/ops-schedule?view=month&date=2026-10-07&kind=mission&kind=home_feed_card&tribe=runner&pattern=P01&pattern=P02&drawer=item&item=card%3A3f2b8c1e-0000-4000-8000-000000000001'
    )
    expect(scheduleHref({ view: 'week', date: '2026-10-07', drawer: 'day' })).toBe(
      '/admin/ops-schedule?view=week&date=2026-10-07&drawer=day'
    )
  })

  it('시험 묶음을 포함하는 중이면 sample=1이 맨 뒤에 이어 붙고, 아니면 키가 없다', () => {
    expect(scheduleHref({ view: 'week', date: '2026-10-07' }, { includeSample: true })).toBe(
      '/admin/ops-schedule?view=week&date=2026-10-07&sample=1'
    )
    expect(scheduleHomeHref({ includeSample: true })).toBe('/admin/ops-schedule?sample=1')
    expect(scheduleHref({ view: 'week' }, { includeSample: false })).toBe('/admin/ops-schedule?view=week')
  })

  it('만든 링크를 시험 스위치가 그대로 끄고 켤 수 있다(쿼리 키 보존)', () => {
    const on = scheduleHref({ view: 'week', date: '2026-10-07', kinds: ['mission'] }, { includeSample: true })
    const [path, query] = on.split('?')
    expect(sampleToggleHref(path, query, false)).toBe('/admin/ops-schedule?view=week&date=2026-10-07&kind=mission')
  })
})
