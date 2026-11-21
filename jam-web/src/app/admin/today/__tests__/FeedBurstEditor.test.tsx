/**
 * 컬렉션 모션 입력 칸 (티켓 20261121_1317, 상위 20261120_2026 5회차-3)
 *
 * 확인하는 것: «자동»·«직접» 마크업, 범위 오류(칸·저장 검증과 같은 문구), «자동 값 불러오기» 결과가 검증을 통과하는지(시드 여러 개), 위치 칸이 빈 행은 저장이 막히는지.
 * 저장소에 jsdom이 없어(vitest.config.ts `environment: 'node'`) 서버 렌더(`renderToStaticMarkup`)와 순수 함수로 확인한다.
 *
 * 실행: cd jam-web && npx vitest run src/app/admin/today/__tests__/FeedBurstEditor.test.tsx
 */
import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ComponentProps } from 'react'

import FeedBurstEditor, {
  BURST_FIELDS,
  burstFieldInvalid,
  burstRowsFromSeed,
  burstRowWithPatch,
  burstSeedOf,
  burstValidation,
  isBlankBurstRow,
} from '../FeedBurstEditor'
import { buildFeedCardColumns, EMPTY_FEED_CARD_FORM_VALUES, validateFeedCardColumns, type FeedBurstFormValue } from '@/lib/admin/feedCardFields'

const row = (patch: Partial<FeedBurstFormValue> = {}): FeedBurstFormValue => ({ x: '0.5', y: '-0.5', tilt: '10', size: '76', delayMs: '100', ...patch })
const field = (key: string) => BURST_FIELDS.find((f) => f.key === key)!
const invalidInput = (html: string, id: string): boolean =>
  new RegExp(`<input[^>]*id="${id}"[^>]*aria-invalid="true"|<input[^>]*aria-invalid="true"[^>]*id="${id}"`).test(html)

const render = (props: Partial<ComponentProps<typeof FeedBurstEditor>> = {}): string =>
  renderToStaticMarkup(<FeedBurstEditor rows={[]} seed="" onChange={() => {}} {...props} />)

describe('FeedBurstEditor — 마크업', () => {
  it('«자동»이면 «홈이 카드마다 정해 줘요»만 보이고 숫자 칸은 없다', () => {
    const html = render()
    expect(html).toContain('홈이 카드마다 정해 줘요')
    expect(html).not.toContain('배지 1')
    expect(html).not.toContain('자동 값 불러오기')
  })

  it('«직접»이면 배지 4개마다 다섯 칸이 보이고 자동 값 불러오기 버튼이 있다', () => {
    const html = render({ rows: burstRowsFromSeed(7) })
    expect(html).toContain('자동 값 불러오기')
    for (const no of [1, 2, 3, 4]) {
      for (const f of BURST_FIELDS) expect(html, `${no}-${f.key}`).toContain(`id="feed-card-burst-${no}-${f.key}"`)
    }
    expect(html).toContain('break-keep wrap-break-word')
    expect(html).toContain('배지 1 가로 위치')
  })

  it('행이 4개보다 적어도 배지 4개 칸을 그린다', () => {
    expect(render({ rows: [row()] })).toContain('id="feed-card-burst-4-delayMs"')
  })

  it('범위 밖 값은 칸이 aria-invalid이고 저장 검증과 같은 문구가 보인다', () => {
    const html = render({ rows: [row({ x: '1.5', size: '90' })] })
    expect(invalidInput(html, 'feed-card-burst-1-x')).toBe(true)
    expect(invalidInput(html, 'feed-card-burst-1-size')).toBe(true)
    expect(invalidInput(html, 'feed-card-burst-1-y')).toBe(false)
    expect(html).toContain('1번째 모션 배지의 값이 범위 밖이에요. 가로 위치는 -1~1, 크기는 68~84 안으로 맞춰 주세요.')
  })
})

describe('범위 오류', () => {
  it('칸마다 범위를 지킨다(위치 −1~1, 크기 68~84, 기울기 −45~45, 지연 70~210)', () => {
    expect(burstFieldInvalid(field('x'), '1')).toBe(false)
    expect(burstFieldInvalid(field('x'), '-1')).toBe(false)
    expect(burstFieldInvalid(field('x'), '1.01')).toBe(true)
    expect(burstFieldInvalid(field('y'), '-1.01')).toBe(true)
    expect(burstFieldInvalid(field('size'), '67')).toBe(true)
    expect(burstFieldInvalid(field('size'), '68')).toBe(false)
    expect(burstFieldInvalid(field('size'), '84')).toBe(false)
    expect(burstFieldInvalid(field('size'), '85')).toBe(true)
    expect(burstFieldInvalid(field('tilt'), '45')).toBe(false)
    expect(burstFieldInvalid(field('tilt'), '-46')).toBe(true)
    expect(burstFieldInvalid(field('delayMs'), '69')).toBe(true)
    expect(burstFieldInvalid(field('delayMs'), '210')).toBe(false)
    expect(burstFieldInvalid(field('x'), 'abc')).toBe(true)
  })
  it('위치 칸은 비우면 오류이고 나머지 칸은 비워도 된다', () => {
    expect(burstFieldInvalid(field('x'), '')).toBe(true)
    expect(burstFieldInvalid(field('y'), '  ')).toBe(true)
    for (const key of ['size', 'tilt', 'delayMs']) expect(burstFieldInvalid(field(key), ''), key).toBe(false)
  })
  it('저장 검증도 같은 범위로 막는다', () => {
    expect(burstValidation([row()]).errors).toEqual([])
    expect(burstValidation([row({ tilt: '46' })]).errors.join(' ')).toContain('기울기는 -45~45도')
    expect(burstValidation([row({ delayMs: '300' })]).errors.join(' ')).toContain('지연은 70~210ms')
  })
  it('위치가 빈 행은 0으로 조용히 저장되지 않고 저장이 막힌다', () => {
    const columns = buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'collection_intro', collectionBurst: [row({ x: '' })] })
    expect(Number.isNaN(columns.collection_burst?.[0].x)).toBe(true)
    expect(burstValidation([row({ x: '' })]).errors.join(' ')).toContain('가로 위치는 -1~1')
  })
  it('모든 칸이 빈 행은 오류로 보지 않고 저장에서 떨어진다', () => {
    const blank = { x: '', y: '', tilt: '', size: '', delayMs: '' }
    expect(isBlankBurstRow(blank)).toBe(true)
    expect(burstValidation([blank]).errors).toEqual([])
    expect(buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'collection_intro', collectionBurst: [blank] }).collection_burst).toBeNull()
  })
})

describe('자동 값 불러오기', () => {
  it('시드 여러 개의 결과가 배지 4개이고 5-1 검증을 통과한다', () => {
    const seeds = [0, 1, 7, 42, 12345, 987654321, 2 ** 32 - 1, ...Array.from({ length: 40 }, (_, i) => i * 104729)]
    for (const seed of seeds) {
      const rows = burstRowsFromSeed(seed)
      expect(rows, `seed ${seed}`).toHaveLength(4)
      expect(burstValidation(rows).errors, `seed ${seed}`).toEqual([])
      for (const r of rows) for (const f of BURST_FIELDS) expect(burstFieldInvalid(f, r[f.key]), `seed ${seed} ${f.key}`).toBe(false)
      // 저장 모양까지 통과한다
      const columns = buildFeedCardColumns({ ...EMPTY_FEED_CARD_FORM_VALUES, feedType: 'collection_intro', collectionBurst: rows })
      expect(
        validateFeedCardColumns({ feed_type: 'collection_intro', collection_burst: columns.collection_burst }, { title: '' }).errors,
        `seed ${seed}`,
      ).toEqual([])
    }
  })
  it('같은 시드는 같은 값이다', () => {
    expect(burstRowsFromSeed(99)).toEqual(burstRowsFromSeed(99))
  })
  it('시드 칸이 올바르면 그 시드를 쓰고, 비었거나 틀리면 임시 시드를 만든다', () => {
    expect(burstSeedOf('12345', () => 1)).toBe(12345)
    expect(burstSeedOf('', () => 77)).toBe(77)
    expect(burstSeedOf('abc', () => 88)).toBe(88)
    expect(burstSeedOf('-3', () => 99)).toBe(99)
    expect(burstSeedOf('1.5', () => 5)).toBe(5)
    expect(burstSeedOf('4294967296', () => 6)).toBe(6)
  })
  it('칸 하나를 고치면 그 행·칸만 바뀐다', () => {
    const rows = burstRowsFromSeed(3)
    const next = burstRowWithPatch(rows, 2, { size: '70' })
    expect(next[2].size).toBe('70')
    expect(next[2].x).toBe(rows[2].x)
    expect(next[1]).toEqual(rows[1])
  })
})
