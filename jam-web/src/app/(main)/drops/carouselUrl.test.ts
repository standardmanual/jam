import { describe, it, expect } from 'vitest'
import { carouselPoiHref, resolveCarouselClose, resolveCarouselPoi } from './carouselUrl'

const pois = [
  { id: 'a', in_drop_range: true },
  { id: 'far', in_drop_range: false },
]

describe('carouselPoiHref', () => {
  it('장소 ID를 poi 쿼리로 싣는다', () => {
    expect(carouselPoiHref('a')).toBe('/drops?poi=a')
  })
  it('특수문자는 인코딩한다', () => {
    expect(carouselPoiHref('a&b')).toBe('/drops?poi=a%26b')
  })
})

describe('resolveCarouselPoi', () => {
  it('poi가 없으면 닫힘', () => {
    expect(resolveCarouselPoi({ poiParam: null, pois, poisLoaded: true })).toEqual({ status: 'none' })
  })
  it('목록을 받기 전에는 판정을 미룬다', () => {
    expect(resolveCarouselPoi({ poiParam: 'a', pois: [], poisLoaded: false })).toEqual({ status: 'pending' })
  })
  it('반경 안 근처 장소면 연다', () => {
    expect(resolveCarouselPoi({ poiParam: 'a', pois, poisLoaded: true })).toEqual({ status: 'open', poiId: 'a' })
  })
  it('근처 장소에 없는 ID는 정리 대상', () => {
    expect(resolveCarouselPoi({ poiParam: 'zzz', pois, poisLoaded: true })).toEqual({ status: 'invalid' })
  })
  it('반경 밖 장소는 정리 대상', () => {
    expect(resolveCarouselPoi({ poiParam: 'far', pois, poisLoaded: true })).toEqual({ status: 'invalid' })
  })
  it('이미 열린 장소는 목록에서 빠져도 닫지 않는다', () => {
    expect(resolveCarouselPoi({ poiParam: 'a', pois: [], poisLoaded: true, openedPoiId: 'a' })).toEqual({
      status: 'open',
      poiId: 'a',
    })
  })
})

describe('resolveCarouselClose', () => {
  it('push로 열었으면 뒤로 가기', () => {
    expect(resolveCarouselClose(true)).toBe('back')
  })
  it('링크·새로고침으로 열었으면 주소 치환', () => {
    expect(resolveCarouselClose(false)).toBe('replace')
  })
})
