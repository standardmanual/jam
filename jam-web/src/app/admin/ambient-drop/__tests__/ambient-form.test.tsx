/**
 * 어드민 앰비언트 드랍 화면의 «정기 배포 설정» 폼 (티켓 20261022_1134 3회)
 *
 * 배포 시각·상호 배제 창·배치 규모·지점당 한도·등급 비율 숫자 칸은 밸런스 설정 «시스템 드랍» 구역으로 옮겼다. jsdom이 없어 서버 렌더(`renderToStaticMarkup`)로 처음 그린 모양만 고정한다:
 * - 숫자 입력칸이 하나도 없고, 옛 칸 이름도 남아 있지 않다
 * - 배포 시각은 읽기 전용 글자(KST와 때)로 보이고 «밸런스 설정에서 바꿔요» 한 줄이 있다. 안내에 링크는 두지 않는다(사용자 결정)
 * - 스위치와 세 축 고르기(`rarity_mode` 고르기 포함)는 그대로 있다
 * - 저장 본문(`axisSettingsPayload`)은 여섯 칸뿐이다
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_AMBIENT_DROP_CONFIG, type AmbientDropConfig } from '@/lib/ambient-drop/config'
import AmbientDropForm, { BALANCE_ONLY_NOTICE, RARITY_BALANCE_NOTICE, axisSettingsPayload } from '../AmbientDropForm'

const render = (initial: AmbientDropConfig = DEFAULT_AMBIENT_DROP_CONFIG, initialBlocked = false) =>
  renderToStaticMarkup(
    <AmbientDropForm initial={initial} categories={[{ slug: 'cafe', label: '카페' }]} books={[{ id: 'b1', name: '컬렉션 하나' }]} history={[]} initialBlocked={initialBlocked} />
  ).replace(/<!-- -->/g, '')

describe('AmbientDropForm — 숫자 칸 제거', () => {
  it('숫자 입력칸이 하나도 없다', () => {
    const out = render()
    expect(out).not.toContain('type="number"')
    expect(out).not.toMatch(/<input[^>]*type="(number|text)"/)
  })

  it('옛 숫자 칸의 이름이 남아 있지 않다(배포 시각 고르기, 상호 배제 창 입력, 배치 규모, 장소당 최대 활성 드랍, 등급 비율 입력과 합계)', () => {
    const out = render()
    for (const gone of ['예약 배포 시각 선택', '상호 배제 창 (분)', '배치 규모', '실행당 배치 개수', '장소당 최대 활성 드랍', '합: ', '1이어야 함']) {
      expect(out, gone).not.toContain(gone)
    }
    for (const label of ['Common', 'Rare', 'Epic', 'Mystic']) expect(out, label).not.toContain(`>${label}<`)
  })

  it('스위치, 세 축 고르기, 저장, 즉시 배포는 그대로 있다', () => {
    const out = render()
    expect(out).toContain('예약 배포 켜기')
    expect(out).toContain('축 1 — 카테고리')
    expect(out).toContain('축 2 — 등급 비율')
    expect(out).toContain('축 3 — 대상 컬렉션')
    // 축마다 «명시/무작위» 고르기가 있다(등급 축의 rarity_mode 고르기 포함)
    expect([...out.matchAll(/>명시</g)]).toHaveLength(3)
    expect([...out.matchAll(/>무작위</g)]).toHaveLength(3)
    expect(out).toContain('>저장<')
    expect(out).toContain('지금 배포')
  })

  it('저장 버튼은 처음부터 눌린다(등급 합계 검사를 이 폼이 하지 않는다)', () => {
    const out = render({ ...DEFAULT_AMBIENT_DROP_CONFIG, rarity_common: 0.5, rarity_rare: 0.2 })
    const tag = /<button[^>]*>저장<\/button>/.exec(out)?.[0]
    expect(tag).toBeDefined()
    // 클래스의 disabled:opacity-50이 아니라 disabled 속성이 없어야 한다
    expect(tag).not.toMatch(/\sdisabled(=""|\s|>)/)
  })
})

describe('AmbientDropForm — 배포 시각은 읽기 전용 글자', () => {
  it('배포 시각을 KST와 때로 보이고 «밸런스 설정에서 바꿔요» 한 줄이 있다', () => {
    const out = render({ ...DEFAULT_AMBIENT_DROP_CONFIG, schedule_hour_kst: 18 })
    expect(out).toContain('18:00 KST · 저녁')
    expect(out).toContain(BALANCE_ONLY_NOTICE)
    expect(BALANCE_ONLY_NOTICE).toBe('배포 시각과 상호 배제 창은 밸런스 설정에서 바꿔요.')
    expect(out).toContain('밸런스 설정에서 바꿔요')
  })

  it('안내에 링크를 두지 않는다(사용자 결정)', () => {
    const out = render()
    expect(out).not.toContain('/admin/balance')
    expect(out).not.toMatch(/<a [^>]*>[^<]*밸런스 설정/)
  })

  it('기본값(3시)이면 새벽 03:00 KST다', () => {
    expect(render()).toContain('03:00 KST · 새벽')
  })

  it('지금 배포가 막혀 있으면 읽은 상호 배제 창 분을 함께 알린다', () => {
    const out = render({ ...DEFAULT_AMBIENT_DROP_CONFIG, exclusion_window_minutes: 20 }, true)
    expect(out).toContain('예약 배포 시각 03:00 KST 전후 20분이라 배포가 겹칠 수 있어요')
  })

  it('고친 문장에 한국어 줄바꿈 클래스가 붙어 있다', () => {
    const out = render()
    const notice = new RegExp(`<p class="([^"]*)">${BALANCE_ONLY_NOTICE}</p>`).exec(out)
    expect(notice).not.toBeNull()
    for (const c of ['break-keep', 'wrap-break-word', 'text-pretty']) expect(notice?.[1], c).toContain(c)
  })
})

describe('AmbientDropForm — 등급 축', () => {
  it('명시이면 비율은 밸런스 설정에서 바꾼다는 한 줄뿐이다(비율 칸이 없다)', () => {
    const out = render({ ...DEFAULT_AMBIENT_DROP_CONFIG, rarity_mode: 'explicit' })
    expect(out).toContain(RARITY_BALANCE_NOTICE)
    expect(RARITY_BALANCE_NOTICE).toBe('저장된 등급 비율대로 정해요. 비율은 밸런스 설정에서 바꿔요.')
    expect(out).not.toContain('실행 시점에 등급 분포 자체를 무작위로 생성해요')
  })

  it('무작위이면 분포를 무작위로 만든다는 한 줄이다', () => {
    const out = render({ ...DEFAULT_AMBIENT_DROP_CONFIG, rarity_mode: 'random' })
    expect(out).toContain('실행 시점에 등급 분포 자체를 무작위로 생성해요')
    expect(out).not.toContain(RARITY_BALANCE_NOTICE)
  })
})

describe('axisSettingsPayload — 저장 본문', () => {
  const config: AmbientDropConfig = {
    ...DEFAULT_AMBIENT_DROP_CONFIG,
    auto_enabled: true,
    category_mode: 'explicit',
    category_slug: 'cafe',
    rarity_mode: 'random',
    collection_mode: 'explicit',
    collection_ids: ['c1'],
    // 화면이 들고 있는 숫자는 낡았을 수 있다
    schedule_hour_kst: 9,
    exclusion_window_minutes: 99,
    batch_size: 7,
    max_active_per_poi: 5,
    rarity_common: 0.5,
    rarity_rare: 0.5,
    rarity_epic: 0,
    rarity_mystic: 0,
    last_auto_run_on: '2026-10-23',
  }

  it('스위치와 세 축 고르기 여섯 칸만 싣는다', () => {
    expect(axisSettingsPayload(config)).toEqual({
      auto_enabled: true,
      category_mode: 'explicit',
      category_slug: 'cafe',
      rarity_mode: 'random',
      collection_mode: 'explicit',
      collection_ids: ['c1'],
    })
  })

  it('숫자 8칸과 last_auto_run_on을 싣지 않는다', () => {
    const payload = axisSettingsPayload(config) as Record<string, unknown>
    for (const key of [
      'schedule_hour_kst',
      'exclusion_window_minutes',
      'batch_size',
      'max_active_per_poi',
      'rarity_common',
      'rarity_rare',
      'rarity_epic',
      'rarity_mystic',
      'last_auto_run_on',
    ]) {
      expect(payload, key).not.toHaveProperty(key)
    }
    expect(Object.keys(payload)).toHaveLength(6)
  })
})
