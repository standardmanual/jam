import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import { AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES } from '@/lib/ambient-drop/schedule'
import { SERVICE_JAM_DEFAULT_AMOUNTS, SERVICE_JAM_DEFAULT_CAPS } from '@/lib/admin/balance/serviceJam'
import { CAPSULE_CHAPTER_DEFAULT_ADVANCE, CAPSULE_CHAPTER_DEFAULT_FILL_V2 } from '@/lib/admin/balance/capsule'
import { INVENTORY_LOW_FREE_SLOTS, METRIC_SPECS, REACH_HORIZONS } from '@/lib/admin/balanceDashboard/targets'
import { POLICIES_DATA } from '../policiesData'

describe('POLICIES_DATA 카탈로그 정합성 검사 (티켓 20261022_1631)', () => {
  it('19개 장 전체가 누락 없이 최소 1개 이상의 정책을 포함한다', () => {
    const chapters = new Set(POLICIES_DATA.map((p) => p.chapter))
    for (let c = 1; c <= 19; c += 1) {
      expect(chapters.has(c), `${c}장이 카탈로그에 존재해야 합니다`).toBe(true)
    }
  })

  it('모든 정책의 id는 고유하며 공백이 없다', () => {
    const ids = new Set<string>()
    for (const p of POLICIES_DATA) {
      expect(p.id.trim()).toBe(p.id)
      expect(ids.has(p.id), `중복 id 발견: ${p.id}`).toBe(false)
      ids.add(p.id)
    }
  })

  it('모든 정책은 제목, 설명, 유저 경험, 근거 문서를 갖추고 있다', () => {
    for (const p of POLICIES_DATA) {
      expect(p.title.length).toBeGreaterThan(2)
      expect(p.currentSpec.length).toBeGreaterThan(2)
      expect(p.userExperience.length).toBeGreaterThan(5)
      expect(p.basisDoc.length).toBeGreaterThan(2)
    }
  })

  it('설정 화면에서 바꾸는(admin_link) 항목은 링크를 갖고, 직접 저장 설정은 어디에도 없다', () => {
    const linked = POLICIES_DATA.filter((p) => p.type === 'admin_link')
    expect(linked.length).toBeGreaterThan(5)

    for (const p of linked) {
      expect(p.adminLink, `${p.id}에 adminLink가 있어야 합니다`).toBeDefined()
      expect(p.adminLink?.href.startsWith('/admin/'), `${p.id}의 링크는 어드민 화면이어야 합니다`).toBe(true)
    }

    // 직접 저장하던 시절의 칸(editableConfig)과 옛 유형 이름은 남아 있지 않다
    for (const p of POLICIES_DATA) {
      expect('editableConfig' in p, `${p.id}에 editableConfig가 남아 있습니다`).toBe(false)
      expect(p.type as string).not.toBe('db_editable')
    }
  })

  it('adminLink는 admin_link 유형에만 있고, 읽어 보여 줄 칸(liveField)은 DB 칸과 같다', () => {
    for (const p of POLICIES_DATA) {
      if (p.type !== 'admin_link') {
        expect(p.adminLink, `${p.id}는 admin_link가 아니므로 adminLink가 없어야 합니다`).toBeUndefined()
        continue
      }
      if (p.adminLink?.liveField !== undefined) {
        expect(p.adminLink.liveField, `${p.id}의 liveField는 dbColumn과 같아야 합니다`).toBe(p.dbColumn)
      }
    }
  })

  it('밸런스 설정에 구역이 있는 항목은 해당 구역 링크(/admin/balance#구역)로 이어진다', () => {
    const hrefOf = (id: string) => POLICIES_DATA.find((p) => p.id === id)?.adminLink?.href

    // 잼 구역(강도 배율 3칸, 경보 기준 2칸)
    for (const id of [
      'ch4-intensity-light',
      'ch4-intensity-normal',
      'ch4-intensity-hard',
      'ch4-mass-earn-multiplier',
      'ch4-mass-earn-no-history',
    ]) {
      expect(hrefOf(id), id).toBe('/admin/balance#jam')
    }
    // 컬렉션과 믹스 구역
    expect(hrefOf('ch8-mix-fail-reward')).toBe('/admin/balance#collection')
    expect(hrefOf('ch8-collection-rewards')).toBe('/admin/balance#collection')
    // 잠긴 아이템 배지 구역
    expect(hrefOf('ch7-locked-min-requirements')).toBe('/admin/balance#locked')
    // 챕터 구역
    expect(hrefOf('ch12-score-thresholds')).toBe('/admin/balance#chapter')
    expect(hrefOf('ch12-jam-weekly-cap')).toBe('/admin/balance#chapter')
    // 서비스 활동 잼 구역
    expect(hrefOf('ch4-service-jam')).toBe('/admin/balance#servicejam')
    expect(hrefOf('ch7-locked-open-score')).toBe('/admin/balance#servicejam')
    // 인벤토리 구역(옛 «인벤토리 최대치» 화면은 없앴다, 티켓 20261022_1134)
    expect(hrefOf('ch8-inventory-max-slots')).toBe('/admin/balance#inventory')
  })

  it('어뷰징 기준값 카드 8개는 모두 어뷰징 구역(/admin/balance#abusing)으로 이어진다. 옛 «정책 설정» 탭은 없앴다 (티켓 20261022_1134 2회)', () => {
    const abusing = POLICIES_DATA.filter((p) => p.dbTable === 'abusing_policy')
    expect(abusing.length).toBe(8)
    for (const p of abusing) {
      expect(p.adminLink?.href, p.id).toBe('/admin/balance#abusing')
    }
    // 이용 정지·장소 블록 화면(/admin/abusing)은 기준값 화면이 아니라 카드가 가리키지 않는다
    expect(POLICIES_DATA.filter((p) => p.adminLink?.href === '/admin/abusing')).toEqual([])
  })

  it('배지 포인트 일괄 값 카드는 14장에 있고 배지와 포인트 구역(/admin/balance#badgepoints)으로 이어진다 (티켓 20261022_1135)', () => {
    const card = POLICIES_DATA.find((p) => p.id === 'ch14-badge-point-defaults')
    expect(card).toBeDefined()
    expect(card?.chapter).toBe(14)
    expect(card?.type).toBe('admin_link')
    expect(card?.dbTable).toBe('badge_point_policy')
    expect(card?.adminLink?.href).toBe('/admin/balance#badgepoints')
    // 칸이 다섯이라 한 칸만 읽어 보이지 않는다
    expect(card?.adminLink?.liveField).toBeUndefined()
    // 값 문구: 일괄 값 5개와 숨김 0, 기존 배지가 바뀌지 않는다는 것, 온보딩 배지 예외
    for (const text of ['Common 10pt', 'Rare 20pt', 'Epic 50pt', 'Mystic 100pt', '레벨형 레벨마다 10pt', '숨김 배지 0pt']) {
      expect(card?.currentSpec, text).toContain(text)
    }
    expect(card?.currentSpec).toContain('이미 있는 배지의 포인트는 바뀌지 않음')
    expect(card?.currentSpec).toContain('온보딩 완료 배지 «JAM!»')
    expect(card?.currentSpec).toContain('100pt로 따로 정해져 있음')
  })

  it('옛 인벤토리 화면 주소(/admin/inventory-policy)를 가리키는 카드가 없다', () => {
    expect(POLICIES_DATA.filter((p) => p.adminLink?.href.startsWith('/admin/inventory-policy'))).toEqual([])
  })

  it('시스템 드랍 카드 3개는 모두 시스템 드랍 구역(/admin/balance#ambient)으로 이어진다. 옛 화면(/admin/ambient-drop)은 가리키지 않는다 (티켓 20261022_1134 3회)', () => {
    const ambient = POLICIES_DATA.filter((p) => p.dbTable === 'ambient_drop_config')
    expect(ambient.map((p) => p.id).sort()).toEqual(['ch9-ambient-exclusion-window', 'ch9-ambient-poi-cap', 'ch9-ambient-schedule-hour'])
    for (const p of ambient) {
      expect(p.adminLink?.href, p.id).toBe('/admin/balance#ambient')
    }
    expect(POLICIES_DATA.filter((p) => p.adminLink?.href.startsWith('/admin/ambient-drop'))).toEqual([])
  })

  it('설정 화면 링크가 있는 카드는 모두 밸런스 설정 구역으로 이어진다(옛 화면 링크가 하나도 남지 않아 화면의 링크 글자 분기를 지웠다)', () => {
    const linked = POLICIES_DATA.filter((p) => p.type === 'admin_link')
    expect(linked.length).toBeGreaterThan(5)
    for (const p of linked) {
      expect(p.adminLink?.href, p.id).toMatch(/^\/admin\/balance#[a-z]+$/)
    }
  })

  it('상호 배제 창 카드의 상한은 코드 기준 180분이다(720분이 아니다)', () => {
    const card = POLICIES_DATA.find((p) => p.id === 'ch9-ambient-exclusion-window')
    expect(card?.currentSpec).toContain(`상한 ${AMBIENT_DROP_EXCLUSION_WINDOW_MAX_MINUTES}분`)
    expect(card?.currentSpec).not.toContain('720')
  })

  it('차량 속도 필터 카드는 기본값 60km/h를 읽어 보이고 밸런스 설정 어뷰징 구역으로 이어진다', () => {
    const vehiclePolicy = POLICIES_DATA.find((p) => p.id === 'ch16-vehicle-speed-filter')
    expect(vehiclePolicy).toBeDefined()
    expect(vehiclePolicy?.adminLink?.liveField).toBe('vehicle_speed_filter_kmh')
    expect(vehiclePolicy?.adminLink?.unit).toBe('km/h')
    expect(vehiclePolicy?.adminLink?.href).toBe('/admin/balance#abusing')
    expect(vehiclePolicy?.defaultValue).toBe(60)
  })

  it('등급 올리기 카드는 «고른 컬렉션 안에서 균등, 바로 윗등급 70%·같은 등급 30%, 후보 없으면 소각 전 거절, 아래 등급으로 내려가지 않음» 규칙을 말한다 (티켓 20261023_1648 4회)', () => {
    const rule = POLICIES_DATA.find((p) => p.id === 'ch8-tier-up-recipes')
    expect(rule?.type).toBe('code_constant')
    for (const text of [
      '받을 컬렉션',
      '고른 컬렉션 안에서',
      '균등 추첨',
      '윗등급 확률(기본 70%)',
      '같은 등급이 나머지(기본 30%)',
      '소각하기 전에 거절',
      '아래 등급으로 내려가지 않음',
      '확률 안내 페이지가 재료 등급별 표',
    ]) {
      expect(rule?.currentSpec, text).toContain(text)
    }
    // 7-7a의 옛 규칙 문구가 남아 있지 않다
    for (const old of ['캡슐 등급 확률', '합이 100%', '열린 컬렉션에서 균등', '캡슐과 같은 굴림', '한 등급씩 낮춤', '다른 트라이브일 확률']) {
      expect(`${rule?.currentSpec} ${rule?.userExperience}`, old).not.toContain(old)
    }
    expect(rule?.userExperience).toContain('받을 컬렉션을 고르면')
    expect(rule?.ticketId).toBe('20261023_1648')
  })

  it('등급 올리기 윗등급 확률 카드는 combine_policy.tier_up_probability를 밸런스 설정 «컬렉션과 믹스» 구역으로 잇는다 (티켓 20261023_1648 4회)', () => {
    const card = POLICIES_DATA.find((p) => p.id === 'ch8-tier-up-probability')
    expect(card?.chapter).toBe(8)
    expect(card?.type).toBe('admin_link')
    expect(card?.dbTable).toBe('combine_policy')
    expect(card?.dbColumn).toBe('tier_up_probability')
    expect(card?.adminLink?.href).toBe('/admin/balance#collection')
    // DB는 0~1, 화면은 %라 한 칸 실측값은 읽어 보이지 않는다(0.7이 70%로 읽히지 않는다)
    expect(card?.adminLink?.liveField).toBeUndefined()
    expect(card?.currentSpec).toContain('기본 70%')
    expect(card?.currentSpec).toContain('확률 안내 페이지')
  })

  it('확률 안내 페이지 카드가 등급 올리기 윗등급 확률(combine_policy)을 읽는다고 적는다 (티켓 20261023_1648 4회)', () => {
    const card = POLICIES_DATA.find((p) => p.id === 'ch18-probability-page')
    expect(card?.currentSpec).toContain('combine_policy')
  })

  it('밸런스 목표 카드 5개(캡슐·챕터 도달·월 아이템 배지·컬렉션 완성·인벤토리)는 밸런스 지표의 목표 정의(targets.ts)를 코드 위치로 가리키고 그 파일이 실재한다 (티켓 20261022_1136 1회 b)', () => {
    const kpi = POLICIES_DATA.filter((p) => p.id.startsWith('ch19-kpi-'))
    expect(kpi.map((p) => p.id).sort()).toEqual([
      'ch19-kpi-capsule-speed',
      'ch19-kpi-chapter-reach',
      'ch19-kpi-collection-speed',
      'ch19-kpi-inventory-full',
      'ch19-kpi-item-badges-monthly',
    ])
    const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
    for (const p of kpi) {
      expect(p.chapter, p.id).toBe(19)
      expect(p.ticketId, p.id).toBe('20261022_1136')
      expect(p.codeLocation, p.id).toBe('jam-web/src/lib/admin/balanceDashboard/targets.ts')
      expect(existsSync(`${repoRoot}${p.codeLocation}`), `${p.id}의 코드 위치가 실재해야 합니다`).toBe(true)
    }
  })

  it('챕터 도달·인벤토리 카드의 숫자는 밸런스 지표의 목표 정의(targets.ts)와 같다 (티켓 20261022_1136 1회 b)', () => {
    const reach = POLICIES_DATA.find((p) => p.id === 'ch19-kpi-chapter-reach')
    for (const { chapterNo, days } of REACH_HORIZONS) {
      expect(reach?.currentSpec, `챕터 ${chapterNo}`).toContain(`${days}일 안에 챕터 ${chapterNo}`)
    }
    const inventory = POLICIES_DATA.find((p) => p.id === 'ch19-kpi-inventory-full')
    const target = METRIC_SPECS.inventory_full.parts[0].target
    expect(inventory?.currentSpec).toContain(`남은 칸이 ${INVENTORY_LOW_FREE_SLOTS} 이하`)
    expect(inventory?.currentSpec).toContain(`${Math.round((target?.high ?? 0) * 100)}% 미만`)
  })

  it('슬롭 금칙어가 정책 텍스트에 포함되지 않는다', () => {
    // 슬롭 검사기가 테스트 코드 자체를 오탐하지 않도록 분할 정의
    const forbidden = [
      ['다양', '한'].join(''),
      ['여러', ' 가지'].join(''),
      ['~을', ' 통해'].join(''),
      ['~되어', '진다'].join(''),
      ['~지게', ' 된다'].join(''),
      ['여', '정'].join(''),
    ]
    for (const p of POLICIES_DATA) {
      const combined = `${p.title} ${p.currentSpec} ${p.userExperience} ${p.basisDoc}`
      for (const word of forbidden) {
        expect(combined.includes(word), `금칙어 "${word}" 발견: ${p.id}`).toBe(false)
      }
    }
  })
})

describe('컬렉션 4등급 완성 체계 항목 (티켓 20261028_1408)', () => {
  const policy = POLICIES_DATA.find((p) => p.id === 'ch8-collection-4tiers')

  it('코드 위치가 실재하고 실제 동작(처음 장착한 등급으로 고정, 모두 해제하면 풀림)을 적는다', () => {
    const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
    expect(policy?.codeLocation).toBe('jam-web/src/lib/itembook/completion-basis.ts')
    expect(existsSync(`${repoRoot}${policy?.codeLocation}`), '코드 위치가 실재해야 합니다').toBe(true)
    expect(policy?.currentSpec).toContain('처음 장착한')
    expect(policy?.currentSpec).toContain('모두 해제하면')
    expect(policy?.currentSpec).not.toContain('최저 등급')
    expect(policy?.userExperience).not.toContain('업그레이드')
  })
})

describe('캡슐 자동 채움과 챕터 100% 횟수 항목 (티켓 20261028_1733 4회)', () => {
  const find = (id: string) => POLICIES_DATA.find((p) => p.id === id)
  const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))

  it('챕터별 채울 양 카드는 자동 채움 값(fill_amount_v2) 기본값을 적고 밸런스 설정 캡슐 구역으로 이어진다', () => {
    const card = find('ch5-costs-by-chapter')
    expect(card?.type).toBe('admin_link')
    expect(card?.dbTable).toBe('capsule_chapter_costs')
    expect(card?.dbColumn).toBe('fill_amount_v2')
    expect(card?.adminLink?.href).toBe('/admin/balance#capsule')
    for (const [index, fill] of CAPSULE_CHAPTER_DEFAULT_FILL_V2.entries()) {
      expect(card?.currentSpec, `챕터 ${index + 1}`).toContain(`${index + 1}(${fill}`)
    }
    expect(card?.currentSpec).toContain('퀘스트 전 첫 캡슐은 5잼')
  })

  it('100% 횟수 카드는 advance_count 기본값(챕터 1~9)을 적고 챕터 10은 횟수 없음이라고 적으며 캡슐 구역으로 이어진다', () => {
    const card = find('ch12-advance-count')
    expect(card?.type).toBe('admin_link')
    expect(card?.dbTable).toBe('capsule_chapter_costs')
    expect(card?.dbColumn).toBe('advance_count')
    expect(card?.adminLink?.href).toBe('/admin/balance#capsule')
    for (const [index, advance] of CAPSULE_CHAPTER_DEFAULT_ADVANCE.entries()) {
      expect(card?.currentSpec, `챕터 ${index + 1}`).toContain(`${index + 1}(${advance}`)
    }
    expect(card?.currentSpec).toContain('챕터 10은 횟수 없음')
  })

  it('자동 채움·보지 않은 결과 카드의 코드 위치가 실재한다', () => {
    for (const id of ['ch5-auto-fill', 'ch5-unseen-result']) {
      const card = find(id)
      expect(card?.ticketId, id).toBe('20261028_1733')
      expect(existsSync(`${repoRoot}${card?.codeLocation}`), `${id}의 코드 위치가 실재해야 합니다`).toBe(true)
    }
  })

  it('점수 카드 두 개는 모은 잼이 더는 점수를 쌓지 않는다고 적는다', () => {
    expect(find('ch12-jam-weekly-cap')?.currentSpec).toContain('점수에 반영되지 않음')
    expect(find('ch12-score-thresholds')?.currentSpec).toContain('모든 활동이 점수를 쌓지 않음')
  })
})

describe('서비스 활동 잼 항목 (티켓 20261028_1735 4회)', () => {
  const find = (id: string) => POLICIES_DATA.find((p) => p.id === id)
  const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))

  it('서비스 활동 잼 카드는 4장에 있고 service_jam_rules를 밸런스 설정 «서비스 활동 잼» 구역으로 잇는다', () => {
    const card = find('ch4-service-jam')
    expect(card?.chapter).toBe(4)
    expect(card?.type).toBe('admin_link')
    expect(card?.dbTable).toBe('service_jam_rules')
    expect(card?.adminLink?.href).toBe('/admin/balance#servicejam')
    // 값이 아홉 칸이라 한 칸만 읽어 보이지 않는다
    expect(card?.adminLink?.liveField).toBeUndefined()
    expect(card?.ticketId).toBe('20261028_1735')
    expect(existsSync(`${repoRoot}${card?.codeLocation}`), '코드 위치가 실재해야 합니다').toBe(true)
  })

  it('기본 고정값 7종과 하루·주간 상한은 설정 구역의 기본값과 같다', () => {
    const spec = find('ch4-service-jam')?.currentSpec ?? ''
    const A = SERVICE_JAM_DEFAULT_AMOUNTS
    for (const text of [
      `잠긴 아이템 배지 열기 ${A.locked_unlock}`,
      `배지 받기 ${A.badge_earned}`,
      `믹스 성공(등급 올리기 포함) ${A.combine_success}`,
      `미션 완료 ${A.mission_complete}`,
      `컬렉션 완성(등급 무관) ${A.collection_complete}`,
      `드랍 ${A.drop}`,
      `픽업 ${A.pickup}잼`,
      `하루(KST) ${SERVICE_JAM_DEFAULT_CAPS.service_jam_daily_cap}잼`,
      `주간(월~일 KST) ${SERVICE_JAM_DEFAULT_CAPS.service_jam_weekly_cap}잼`,
    ]) {
      expect(spec, text).toContain(text)
    }
  })

  it('상한 0은 «지급 0»이고 일부 지급·한 번만 지급·이용 정지·지급 직후 채움·재진입 건너뜀을 적는다', () => {
    const spec = find('ch4-service-jam')?.currentSpec ?? ''
    for (const text of [
      '상한 0은 «상한 없음»이 아니라 지급 0',
      '남은 만큼만 일부 지급',
      '한 번만 지급',
      '이용 정지 중에는 지급하지 않음',
      '캡슐 가득 참은 종류에 없음',
      '지급 직후 캡슐 자동 채움',
      '안쪽 호출은 건너뜀',
    ]) {
      expect(spec, text).toContain(text)
    }
  })

  it('잠김 해금 카드는 서비스 활동 잼 5잼을 적고 챕터 점수 가산 문구가 남아 있지 않다', () => {
    const card = find('ch7-locked-open-score')
    expect(card?.currentSpec).toContain('locked_unlock')
    expect(card?.currentSpec).toContain('기본 5잼')
    expect(card?.adminLink?.href).toBe('/admin/balance#servicejam')
    expect(`${card?.title} ${card?.userExperience}`).not.toContain('챕터 점수')
    expect(card?.currentSpec).not.toContain('10점 가산')
  })

  it('챕터 점수 카드 두 개는 모든 활동의 점수 쌓기가 멈췄고 삭제는 후속 정리라고 적는다', () => {
    for (const id of ['ch12-score-thresholds', 'ch12-jam-weekly-cap']) {
      expect(find(id)?.currentSpec, id).toContain('U11')
      expect(find(id)?.ticketId, id).toBe('20261028_1735')
    }
    expect(find('ch12-score-thresholds')?.currentSpec).not.toContain('나머지 활동의 점수는 아직 쌓임')
  })
})

describe('캡슐 보류·잼 소멸·알림 항목 (티켓 20261028_1734 4회)', () => {
  const find = (id: string) => POLICIES_DATA.find((p) => p.id === id)
  const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url))
  const IDS = [
    'ch5-pending-reward',
    'ch5-claim-pending',
    'ch5-jam-forfeit',
    'ch5-forfeit-weekly',
    'ch5-capsule-alerts',
    'ch16-suspension-capsule-hold',
  ]

  it('새 항목 6개가 있고 코드 위치가 실재한다', () => {
    for (const id of IDS) {
      const card = find(id)
      expect(card, id).toBeDefined()
      expect(card?.ticketId, id).toBe('20261028_1734')
      expect(existsSync(`${repoRoot}${card?.codeLocation}`), `${id}의 코드 위치가 실재해야 합니다`).toBe(true)
    }
  })

  it('보류는 최대 2개이고 보류가 있으면 새로 가득 찬 보상도 보류한다', () => {
    expect(find('ch5-pending-reward')?.currentSpec).toContain('최대 2개')
    expect(find('ch5-pending-reward')?.currentSpec).toContain('바로 보류')
    expect(find('ch5-pending-reward')?.dbTable).toBe('capsule_pending_rewards')
  })

  it('받기는 오래된 것부터 빈칸이 닿는 만큼이고 보상을 포기하는 버튼이 없다', () => {
    const spec = find('ch5-claim-pending')?.currentSpec ?? ''
    expect(spec).toContain('오래된 보류')
    expect(spec).toContain('포기하는 버튼은 없음')
  })

  it('소멸은 지갑 전액을 capsule_forfeit으로 기록하고 정지 중에는 소멸하지 않으며 주간 뷰가 집계한다', () => {
    const spec = find('ch5-jam-forfeit')?.currentSpec ?? ''
    expect(spec).toContain('지갑 잼 전액')
    expect(spec).toContain('capsule_forfeit')
    expect(spec).toContain('이용 정지 중에는')
    expect(find('ch5-forfeit-weekly')?.dbTable).toBe('jam_forfeit_weekly')
    expect(find('ch16-suspension-capsule-hold')?.currentSpec).toContain('user_suspended')
  })

  it('알림 단계는 70·80·90이고 보류가 하나일 때만이며 둘째 보류 소식은 한 건이다', () => {
    const spec = find('ch5-capsule-alerts')?.currentSpec ?? ''
    for (const text of ['70·80·90%', '보류가 정확히 1개인 동안만', '단계마다 최대 1회', '가장 높은 단계 하나', 'capsule_jam_blocked', 'capsule_nearly_full']) {
      expect(spec, text).toContain(text)
    }
    expect(find('ch5-capsule-alerts')?.dbColumn).toBe('alert_stage')
  })

  it('챕터 횟수 카드는 100%에 닿는 시점에 센다고 적는다', () => {
    expect(find('ch12-advance-count')?.currentSpec).toContain('100%에 처음 닿는 시점')
  })
})
