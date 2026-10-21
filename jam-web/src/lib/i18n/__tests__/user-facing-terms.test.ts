/**
 * 유저 화면 문구 사전의 금지 용어 (티켓 20261019_1317 3회, 운영 로직 14.2절)
 *
 * «회수»는 어드민이 유저 포인트를 빼는 일을 가리키는 어드민 전용 용어다. 유저 화면에는 쓰지 않는다
 * (`docs/service/writing/UX_WRITING_GUIDELINE.md` 1.3절, 운영 로직 14.2절). 유저에게 보이는 문구는 모두 `d`(`lib/i18n/ko.ts`)에서 나오므로,
 * 사전 전체를 돌며 모든 문자열 값에 «회수»가 없음을 확인한다. 코드 주석은 실행 값이 아니라 해당하지 않는다.
 *
 * 화면별 시험(`points/page.test.tsx`, `api/points/__tests__/route.test.ts`)은 그려진 글을, 이 시험은 사전의 값을 본다.
 * 어드민 화면과 어드민 API가 쓰는 어드민 전용 문구(`src/app/admin/`, `points/reasons.ts`의 `ADMIN_REASONS` 라벨)는 사전 밖에 있어 대상이 아니다.
 *
 * 실패하면 «경로: 문구» 목록을 보여 준다 — 어느 키가 금지 용어를 담고 있는지 바로 찾을 수 있다.
 *
 * 실행: cd jam-web && npx vitest run src/lib/i18n/__tests__/user-facing-terms.test.ts
 */
import { describe, expect, it } from 'vitest'
import { d } from '@/lib/i18n'

/** 유저 화면에 쓰지 않는 어드민 용어 */
const ADMIN_ONLY_TERMS = ['회수']

interface Entry {
  path: string
  text: string
}

/** 사전을 끝까지 돌며 문자열 값을 모은다. 배열은 `[i]`, 객체는 `.키`로 경로를 만든다 */
function collectStrings(node: unknown, path: string, out: Entry[], skipped: string[]): void {
  if (typeof node === 'string') {
    out.push({ path, text: node })
    return
  }
  if (Array.isArray(node)) {
    node.forEach((child, i) => collectStrings(child, `${path}[${i}]`, out, skipped))
    return
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) collectStrings(value, path ? `${path}.${key}` : key, out, skipped)
    return
  }
  // 함수 값은 실행 결과를 알 수 없어 건너뛴다(어떤 경로를 건너뛰었는지 아래에서 확인한다)
  if (typeof node === 'function') skipped.push(path)
}

describe('유저 화면 문구 사전 d — 어드민 전용 용어', () => {
  const entries: Entry[] = []
  const skipped: string[] = []
  collectStrings(d, 'd', entries, skipped)

  it('사전 전체를 돌았다 — 문자열이 충분히 모였고 포인트·소식 문구가 들어 있다', () => {
    // 비어 있거나 일부만 돌면 아래 시험이 아무것도 못 잡고 통과한다
    expect(entries.length).toBeGreaterThan(500)
    // 최상위 묶음마다 문자열이 하나 이상 모였다(통째로 빠진 묶음이 없다)
    for (const group of Object.keys(d)) {
      expect(entries.some((e) => e.path.startsWith(`d.${group}.`)), `d.${group}에서 모은 문자열이 없다`).toBe(true)
    }
    const paths = new Set(entries.map((e) => e.path))
    expect(paths.has('d.points.balanceLabel')).toBe(true)
    expect(paths.has('d.points.reasonAbuseReclaim')).toBe(true)
    expect(paths.has('d.notifications.msgChapterUp')).toBe(true)
    expect(paths.has('d.notifications.msgMissionParticipationCancelled')).toBe(true)
  })

  it('함수로 된 문구는 사전에 없다 — 있으면 이 시험이 값을 볼 수 없다', () => {
    expect(skipped, `함수 값 경로: ${skipped.join(', ')}`).toEqual([])
  })

  for (const term of ADMIN_ONLY_TERMS) {
    it(`어떤 문구에도 «${term}»가 없다 (운영 로직 14.2절)`, () => {
      const found = entries.filter((e) => e.text.includes(term)).map((e) => `${e.path}: ${e.text}`)
      expect(found, `«${term}»가 들어 있는 문구:\n${found.join('\n')}`).toEqual([])
    })
  }

  it('포인트 사유 문구는 어드민 원장 용어(회수·지급·차감) 없이 유저용으로 쓰였다', () => {
    const userFacing = entries.filter((e) => e.path.startsWith('d.points.'))
    const found = userFacing
      .filter((e) => ['회수', '지급', '차감'].some((term) => e.text.includes(term)))
      .map((e) => `${e.path}: ${e.text}`)
    expect(found, found.join('\n')).toEqual([])
  })
})
