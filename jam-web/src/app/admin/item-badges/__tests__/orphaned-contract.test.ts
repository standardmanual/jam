/**
 * 미소유 아이템배지·발급현황·고액 원장 목록 전환 계약 테스트(티켓 20260924_0950).
 *
 * 아래 계약은 "없어도 조용히 통과"하는 종류라 소스를 스캔해 고정한다(POI의
 * `poi-table-bulk-contract.test.ts`와 같은 방식):
 * 1. 폐기·재배정을 각각 따로 받던 옛 라우트 디렉터리가 없고, 코드 어디에도 그 경로가 남지 않는다.
 * 2. 폐기·재배정 액션 컴포넌트가 개체마다 요청을 반복하지 않고 일괄 처리 라우트 하나만 부른다.
 * 3. 미소유 표는 클라이언트에서 정렬하지 않는다(정렬은 서버, `sortOrphanedRows`).
 * 4. 세 화면의 표가 각자 서버 전체 선택 ID 조회와 CSV 내보내기를 부른다.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

/** 주석에 적힌 단어가 검사를 통과/실패시키지 않도록 코드만 남긴다 */
function codeOf(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n')
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(process.cwd(), dir))) {
    const rel = `${dir}/${name}`
    if (statSync(join(process.cwd(), rel)).isDirectory()) out.push(...listFiles(rel))
    else out.push(rel)
  }
  return out
}

describe('옛 폐기·재배정 라우트 제거', () => {
  it('옛 라우트 디렉터리가 없고 일괄 라우트가 있다', () => {
    // 옛 경로 문자열이 소스에 남지 않았는지 검사하는 테스트(`rg`)라 이 파일에도 경로를 통째로 적지 않는다
    for (const oldName of ['destroy', 'reassign']) {
      expect(existsSync(join(process.cwd(), 'src/app/api/admin/item-badges', 'orphaned', oldName))).toBe(false)
    }
    expect(existsSync(join(process.cwd(), 'src/app/api/admin/item-badges/orphaned/bulk/route.ts'))).toBe(true)
  })

  it('소스 어디에도 옛 경로가 남지 않는다', () => {
    const leftovers = listFiles('src')
      .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes('__tests__'))
      .filter((f) => /orphaned\/(destroy|reassign)/.test(read(f)))
    expect(leftovers).toEqual([])
  })
})

describe('액션 컴포넌트는 일괄 처리 라우트 하나만 부른다', () => {
  for (const file of ['DestroyOrphanedAction', 'ReassignOrphanedAction']) {
    it(`${file}: 개체 반복 요청이 없고 공용 확인창을 쓴다`, () => {
      const code = codeOf(`src/app/admin/item-badges/_orphaned-actions/${file}.tsx`)
      expect(code).not.toMatch(/for \((const|let) [^)]*\bof\b/)
      expect(code).not.toMatch(/\.map\([^)]*=>\s*fetch\(/)
      expect(code).toContain('ORPHANED_BULK_ENDPOINT')
      expect(code).toContain('BulkConfirmDialog')
    })
  }

  it('폐기는 등급 3(확인 문구), 재배정은 등급 2다', () => {
    expect(codeOf('src/app/admin/item-badges/_orphaned-actions/DestroyOrphanedAction.tsx')).toMatch(/level=\{3\}/)
    expect(codeOf('src/app/admin/item-badges/_orphaned-actions/ReassignOrphanedAction.tsx')).toMatch(/level=\{2\}/)
  })

  it('일괄 라우트가 폐기(확인 문구)와 재배정(상한 200)을 정의한다', () => {
    const code = codeOf('src/app/api/admin/item-badges/orphaned/bulk/route.ts')
    expect(code).toMatch(/destroy:\s*\{\}/)
    expect(code).toMatch(/reassign:\s*\{\s*maxIds:\s*ORPHANED_REASSIGN_MAX_IDS\s*\}/)
    expect(code).toContain("confirmPhraseFor('폐기'")
    expect(read('src/lib/admin/orphaned-item-actions.ts')).toMatch(/ORPHANED_REASSIGN_MAX_IDS = 200/)
  })
})

describe('미소유 표', () => {
  const code = codeOf('src/app/admin/item-badges/orphaned/OrphanedItemsTable.tsx')

  it('클라이언트 정렬을 쓰지 않는다 — manualSorting이고 정렬 모델을 만들지 않는다', () => {
    expect(code).toContain('manualSorting: true')
    expect(code).not.toMatch(/useState<SortingState>/)
  })

  it('서버 페이지가 sortOrphanedRows로 정렬한 뒤 쪽을 자른다', () => {
    const page = codeOf('src/app/admin/item-badges/orphaned/page.tsx')
    expect(page).toMatch(/sortOrphanedRows\(/)
    expect(page.indexOf('sortOrphanedRows(')).toBeLessThan(page.indexOf('.slice('))
  })
})

describe('세 화면 모두 서버 전체 선택과 내보내기를 쓴다', () => {
  const tables: [string, string, string][] = [
    ['src/app/admin/item-badges/ItemBadgesTable.tsx', '/api/admin/item-badges/ids', '/api/admin/item-badges/export'],
    [
      'src/app/admin/item-badges/orphaned/OrphanedItemsTable.tsx',
      '/api/admin/item-badges/orphaned/ids',
      '/api/admin/item-badges/orphaned/export',
    ],
    ['src/app/admin/points/HighValueTable.tsx', '/api/admin/points/ledger/ids', '/api/admin/points/ledger/export'],
  ]

  for (const [file, idsUrl, exportUrl] of tables) {
    it(`${file}`, () => {
      const code = codeOf(file)
      expect(code).toContain(idsUrl)
      expect(code).toContain(exportUrl)
      expect(code).toContain('DataTableSelectAllBanner')
      expect(code).toContain('getRowHref')
    })
  }

  it('발급 수는 countRowsByKey로 센다 — 행을 전부 받아 세지 않는다', () => {
    expect(codeOf('src/lib/admin/item-badge-list.ts')).toMatch(/countRowsByKey\(client, 'inventory_items', 'badge_id'/)
    const page = codeOf('src/app/admin/item-badges/page.tsx')
    expect(page).toContain('loadItemBadgeIssuedCounts')
    expect(page).not.toMatch(/\.limit\(100\)/)
    expect(page).not.toContain('hasFilter')
  })
})
