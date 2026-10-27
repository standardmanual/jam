/**
 * 개발·배포 상황판 화면 부품 (티켓 20261026_2028 3회차) — 서버 렌더(`renderToStaticMarkup`)로 그린 모양을 고정한다. 지키는 것:
 * - 배포 현황 네 장: 상태 글자 네 가지(기호 포함), 동결이면 사유, 앞선 커밋 수·못 읽음, 마지막 배포(KST·커밋 7자리·상태·main 커밋으로 대신한 표시), 다음 배포 일정
 * - 묶음 막대: `x`·`width`가 `%` 속성이고 합이 100, 하위 티켓이 없으면 막대 없이 「하위 티켓 없음」
 * - 보드 네 칸: 칸 머리 전체 개수, 요청 카드(「요청 N번」·출처), 「이 밖에 N건 더 있어요」, 「배포됨」의 추정 한 줄, 날짜 없음 한 줄
 * - 출처 글자는 `origin`이 있을 때만, 티켓 링크는 인코딩된 `blob/staging` 주소에 `target="_blank"`·`rel`
 * - 읽기 안내 줄은 문제가 있을 때만 그려지고, 어디에도 인라인 `style`이 없다
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { BoardCard, BoardColumns as BoardColumnsData, BundleProgress, DeployStatus } from '@/lib/admin/devBoard/types'
import { BoardColumns } from '../BoardColumns'
import { BundleProgressList } from '../BundleProgressList'
import { DeployStatusCards } from '../DeployStatusCards'
import { ReadNotices } from '../ReadNotices'

const html = (element: React.ReactElement) => renderToStaticMarkup(element).replace(/<!-- -->/g, '')
const textOf = (markup: string) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

function deploy(overrides: Partial<DeployStatus> = {}): DeployStatus {
  return {
    frozen: true,
    reason: 'JAM 2.0 출시 전까지 main 배포를 멈춤(2026-10-15 결정)',
    nextDeploy: 'JAM 2.0 출시 때',
    ahead: 1278,
    label: '동결',
    lastDeploy: { at: '2026-10-14T07:31:59Z', kstDate: '2026-10-14', sha: '1e2d55e2abc', state: 'success', estimated: false },
    ...overrides,
  }
}

describe('DeployStatusCards', () => {
  it('동결이면 상태 글자·기호·사유, 앞선 커밋 수, 마지막 배포(KST·7자리·상태), 다음 일정을 쓴다', () => {
    const markup = html(<DeployStatusCards deploy={deploy()} />)
    const text = textOf(markup)
    expect(markup).toContain('data-label="동결"')
    expect(text).toContain('■ 동결')
    expect(text).toContain('JAM 2.0 출시 전까지 main 배포를 멈춤')
    expect(text).toContain('staging이 main보다 1,278 커밋 앞서요')
    expect(text).toContain('2026.10.14 16:31')
    expect(text).toContain('커밋 1e2d55e · 성공')
    expect(text).toContain('JAM 2.0 출시 때')
    expect(markup).not.toContain('data-estimated')
  })

  it('상태 글자 네 가지가 각자 기호와 함께 그려진다 (색만으로 알리지 않는다)', () => {
    const symbols: Array<[DeployStatus['label'], string]> = [
      ['동결', '■'],
      ['배포 가능', '●'],
      ['배포할 것 없음', '–'],
      ['확인 안 됨', '!'],
    ]
    for (const [label, symbol] of symbols) {
      const markup = html(<DeployStatusCards deploy={deploy({ label, frozen: label === '동결' ? true : false })} />)
      expect(textOf(markup)).toContain(`${symbol} ${label}`)
    }
  })

  it('동결이 아니면 사유를 보이지 않는다', () => {
    const markup = html(<DeployStatusCards deploy={deploy({ frozen: false, label: '배포 가능' })} />)
    expect(textOf(markup)).not.toContain('main 배포를 멈춤')
  })

  it('앞선 커밋 수·마지막 배포·다음 일정을 못 읽었으면 「확인 안 됨」이다', () => {
    const markup = html(<DeployStatusCards deploy={deploy({ ahead: null, lastDeploy: null, nextDeploy: '', frozen: null, reason: '', label: '확인 안 됨' })} />)
    expect(textOf(markup).match(/확인 안 됨/g)).toHaveLength(4)
    expect(textOf(markup)).not.toContain('커밋 앞서요')
  })

  it('배포 기록이 없어 main 마지막 커밋 시각으로 대신했으면 그렇게 말한다', () => {
    const markup = html(
      <DeployStatusCards deploy={deploy({ lastDeploy: { at: '2026-10-13T01:00:00Z', kstDate: '2026-10-13', sha: 'cafebabe1', state: null, estimated: true } })} />
    )
    expect(markup).toContain('data-estimated')
    expect(textOf(markup)).toContain('main 마지막 커밋 시각이에요')
    expect(textOf(markup)).toContain('커밋 cafebab')
  })
})

describe('BundleProgressList', () => {
  const bundles: BundleProgress[] = [
    { number: 0, name: '정리', ticketId: 'a', done: 0, active: 0, remaining: 0, total: 0 },
    { number: 2, name: '활동에서 보상까지', ticketId: 'b', done: 11, active: 0, remaining: 6, total: 17 },
    { number: 6, name: '입장과 퇴장', ticketId: 'c', done: 7, active: 1, remaining: 37, total: 45 },
  ]
  const markup = html(<BundleProgressList bundles={bundles} />)

  it('줄마다 묶음 번호·이름과 끝남·진행·남음 개수 글자를 쓴다', () => {
    const text = textOf(markup)
    expect(text).toContain('묶음 2 · 활동에서 보상까지')
    expect(text).toContain('끝남 11 · 진행 0 · 남음 6 (전체 17)')
    expect(text).toContain('끝남 7 · 진행 1 · 남음 37 (전체 45)')
  })

  it('하위 티켓이 없는 묶음은 막대 없이 「하위 티켓 없음」이다', () => {
    const row = markup.split('<li').find((chunk) => chunk.includes('data-bundle="0"'))!
    expect(textOf(row)).toContain('하위 티켓 없음')
    expect(row).not.toContain('<svg')
    expect(markup.match(/<svg/g)).toHaveLength(2)
  })

  it('막대의 x·width는 % 속성이고 세 조각이 100%를 채운다', () => {
    const row = markup.split('<li').find((chunk) => chunk.includes('data-bundle="6"'))!
    const part = (name: string) => {
      const rect = row.match(new RegExp(`<rect data-part="${name}" x="([\\d.]+)%"[^>]*width="([\\d.]+)%"`))!
      return { x: Number(rect[1]), width: Number(rect[2]) }
    }
    const done = part('done')
    const active = part('active')
    const remaining = part('remaining')
    expect(done).toEqual({ x: 0, width: 15.56 })
    expect(active.x).toBeCloseTo(done.width, 5)
    expect(remaining.x).toBeCloseTo(done.width + active.width, 5)
    expect(remaining.x + remaining.width).toBeCloseTo(100, 5)
  })
})

function ticket(id: string, extra: Partial<BoardCard> = {}): BoardCard {
  return {
    kind: 'ticket',
    id,
    requestNo: null,
    title: `[Admin] 제목 ${id}`,
    category: 'Admin',
    priority: 'P2',
    origin: null,
    path: `docs/tickets/p2-normal/${id}_Admin_x.md`,
    ...extra,
  }
}

function columns(overrides: Partial<BoardColumnsData> = {}): BoardColumnsData {
  const empty = { cards: [], total: 0 }
  return { waiting: empty, progress: empty, staged: empty, deployed: empty, ...overrides }
}

describe('BoardColumns', () => {
  it('네 칸이 순서대로 나오고 칸 머리에 전체 개수가 있다', () => {
    const markup = html(
      <BoardColumns
        columns={columns({ waiting: { cards: [ticket('t1')], total: 435 }, progress: { cards: [], total: 14 } })}
        estimatedDeployed={false}
        undatedClosed={0}
      />
    )
    expect([...markup.matchAll(/data-column="(\w+)"/g)].map((m) => m[1])).toEqual(['waiting', 'progress', 'staged', 'deployed'])
    const waiting = markup.split('data-column="progress"')[0]
    expect(textOf(waiting)).toContain('대기 435')
    expect(textOf(markup)).toContain('진행 14')
    expect(textOf(markup)).toContain('staging 반영 0')
    expect(textOf(markup)).toContain('배포됨 0')
    expect(markup).toContain('md:grid-cols-2')
    expect(markup).toContain('xl:grid-cols-4')
    expect(markup).toContain('grid-cols-1')
  })

  it('요청 카드는 「요청 N번」과 출처 글자를 쓴다', () => {
    const request: BoardCard = {
      kind: 'request',
      id: 'request-7',
      requestNo: 7,
      title: '캡슐 확률을 코드 밖으로',
      category: '',
      priority: '',
      origin: 'eco',
      path: null,
    }
    const markup = html(<BoardColumns columns={columns({ waiting: { cards: [request, ticket('t1')], total: 2 } })} estimatedDeployed={false} undatedClosed={0} />)
    const card = markup.split('<li').find((chunk) => chunk.includes('data-kind="request"'))!
    expect(textOf(card)).toContain('요청 7번')
    expect(textOf(card)).toContain('캡슐 확률을 코드 밖으로')
    expect(textOf(card)).toContain('생태계에서')
    expect(card).not.toContain('<a ')
  })

  it('출처 글자는 티켓 origin이 있을 때만 쓴다', () => {
    const markup = html(
      <BoardColumns
        columns={columns({ waiting: { cards: [ticket('with', { origin: 'ops' }), ticket('without')], total: 2 } })}
        estimatedDeployed={false}
        undatedClosed={0}
      />
    )
    const rows = markup.split('<li').filter((chunk) => chunk.includes('data-kind="ticket"'))
    expect(textOf(rows.find((r) => r.includes('data-card-id="with"'))!)).toContain('운영에서')
    expect(rows.find((r) => r.includes('data-card-id="without"'))!).not.toContain('data-origin')
  })

  it('티켓 카드는 접두를 뗀 제목, 우선순위·카테고리, 인코딩한 새 탭 링크를 쓴다', () => {
    const card = ticket('20261026_2028', { path: 'docs/tickets/p2-normal/20261026_2028_Admin_개발 요청.md' })
    const markup = html(<BoardColumns columns={columns({ progress: { cards: [card], total: 1 } })} estimatedDeployed={false} undatedClosed={0} />)
    expect(textOf(markup)).toContain('제목 20261026_2028')
    expect(textOf(markup)).not.toContain('[Admin] 제목')
    expect(textOf(markup)).toContain('P2 · Admin')
    expect(markup).toContain(
      'href="https://github.com/standardmanual/jam/blob/staging/docs/tickets/p2-normal/20261026_2028_Admin_%EA%B0%9C%EB%B0%9C%20%EC%9A%94%EC%B2%AD.md"'
    )
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('rel="noopener noreferrer"')
  })

  it('담은 카드보다 전체가 많으면 칸 아래에 「이 밖에 N건 더 있어요」를 쓴다', () => {
    const markup = html(<BoardColumns columns={columns({ waiting: { cards: [ticket('a'), ticket('b')], total: 1432 } })} estimatedDeployed={false} undatedClosed={0} />)
    expect(textOf(markup)).toContain('이 밖에 1,430건 더 있어요')
    const none = html(<BoardColumns columns={columns({ waiting: { cards: [ticket('a')], total: 1 } })} estimatedDeployed={false} undatedClosed={0} />)
    expect(none).not.toContain('data-more')
  })

  it('추정이면 「배포됨」 머리에만 「추정」과 한 줄이 붙는다', () => {
    const markup = html(<BoardColumns columns={columns()} estimatedDeployed={true} undatedClosed={0} />)
    expect(markup.match(/data-estimated/g)).toHaveLength(1)
    const deployed = markup.split('data-column="deployed"')[1]
    expect(textOf(deployed)).toContain('추정')
    expect(textOf(deployed)).toContain('main에 티켓 색인이 없어 닫은 날짜로 가렸어요')
    const exact = html(<BoardColumns columns={columns()} estimatedDeployed={false} undatedClosed={0} />)
    expect(exact).not.toContain('data-estimated')
    expect(textOf(exact)).not.toContain('닫은 날짜로 가렸어요')
  })

  it('닫은 날짜가 없는 완료 티켓이 있으면 「staging 반영」·「배포됨」 칸 아래에만 알린다', () => {
    const markup = html(<BoardColumns columns={columns()} estimatedDeployed={true} undatedClosed={73} />)
    expect(markup.match(/data-undated/g)).toHaveLength(2)
    expect(textOf(markup.split('data-column="staged"')[1])).toContain('닫은 날짜가 없는 완료 티켓 73건은 이 칸에 넣지 않았어요')
    expect(textOf(markup.split('data-column="progress"')[1].split('data-column="staged"')[0])).not.toContain('닫은 날짜가 없는')
    expect(html(<BoardColumns columns={columns()} estimatedDeployed={true} undatedClosed={0} />)).not.toContain('data-undated')
  })
})

describe('ReadNotices', () => {
  it('안내가 없으면 아무것도 그리지 않는다', () => {
    expect(html(<ReadNotices notices={[]} />)).toBe('')
  })

  it('[현상](원인). 해결 한 줄씩 쓴다', () => {
    const markup = html(
      <ReadNotices notices={[{ key: 'rate_limited', summary: 'GitHub에서 일부를 불러오지 못했어요', cause: '읽기 한도를 넘었어요', fix: '서버에 GITHUB_READ_TOKEN을 설정하면 한도가 늘어요' }]} />
    )
    expect(textOf(markup)).toContain('GitHub에서 일부를 불러오지 못했어요(읽기 한도를 넘었어요). 서버에 GITHUB_READ_TOKEN을 설정하면 한도가 늘어요.')
    expect(markup).toContain('role="status"')
  })
})

describe('소스 점검', () => {
  it('화면 부품 파일 어디에도 인라인 style 속성이 없다', () => {
    const dir = path.resolve(__dirname, '..')
    const files = readdirSync(dir).filter((name) => name.endsWith('.tsx'))
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const name of files) {
      expect(readFileSync(path.join(dir, name), 'utf8'), name).not.toMatch(/\sstyle=\{/)
    }
  })

  it('렌더 결과에도 style 속성이 없다', () => {
    const markup = html(
      <>
        <DeployStatusCards deploy={deploy()} />
        <BundleProgressList bundles={[{ number: 1, name: '기반', ticketId: 'x', done: 1, active: 1, remaining: 1, total: 3 }]} />
        <BoardColumns columns={columns({ waiting: { cards: [ticket('a')], total: 1 } })} estimatedDeployed={true} undatedClosed={1} />
      </>
    )
    expect(markup).not.toMatch(/\sstyle="/)
  })
})
