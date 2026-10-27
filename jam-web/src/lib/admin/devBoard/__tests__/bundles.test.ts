/**
 * 묶음 진행 계산과 묶음 상수 (티켓 20261026_2028 2회차)
 *
 * 지키는 것:
 * - 묶음 티켓 자신은 세지 않고 자손 전체(3단계 포함)에서 끝남·진행·남음을 센다
 * - 저장소의 실제 색인으로 묶음 8개를 다른 방식(반복 확장)으로 센 값과 같다
 * - `JAM2_BUNDLES`의 번호·이름·티켓 ID가 상위 티켓 `20261016_2335`의 「묶음」 표와 같다(드리프트 방지)
 *
 * 실행: cd jam-web && npx vitest run src/lib/admin/devBoard/__tests__/bundles.test.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { bundleProgress } from '../board'
import { JAM2_BUNDLES, JAM2_ROOT_ID, TICKET_INDEX_PATH } from '../constants'
import { parseTicketIndex } from '../ticketIndex'
import type { TicketIndexEntry } from '../types'
import { entry } from './fixtures'

const REPO_ROOT = resolve(__dirname, '../../../../../..')

describe('bundleProgress', () => {
  it('묶음 티켓 자신을 빼고 3단계 자손까지 끝남·진행·남음으로 센다', () => {
    const bundles = [{ number: 9, name: '시험', ticketId: 'B' }]
    const entries = [
      entry({ id: 'B', status: 'IN_PROGRESS' }),
      entry({ id: 'c1', parent: 'B', status: 'CLOSED' }),
      entry({ id: 'c2', parent: 'B', status: 'IN_PROGRESS' }),
      entry({ id: 'c3', parent: 'B', status: 'OPEN' }),
      entry({ id: 'g1', parent: 'c1', status: 'CLOSED' }),
      entry({ id: 'g2', parent: 'c3', status: 'WAITING' }),
      entry({ id: 'gg1', parent: 'g2', status: 'CLOSED' }),
      entry({ id: 'elsewhere', parent: 'zzz', status: 'OPEN' }),
    ]
    expect(bundleProgress(entries, bundles)).toEqual([
      { number: 9, name: '시험', ticketId: 'B', done: 3, active: 1, remaining: 2, total: 6 },
    ])
  })

  it('하위가 없으면 모두 0이다', () => {
    expect(bundleProgress([entry({ id: 'B' })], [{ number: 0, name: 'x', ticketId: 'B' }])[0]).toMatchObject({ total: 0, done: 0 })
  })

  it('순환 parent에도 끝난다', () => {
    const entries = [entry({ id: 'B', parent: 'c' }), entry({ id: 'a', parent: 'B' }), entry({ id: 'c', parent: 'a' })]
    expect(bundleProgress(entries, [{ number: 0, name: 'x', ticketId: 'B' }])[0].total).toBe(2)
  })
})

describe('저장소의 실제 색인', () => {
  const parsed = parseTicketIndex(readFileSync(resolve(REPO_ROOT, TICKET_INDEX_PATH), 'utf-8'))

  it('색인을 읽을 수 있고 깨진 항목이 없다', () => {
    expect(parsed).not.toBeNull()
    expect(parsed?.invalid).toBe(0)
  })

  it('묶음 8개의 개수가 반복 확장으로 직접 센 값과 같다', () => {
    const entries = parsed?.entries ?? []
    const progress = bundleProgress(entries, JAM2_BUNDLES)
    for (const bundle of progress) {
      // 다른 방식: 부모 id 집합을 더 늘어나지 않을 때까지 넓힌다
      const ids = new Set<string>([bundle.ticketId])
      let grew = true
      while (grew) {
        grew = false
        for (const e of entries) {
          if (e.parent !== '' && ids.has(e.parent) && !ids.has(e.id)) {
            ids.add(e.id)
            grew = true
          }
        }
      }
      const members: TicketIndexEntry[] = entries.filter((e) => e.parent !== '' && ids.has(e.parent) && e.id !== bundle.ticketId)
      expect(bundle.total, `묶음 ${bundle.number}`).toBe(members.length)
      expect(bundle.done).toBe(members.filter((e) => e.status === 'CLOSED').length)
      expect(bundle.active).toBe(members.filter((e) => e.status === 'IN_PROGRESS').length)
      expect(bundle.done + bundle.active + bundle.remaining).toBe(bundle.total)
    }
    // 하위가 있는 묶음이 하나라도 있어야 위 대조가 빈 껍데기가 아니다
    expect(progress.some((b) => b.total > 0)).toBe(true)
  })

  it('묶음 티켓은 상위 티켓의 하위로 색인에 있다', () => {
    const entries = parsed?.entries ?? []
    for (const bundle of JAM2_BUNDLES) {
      const found = entries.find((e) => e.id === bundle.ticketId)
      expect(found?.parent, `묶음 ${bundle.number}`).toBe(JAM2_ROOT_ID)
    }
  })
})

describe('JAM2_BUNDLES와 상위 티켓 표', () => {
  const dir = resolve(REPO_ROOT, 'docs/tickets/p2-normal')
  const file = readdirSync(dir).find((name) => name.startsWith(`${JAM2_ROOT_ID}_`))

  it('상위 티켓 파일이 있다', () => {
    expect(file).toBeDefined()
  })

  it('번호·이름·티켓 ID가 「묶음」 표의 0~7행과 같다', () => {
    const text = readFileSync(resolve(dir, file as string), 'utf-8')
    const rows = text
      .split('\n')
      .map((line) => line.split('|').map((cell) => cell.trim()))
      .map((cells) => {
        const label = /^(\d+)\.\s+(.+?)(?:\s*\(.*\))?$/.exec(cells[1] ?? '')
        const ticket = /^(\d{8}_\d{4})/.exec(cells[4] ?? '')
        return label && ticket ? { number: Number(label[1]), name: label[2], ticketId: ticket[1] } : null
      })
      .filter((row): row is { number: number; name: string; ticketId: string } => row !== null)
    expect(rows).toEqual(JAM2_BUNDLES.map((b) => ({ number: b.number, name: b.name, ticketId: b.ticketId })))
  })
})
