/**
 * 유저 검색 — 검색어 전처리 · 정렬 스펙 문서화 테스트
 *
 * 대상 로직은 다음 두 곳에 인라인으로 동일하게 구현되어 있다 (헬퍼로 추출하지 않음):
 *   - src/app/api/users/search/route.ts (GET)
 *   - src/app/(main)/search/page.tsx (searchUsers)
 *
 * 이 테스트는 실제 구현을 import하지 않고, 두 구현이 공유해야 하는 규칙을
 * 로컬 함수로 재현하여 스펙으로 고정한다. Supabase 호출은 테스트하지 않는다.
 *
 * 실행: jest 또는 vitest (프레임워크 무관 — describe/it/expect 호환)
 */

// ── 검색어 전처리 스펙 재현 ────────────────────────────────────────────────
// route.ts / page.tsx 공통 규칙:
//   1. trim
//   2. trim 후 2자 미만이면 빈 결과
//   3. ilike 와일드카드(%, _) + PostgREST or-필터 구분자(,, (, )) 제거
//   4. 제거 후 다시 2자 미만이면 빈 결과

function preprocessQuery(raw: string): { skip: true } | { skip: false; sanitized: string; pattern: string } {
  const q = raw.trim()
  if (q.length < 2) return { skip: true }

  const sanitized = q.replace(/[%_,()]/g, '')
  if (sanitized.length < 2) return { skip: true }

  return { skip: false, sanitized, pattern: `%${sanitized}%` }
}

// ── 정렬 스펙 재현 ────────────────────────────────────────────────────────
// 정확 일치(lower(username) === lower(query)) 우선 → username 오름차순(localeCompare)

interface SearchRow {
  id: string
  username: string
}

function sortResults<T extends SearchRow>(rows: T[], sanitizedQuery: string): T[] {
  const lowerQ = sanitizedQuery.toLowerCase()
  return [...rows].sort((a, b) => {
    const aExact = a.username.toLowerCase() === lowerQ ? 0 : 1
    const bExact = b.username.toLowerCase() === lowerQ ? 0 : 1
    if (aExact !== bExact) return aExact - bExact
    return a.username.localeCompare(b.username)
  })
}

// ── 전처리 ──────────────────────────────────────────────────────────────

describe('검색어 전처리', () => {
  it('앞뒤 공백은 trim된다', () => {
    const result = preprocessQuery('  abc  ')
    expect(result.skip).toBe(false)
    if (!result.skip) expect(result.sanitized).toBe('abc')
  })

  it('trim 후 2자 미만이면 빈 결과(skip)', () => {
    expect(preprocessQuery('a').skip).toBe(true)
    expect(preprocessQuery(' a ').skip).toBe(true)
    expect(preprocessQuery('').skip).toBe(true)
    expect(preprocessQuery('   ').skip).toBe(true)
  })

  it('정확히 2자면 통과한다', () => {
    const result = preprocessQuery('ab')
    expect(result.skip).toBe(false)
  })

  it('%, _ 와일드카드 문자는 제거된다', () => {
    const result = preprocessQuery('a%b_c')
    expect(result.skip).toBe(false)
    if (!result.skip) expect(result.sanitized).toBe('abc')
  })

  it('와일드카드 제거 후 2자 미만이 되면 빈 결과(skip)', () => {
    // '%%%a%%%' → 제거 후 'a' (1자) → skip
    expect(preprocessQuery('%%%a%%%').skip).toBe(true)
    // '%_' → 제거 후 '' → skip
    expect(preprocessQuery('%_').skip).toBe(true)
  })

  it('PostgREST or-필터 구분자(,, 괄호)도 제거된다', () => {
    const result = preprocessQuery('a,b(c)d')
    expect(result.skip).toBe(false)
    if (!result.skip) expect(result.sanitized).toBe('abcd')
    // 구분자만으로 이루어진 검색어는 skip
    expect(preprocessQuery(',,()').skip).toBe(true)
  })

  it('ilike 패턴은 %sanitized% 형태로 감싼다', () => {
    const result = preprocessQuery('abc')
    expect(result.skip).toBe(false)
    if (!result.skip) expect(result.pattern).toBe('%abc%')
  })
})

// ── 정렬 ────────────────────────────────────────────────────────────────

describe('검색 결과 정렬', () => {
  it('정확 일치 username이 최우선으로 온다', () => {
    const rows: SearchRow[] = [
      { id: '1', username: 'jamboree' },
      { id: '2', username: 'jam' },
      { id: '3', username: 'jamie' },
    ]
    const sorted = sortResults(rows, 'jam')
    expect(sorted[0].username).toBe('jam')
  })

  it('정확 일치는 대소문자 무관하게 판정된다', () => {
    const rows: SearchRow[] = [
      { id: '1', username: 'zzz' },
      { id: '2', username: 'JAM' },
    ]
    const sorted = sortResults(rows, 'jam')
    expect(sorted[0].username).toBe('JAM')
  })

  it('정확 일치가 없으면 username 오름차순(localeCompare)으로 정렬된다', () => {
    const rows: SearchRow[] = [
      { id: '1', username: 'charlie' },
      { id: '2', username: 'alpha' },
      { id: '3', username: 'bravo' },
    ]
    const sorted = sortResults(rows, 'xyz')
    expect(sorted.map((r) => r.username)).toEqual(['alpha', 'bravo', 'charlie'])
  })

  it('정렬은 원본 배열을 변형하지 않는다', () => {
    const rows: SearchRow[] = [
      { id: '1', username: 'b' },
      { id: '2', username: 'a' },
    ]
    const original = [...rows]
    sortResults(rows, 'zzz')
    expect(rows).toEqual(original)
  })
})
