/**
 * 항목 이미지 저장·정리 (티켓 20261006_1801). 메모리 DB(`execute/__tests__/fakeDb.ts`)로 지킨다.
 *
 * - 종류별 이미지 칸·저장 경로(항목 ID 기준, 자원 ID 경로 아님)
 * - `applyItemImage`: 항목 `edited.resource`에 기존 값과 합쳐 쓰기, 예약된 뒤 자원 행 갱신, 시험 묶음·자원 ID 없음은 항목만, 충돌 재시도, 거절 상태
 * - `removeOpsImageFiles`: 두 파일 정리, 이미지 없는 종류는 무동작, 실패해도 던지지 않음
 */
import { vi, describe, it, expect, beforeEach, type MockInstance } from 'vitest'
import { applyItemImage, imageKeyOfKind, removeOpsImageFiles, storagePathOf } from '../image'
import { imageKeyOfKind as imageKeyOfKindShared } from '../imageSpec'
import { FakeDb,type Row } from '../execute/__tests__/fakeDb'
import { makeItem, type ItemSpec } from '../execute/__tests__/fixtures'

const ITEM = '00000000-0000-4000-8000-000000000001'
const RES = '00000000-0000-4000-8000-000000000011'
const URL = 'https://cdn.test/images/ops-inbox/today_cards/x.webp?v=1'

let errorSpy: MockInstance<typeof console.error>
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  errorSpy.mockClear()
})

function setup(spec: ItemSpec) {
  const db = new FakeDb()
  db.tables.ops_bundle_items = [{ ...makeItem({ id: ITEM, key: 'k', ...spec }) }]
  return db
}

describe('이미지 칸과 저장 경로', () => {
  it('카드는 cover_image_url, 미션·배지·컬렉션은 image_url, 그 밖의 종류는 없다', () => {
    expect(imageKeyOfKind).toBe(imageKeyOfKindShared) // image.ts는 공용 모듈 imageSpec.ts의 함수를 다시 내보낸다
    expect(imageKeyOfKind('home_feed_card')).toBe('cover_image_url')
    expect(['mission', 'jam_badge', 'collection_launch'].map(imageKeyOfKind)).toEqual(['image_url', 'image_url', 'image_url'])
    expect([imageKeyOfKind('recipe'), imageKeyOfKind('drop_schedule'), imageKeyOfKind(null), imageKeyOfKind('constructor')]).toEqual([null, null, null, null])
  })

  it('경로는 항목 ID 기준이고 기존 이미지 경로와 겹치지 않는다', () => {
    expect(storagePathOf('mission', ITEM)).toEqual({ pngPath: `ops-inbox/missions/${ITEM}.png`, webpPath: `ops-inbox/missions/${ITEM}.webp` })
    expect(storagePathOf('home_feed_card', ITEM)?.webpPath).toBe(`ops-inbox/today_cards/${ITEM}.webp`)
    expect(storagePathOf('jam_badge', ITEM)?.webpPath).toBe(`ops-inbox/badges/${ITEM}.webp`)
    expect(storagePathOf('collection_launch', ITEM)?.webpPath).toBe(`ops-inbox/item_books/${ITEM}.webp`)
    expect(storagePathOf('recipe', ITEM)).toBeNull()
  })
})

describe('applyItemImage', () => {
  it('승인된 항목은 edited.resource에 기존 resource와 합쳐 쓴다. 다른 edited 키는 그대로다', async () => {
    const db = setup({ kind: 'home_feed_card', status: 'approved', resource: { title: '제목', cover_image_url: 'old' }, edited: { copy: ['a'] } })
    const result = await applyItemImage(db.service, { itemId: ITEM, url: URL })
    expect(result).toEqual({ ok: true, resourceWritten: true })
    expect(db.item(ITEM).edited).toEqual({ copy: ['a'], resource: { title: '제목', cover_image_url: URL } })
    expect(db.calls.some((call) => call.table === 'today_cards')).toBe(false)
  })

  it('수정본에 resource가 이미 있으면 그 값과 합친다', async () => {
    const db = setup({ kind: 'mission', status: 'reviewing', resource: { a: 1 }, edited: { resource: { b: 2 } } })
    await applyItemImage(db.service, { itemId: ITEM, url: URL })
    expect(db.item(ITEM).edited).toEqual({ resource: { b: 2, image_url: URL } })
  })

  it('항목의 updated_at을 조건으로 건다', async () => {
    const db = setup({ kind: 'mission', status: 'approved', updatedAt: '2026-10-04T00:00:00.000Z' })
    await applyItemImage(db.service, { itemId: ITEM, url: URL })
    const write = db.itemWrites()[0]
    expect(write.filters).toContainEqual(['updated_at', '2026-10-04T00:00:00.000Z'])
  })

  it('예약된 뒤에는 created_resource가 가리키는 자원 행의 이미지 칸에도 쓴다', async () => {
    const db = setup({ kind: 'jam_badge', status: 'scheduled', createdResource: { badge_id: RES } })
    db.tables.badges = [{ id: RES, image_url: null }, { id: 'other', image_url: 'keep' }]
    const result = await applyItemImage(db.service, { itemId: ITEM, url: URL })
    expect(result).toEqual({ ok: true, resourceWritten: true })
    expect(db.tables.badges).toEqual([{ id: RES, image_url: URL }, { id: 'other', image_url: 'keep' }])
    expect((db.item(ITEM).edited as Row).resource).toEqual({ image_url: URL })
  })

  it('카드는 today_cards.cover_image_url에 쓴다', async () => {
    const db = setup({ kind: 'home_feed_card', status: 'live', createdResource: { today_card_id: RES } })
    db.tables.today_cards = [{ id: RES }]
    await applyItemImage(db.service, { itemId: ITEM, url: URL })
    expect(db.tables.today_cards).toEqual([{ id: RES, cover_image_url: URL }])
  })

  it('시험 묶음(sample)이거나 자원 ID가 없으면 항목에만 쓴다', async () => {
    const sample = setup({ kind: 'mission', status: 'scheduled', createdResource: { sample: true } })
    expect(await applyItemImage(sample.service, { itemId: ITEM, url: URL })).toEqual({ ok: true, resourceWritten: true })
    expect(sample.calls.some((call) => call.table === 'missions')).toBe(false)
    const none = setup({ kind: 'mission', status: 'approved' })
    await applyItemImage(none.service, { itemId: ITEM, url: URL })
    expect(none.calls.some((call) => call.table === 'missions')).toBe(false)
  })

  it('자원 쓰기가 실패하면 항목에는 남기고 resourceWritten: false다. 원문은 로그에만 있다', async () => {
    const db = setup({ kind: 'mission', status: 'scheduled', createdResource: { mission_id: RES } })
    db.tables.missions = [{ id: RES }]
    db.failIf = (call) => call.table === 'missions' && call.op === 'update'
    const result = await applyItemImage(db.service, { itemId: ITEM, url: URL })
    expect(result).toEqual({ ok: true, resourceWritten: false })
    expect((db.item(ITEM).edited as Row).resource).toEqual({ image_url: URL })
    expect(errorSpy).toHaveBeenCalled()
  })

  it('그사이 항목이 바뀌면 한 번 다시 읽어 쓴다', async () => {
    const db = setup({ kind: 'mission', status: 'approved' })
    let bumped = false
    db.beforeRun = (call) => {
      if (!bumped && call.table === 'ops_bundle_items' && call.op === 'update') {
        bumped = true
        db.item(ITEM).updated_at = '2026-10-05T00:00:00.000Z'
      }
    }
    expect(await applyItemImage(db.service, { itemId: ITEM, url: URL })).toEqual({ ok: true, resourceWritten: true })
    expect(db.itemWrites()).toHaveLength(2)
  })

  it('계속 충돌하면 conflict다', async () => {
    const db = setup({ kind: 'mission', status: 'approved' })
    let n = 0
    db.beforeRun = (call) => {
      if (call.table === 'ops_bundle_items' && call.op === 'update') db.item(ITEM).updated_at = `2026-10-05T00:00:0${++n}.000Z`
    }
    expect(await applyItemImage(db.service, { itemId: ITEM, url: URL })).toEqual({ ok: false, code: 'conflict' })
  })

  it('반려·취소·실패·종료 항목, 이미지 칸이 없는 종류, 없는 항목은 거절하고 쓰지 않는다', async () => {
    for (const status of ['rejected', 'cancelled', 'failed', 'ended']) {
      const db = setup({ kind: 'mission', status })
      expect(await applyItemImage(db.service, { itemId: ITEM, url: URL })).toEqual({ ok: false, code: 'not_allowed' })
      expect(db.itemWrites()).toEqual([])
    }
    const recipe = setup({ kind: 'recipe', status: 'approved' })
    expect(await applyItemImage(recipe.service, { itemId: ITEM, url: URL })).toEqual({ ok: false, code: 'no_image_field' })
    expect(await applyItemImage(new FakeDb().service, { itemId: ITEM, url: URL })).toEqual({ ok: false, code: 'not_found' })
  })

  it('DB 오류는 error 코드이고 원문은 로그에만 있다', async () => {
    const db = setup({ kind: 'mission', status: 'approved' })
    db.failIf = (call) => call.op === 'update'
    expect(await applyItemImage(db.service, { itemId: ITEM, url: URL })).toEqual({ ok: false, code: 'error' })
    expect(errorSpy).toHaveBeenCalled()
  })
})

describe('removeOpsImageFiles', () => {
  it('두 파일을 images 버킷에서 지운다', async () => {
    const db = new FakeDb()
    await removeOpsImageFiles(db.service, { kind: 'mission', itemId: ITEM })
    expect(db.removedFiles).toEqual([{ bucket: 'images', paths: [`ops-inbox/missions/${ITEM}.png`, `ops-inbox/missions/${ITEM}.webp`] }])
  })

  it('이미지 칸이 없는 종류는 아무것도 하지 않는다', async () => {
    const db = new FakeDb()
    await removeOpsImageFiles(db.service, { kind: 'recipe', itemId: ITEM })
    expect(db.removedFiles).toEqual([])
  })

  it('저장소가 오류를 돌려주거나 던져도 던지지 않고 로그만 남긴다', async () => {
    const failing = { storage: { from: () => ({ remove: async () => ({ error: { message: 'boom' } }) }) } }
    await expect(removeOpsImageFiles(failing as never, { kind: 'mission', itemId: ITEM })).resolves.toBeUndefined()
    const throwing = {
      storage: {
        from: () => ({
          remove: async () => {
            throw new Error('thrown')
          },
        }),
      },
    }
    await expect(removeOpsImageFiles(throwing as never, { kind: 'mission', itemId: ITEM })).resolves.toBeUndefined()
    expect(errorSpy).toHaveBeenCalledTimes(2)
  })
})
