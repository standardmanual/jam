/**
 * 마이그레이션 289·290 — 기존 배지에 포인트 일괄 값을 적용하는 SQL 파일 (티켓 20261022_1135 2회)
 *
 * 두 파일은 공용 DB에 사용자 승인 뒤에만 실행된다. 이 시험은 파일을 읽어 «실행해서는 안 되는 모양»으로 바뀌지 않게 고정한다.
 * SQL을 실행하지 않고(공용 DB 호출 없음) 파일 텍스트와 코드 상수를 대조한다.
 *
 * 고정하는 것
 *  (a) 값이 `badge_point_policy`의 칸 5개에서 오고, 포인트 리터럴(10·20·50·100)을 코드에 직접 쓰지 않는다.
 *  (b) 계획 문장이 `deleted_at IS NULL`·`is_hidden = false`로 삭제·숨김 배지를 뺀다.
 *  (c) 289는 종류가 `item`·`checkin` 둘뿐, 290은 `activity`뿐이며 온보딩 완료 배지 id를 제외한다(id는 onboarding-quest/config.ts의 상수와 같다).
 *  (d) 백업 표(RLS 켬·권한 회수), 바뀔 행만 백업, 조건부 UPDATE, 건수 가드, 사후 검증, 되돌림 블록, 맨 앞 드라이런이 있다.
 *  (e) 등급 → 칸 대응이 `lib/admin/badge-point-defaults.ts`의 `defaultPointFor`와 같다(같은 입력으로 대조).
 *  (f) `BEGIN`·`COMMIT` 같은 트랜잭션 문장이 없다(호출자가 한 트랜잭션으로 실행한다).
 *
 * 실행: cd jam-web && npx vitest run src/lib/badge/__tests__/pointApplySql.test.ts
 */
import { describe, it, expect, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// pointPolicy.ts가 서버 클라이언트 모듈을 가져오므로 막아 둔다(상수만 쓴다. 공용 DB는 호출하지 않는다)
vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => {
    throw new Error('createServiceClient가 호출됨 — 이 시험은 DB를 부르지 않는다')
  },
}))

import { defaultPointFor } from '@/lib/admin/badge-point-defaults'
import { BADGE_POINT_POLICY_KEYS, type BadgePointPolicy } from '@/lib/badge/pointPolicy'
import { ONBOARDING_COMPLETION_BADGE_ID } from '@/lib/onboarding-quest/config'
import type { BadgeRarity } from '@/types/database'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

interface SqlFile {
  /** 마이그레이션 번호 */
  no: '289' | '290'
  name: string
  sql: string
  /** 주석을 뺀 코드 */
  code: string
  backupTable: string
  planTable: string
}

/** 줄 끝 `--` 주석과 주석 줄을 지운다. 작은따옴표 문자열 안의 `--`는 지우지 않는다. */
function stripComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      let inQuote = false
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]
        if (ch === "'") inQuote = !inQuote
        if (!inQuote && ch === '-' && line[i + 1] === '-') return line.slice(0, i)
      }
      return line
    })
    .filter((line) => line.trim() !== '')
    .join('\n')
}

function load(no: '289' | '290', name: string): SqlFile {
  const sql = readFileSync(join(MIGRATIONS_DIR, name), 'utf8')
  return { no, name, sql, code: stripComments(sql), backupTable: `badge_point_backup_${no}`, planTable: `_badge_point_plan_${no}` }
}

const F289 = load('289', '289_apply_badge_point_defaults_item_checkin.sql')
const F290 = load('290', '290_apply_badge_point_defaults_activity.sql')
const FILES = [F289, F290]

/** `startPattern`이 처음 맞는 곳부터 다음 `;`까지의 문장. 없으면 테스트가 실패하도록 빈 문자열을 돌려주지 않고 던진다. */
function statement(code: string, startPattern: RegExp): string {
  const m = startPattern.exec(code)
  if (!m) throw new Error(`문장을 찾지 못했다: ${startPattern}`)
  const end = code.indexOf(';', m.index)
  if (end < 0) throw new Error(`문장이 ;로 끝나지 않는다: ${startPattern}`)
  return code.slice(m.index, end + 1)
}

const planStatement = (f: SqlFile) => statement(f.code, new RegExp(`CREATE\\s+TEMP\\s+TABLE\\s+${f.planTable}\\b`, 'i'))
const updateStatement = (f: SqlFile) => statement(f.code, /UPDATE\s+public\.badges\b/i)
const backupInsertStatement = (f: SqlFile) => statement(f.code, new RegExp(`INSERT\\s+INTO\\s+public\\.${f.backupTable}\\b`, 'i'))

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** 계획 문장의 CASE 블록 */
function caseBlock(f: SqlFile): string {
  const m = /CASE([\s\S]*?)END\s+AS\s+after_pt/i.exec(planStatement(f))
  if (!m) throw new Error(`${f.name}: 계획 문장에서 CASE ... END AS after_pt를 찾지 못했다`)
  return m[1]
}

/** CASE의 «WHEN b.rarity::text = '<등급>' THEN pol.<칸>» 대응 */
function rarityColumnMap(f: SqlFile): Record<string, string> {
  const map: Record<string, string> = {}
  for (const m of caseBlock(f).matchAll(/WHEN\s+b\.rarity::text\s*=\s*'([a-z]+)'\s+THEN\s+pol\.([a-z_]+)/gi)) map[m[1]] = m[2]
  return map
}

/** CASE의 «WHEN b.rarity IS NULL THEN pol.<칸>» (레벨형) */
function leveledColumn(f: SqlFile): string | null {
  const m = /WHEN\s+b\.rarity\s+IS\s+NULL\s+THEN\s+pol\.([a-z_]+)/i.exec(caseBlock(f))
  return m ? m[1] : null
}

describe('마이그레이션 289·290 파일 존재와 번호', () => {
  it('289와 290은 각각 한 파일뿐이다(번호 중복 없음)', () => {
    const names = readdirSync(MIGRATIONS_DIR)
    expect(names.filter((n) => n.startsWith('289_'))).toEqual([F289.name])
    expect(names.filter((n) => n.startsWith('290_'))).toEqual([F290.name])
  })

  it('288 정책 표 파일이 있고 289·290이 그 표를 읽는다', () => {
    expect(readdirSync(MIGRATIONS_DIR)).toContain('288_badge_point_policy.sql')
    for (const f of FILES) expect(planStatement(f)).toMatch(/public\.badge_point_policy\s+pol/i)
  })
})

describe.each(FILES)('$name', (f) => {
  describe('(a) 값은 정책 표의 칸에서 읽는다', () => {
    it('계획 문장이 정책 표 id=1 행의 칸 5개를 모두 읽는다', () => {
      const plan = planStatement(f)
      expect(plan).toMatch(/CROSS\s+JOIN\s+public\.badge_point_policy\s+pol\b/i)
      expect(plan).toMatch(/pol\.id\s*=\s*1\b/)
      const used = new Set([...plan.matchAll(/\bpol\.([a-z_]+)/gi)].map((m) => m[1]).filter((c) => c !== 'id'))
      expect([...used].sort()).toEqual([...BADGE_POINT_POLICY_KEYS].sort())
    })

    it('주석을 뺀 코드에 포인트 리터럴(10·20·50·100)이 없다', () => {
      // 건수(1701 등)와 id 조각은 단어 경계가 달라 걸리지 않는다
      expect(f.code.match(/(?<![\w.])(?:10|20|50|100)(?![\w.])/g)).toBeNull()
    })

    it('UPDATE는 계획의 after_pt를 넣고 숫자 리터럴이 없다', () => {
      const upd = updateStatement(f)
      expect(upd).toMatch(/SET\s+point_reward\s*=\s*plan\.after_pt\b/i)
      expect(upd.match(/(?<![\w.])\d+(?![\w.])/g)).toBeNull()
    })

    it('계획 문장의 CASE는 한 값만 정한다(ELSE로 리터럴을 쓰지 않는다)', () => {
      expect(caseBlock(f)).not.toMatch(/\bELSE\b/i)
    })
  })

  describe('(b) 삭제·숨김 배지는 범위에서 뺀다', () => {
    it('계획 문장에 deleted_at IS NULL과 is_hidden = false가 있다', () => {
      const plan = planStatement(f)
      expect(plan).toMatch(/\bb\.deleted_at\s+IS\s+NULL\b/i)
      expect(plan).toMatch(/\bb\.is_hidden\s*=\s*false\b/i)
    })
  })

  describe('(d) 백업·가드·검증·되돌림', () => {
    it('백업 표는 배지 id 기본키와 이전 값·이후 값을 가지고 RLS를 켜고 권한을 회수하며 정책이 없다', () => {
      const create = statement(f.code, new RegExp(`CREATE\\s+TABLE\\s+IF\\s+NOT\\s+EXISTS\\s+public\\.${f.backupTable}\\b`, 'i'))
      expect(create).toMatch(/badge_id\s+UUID\s+PRIMARY\s+KEY/i)
      expect(create).toMatch(/before_point\s+INTEGER\s+NOT\s+NULL/i)
      expect(create).toMatch(/after_point\s+INTEGER\s+NOT\s+NULL/i)
      expect(create).toMatch(/backed_up_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i)
      expect(f.code).toMatch(new RegExp(`ALTER\\s+TABLE\\s+public\\.${f.backupTable}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i'))
      expect(f.code).toMatch(new RegExp(`REVOKE\\s+ALL\\s+ON\\s+public\\.${f.backupTable}\\s+FROM\\s+anon,\\s*authenticated`, 'i'))
      expect(f.code).not.toMatch(/CREATE\s+POLICY/i)
    })

    it('바뀔 행(before <> after)만 계획에서 백업 표에 넣는다', () => {
      const ins = backupInsertStatement(f)
      expect(squash(ins)).toContain(`FROM ${f.planTable} plan`)
      expect(ins).toMatch(/WHERE\s+plan\.before_pt\s*<>\s*plan\.after_pt/i)
      expect(ins).toMatch(/\(\s*badge_id\s*,\s*before_point\s*,\s*after_point\s*\)/i)
    })

    it('UPDATE는 바뀔 행만, 읽은 뒤 값이 바뀌지 않은 행만 고친다', () => {
      const upd = updateStatement(f)
      expect(squash(upd)).toContain(`FROM ${f.planTable} plan`)
      expect(upd).toMatch(/WHERE\s+b\.id\s*=\s*plan\.id/i)
      expect(upd).toMatch(/AND\s+plan\.before_pt\s*<>\s*plan\.after_pt/i)
      expect(upd).toMatch(/AND\s+b\.point_reward\s*=\s*plan\.before_pt/i)
    })

    it('건수 가드: 갱신 행 수를 세고 바뀔 행 수·갱신 행 수·백업 행 수가 다르면 예외를 낸다', () => {
      expect(f.code).toMatch(/GET\s+DIAGNOSTICS\s+v_updated\s*=\s*ROW_COUNT/i)
      expect(f.code).toMatch(/IF\s+v_changed\s*<>\s*v_updated\s+OR\s+v_updated\s*<>\s*v_backup\b/i)
      // 갱신 뒤 범위 안에 규칙과 다른 행이 남으면 예외
      expect(f.code).toMatch(/b\.point_reward\s+IS\s+DISTINCT\s+FROM\s+plan\.after_pt/i)
    })

    it('가드: 정책 표 확인, 백업 표가 비어 있어야 진행, after가 NULL인 행이 있으면 예외', () => {
      expect(f.code).toMatch(/to_regclass\('public\.badge_point_policy'\)\s+IS\s+NULL/i)
      expect(f.code).toMatch(/FROM\s+public\.badge_point_policy\s+WHERE\s+id\s*=\s*1/i)
      expect(f.code).toMatch(new RegExp(`FROM\\s+public\\.${f.backupTable};`, 'i'))
      expect(f.code).toMatch(/IF\s+v_backup\s*<>\s*0\s+THEN/i)
      expect(f.code).toMatch(/count\(\*\)\s+FILTER\s+\(WHERE\s+after_pt\s+IS\s+NULL\)/i)
      expect(f.code).toMatch(/IF\s+v_null_after\s*>\s*0\s+THEN/i)
    })

    it('RAISE EXCEPTION의 % 자리 수와 인자 수가 맞다(실행 중 형식 오류로 멈추지 않는다)', () => {
      const raises = [...f.code.matchAll(/RAISE\s+EXCEPTION\s+'((?:[^']|'')*)'\s*(?:,([^;]*))?;/gi)]
      expect(raises.length).toBeGreaterThanOrEqual(6)
      for (const m of raises) {
        const placeholders = (m[1].match(/%/g) ?? []).length
        const args = m[2] ? m[2].split(',').filter((a) => a.trim() !== '').length : 0
        expect({ message: m[1].slice(0, 30), placeholders }).toEqual({ message: m[1].slice(0, 30), placeholders: args })
      }
    })

    it('드라이런 SELECT 묶음이 파일 맨 앞 주석에 있다(첫 코드 줄보다 앞)', () => {
      const firstCodeIdx = f.sql.split('\n').findIndex((l) => l.trim() !== '' && !l.trimStart().startsWith('--'))
      const head = f.sql.split('\n').slice(0, firstCodeIdx).join('\n')
      expect(head).toMatch(/드라이런/)
      expect(head).toMatch(/--\s+SELECT[\s\S]*FROM\s+plan/i)
      expect(head).toMatch(/바뀔 행 수/)
      expect(head).toMatch(/to_regclass\('public\.badge_point_policy'\)|FROM public\.badge_point_policy/)
      expect(head).toContain(`to_regclass('public.${f.backupTable}')`)
      // 규칙 밖 값 목록과 종류·등급별 건수
      expect(head).toMatch(/규칙 밖 값 목록/)
      expect(head).toMatch(/GROUP BY/)
    })

    it('사후 검증 SELECT 블록이 주석으로 있고 원장 건수·합계와 규칙과 다른 행을 본다', () => {
      const sectionMatch = /--\s*사후 검증[^\n]*\n([\s\S]*?)\n-- 되돌림 SQL/.exec(f.sql)
      expect(sectionMatch).not.toBeNull()
      const section = sectionMatch![1]
      expect(section).toMatch(/^--\s+(?:SELECT|WITH)/m)
      expect(section).toMatch(/규칙과_다른_행/)
      expect(section).toMatch(/FROM public\.point_transactions/)
      expect(section).toContain(f.backupTable)
    })

    it('되돌림 SQL 블록이 파일 끝 주석에 있고 백업의 before_point로 현재 값이 after_point인 행만 되돌린다', () => {
      const lines = f.sql.split('\n')
      const idx = lines.findIndex((l) => /^-- 되돌림 SQL\s*$/.test(l))
      expect(idx).toBeGreaterThan(0)
      const tail = lines.slice(idx)
      // 되돌림 블록은 전부 주석이다(실행되지 않는다)
      for (const l of tail) expect(l.trim() === '' || l.trimStart().startsWith('--')).toBe(true)
      const text = tail.join('\n')
      expect(text).toMatch(new RegExp(`UPDATE public\\.badges b SET point_reward = bk\\.before_point\\s*\\n--\\s+FROM public\\.${f.backupTable} bk`))
      expect(text).toMatch(/WHERE b\.id = bk\.badge_id AND b\.point_reward = bk\.after_point/)
      expect(text).toContain(`DROP TABLE IF EXISTS public.${f.backupTable};`)
      expect(text).toMatch(/원장/)
    })

    it('머리말에 «이미 받은 배지에는 소급하지 않는다»와 원장 불변이 적혀 있다', () => {
      const head = f.sql.split('\n').slice(0, 25).join('\n')
      expect(head).toMatch(/소급하지 않는다/)
      expect(head).toMatch(/원장/)
    })
  })

  describe('(f) 트랜잭션 문장이 없다', () => {
    it('BEGIN;·COMMIT;·ROLLBACK;·START TRANSACTION;이 코드에 없다', () => {
      expect(f.code).not.toMatch(/^\s*(?:BEGIN|COMMIT|ROLLBACK|END)\s*;/im)
      expect(f.code).not.toMatch(/START\s+TRANSACTION/i)
    })

    it('본문 가드와 갱신은 DO 블록(RAISE EXCEPTION으로 전체를 되돌린다) 안에 있다', () => {
      expect([...f.code.matchAll(/\bDO\s+\$(\w+)\$/g)].length).toBeGreaterThanOrEqual(3)
      expect(f.code).toMatch(/DO\s+\$apply\$[\s\S]*UPDATE\s+public\.badges[\s\S]*\$apply\$;/i)
    })

    it('임시 표를 만들기 전에 지우고 끝에서 다시 지운다', () => {
      expect(f.code).toMatch(new RegExp(`DROP\\s+TABLE\\s+IF\\s+EXISTS\\s+pg_temp\\.${f.planTable};`, 'i'))
      expect(f.code).toMatch(new RegExp(`DROP\\s+TABLE\\s+${f.planTable};`, 'i'))
    })
  })
})

describe('(c) 범위: 종류와 제외 조건', () => {
  it('289: 종류는 item·checkin 둘뿐이고 activity가 없다', () => {
    const plan = planStatement(F289)
    const m = /\bb\.type\s+IN\s*\(([^)]*)\)/i.exec(plan)
    expect(m).not.toBeNull()
    const kinds = m![1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).sort()
    expect(kinds).toEqual(['checkin', 'item'])
    expect(plan).not.toMatch(/activity/i)
    expect(plan).not.toMatch(/\bb\.type\s*=/i)
  })

  it('289: 온보딩 배지 id를 따로 빼지 않는다(액티비티가 범위 밖이다)', () => {
    expect(planStatement(F289)).not.toContain(ONBOARDING_COMPLETION_BADGE_ID)
  })

  it('290: 종류는 activity뿐이다', () => {
    const plan = planStatement(F290)
    expect(plan).toMatch(/\bb\.type\s*=\s*'activity'/i)
    expect(plan).not.toMatch(/\bb\.type\s+IN\b/i)
    expect(plan).not.toMatch(/'item'|'checkin'/i)
  })

  it('290: 온보딩 완료 배지 id를 계획에서 뺀다(config.ts 상수와 같은 값)', () => {
    expect(ONBOARDING_COMPLETION_BADGE_ID).toBe('cd20f271-9445-42cc-ac51-d8a96b25e1c3')
    const plan = planStatement(F290)
    expect(plan).toMatch(new RegExp(`\\bb\\.id\\s*<>\\s*'${ONBOARDING_COMPLETION_BADGE_ID}'`))
    // 파일에 쓴 uuid는 이 상수 하나뿐이다
    const uuids = new Set(F290.code.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi))
    expect([...uuids]).toEqual([ONBOARDING_COMPLETION_BADGE_ID])
  })

  it('290: 계획에 온보딩 배지가 들어오면 예외를 내는 가드가 있다', () => {
    expect(F290.code).toMatch(new RegExp(`count\\(\\*\\)\\s+FILTER\\s+\\(WHERE\\s+id\\s*=\\s*'${ONBOARDING_COMPLETION_BADGE_ID}'\\)`, 'i'))
    expect(F290.code).toMatch(/IF\s+v_onboarding\s*>\s*0\s+THEN/i)
  })
})

describe('289 기대 건수 가드', () => {
  const guardMatch = /v_plan\s*<>\s*(\d+)\s+OR\s+v_changed\s*<>\s*(\d+)\s+OR\s+v_same\s*<>\s*(\d+)/i.exec(F289.code)

  it('계획 행 3803 = 바뀔 행 1701 + 바뀌지 않는 행 2102 를 가드에 박았다', () => {
    expect(guardMatch).not.toBeNull()
    const [plan, changed, same] = guardMatch!.slice(1).map(Number)
    expect([plan, changed, same]).toEqual([3803, 1701, 2102])
    expect(changed + same).toBe(plan)
  })

  it('종류·등급별 바뀔 행(아이템 351·450·450·450)과 바뀌지 않는 행(270·1832)을 가드에 박았다', () => {
    const m =
      /v_item_common_changed\s*<>\s*(\d+)\s+OR\s+v_item_rare_changed\s*<>\s*(\d+)\s+OR\s+v_item_epic_changed\s*<>\s*(\d+)\s+OR\s+v_item_mystic_changed\s*<>\s*(\d+)\s+OR\s+v_item_common_same\s*<>\s*(\d+)\s+OR\s+v_checkin_same\s*<>\s*(\d+)/i.exec(
        F289.code,
      )
    expect(m).not.toBeNull()
    const [cc, rc, ec, mc, cs, ks] = m!.slice(1).map(Number)
    expect([cc, rc, ec, mc, cs, ks]).toEqual([351, 450, 450, 450, 270, 1832])
    // 합이 위 총계와 맞는다
    expect(cc + rc + ec + mc).toBe(1701)
    expect(cs + ks).toBe(2102)
  })

  it('갱신 가드도 1701을 기대한다', () => {
    expect(F289.code).toMatch(/v_changed\s*<>\s*1701/)
  })

  it('등급 없음(레벨형) 행이 있으면 예외를 낸다', () => {
    expect(F289.code).toMatch(/count\(\*\)\s+FILTER\s+\(WHERE\s+rarity\s+IS\s+NULL\)/i)
    expect(F289.code).toMatch(/IF\s+v_null_rarity\s*>\s*0\s+THEN/i)
  })
})

describe('290 선행 조건과 동등 가드', () => {
  it('활성 액티비티 배지 수가 390(244 뒤 270 + 245의 61 + 248의 59)이 아니면 정해진 문구로 멈춘다', () => {
    expect(270 + 61 + 59).toBe(390)
    expect(F290.code).toMatch(/FROM\s+public\.badges\s+WHERE\s+type\s*=\s*'activity'\s+AND\s+deleted_at\s+IS\s+NULL;/i)
    expect(F290.code).toMatch(/IF\s+v_active\s*<>\s*390\s+THEN/i)
    expect(F290.code).toContain('244, 245, 248 적용 전이거나 건수가 계획과 다릅니다')
  })

  it('바뀔 건수의 기대값을 파일에 박지 않는다(동등 가드만 쓴다)', () => {
    const guard = statement(F290.code, /IF\s+v_changed\s*<>\s*v_updated/i)
    expect(guard.match(/(?<![\w.])\d+(?![\w.])/g)).toBeNull()
    expect(F290.code).not.toMatch(/v_changed\s*<>\s*\d+/)
  })

  it('머리말에 244 → 245 → 248 → 포인트 합 확인(1410·1650) → 290 순서가 적혀 있다', () => {
    const head = F290.sql.split('\n').slice(0, 15).join('\n')
    expect(head).toMatch(/244\s*→\s*245\s*→\s*248/)
    expect(head).toMatch(/1410/)
    expect(head).toMatch(/1650/)
    expect(head).toMatch(/적용하기 «전에»/)
  })

  it('계획이 0건이면 멈춘다', () => {
    expect(F290.code).toMatch(/IF\s+v_plan\s*=\s*0\s+THEN/i)
  })
})

describe('(e) 등급 → 칸 대응이 defaultPointFor와 같다', () => {
  // 칸마다 값이 다른 정책: 대응이 틀리면 값이 어긋나 바로 드러난다
  const POLICY: BadgePointPolicy = { common_points: 11, rare_points: 22, epic_points: 33, mystic_points: 44, leveled_points: 55 }
  const RARITIES: BadgeRarity[] = ['common', 'rare', 'epic', 'mystic']

  it.each(FILES)('$name: SQL의 등급 4개와 칸이 defaultPointFor와 같은 값을 낸다', (f) => {
    const map = rarityColumnMap(f)
    expect(Object.keys(map).sort()).toEqual([...RARITIES].sort())
    for (const rarity of RARITIES) {
      const column = map[rarity] as keyof BadgePointPolicy
      expect(BADGE_POINT_POLICY_KEYS as readonly string[]).toContain(column)
      expect(POLICY[column]).toBe(defaultPointFor({ rarity, isLeveled: false, isHidden: false }, POLICY))
    }
  })

  it.each(FILES)('$name: 등급이 없는 레벨형은 defaultPointFor의 레벨형 값과 같은 칸을 읽는다', (f) => {
    const column = leveledColumn(f) as keyof BadgePointPolicy
    expect(BADGE_POINT_POLICY_KEYS as readonly string[]).toContain(column)
    expect(POLICY[column]).toBe(defaultPointFor({ rarity: null, isLeveled: true, isHidden: false }, POLICY))
  })

  it('등급마다 서로 다른 칸을 읽는다(두 등급이 같은 칸을 읽지 않는다)', () => {
    for (const f of FILES) {
      const columns = [...Object.values(rarityColumnMap(f)), leveledColumn(f)]
      expect(new Set(columns).size).toBe(5)
    }
  })

  it('289와 290의 CASE 블록이 글자 그대로 같다(대응이 갈라지지 않는다)', () => {
    expect(squash(caseBlock(F289))).toBe(squash(caseBlock(F290)))
  })

  it('숨김 배지는 defaultPointFor가 0이고, SQL은 숨김 배지를 범위에서 뺀다', () => {
    expect(defaultPointFor({ rarity: 'common', isLeveled: false, isHidden: true }, POLICY)).toBe(0)
    for (const f of FILES) expect(planStatement(f)).toMatch(/\bb\.is_hidden\s*=\s*false\b/i)
  })
})
