#!/usr/bin/env node
/**
 * 티켓 20261116_1250 — 읽히지 않는 배지 이름·설명을 고치는 1회성 SQL을 대응표에서 만든다.
 * 파일만 쓰고 실행하지 않는다. DB 실행은 메인 세션이 한다.
 *
 *   node scripts/jam2-content/gen-badge-copy-fix-sql.mjs
 *
 * 입력: badge-copy-fix-20261116.json (names, descriptions)
 * 출력: supabase/migrations/seed_badge_copy_readability_20261116.sql, 같은 이름의 _down.sql
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS = path.resolve(here, '../../supabase/migrations')
const FILE = 'seed_badge_copy_readability_20261116.sql'
const DOWN_FILE = 'seed_badge_copy_readability_20261116_down.sql'

const q = (s) => `'${String(s).replace(/'/g, "''")}'`

export function buildSql(table, direction) {
  const names = table.names
  const descs = table.descriptions
  const from = direction === 'up' ? 'old' : 'new'
  const to = direction === 'up' ? 'new' : 'old'
  const nameRows = names.reduce((n, x) => n + x.ids.length, 0)
  const descRows = descs.reduce((n, x) => n + x.ids.length, 0)

  const lines = []
  if (direction === 'up') {
    lines.push('-- 읽히지 않는 배지 이름·설명 고쳐 쓰기')
    lines.push('-- 티켓 20261116_1250: 어디서 끊어 읽어야 할지 알 수 없는 액티비티·아이템 배지의 이름과 설명을 사용자가 승인한 변경안으로 바꾼다.')
    lines.push('-- 행은 id로 지정하고 현재 값이 기존 문구와 같을 때만 바꾼다. 되돌림은 seed_badge_copy_readability_20261116_down.sql.')
    lines.push(`-- 바뀌는 행: 이름 ${nameRows}행, 설명 ${descRows}행. 건수가 다르면 예외로 전부 되돌아간다.`)
  } else {
    lines.push('-- 읽히지 않는 배지 이름·설명 고쳐 쓰기 되돌림')
    lines.push('-- 티켓 20261116_1250: 같은 id의 이름·설명을 실행 전의 문구로 되돌린다.')
    lines.push(`-- 바뀌는 행: 이름 ${nameRows}행, 설명 ${descRows}행. 건수가 다르면 예외로 전부 되돌아간다.`)
  }
  lines.push('do $$')
  lines.push('declare n int; name_total int := 0; desc_total int := 0;')
  lines.push('begin')
  for (const x of names) {
    for (const id of x.ids) {
      lines.push(`  update public.badges set name = ${q(x[to])} where id = '${id}' and name = ${q(x[from])};`)
      lines.push('  get diagnostics n = row_count;')
      lines.push(`  if n <> 1 then raise exception 'badges.name ${id} 현재 값이 예상과 다르다(갱신 %건)', n; end if;`)
      lines.push('  name_total := name_total + n;')
    }
  }
  for (const x of descs) {
    for (const id of x.ids) {
      lines.push(`  update public.badges set description = ${q(x[to])} where id = '${id}' and description = ${q(x[from])};`)
      lines.push('  get diagnostics n = row_count;')
      lines.push(`  if n <> 1 then raise exception 'badges.description ${id} 현재 값이 예상과 다르다(갱신 %건)', n; end if;`)
      lines.push('  desc_total := desc_total + n;')
    }
  }
  lines.push(`  if name_total <> ${nameRows} then raise exception '이름 갱신 행 수가 ${nameRows}이 아니다(%)', name_total; end if;`)
  lines.push(`  if desc_total <> ${descRows} then raise exception '설명 갱신 행 수가 ${descRows}이 아니다(%)', desc_total; end if;`)
  lines.push('end $$;')
  return lines.join('\n') + '\n'
}

function main() {
  const table = JSON.parse(fs.readFileSync(path.join(here, 'badge-copy-fix-20261116.json'), 'utf8'))
  fs.writeFileSync(path.join(MIGRATIONS, FILE), buildSql(table, 'up'), 'utf8')
  fs.writeFileSync(path.join(MIGRATIONS, DOWN_FILE), buildSql(table, 'down'), 'utf8')
  console.log(`${FILE}, ${DOWN_FILE} 쓰기 완료`)
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) main()
