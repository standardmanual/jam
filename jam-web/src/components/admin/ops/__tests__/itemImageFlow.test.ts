/**
 * 승인 직후 이미지 제작 흐름 (티켓 20261007_0947 ③-b1). 렌더·업로드는 주입하고, 던지지 않는 것과 건너뜀 사유를 고정한다.
 */
import { describe, it, expect, vi } from 'vitest'
import { seedFromBundleId } from '@/lib/admin/opsInbox/imageTarget'
import { SKIP_MESSAGES, makeItemImage, type MakeItemImageInput } from '../itemImageFlow'

const spec = { preset_id: 'card-a', bg: '#112233', end: '#AABBCC', values: { text01: '문구' } }
const blob = new Blob(['x'], { type: 'image/png' })

function input(overrides: Partial<MakeItemImageInput> = {}): MakeItemImageInput {
  return {
    bundleId: 'bundle-1',
    itemId: 'item-1',
    kind: 'home_feed_card',
    isSample: false,
    item: { original: { image_spec: spec } as never, edited: null },
    render: vi.fn(async () => blob),
    post: vi.fn(async () => ({ ok: true as const, url: 'https://img.test/a.png' })),
    ...overrides,
  }
}

describe('makeItemImage', () => {
  it('렌더 후 올리고 done을 돌려준다(시드는 묶음 ID에서)', async () => {
    const i = input()
    expect(await makeItemImage(i)).toEqual({ status: 'done', url: 'https://img.test/a.png' })
    expect(i.render).toHaveBeenCalledWith({
      presetId: 'card-a',
      bg: '#112233',
      end: '#AABBCC',
      values: { text01: '문구' },
      seed: seedFromBundleId('bundle-1'),
    })
    expect(i.post).toHaveBeenCalledWith('bundle-1', 'item-1', blob)
  })

  it.each([
    ['시험 묶음', { isSample: true }, 'sample'],
    ['이미지 칸 없는 종류', { kind: 'badge_drop' }, 'no_image_kind'],
    ['지시 없음', { item: { original: {} as never, edited: null } }, 'missing'],
    ['형식 오류', { item: { original: { image_spec: { ...spec, bg: 'x' } } as never, edited: null } }, 'invalid'],
  ] as const)('%s는 건너뛰고 렌더·업로드를 부르지 않는다', async (_name, over, reason) => {
    const i = input(over as Partial<MakeItemImageInput>)
    expect(await makeItemImage(i)).toEqual({ status: 'skipped', reason, message: SKIP_MESSAGES[reason] })
    expect(i.render).not.toHaveBeenCalled()
    expect(i.post).not.toHaveBeenCalled()
  })

  it('렌더가 던져도 던지지 않고 failed(render)다', async () => {
    const i = input({
      render: vi.fn(async () => {
        throw new Error('글꼴을 불러오지 못했어요')
      }),
    })
    expect(await makeItemImage(i)).toEqual({ status: 'failed', reason: 'render', message: '글꼴을 불러오지 못했어요' })
    expect(i.post).not.toHaveBeenCalled()
  })

  it('업로드 실패는 서버 문장과 함께 failed(upload)다', async () => {
    const i = input({ post: vi.fn(async () => ({ ok: false as const, status: 500, message: '저장 실패' })) })
    expect(await makeItemImage(i)).toEqual({ status: 'failed', reason: 'upload', message: '저장 실패' })
  })

  it('업로드가 던져도 던지지 않는다', async () => {
    const i = input({
      post: vi.fn(async () => {
        throw new Error('boom')
      }),
    })
    expect(await makeItemImage(i)).toMatchObject({ status: 'failed', reason: 'upload' })
  })
})
