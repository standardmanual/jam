import { describe, expect, it } from 'vitest'
import { COMBINE_IN_CHUNK_SIZE, chunkList, selectInChunks } from '../chunked-in'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`)

describe('chunkList 경계', () => {
  it('빈 목록은 묶음이 없다', () => {
    expect(chunkList([])).toEqual([])
  })

  it('한도 이하는 한 묶음이다', () => {
    expect(chunkList(ids(COMBINE_IN_CHUNK_SIZE)).map((c) => c.length)).toEqual([COMBINE_IN_CHUNK_SIZE])
  })

  it('한도를 1개 넘으면 두 묶음으로 나뉜다', () => {
    expect(chunkList(ids(COMBINE_IN_CHUNK_SIZE + 1)).map((c) => c.length)).toEqual([COMBINE_IN_CHUNK_SIZE, 1])
  })

  it('한도의 정수배는 빈 묶음을 만들지 않는다', () => {
    expect(chunkList(ids(COMBINE_IN_CHUNK_SIZE * 2)).map((c) => c.length)).toEqual([
      COMBINE_IN_CHUNK_SIZE,
      COMBINE_IN_CHUNK_SIZE,
    ])
  })
})

describe('selectInChunks', () => {
  it('ID가 없으면 조회하지 않는다', async () => {
    let calls = 0
    const result = await selectInChunks<string>([], async () => {
      calls += 1
      return { data: [], error: null }
    })
    expect(calls).toBe(0)
    expect(result).toEqual({ data: [], error: null })
  })

  it('한 번의 조회에 한도를 넘는 ID를 싣지 않고, 결과는 순서대로 합친다', async () => {
    const all = ids(COMBINE_IN_CHUNK_SIZE * 2 + 5)
    const sizes: number[] = []
    const result = await selectInChunks<string>(all, async (chunk) => {
      sizes.push(chunk.length)
      return { data: chunk, error: null }
    })
    expect(Math.max(...sizes)).toBeLessThanOrEqual(COMBINE_IN_CHUNK_SIZE)
    expect(sizes).toHaveLength(3)
    expect(result.data).toEqual(all)
    expect(result.error).toBeNull()
  })

  it('일부 묶음이 실패해도 성공한 묶음의 행은 돌려주고 첫 오류를 알린다', async () => {
    const all = ids(COMBINE_IN_CHUNK_SIZE + 1)
    const result = await selectInChunks<string>(all, async (chunk) =>
      chunk.length === 1 ? { data: null, error: { message: 'boom' } } : { data: chunk, error: null },
    )
    expect(result.data).toHaveLength(COMBINE_IN_CHUNK_SIZE)
    expect(result.error).toEqual({ message: 'boom' })
  })
})
