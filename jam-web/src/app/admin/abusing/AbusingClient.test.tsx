/**
 * 어드민 어뷰징 화면의 «이용 정지» 탭 (티켓 20261017_1426 2회)과 «정책 설정» 탭 (티켓 20261021_1250, 6-4 2회)
 *
 * 저장소에 jsdom·testing-library가 없어 서버 렌더(`renderToStaticMarkup`)로 마크업만 고정한다. 가짜 props만 쓰며 공용 DB는 부르지 않는다.
 *
 * 고정하는 것: 탭 이름이 «이용 정지»(옛 «섀도우밴» 탭이 아니다)이고 진행 중 건수가 붙는다, 걸기 폼에 사유 입력과
 * «유저에게 그대로 보여요» 안내가 있고 레벨 선택(Soft/Hard)이 없다, 네이티브 select가 없다, 이력 표가 정지 사유·푼 기록을 보인다.
 * 정책 설정 탭(6-4 2회): 옛 «투트랙 정책» 안내·Soft-ban/Hard-ban 배율 입력 8칸·DB 배율 불일치 경고가 없고, GPS 임계값·장소 블록 시간 등 나머지 칸은 그대로다.
 */
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/admin/abusing',
  useSearchParams: () => new URLSearchParams('tab=suspensions'),
}))

import AbusingClient from './AbusingClient'
import { DEFAULT_POLICY } from '@/lib/abusing/policy'
import type { SuspensionRow } from '@/lib/admin/suspension-list'

const ROWS: SuspensionRow[] = [
  {
    id: 's1',
    user_id: '11111111-1111-4111-8111-111111111111',
    reason: 'GPS 조작이 반복돼서 정지했어요.',
    suspended_at: '2026-10-17T03:00:00.000Z',
    suspended_by: 'admin@jam.test',
    lifted_at: null,
    lifted_by: null,
    lift_note: null,
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'runner@jam.test', username: 'runner' },
  },
  {
    id: 's2',
    user_id: '22222222-2222-4222-8222-222222222222',
    reason: '지난 정지',
    suspended_at: '2026-09-01T03:00:00.000Z',
    suspended_by: 'admin@jam.test',
    lifted_at: '2026-09-05T03:00:00.000Z',
    lifted_by: 'ops@jam.test',
    lift_note: '소명 확인 후 해제',
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'old@jam.test', username: 'old' },
  },
]

function render(tab: 'policy' | 'suspensions' | 'poi-blocks', suspensions: SuspensionRow[] = ROWS) {
  return renderToStaticMarkup(
    <AbusingClient
      policy={DEFAULT_POLICY}
      tab={tab}
      counts={{ suspensions: 1, poiBlocks: 0 }}
      suspensions={suspensions}
      poiBlocks={[]}
      listTotal={suspensions.length}
      page={1}
      totalPages={1}
    />
  )
}

describe('AbusingClient — 이용 정지 탭', () => {
  const html = render('suspensions')

  it('탭 이름은 «이용 정지»이고 진행 중 건수가 붙으며 옛 «섀도우밴» 탭은 없다', () => {
    expect(html).toContain('이용 정지')
    expect(html).toContain('href="/admin/abusing?tab=suspensions"')
    expect(html).not.toContain('tab=bans')
    expect(html).not.toContain('>섀도우밴<')
  })

  it('걸기 폼에 사유 입력과 «유저에게 그대로 보여요» 안내가 있다', () => {
    expect(html).toContain('이용 정지 걸기')
    expect(html).toContain('placeholder="정지 사유 (필수)"')
    expect(html).toContain('유저에게 그대로 보여요')
    expect(html).toContain('aria-describedby="suspension-reason-hint"')
    expect(html).toContain('id="suspension-reason-hint"')
  })

  it('레벨 선택(Soft/Hard)과 네이티브 select가 없다', () => {
    expect(html).not.toContain('Soft-ban')
    expect(html).not.toContain('Hard-ban')
    expect(html).not.toContain('<select')
  })

  it('이력 표가 사유·정지 중 표시·푼 기록을 보인다', () => {
    expect(html).toContain('GPS 조작이 반복돼서 정지했어요.')
    expect(html).toContain('정지 중')
    expect(html).toContain('소명 확인 후 해제')
    expect(html).toContain('ops@jam.test')
    expect(html).toContain('풀기') // 진행 중인 줄에만 있다
    expect(html.match(/>풀기</g)).toHaveLength(1)
  })

  it('이력이 없으면 빈 상태 문구가 보인다', () => {
    expect(render('suspensions', [])).toContain('조건에 맞는 이용 정지가 없어요.')
  })

  it('한국어 줄바꿈 클래스가 붙은 안내 문구가 있다', () => {
    expect(html).toMatch(/id="suspension-reason-hint" class="[^"]*break-keep[^"]*wrap-break-word/)
  })
})

describe('AbusingClient — 정책 설정 탭 (옛 섀도우밴 배율 화면을 지웠다)', () => {
  const html = render('policy')

  it('«투트랙 정책» 안내와 Soft-ban·Hard-ban 배율 칸, 배율 슬라이더가 없다', () => {
    expect(html).not.toContain('투트랙')
    expect(html).not.toContain('Soft-ban')
    expect(html).not.toContain('Hard-ban')
    expect(html).not.toContain('드랍 배율')
    expect(html).not.toContain('type="range"')
    expect(html).not.toContain('섀도우밴')
  })

  it('DB 배율 불일치 경고가 없다', () => {
    expect(html).not.toContain('DB 배율이 코드 기본값과 달라요')
    expect(html).not.toContain('DEFAULT_POLICY')
  })

  it('GPS 임계값·차량 속도 필터·교통수단·종목 불일치·장소 블록 시간 칸과 저장 버튼은 그대로 있다', () => {
    for (const label of [
      'GPS 조작 감지',
      '이동 속도 임계값 (km/h)',
      '하루 누적 이동거리 상한 (km)',
      '차량 속도 필터 (km/h)',
      '교통수단 감지 — 걷기 최고속도 (km/h)',
      '교통수단 감지 — 러닝 최고속도 (km/h)',
      '교통수단 감지 — 자전거 최고속도 (km/h)',
      '교통수단 감지 — 최소 지속시간 (초)',
      '종목 불일치 — 러닝 최소 평균속도 (km/h)',
      '종목 불일치 — 자전거 최소 평균속도 (km/h)',
      '장소 블록 지속 시간 (시간)',
      '정책 저장',
    ]) {
      expect(html, label).toContain(label)
    }
    // 숫자 입력은 열 칸(GPS 속도·하루 거리·차량 필터·교통수단 넷·종목 불일치 둘·장소 블록 시간)이다
    expect(html.match(/type="number"/g)).toHaveLength(10)
  })

  it('머리말은 옛 «투트랙 섀도우밴» 대신 장소 GPS 조작 감지와 이용 정지를 말하고 줄바꿈 클래스가 붙는다', () => {
    expect(html).toContain('장소 GPS 조작 감지 + 이용 정지')
    expect(html).toMatch(/class="[^"]*break-keep[^"]*wrap-break-word[^"]*"[^>]*>장소 GPS 조작 감지 \+ 이용 정지/)
  })

  it('탭은 정책 설정·이용 정지·장소 블록 셋이다', () => {
    expect(html).toContain('정책 설정')
    expect(html).toContain('href="/admin/abusing?tab=suspensions"')
    expect(html).toContain('href="/admin/abusing?tab=poi-blocks"')
    expect(html).not.toContain('tab=bans')
  })
})
