import { describe, it, expect } from 'vitest'
import { readVocQuery, vocPageHref, vocSortHref } from './vocQuery'

const q = (s: string) => new URLSearchParams(s)

describe('readVocQuery', () => {
  it('쿼리가 없으면 최신순 1쪽', () => {
    expect(readVocQuery(q(''))).toEqual({ sort: 'latest', page: 1 })
  })
  it('쿼리 → 초기 선택', () => {
    expect(readVocQuery(q('sort=answered&page=3'))).toEqual({ sort: 'answered', page: 3 })
  })
  it('알 수 없는 값은 기본값', () => {
    expect(readVocQuery(q('sort=oldest&page=abc'))).toEqual({ sort: 'latest', page: 1 })
    expect(readVocQuery(q('page=0'))).toEqual({ sort: 'latest', page: 1 })
    expect(readVocQuery(q('page=-1'))).toEqual({ sort: 'latest', page: 1 })
  })
})

describe('vocSortHref', () => {
  it('정렬을 쓰고 page는 지운다 (1쪽으로 리셋)', () => {
    expect(vocSortHref('/voc', q('page=3'), 'answered')).toBe('/voc?sort=answered')
  })
  it('기본 정렬(최신순)은 쿼리에서 빠진다', () => {
    expect(vocSortHref('/voc', q('sort=answered&page=2'), 'latest')).toBe('/voc')
  })
})

describe('vocPageHref', () => {
  it('페이지를 쓰고 정렬은 보존한다', () => {
    expect(vocPageHref('/voc', q('sort=answered'), 2)).toBe('/voc?sort=answered&page=2')
  })
  it('1쪽은 쿼리에서 빠진다', () => {
    expect(vocPageHref('/voc', q('sort=answered&page=2'), 1)).toBe('/voc?sort=answered')
    expect(vocPageHref('/voc', q('page=2'), 1)).toBe('/voc')
  })
})
