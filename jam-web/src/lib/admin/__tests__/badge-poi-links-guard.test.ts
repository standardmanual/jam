/**
 * 배지 수정 폼의 장소 연결 저장 가드 (티켓 20261018_1813, 원인 티켓 20261006_1028)
 *
 * 실행: `npx vitest run src/lib/admin/__tests__/badge-poi-links-guard.test.ts`
 */
import { describe, it, expect } from 'vitest'
import {
  findPoiLinksNotLoadedError,
  mergeLoadedPoiLinks,
  POI_LINKS_NOT_LOADED_MESSAGE,
  type PoiLinksLoadState,
} from '../badge-poi-links-guard'

describe('findPoiLinksNotLoadedError', () => {
  it.each<PoiLinksLoadState>(['idle', 'loading', 'failed'])('수정 화면의 체크인 배지는 %s 상태에서 저장을 막는다', (state) => {
    expect(findPoiLinksNotLoadedError('checkin', true, state)).toBe(POI_LINKS_NOT_LOADED_MESSAGE)
  })

  it('불러오기에 성공한 뒤에는 저장을 허용한다', () => {
    expect(findPoiLinksNotLoadedError('checkin', true, 'loaded')).toBeNull()
  })

  it('새 배지는 불러올 연결이 없으므로 항상 허용한다', () => {
    expect(findPoiLinksNotLoadedError('checkin', false, 'idle')).toBeNull()
  })

  it('체크인 배지가 아니면 장소 연결을 저장하지 않으므로 막지 않는다', () => {
    expect(findPoiLinksNotLoadedError('item', true, 'idle')).toBeNull()
    expect(findPoiLinksNotLoadedError('activity', true, 'failed')).toBeNull()
  })
})

describe('mergeLoadedPoiLinks', () => {
  it('불러온 목록 뒤에 먼저 추가한 장소를 중복 없이 붙인다', () => {
    const merged = mergeLoadedPoiLinks([{ id: 'a' }, { id: 'b' }], [{ id: 'b' }, { id: 'c' }])
    expect(merged.map((p) => p.id)).toEqual(['a', 'b', 'c'])
  })

  it('먼저 추가한 장소가 없으면 불러온 목록 그대로다', () => {
    expect(mergeLoadedPoiLinks([{ id: 'a' }], [])).toEqual([{ id: 'a' }])
  })
})
