/**
 * today-sections.ts — 어드민 투데이 카드 생성·수정·조회 화면 섹션 구성 (티켓 20260911_1454)
 */
import { describe, it, expect } from 'vitest'
import {
  TODAY_FIELDS_FOR,
  computeTodaySectionStatuses,
  todayTemplateFields,
  visibleTodaySections,
  todaySectionTitle,
  buildTodayCardSavePayload,
  type TodaySectionSnapshot,
  type TodayCardFormValues,
} from '../today-sections'
import type { TodayCardTemplateType } from '@/types/database'

const ALL_TEMPLATES: TodayCardTemplateType[] = [
  'badge_spotlight',
  'progress_nudge',
  'mission_spotlight',
  'itembook_milestone',
  'location_trend',
  'drop_alert',
  'editorial_article',
  'ranking_board',
]

const base: TodaySectionSnapshot = {
  templateType: 'badge_spotlight',
  title: '핫한 성수동',
  badgeCount: 0,
  missionId: null,
  itemBookId: null,
  regionLabel: '',
  bodyMarkdown: '',
  rankingModeId: null,
  exposureTagCount: 1,
  hasStartsAt: true,
  hasEndsAt: true,
}

describe('visibleTodaySections — 참조 컨텐츠가 없는 템플릿(drop_alert)만 ref 섹션을 숨긴다', () => {
  it('drop_alert는 참조 컨텐츠 섹션이 없다', () => {
    expect(visibleTodaySections('drop_alert')).toEqual(['class', 'basic', 'expose', 'period'])
  })
  it('그 외 7개 템플릿은 참조 컨텐츠 섹션을 포함한 5개 섹션을 모두 보인다', () => {
    for (const t of ALL_TEMPLATES) {
      if (t === 'drop_alert') continue
      expect(visibleTodaySections(t)).toEqual(['class', 'basic', 'ref', 'expose', 'period'])
    }
  })
  it('섹션 순서는 분류 → 기본 정보 → 참조 컨텐츠 → 노출 설정 → 게시 기간·상태다', () => {
    expect(todaySectionTitle('class')).toBe('분류')
    expect(todaySectionTitle('basic')).toBe('기본 정보')
    expect(todaySectionTitle('ref')).toBe('참조 컨텐츠')
    expect(todaySectionTitle('expose')).toBe('노출 설정')
    expect(todaySectionTitle('period')).toBe('게시 기간 · 상태')
  })
})

describe('TODAY_FIELDS_FOR — 템플릿별 노출 필드 매트릭스(기존 TodayCardList.tsx의 fieldsFor와 동일)', () => {
  it('badge_spotlight는 배지·이동경로만 쓴다', () => {
    expect(todayTemplateFields('badge_spotlight')).toEqual({ badges: true, targetHref: true })
  })
  it('progress_nudge는 배지·미션·이동경로를 쓴다', () => {
    expect(todayTemplateFields('progress_nudge')).toEqual({ badges: true, mission: true, targetHref: true })
  })
  it('mission_spotlight는 미션·이동경로만 쓴다', () => {
    expect(todayTemplateFields('mission_spotlight')).toEqual({ mission: true, targetHref: true })
  })
  it('itembook_milestone은 컬렉션·이동경로만 쓴다', () => {
    expect(todayTemplateFields('itembook_milestone')).toEqual({ itemBook: true, targetHref: true })
  })
  it('location_trend은 배지·지역·이동경로를 쓴다', () => {
    expect(todayTemplateFields('location_trend')).toEqual({ badges: true, region: true, targetHref: true })
  })
  it('drop_alert는 아무 참조 필드도 쓰지 않는다(경로 고정 /drops)', () => {
    expect(todayTemplateFields('drop_alert')).toEqual({})
  })
  it('editorial_article은 본문만 쓴다(경로 고정 /today/{id})', () => {
    expect(todayTemplateFields('editorial_article')).toEqual({ body: true })
  })
  it('ranking_board는 랭킹모드·이동경로를 쓴다(티켓 20260911_1440)', () => {
    expect(todayTemplateFields('ranking_board')).toEqual({ rankingMode: true, targetHref: true })
  })
  it('8개 템플릿 모두 매핑이 존재한다', () => {
    expect(Object.keys(TODAY_FIELDS_FOR).sort()).toEqual([...ALL_TEMPLATES].sort())
  })
})

describe('computeTodaySectionStatuses', () => {
  it('필수가 다 채워지면 완료다', () => {
    const s = computeTodaySectionStatuses(base)
    expect(s.class).toEqual({ tone: 'ok', text: '완료' })
    expect(s.basic).toEqual({ tone: 'ok', text: '완료' })
    expect(s.expose).toEqual({ tone: 'ok', text: '완료' })
    expect(s.period).toEqual({ tone: 'ok', text: '완료' })
  })
  it('제목이 비면 기본 정보가 필수 남음이다', () => {
    expect(computeTodaySectionStatuses({ ...base, title: '  ' }).basic).toEqual({ tone: 'bad', text: '필수 1개 남음' })
  })
  it('노출조건 태그가 비면 노출 설정이 필수 남음이다', () => {
    expect(computeTodaySectionStatuses({ ...base, exposureTagCount: 0 }).expose).toEqual({ tone: 'bad', text: '필수 1개 남음' })
  })
  it('시작·종료 일시가 둘 다 비면 게시 기간이 2개 남음이다', () => {
    expect(computeTodaySectionStatuses({ ...base, hasStartsAt: false, hasEndsAt: false }).period).toEqual({
      tone: 'bad',
      text: '필수 2개 남음',
    })
  })
  it('참조 컨텐츠 — 템플릿이 쓰는 필드만 세고, 쓰지 않는 필드는 채워도 세지 않는다', () => {
    // location_trend는 badges·region을 쓴다 — 배지 1개 + 지역명을 채우면 2개 설정
    expect(
      computeTodaySectionStatuses({ ...base, templateType: 'location_trend', badgeCount: 1, regionLabel: '성수동' }).ref
    ).toEqual({ tone: 'set', text: '2개 설정' })
    // badge_spotlight는 mission을 쓰지 않으므로 missionId를 채워도 ref는 idle
    expect(computeTodaySectionStatuses({ ...base, templateType: 'badge_spotlight', missionId: 'm1' }).ref).toEqual({
      tone: 'idle',
      text: '선택',
    })
    // ranking_board — rankingModeId를 채우면 1개 설정(티켓 20260911_1440)
    expect(
      computeTodaySectionStatuses({ ...base, templateType: 'ranking_board', rankingModeId: 'rm1' }).ref
    ).toEqual({ tone: 'set', text: '1개 설정' })
    expect(computeTodaySectionStatuses({ ...base, templateType: 'ranking_board' }).ref).toEqual({
      tone: 'idle',
      text: '선택',
    })
  })
})

describe('buildTodayCardSavePayload — 저장 페이로드 구성(기존 TodayCardList.tsx의 handleSave와 동일 로직)', () => {
  const baseValues: TodayCardFormValues = {
    templateType: 'badge_spotlight',
    layoutType: 'large_thumbnail',
    title: '  핫한 성수동  ',
    subtitle: '',
    coverImageUrl: '',
    badgeIds: ['b1', 'b2'],
    missionId: '',
    itemBookId: '',
    regionLabel: '',
    bodyMarkdown: '',
    rankingModeId: '',
    targetHref: '',
    exposureTags: ['all'],
    startsAt: '2026-09-11T00:00',
    endsAt: '2026-09-12T00:00',
    sortOrder: '3',
    isActive: true,
  }

  it('제목·부제·URL은 trim하고 빈 문자열은 null로 저장한다', () => {
    const p = buildTodayCardSavePayload(baseValues)
    expect(p.title).toBe('핫한 성수동')
    expect(p.subtitle).toBeNull()
    expect(p.cover_image_url).toBeNull()
  })
  it('시작·종료 일시는 ISO 문자열로, 정렬 순서는 숫자로 변환한다', () => {
    const p = buildTodayCardSavePayload(baseValues)
    expect(p.starts_at).toBe(new Date('2026-09-11T00:00').toISOString())
    expect(p.ends_at).toBe(new Date('2026-09-12T00:00').toISOString())
    expect(p.sort_order).toBe(3)
  })
  it('정렬 순서가 숫자로 안 읽히면 0으로 저장한다', () => {
    expect(buildTodayCardSavePayload({ ...baseValues, sortOrder: '' }).sort_order).toBe(0)
    expect(buildTodayCardSavePayload({ ...baseValues, sortOrder: 'abc' }).sort_order).toBe(0)
  })
  it('badge_spotlight — badges만 쓴다. 나머지 참조 필드는 값이 있어도 null로 비운다', () => {
    const p = buildTodayCardSavePayload({
      ...baseValues,
      missionId: 'm1',
      itemBookId: 'ib1',
      regionLabel: '성수동',
      bodyMarkdown: '본문',
    })
    expect(p.badge_ids).toEqual(['b1', 'b2'])
    expect(p.mission_id).toBeNull()
    expect(p.item_book_id).toBeNull()
    expect(p.region_label).toBeNull()
    expect(p.body_markdown).toBeNull()
  })
  it('drop_alert — 참조 필드를 아무것도 쓰지 않는다(badges도 빈 배열로 비운다)', () => {
    const p = buildTodayCardSavePayload({ ...baseValues, templateType: 'drop_alert', targetHref: '/무시됨' })
    expect(p.badge_ids).toEqual([])
    expect(p.mission_id).toBeNull()
    expect(p.item_book_id).toBeNull()
    expect(p.region_label).toBeNull()
    expect(p.body_markdown).toBeNull()
    // editorial_article/drop_alert은 target_href를 무시한다(자동/고정 경로)
    expect(p.target_href).toBeNull()
  })
  it('editorial_article — 본문만 쓰고 target_href는 무시한다', () => {
    const p = buildTodayCardSavePayload({
      ...baseValues,
      templateType: 'editorial_article',
      bodyMarkdown: '첫 문단\n\n둘째 문단',
      targetHref: '/무시됨',
    })
    expect(p.body_markdown).toBe('첫 문단\n\n둘째 문단')
    expect(p.target_href).toBeNull()
    expect(p.badge_ids).toEqual([])
  })
  it('location_trend — badges·region·targetHref를 쓴다', () => {
    const p = buildTodayCardSavePayload({
      ...baseValues,
      templateType: 'location_trend',
      regionLabel: '  성수동  ',
      targetHref: '  /badges  ',
    })
    expect(p.region_label).toBe('성수동')
    expect(p.target_href).toBe('/badges')
  })
  it('이동 경로를 비우면 null로 저장한다(자동 생성은 서버·유저 화면 쪽 로직, 이 함수 범위 밖)', () => {
    const p = buildTodayCardSavePayload({ ...baseValues, templateType: 'location_trend', targetHref: '   ' })
    expect(p.target_href).toBeNull()
  })
  it('ranking_board — rankingModeId를 저장하고 다른 참조 필드는 값이 있어도 null로 비운다(티켓 20260911_1440)', () => {
    const p = buildTodayCardSavePayload({
      ...baseValues,
      templateType: 'ranking_board',
      rankingModeId: 'rm1',
      missionId: 'm1',
      itemBookId: 'ib1',
      regionLabel: '성수동',
      bodyMarkdown: '본문',
    })
    expect(p.ranking_mode_id).toBe('rm1')
    expect(p.badge_ids).toEqual([])
    expect(p.mission_id).toBeNull()
    expect(p.item_book_id).toBeNull()
    expect(p.region_label).toBeNull()
    expect(p.body_markdown).toBeNull()
  })
  it('ranking_board가 아닌 템플릿은 rankingModeId가 있어도 ranking_mode_id를 null로 비운다', () => {
    const p = buildTodayCardSavePayload({ ...baseValues, templateType: 'badge_spotlight', rankingModeId: 'rm1' })
    expect(p.ranking_mode_id).toBeNull()
  })
})
