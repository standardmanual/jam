import { sanitizeSearchTerm, MAX_SEARCH_TERM_LENGTH } from '../search-term'

describe('sanitizeSearchTerm', () => {
  it('PostgREST 필터 문법을 깨는 문자(쉼표·괄호)를 공백으로 바꾼다', () => {
    expect(sanitizeSearchTerm('a,b(c)d')).toBe('a b c d')
  })

  it('LIKE 와일드카드(%·_·*·\\)를 공백으로 바꾼다(문자마다 각각 공백 하나로)', () => {
    expect(sanitizeSearchTerm('100%_할인*가\\격')).toBe('100  할인 가 격')
  })

  it('앞뒤 공백을 제거한다', () => {
    expect(sanitizeSearchTerm('  카페  ')).toBe('카페')
  })

  it(`${MAX_SEARCH_TERM_LENGTH}자를 넘으면 자른다`, () => {
    const long = 'a'.repeat(MAX_SEARCH_TERM_LENGTH + 20)
    const result = sanitizeSearchTerm(long)
    expect(result).toHaveLength(MAX_SEARCH_TERM_LENGTH)
    expect(result).toBe('a'.repeat(MAX_SEARCH_TERM_LENGTH))
  })

  it('안전한 문자열은 그대로 둔다', () => {
    expect(sanitizeSearchTerm('성수 오아시스 카페')).toBe('성수 오아시스 카페')
  })

  it('빈 문자열은 빈 문자열을 돌려준다', () => {
    expect(sanitizeSearchTerm('')).toBe('')
  })
})
