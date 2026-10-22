// 티켓 20261022_1138(7-7): 단서 레시피 SQL(281)과 끄기 SQL(282) 생성기 — 건수, 포인트, 공개 시작 값, 안전장치,
// 되돌림 SQL이 백업 표를 쓰는지, 커밋된 SQL 파일과 생성 결과의 일치를 검사한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, buildPlan, q } from '../gen-content-sql.mjs';
import {
  BOOKS_IN_DB_AFTER_7_6,
  CLUE_FILE,
  CLUE_VALID_FROM,
  OLD_RECIPE_NAMES,
  POINTS_PER_INGREDIENT,
  RETIRE_BACKUP_TABLE,
  RETIRE_FILE,
  buildClues,
  buildOutputs,
  countClueRecipes,
  genClueSql,
  genRetireSql,
  planBooks,
  retireExpectation
} from '../gen-recipe-sql.mjs';
import { MANUSCRIPT_DIR } from '../parse-manuscript.mjs';
import { findClueFile, parseClueManuscript } from '../parse-clue-recipes.mjs';

const plan = buildPlan();
const parsed = parseClueManuscript();
const clues = buildClues(parsed, plan);
const sql281 = genClueSql(clues);
const sql282 = genRetireSql(plan);

const ROLLBACK_MARKER = /^\s*--\s*(?:되돌림|ROLLBACK\b|DOWN\b)/m;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** `(1, 'a''b', NULL, 2)` 한 줄을 값 배열로 읽는다. 문자열은 따옴표 겹침(`''`)을 풀어 준다. */
function parseValuesRow(line) {
  const body = line.trim().replace(/^\(/, '').replace(/\)[,;]?$/, '');
  const out = [];
  let i = 0;
  while (i < body.length) {
    while (body[i] === ' ' || body[i] === ',') i++;
    if (i >= body.length) break;
    if (body[i] === "'") {
      let s = '';
      i++;
      for (;;) {
        if (body[i] === "'" && body[i + 1] === "'") {
          s += "'";
          i += 2;
        } else if (body[i] === "'") {
          i++;
          break;
        } else {
          s += body[i++];
        }
      }
      out.push(s);
    } else {
      const m = body.slice(i).match(/^(NULL|\d+)/);
      if (!m) throw new Error(`값을 읽지 못했습니다: ${body.slice(i, i + 20)}`);
      out.push(m[1] === 'NULL' ? null : Number(m[1]));
      i += m[1].length;
    }
  }
  return out;
}

/** SQL 글에서 `INSERT INTO <표> (...) VALUES` 다음 줄들을 값 배열로 읽는다. */
function readInsertRows(sql, table) {
  const lines = sql.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`INSERT INTO ${table} (`) && l.endsWith('VALUES'));
  if (start < 0) throw new Error(`${table} INSERT를 찾지 못했습니다`);
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (!lines[i].startsWith('  (')) break;
    rows.push(parseValuesRow(lines[i]));
    if (lines[i].endsWith(';')) break;
  }
  return rows;
}

/** 파일 끝 «-- 되돌림 SQL» 아래 블록 */
const rollbackTail = (sql) => sql.slice(sql.lastIndexOf('-- 되돌림 SQL'));

describe('계획: 원고 07의 재료·보상을 7-6 계획의 이름으로 푼다', () => {
  it('단서 20건, 재료 칸 86개, 성공 포인트는 재료 수 × 10이다(3개 30, 4개 40, 5개 50)', () => {
    expect(POINTS_PER_INGREDIENT).toBe(10);
    expect(clues).toHaveLength(20);
    expect(countClueRecipes(clues)).toEqual({ recipes: 20, slots: 86, points: 860 });
    for (const c of clues) expect(c.points, c.code).toBe(c.ingredients.length * 10);
    const byCode = Object.fromEntries(clues.map((c) => [c.code, c.points]));
    expect(byCode.R05).toBe(30);
    expect(byCode.R07).toBe(30);
    expect(byCode.R03).toBe(40);
    expect(byCode.R01).toBe(50);
    expect(new Set(clues.map((c) => c.points))).toEqual(new Set([30, 40, 50]));
  });

  it('R01의 재료는 한입만 연구회 «5번 컬렉션»의 아이템이고 보상은 혼자들 4번 컬렉션의 접이식 테이블이다', () => {
    const r01 = clues[0];
    const book5 = plan.tribes.find((t) => t.name === '한입만 연구회').books.find((b) => b.no === 5);
    expect(r01.ingredients[0]).toEqual({ tribe: '한입만 연구회', bookNo: 5, bookName: book5.name, itemNo: 6, itemName: '젓가락 포장지' });
    const book4 = plan.tribes.find((t) => t.name === '혼자들').books.find((b) => b.no === 4);
    expect(r01.reward).toEqual({ tribe: '혼자들', bookNo: 4, bookName: book4.name, itemNo: 2, itemName: '접이식 테이블' });
  });

  it('원고 07의 아이템 이름이 트라이브 원고와 다르거나 번호가 없으면 멈춘다', () => {
    const wrongName = structuredClone(parsed);
    wrongName.clues[0].reward.name = '다른 이름';
    expect(() => buildClues(wrongName, plan)).toThrow('트라이브 원고의');
    const wrongItem = structuredClone(parsed);
    wrongItem.clues[2].ingredients[0].item = 9;
    expect(() => buildClues(wrongItem, plan)).toThrow();
    const wrongBook = structuredClone(parsed);
    wrongBook.clues[3].ingredients[0].book = 10;
    expect(() => buildClues(wrongBook, plan)).toThrow();
  });
});

describe('281: 단서 레시피 SQL', () => {
  it('레시피 20행과 재료 칸 86행이 계획과 같고 칸 순서는 0부터 원고 순서다', () => {
    const recipeRows = readInsertRows(sql281, '_jam2_clue');
    expect(recipeRows).toEqual(
      clues.map((c) => [c.no, c.code, c.name, c.description, c.points, c.reward.tribe, c.reward.bookName, c.reward.itemName])
    );
    const slotRows = readInsertRows(sql281, '_jam2_clue_slot');
    expect(slotRows).toHaveLength(86);
    expect(slotRows).toEqual(
      clues.flatMap((c) => c.ingredients.map((ing, k) => [c.no, k, ing.tribe, ing.bookName, ing.itemName]))
    );
  });

  it('성공 포인트가 SQL 행의 칸 수 × 10과 같다', () => {
    const recipeRows = readInsertRows(sql281, '_jam2_clue');
    const slotRows = readInsertRows(sql281, '_jam2_clue_slot');
    for (const row of recipeRows) {
      const slots = slotRows.filter((s) => s[0] === row[0]).length;
      expect(row[4], row[1]).toBe(slots * 10);
    }
    expect(sql281).toContain(`r.reward_points = ${POINTS_PER_INGREDIENT} * (SELECT count(*) FROM public.combination_recipe_slots`);
  });

  it('공개 시작은 2099-01-01 00:00 KST 자리 값이고, 종료 시각은 넣지 않는다', () => {
    expect(CLUE_VALID_FROM).toBe('2099-01-01 00:00:00+09');
    expect(new Date('2099-01-01T00:00:00+09:00').toISOString()).toBe('2098-12-31T15:00:00.000Z');
    expect(sql281).toContain("TIMESTAMPTZ '2099-01-01 00:00:00+09'");
    const insert = sql281.match(/INSERT INTO public\.combination_recipes \(([^)]*)\)\s*SELECT([\s\S]*?);/);
    expect(insert).toBeTruthy();
    expect(insert[1].split(',').map((s) => s.trim())).toEqual(['id', 'name', 'description', 'reward_points', 'reward_badge_ids', 'valid_from']);
    expect(insert[2]).toContain("TIMESTAMPTZ '2099-01-01 00:00:00+09'");
    expect(insert[1]).not.toContain('valid_until');
  });

  it('재료와 보상 배지를 id가 아니라 «트라이브, 컬렉션, 아이템 이름, Common 등급»으로 찾는다', () => {
    expect(sql281).not.toMatch(UUID);
    // 찾기 4곳(재료 건수·id, 보상 건수·id)과 끝 검사 1곳
    expect(sql281.match(/b\.type = 'item' AND b\.rarity = 'common' AND b\.deleted_at IS NULL/g)).toHaveLength(5);
    expect(sql281.match(/t\.name = s\.tribe AND ib\.name = s\.book_name AND b\.name = s\.item_name/g)).toHaveLength(2);
    expect(sql281.match(/t\.name = c\.reward_tribe AND ib\.name = c\.reward_book AND b\.name = c\.reward_item/g)).toHaveLength(2);
  });

  it('찾은 수가 한 건씩이 아니거나 같은 이름의 레시피가 있으면 멈추고, 끝 검사가 건수와 포인트를 확인한다', () => {
    expect(sql281).toContain('badge_matches IS DISTINCT FROM 1');
    expect(sql281).toContain('reward_matches IS DISTINCT FROM 1');
    expect(sql281).toContain('기대: 86개 모두 1건');
    expect(sql281).toContain('기대: 20개 모두 1건');
    expect(sql281).toContain('같은 이름의 레시피가 이미 %건 있습니다');
    expect(sql281).toContain('s.badge_id = c.reward_id');
    expect(sql281).toContain('끝 검사: 계획과 같은 레시피가 %건입니다(기대 20)');
    expect(sql281).toContain('끝 검사: 단서 레시피의 칸이 %개입니다(기대 86)');
    expect(sql281).toContain('끝 검사: 계획과 같은 칸이 %개입니다(기대 86)');
    expect(sql281).toContain('끝 검사: 성공 포인트가 칸 수 × 10인 레시피가 %건입니다(기대 20)');
    expect(sql281).toContain('NOT r.reward_locked AND NOT r.allow_no_reward');
  });

  it('칸은 item 타입이고 후보는 재료 배지 1개이며 BEGIN/COMMIT은 쓰지 않는다', () => {
    expect(sql281).toMatch(/INSERT INTO public\.combination_recipe_slots \(recipe_id, slot_order, badge_type, allowed_badge_ids\)\s*SELECT c\.recipe_id, s\.slot_order, 'item', ARRAY\[s\.badge_id\]/);
    expect(sql281).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });

  it('파일 끝 되돌림 SQL(deploy-gate 표식)은 모두 주석이고 단서 레시피 20건을 이름으로 지운다', () => {
    expect(sql281).toMatch(ROLLBACK_MARKER);
    const tail = rollbackTail(sql281);
    for (const line of tail.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--')).toBe(true);
    expect(tail).toContain('DELETE FROM public.combination_recipes WHERE valid_from =');
    for (const c of clues) expect(tail, c.name).toContain(q(c.name));
  });

  it('머리말에 적용 전·후 확인 SELECT가 있다', () => {
    expect(sql281).toContain('적용 전 확인 쿼리(읽기 전용 SELECT)');
    expect(sql281).toContain('적용 후 확인 쿼리(읽기 전용 SELECT)');
  });

  it('원고의 이름과 설명 20쌍이 SQL에 한 글자도 다르지 않게 들어 있고 원고 원문에도 그대로 있다', () => {
    const raw = fs.readFileSync(path.join(MANUSCRIPT_DIR, findClueFile()), 'utf8');
    for (const c of clues) {
      expect(sql281.includes(q(c.name)), `${c.code} 이름`).toBe(true);
      expect(sql281.includes(q(c.description)), `${c.code} 설명`).toBe(true);
      expect(raw.includes(c.description), `${c.code} 설명 원문`).toBe(true);
    }
  });

  it('같은 입력이면 같은 SQL이 나온다', () => {
    expect(genClueSql(clues)).toBe(genClueSql(buildClues()));
  });
});

describe('282: 쓰지 않는 컬렉션 56개와 옛 레시피 3건 끄기 SQL', () => {
  it('건수 기대는 계획 컬렉션 50개, 끄기 대상 56개(106 − 50), 옛 레시피 3건이다', () => {
    expect(BOOKS_IN_DB_AFTER_7_6).toBe(106);
    expect(retireExpectation(plan)).toEqual({ plannedBooks: 50, retireBooks: 56, oldRecipes: 3 });
  });

  it('계획 컬렉션 50개를 «트라이브 이름, 컬렉션 이름»으로 담고 한 건씩 맞지 않으면 멈춘다', () => {
    const rows = readInsertRows(sql282, '_jam2_keep');
    expect(rows).toHaveLength(50);
    expect(rows).toEqual(planBooks(plan).map((b) => [b.tribe, b.book]));
    expect(new Set(rows.map((r) => r.join('/'))).size).toBe(50);
    expect(sql282).toContain('t.name = k.tribe AND ib.name = k.book');
    expect(sql282).toContain('matches IS DISTINCT FROM 1');
    expect(sql282).toContain('기대: 50개 모두 1건');
    expect(sql282).not.toMatch(UUID);
  });

  it('끄기 대상은 활성 컬렉션 가운데 계획 컬렉션이 아닌 것이고, 56개가 아니면 멈춘다', () => {
    expect(sql282).toMatch(/WHERE ib\.is_active\s+AND ib\.id NOT IN \(SELECT book_id FROM _jam2_keep\)/);
    expect(sql282).toContain('IF v_n <> 56 THEN');
    expect(sql282).toContain('끄기 대상 컬렉션이 %개입니다(기대 56개: 7-6 적용 뒤 컬렉션 106개 − 계획 50개)');
  });

  it('컬렉션은 is_active만 false로 바꾸고 지우지 않는다', () => {
    const upd = sql282.match(/UPDATE public\.item_books ib\s+SET([\s\S]*?)\n\s+FROM/)[1];
    expect(upd.trim().startsWith('is_active = false')).toBe(true);
    expect(upd.match(/\w+ = /g)).toHaveLength(1);
    expect(sql282).not.toMatch(/^\s*DELETE FROM/m);
  });

  it('옛 레시피 3건을 이름으로 찾고 valid_until만 now()로 채우며, 이미 종료·공개 전이면 멈춘다', () => {
    expect(OLD_RECIPE_NAMES).toEqual(['무명 트럭의 불맛 흔적', '블랙 트랙 입구의 채비', '살롱의 장물 시세']);
    expect(readInsertRows(sql282, '_jam2_old_recipe').map((r) => r[0])).toEqual(OLD_RECIPE_NAMES);
    const upd = sql282.match(/UPDATE public\.combination_recipes cr\s+SET([\s\S]*?)\n\s+FROM/)[1];
    expect(upd.trim().startsWith('valid_until = now()')).toBe(true);
    expect(upd.match(/\w+ = /g)).toHaveLength(1);
    expect(sql282).toContain('r.valid_until IS NOT NULL OR (r.valid_from IS NOT NULL AND r.valid_from >= now())');
    expect(sql282).toContain('기대: 3개 모두 1건');
  });

  it('옛 레시피 이름은 시드 파일과 정책 문서(COMBINE_RECIPES.md 4절)에 적힌 3건과 같다', () => {
    const seed = fs.readFileSync(path.join(MIGRATIONS_DIR, 'seed_combine_recipes_r1_r3.sql'), 'utf8');
    const doc = fs.readFileSync(path.resolve(MIGRATIONS_DIR, '../../../docs/service/content/COMBINE_RECIPES.md'), 'utf8');
    for (const name of OLD_RECIPE_NAMES) {
      expect(seed.includes(name), `시드 ${name}`).toBe(true);
      expect(doc.includes(name), `문서 ${name}`).toBe(true);
    }
  });

  it('끄기 직전 상태를 새 백업 표에 행 전체(to_jsonb)로 담고, RLS를 켜고 클라이언트 권한을 회수한다', () => {
    expect(RETIRE_BACKUP_TABLE).toBe('retire_backup_20261022');
    expect(sql282).toContain(`CREATE TABLE IF NOT EXISTS public.${RETIRE_BACKUP_TABLE}`);
    expect(sql282).toContain("CHECK (kind IN ('item_book', 'combination_recipe'))");
    expect(sql282).toContain(`ALTER TABLE public.${RETIRE_BACKUP_TABLE} ENABLE ROW LEVEL SECURITY`);
    expect(sql282).toContain(`REVOKE ALL ON public.${RETIRE_BACKUP_TABLE} FROM anon, authenticated`);
    expect(sql282).toContain("SELECT 'item_book', ib.id, to_jsonb(ib)");
    expect(sql282).toContain("SELECT 'combination_recipe', cr.id, to_jsonb(cr)");
    // 백업은 끄는 UPDATE보다 앞에 있다
    expect(sql282.indexOf('to_jsonb(ib)')).toBeLessThan(sql282.indexOf('SET is_active = false'));
    expect(sql282.indexOf('to_jsonb(cr)')).toBeLessThan(sql282.indexOf('SET valid_until = now()'));
  });

  it('끝 검사가 끈 수, 활성으로 남은 비계획 컬렉션 0, 옛 레시피 종료, 백업 건수를 확인한다', () => {
    const end = sql282.slice(sql282.indexOf('-- 6. 끝 검사'), sql282.lastIndexOf('-- 되돌림 SQL'));
    expect(end).toContain('끝 검사: 꺼진 컬렉션이 %개입니다(기대 56)');
    expect(end).toContain('끝 검사: 계획 밖의 활성 컬렉션이 %개 남았습니다(기대 0)');
    expect(end).toContain('끝 검사: 종료 시각이 채워진 옛 레시피가 %건입니다(기대 3)');
    expect(end).toContain('끝 검사: 컬렉션 백업이 %건입니다(기대 56)');
    expect(end).toContain('끝 검사: 레시피 백업이 %건입니다(기대 3)');
  });

  it('파일 끝 되돌림 SQL(deploy-gate 표식)은 모두 주석이고 백업 표로 is_active와 valid_until을 되돌린다', () => {
    expect(sql282).toMatch(ROLLBACK_MARKER);
    expect(sql282).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
    const tail = rollbackTail(sql282);
    for (const line of tail.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--')).toBe(true);
    expect(tail).toContain(RETIRE_BACKUP_TABLE);
    expect(tail).toContain("SET is_active = (s.snapshot->>'is_active')::boolean");
    expect(tail).toContain("SET valid_until = (s.snapshot->>'valid_until')::timestamptz");
    expect(tail).toContain("s.kind = 'item_book' AND s.row_id = ib.id");
    expect(tail).toContain("s.kind = 'combination_recipe' AND s.row_id = cr.id");
    expect(tail).toContain('WHERE to_jsonb(ib) <> s.snapshot');
    expect(tail).toContain('WHERE to_jsonb(cr) <> s.snapshot');
  });

  it('머리말에 적용 전·후 확인 SELECT가 있고 오픈 직전에 적용한다고 적혀 있다', () => {
    expect(sql282).toContain('적용 전 확인 쿼리(읽기 전용 SELECT)');
    expect(sql282).toContain('적용 후 확인 쿼리(읽기 전용 SELECT)');
    expect(sql282).toContain('이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.');
  });

  it('같은 입력이면 같은 SQL이 나온다', () => {
    expect(genRetireSql(plan)).toBe(genRetireSql(buildPlan()));
  });
});

describe('커밋된 마이그레이션 파일', () => {
  const outputs = buildOutputs(clues, plan);

  it('1회 몫은 281(단서 레시피)과 282(끄기) 두 파일이고 283(등급 올리기)은 아직 없다', () => {
    expect(CLUE_FILE).toEqual({ number: 281, file: '281_clue_recipes.sql' });
    expect(RETIRE_FILE).toEqual({ number: 282, file: '282_retire_unused_collections_and_old_recipes.sql' });
    expect(Object.keys(outputs)).toEqual(['281_clue_recipes.sql', '282_retire_unused_collections_and_old_recipes.sql']);
  });

  it('생성기 결과와 저장소의 SQL 파일 두 개가 한 글자도 다르지 않다(생성기를 고치면 --write로 다시 만든다)', () => {
    for (const [file, text] of Object.entries(outputs)) {
      expect(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'), file).toBe(text);
    }
  });

  it('281·282 번호를 쓰는 마이그레이션은 이 두 파일뿐이다', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^(281|282)_/.test(f));
    expect(files.sort()).toEqual(Object.keys(outputs).sort());
  });
});
