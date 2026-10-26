// 티켓 20261026_2026(7-9): 오픈 직전 SQL 생성기 — 292(예약 컬렉션 35개 끄기), 293(첫 공개 단서 레시피 28건 열기).
// 건수, 대상 선별, 바꾸는 열이 하나뿐인지, 안전장치, 백업 표 정의, 되돌림 SQL, 282와의 독립, 커밋된 SQL 파일과 생성 결과의 일치를 검사한다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR, buildPlan, q } from '../gen-content-sql.mjs';
import {
  CLOSE_FILE,
  EXPECTED_OPEN_CLUE_NAMES,
  INITIAL_OPEN_BOOKS,
  LAUNCH_BACKUP_TABLE,
  OPEN_RECIPE_FILE,
  buildOutputs,
  genCloseSql,
  genOpenRecipeSql,
  launchExpectation,
  selectOpenClues,
  splitLaunchBooks
} from '../gen-launch-sql.mjs';
import { CLUE_TIERS, CLUE_VALID_FROM, RETIRE_BACKUP_TABLE, buildClues, genRetireSql, planBooks } from '../gen-recipe-sql.mjs';

const plan = buildPlan();
const clues = buildClues(undefined, plan);
const sql292 = genCloseSql(plan);
const sql293 = genOpenRecipeSql(clues, plan);
const sql282 = genRetireSql(plan);

const ROLLBACK_MARKER = /^\s*--\s*(?:되돌림|ROLLBACK\b|DOWN\b)/m;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** 티켓 표: 첫 공개 15개 (2026-10-25 사용자 확정) */
const TICKET_INITIAL = {
  '한입만 연구회': ['무명을 쫓는 야식가들', '비 오는 날의 기름 냄새', '시장 골목의 전설'],
  찰칵단: ['골목길 필름 스냅', '노을 헌터의 기록', '매직 아워'],
  '비사이드 레코즈': ['배터리 방전의 공포', '아날로그 믹스테이프', '삼십 초의 소리'],
  '소나무 잡화점': ['유리 칸 닦는 아침', '창고의 문구 상자', '행운의 잡동사니'],
  혼자들: ['길거리 우체통의 편지', '짝 잃은 양말', '겨울잠의 안식처']
};

/** 티켓 표: 첫 공개 단서 레시피 7개 (이름, 재료 컬렉션, 보상 컬렉션. 2026-10-26 공용 DB에서 읽은 값) */
const TICKET_OPEN_CLUES = [
  ['노을 구석의 트럭', ['한입만 연구회', '무명을 쫓는 야식가들'], ['찰칵단', '골목길 필름 스냅']],
  ['노트 위의 별', ['한입만 연구회', '비 오는 날의 기름 냄새'], ['혼자들', '길거리 우체통의 편지']],
  ['녹음 부스의 셔터 소리', ['비사이드 레코즈', '삼십 초의 소리'], ['찰칵단', '골목길 필름 스냅']],
  ['맨 아래 줄의 노트 12권', ['혼자들', '길거리 우체통의 편지'], ['소나무 잡화점', '유리 칸 닦는 아침']],
  ['벽장의 월세 봉투', ['소나무 잡화점', '유리 칸 닦는 아침'], ['혼자들', '짝 잃은 양말']],
  ['카세트 표지의 같은 글씨', ['비사이드 레코즈', '아날로그 믹스테이프'], ['소나무 잡화점', '창고의 문구 상자']],
  ['하은의 칸에 꽂힌 카세트', ['소나무 잡화점', '창고의 문구 상자'], ['비사이드 레코즈', '아날로그 믹스테이프']]
];

/** 티켓 표: 자리 값으로 남기는 단서 13개 이름 */
const TICKET_KEPT_CLUE_NAMES = [
  '10시 50분의 공중전화',
  '같은 숫자만 적힌 번호표',
  '끝까지 들은 새벽의 곡',
  '마감 무렵의 노래',
  '무명의 손글씨 번호표',
  '반셔터 벽의 무대 사진',
  '빨래방 노트 사이의 봉투',
  '수첩 첫 장의 아침 노래',
  '열쇠고리에 끼운 네컷',
  '좌판 위의 닫힌 카메라',
  '창문과 대합실 사이',
  '필름 마지막 장의 트럭',
  '혼자 찍은 네컷'
];

/** `('a''b', NULL, 2, true)` 한 줄을 값 배열로 읽는다. 문자열은 따옴표 겹침(`''`)을 풀어 준다. */
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
      const m = body.slice(i).match(/^(NULL|true|false|\d+)/);
      if (!m) throw new Error(`값을 읽지 못했습니다: ${body.slice(i, i + 20)}`);
      out.push(m[1] === 'NULL' ? null : m[1] === 'true' ? true : m[1] === 'false' ? false : Number(m[1]));
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

/** 주석 줄을 뺀 SQL 본문 */
const codeOnly = (sql) =>
  sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');

/** 백업 표 정의 구간: CREATE TABLE부터 COMMENT ON TABLE 문장 끝까지 */
function backupDefinition(sql) {
  const start = sql.indexOf('CREATE TABLE IF NOT EXISTS public.');
  const commentAt = sql.indexOf('COMMENT ON TABLE public.', start);
  const end = sql.indexOf(";\n", commentAt) + 2;
  return sql.slice(start, end);
}

describe('계획: 첫 공개 컬렉션 15개와 끄는 컬렉션 35개', () => {
  it('첫 공개 15개는 트라이브마다 3개이고 티켓 표와 같다', () => {
    expect(INITIAL_OPEN_BOOKS).toHaveLength(15);
    const byTribe = {};
    for (const b of INITIAL_OPEN_BOOKS) (byTribe[b.tribe] ??= []).push(b.book);
    expect(Object.keys(byTribe).sort()).toEqual(Object.keys(TICKET_INITIAL).sort());
    for (const [tribe, books] of Object.entries(TICKET_INITIAL)) expect([...byTribe[tribe]].sort(), tribe).toEqual([...books].sort());
  });

  it('계획 50개가 첫 공개 15개와 끄는 35개로 갈리고, 15개가 모두 계획 안에 있다', () => {
    const { initial, reserve } = splitLaunchBooks(plan);
    expect(initial).toHaveLength(15);
    expect(reserve).toHaveLength(35);
    expect([...initial, ...reserve]).toHaveLength(50);
    const all = planBooks(plan);
    expect(all).toHaveLength(50);
    const key = (b) => `${b.tribe}/${b.book}`;
    expect(new Set([...initial, ...reserve].map(key))).toEqual(new Set(all.map(key)));
    expect(initial.map(key).filter((k) => reserve.map(key).includes(k))).toEqual([]);
    for (const i of INITIAL_OPEN_BOOKS) expect(all.map(key), key(i)).toContain(key(i));
    // 트라이브마다 3개는 열고 7개는 끈다
    for (const t of plan.tribes) {
      expect(initial.filter((b) => b.tribe === t.name), t.name).toHaveLength(3);
      expect(reserve.filter((b) => b.tribe === t.name), t.name).toHaveLength(7);
    }
  });

  it('첫 공개 컬렉션이 계획에 없으면 멈춘다', () => {
    const wrong = structuredClone(plan);
    const tribe = wrong.tribes.find((t) => t.name === '찰칵단');
    tribe.books.find((b) => b.name === '매직 아워').name = '다른 이름';
    expect(() => splitLaunchBooks(wrong)).toThrow('첫 공개 컬렉션이 7-6 계획에 없습니다');
    expect(() => splitLaunchBooks(wrong)).toThrow('매직 아워');
  });
});

describe('계획: 첫 공개 단서 7개', () => {
  const open = selectOpenClues(clues);

  it('재료와 보상 컬렉션이 모두 첫 공개 15개에 드는 단서가 정확히 티켓 표의 7개 이름이다', () => {
    expect(EXPECTED_OPEN_CLUE_NAMES).toHaveLength(7);
    expect(open.map((c) => c.name).sort()).toEqual(TICKET_OPEN_CLUES.map((r) => r[0]).sort());
    expect([...EXPECTED_OPEN_CLUE_NAMES].sort()).toEqual(TICKET_OPEN_CLUES.map((r) => r[0]).sort());
  });

  it('이름마다 재료 컬렉션과 보상 컬렉션이 티켓 표(DB에서 읽은 값)와 같다', () => {
    for (const [name, ing, rew] of TICKET_OPEN_CLUES) {
      const c = open.find((x) => x.name === name);
      expect(c, name).toBeTruthy();
      expect([c.ingredientBook.tribe, c.ingredientBook.book], `${name} 재료`).toEqual(ing);
      expect([c.rewardBook.tribe, c.rewardBook.book], `${name} 보상`).toEqual(rew);
    }
  });

  it('나머지 13개 이름은 빠지고 자리 값으로 남는다(단서 20개 = 7 + 13)', () => {
    expect(clues).toHaveLength(20);
    const rest = clues.map((c) => c.name).filter((n) => !open.some((o) => o.name === n));
    expect(rest.sort()).toEqual([...TICKET_KEPT_CLUE_NAMES].sort());
    expect(rest).toHaveLength(13);
  });

  it('건수 기대는 계획 50 / 열림 15 / 끄기 35, 단서 7개 / 28행 / 자리 값 52행 / 전체 80행이다', () => {
    expect(CLUE_TIERS).toHaveLength(4);
    expect(launchExpectation(plan, clues)).toEqual({
      plannedBooks: 50,
      openBooks: 15,
      closeBooks: 35,
      openClues: 7,
      openRecipes: 28,
      keptRecipes: 52,
      totalClueRecipes: 80
    });
  });

  it('재료 컬렉션이 두 곳 이상인 단서가 있거나, 고른 단서가 기대 이름과 다르면 멈춘다', () => {
    const multi = structuredClone(clues);
    multi[0].ingredients[0].bookName = '다른 컬렉션';
    expect(() => selectOpenClues(multi)).toThrow('재료 컬렉션이 2곳입니다');

    // R04의 보상을 첫 공개 컬렉션으로 바꾸면 고른 단서가 8개가 되어 기대와 달라진다
    const extra = structuredClone(clues);
    const r04 = extra.find((c) => c.code === 'R04');
    r04.reward.tribe = '찰칵단';
    r04.reward.bookName = '매직 아워';
    expect(() => selectOpenClues(extra)).toThrow('첫 공개 단서가 기대와 다릅니다');
  });
});

describe('292: 예약 컬렉션 35개 끄기 SQL', () => {
  it('계획 컬렉션 50개를 «트라이브 이름, 컬렉션 이름»으로 담고 첫 공개 15개에 표시하며, 한 건씩 맞지 않으면 멈춘다', () => {
    const rows = readInsertRows(sql292, '_jam2_launch_book');
    expect(rows).toHaveLength(50);
    expect(rows).toEqual(planBooks(plan).map((b) => [b.tribe, b.book, INITIAL_OPEN_BOOKS.some((i) => i.tribe === b.tribe && i.book === b.book)]));
    expect(rows.filter((r) => r[2])).toHaveLength(15);
    expect(rows.filter((r) => !r[2])).toHaveLength(35);
    expect(new Set(rows.map((r) => `${r[0]}/${r[1]}`)).size).toBe(50);
    expect(sql292).toContain('CREATE TEMP TABLE _jam2_launch_book');
    for (const col of ['tribe', 'book', 'is_initial', 'book_id', 'matches']) expect(sql292).toMatch(new RegExp(`^  ${col}\\s+`, 'm'));
    expect(sql292).toContain('t.name = k.tribe AND ib.name = k.book');
    expect(sql292).toContain('matches IS DISTINCT FROM 1');
    expect(sql292).toContain('기대: 50개 모두 1건');
    expect(sql292).toContain('count(DISTINCT book_id) INTO v_bad FROM _jam2_launch_book');
    expect(sql292).not.toMatch(UUID);
  });

  it('첫 공개 15개가 모두 켜져 있지 않으면 멈춘다', () => {
    expect(sql292).toMatch(/WHERE lb\.is_initial AND ib\.is_active;\s+IF v_n <> 15 THEN/);
    expect(sql292).toContain('첫 공개 컬렉션 중 켜져 있는 것이 %개입니다(기대 15개 모두 켜짐)');
  });

  it('끄기 대상은 «계획 컬렉션 가운데 첫 공개가 아니고 지금 켜져 있는 것»이고 35개가 아니면 멈춘다', () => {
    expect(sql292).toMatch(/CREATE TEMP TABLE _jam2_close_book AS\s+SELECT lb\.book_id\s+FROM _jam2_launch_book lb\s+JOIN public\.item_books ib ON ib\.id = lb\.book_id\s+WHERE NOT lb\.is_initial AND ib\.is_active;/);
    expect(sql292).toMatch(/SELECT count\(\*\) INTO v_n FROM _jam2_close_book;\s+IF v_n <> 35 THEN/);
    expect(sql292).toContain('끄기 대상 컬렉션이 %개입니다(기대 35개');
  });

  it('UPDATE는 is_active만 false로 바꾸고 valid_from을 비롯한 다른 열과 지우기(DELETE)는 쓰지 않는다', () => {
    const code = codeOnly(sql292);
    const upd = code.match(/UPDATE public\.item_books ib\s+SET([\s\S]*?)\n\s+FROM/)[1];
    expect(upd.trim()).toBe('is_active = false');
    expect(upd.match(/\w+ = /g)).toHaveLength(1);
    expect(code.match(/UPDATE public\.item_books/g)).toHaveLength(1);
    expect(code).not.toMatch(/SET[^;]*valid_from/);
    expect(code).not.toMatch(/^\s*DELETE FROM/m);
    expect(code).toMatch(/UPDATE public\.item_books ib\s+SET is_active = false\s+FROM _jam2_close_book c\s+WHERE ib\.id = c\.book_id;/);
  });

  it('끄기 직전 행 전체를 백업 표에 item_book 종류로 담고, 백업은 UPDATE보다 앞에 있다', () => {
    expect(sql292).toContain("SELECT 'item_book', ib.id, to_jsonb(ib)");
    expect(sql292).toContain('ON CONFLICT (kind, row_id) DO UPDATE');
    expect(sql292.indexOf('to_jsonb(ib)')).toBeLessThan(sql292.indexOf('SET is_active = false'));
    expect(sql292).not.toContain(RETIRE_BACKUP_TABLE);
  });

  it('끝 검사가 끈 35개, 켜진 것이 정확히 첫 공개 15개, is_active 밖 열 불변, 백업 35건을 확인한다', () => {
    const end = sql292.slice(sql292.indexOf('-- 6. 끝 검사'), sql292.lastIndexOf('-- 되돌림 SQL'));
    expect(end).toContain('끝 검사: 꺼진 컬렉션이 %개입니다(기대 35)');
    expect(end).toContain('count(*) FILTER (WHERE lb.is_initial), count(*) FILTER (WHERE NOT lb.is_initial)');
    expect(end).toContain('IF v_n <> 15 OR v_off <> 0 THEN');
    expect(end).toContain('끝 검사: 계획 컬렉션 가운데 켜진 첫 공개가 %개, 켜진 첫 공개 밖이 %개입니다(기대 15, 0)');
    expect(end).toContain("WHERE to_jsonb(ib) - 'is_active' = s.snapshot - 'is_active'");
    expect(end).toContain('끝 검사: is_active 밖의 열이 백업과 같은 컬렉션이 %개입니다(기대 35)');
    expect(end).toContain("SELECT count(*) INTO v_n FROM public.launch_backup_20261026 WHERE kind = 'item_book'");
    expect(end).toContain('끝 검사: 컬렉션 백업이 %건입니다(기대 35)');
  });

  it('파일 끝 되돌림 SQL(deploy-gate 표식)은 모두 주석이고 백업 표로 is_active만 되돌리며 백업 표 지우기를 «둘 다 되돌린 뒤에만»이라고 적는다', () => {
    expect(sql292).toMatch(ROLLBACK_MARKER);
    const tail = rollbackTail(sql292);
    for (const line of tail.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--')).toBe(true);
    expect(tail).toContain("SET is_active = (s.snapshot->>'is_active')::boolean");
    expect(tail).toContain("s.kind = 'item_book' AND s.row_id = ib.id");
    expect(tail).toContain('WHERE to_jsonb(ib) <> s.snapshot');
    expect(tail).toContain('292와 293을 모두 되돌린 뒤에만 지운다');
    expect(tail).toContain(`DROP TABLE IF EXISTS public.${LAUNCH_BACKUP_TABLE};`);
  });

  it('머리말에 적용 전·후 확인 SELECT가 있고 오픈 직전에 적용한다고 적혀 있다', () => {
    expect(sql292).toContain('적용 전 확인 쿼리(읽기 전용 SELECT)');
    expect(sql292).toContain('적용 후 확인 쿼리(읽기 전용 SELECT)');
    expect(sql292).toContain('이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.');
    const header = sql292.slice(0, sql292.indexOf('CREATE TABLE IF NOT EXISTS'));
    expect(header.match(/SELECT /g).length).toBeGreaterThanOrEqual(6);
    for (const line of header.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--'), line).toBe(true);
  });

  it('BEGIN/COMMIT은 쓰지 않는다', () => {
    expect(sql292).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });

  it('같은 입력이면 같은 SQL이 나온다', () => {
    expect(genCloseSql(plan)).toBe(genCloseSql(buildPlan()));
  });
});

describe('293: 첫 공개 단서 레시피 28건 열기 SQL', () => {
  it('7개 이름과 재료·보상 컬렉션을 담고, 이름마다 정확히 4행이 아니면 멈춘다', () => {
    const rows = readInsertRows(sql293, '_jam2_launch_clue');
    expect(rows).toHaveLength(7);
    expect(rows.map((r) => r[0])).toEqual(selectOpenClues(clues).map((c) => c.name));
    for (const [name, ing, rew] of TICKET_OPEN_CLUES) {
      const row = rows.find((r) => r[0] === name);
      expect(row.slice(1), name).toEqual([...ing, ...rew]);
    }
    expect(sql293).toContain('recipe_rows IS DISTINCT FROM 4');
    expect(sql293).toContain('단서 레시피를 이름으로 찾았을 때 4행이 아닌 이름이 %개입니다(기대: 7개 모두 4행)');
    expect(sql293).toContain('IF v_n <> 28 THEN');
    expect(sql293).toContain('열 레시피가 %건입니다(기대 28건 = 7개 이름 × 4행)');
    expect(sql293).not.toMatch(UUID);
  });

  it('4행 모두 자리 값(CLUE_VALID_FROM)이고 종료 시각이 비어 있어야 하며, 값은 281이 넣은 자리 값과 같다', () => {
    expect(CLUE_VALID_FROM).toBe('2099-01-01 00:00:00+09');
    const literal = `TIMESTAMPTZ '${CLUE_VALID_FROM}'`;
    expect(sql293).toContain(`r.valid_from = ${literal} AND r.valid_until IS NULL`);
    expect(sql293).toContain('placeholder_rows IS DISTINCT FROM 4');
    expect(sql293).toContain('4행이 모두 공개 시작 자리 값(2099-01-01 00:00:00+09)이고 종료 시각이 비어 있어야 하는데 그렇지 않은 이름이 %개입니다');
    const sql281 = fs.readFileSync(path.join(MIGRATIONS_DIR, '281_clue_recipes.sql'), 'utf8');
    expect(sql281).toContain(literal);
  });

  it('UPDATE는 valid_from = NULL 하나만 바꾸고, valid_until·칸·보상 열은 건드리지 않는다', () => {
    const code = codeOnly(sql293);
    const upd = code.match(/UPDATE public\.combination_recipes cr\s+SET([\s\S]*?)\n\s+FROM/)[1];
    expect(upd.trim()).toBe('valid_from = NULL');
    expect(upd.match(/\w+ = /g)).toHaveLength(1);
    expect(code.match(/UPDATE public\.combination_recipes/g)).toHaveLength(1);
    expect(code).not.toMatch(/UPDATE public\.combination_recipe_slots/);
    const stmt = code.match(/UPDATE public\.combination_recipes cr[\s\S]*?;/)[0];
    for (const col of ['valid_until', 'reward_badge_ids', 'reward_points', 'reward_locked', 'allow_no_reward', 'name', 'description']) {
      expect(stmt, col).not.toContain(col);
    }
    expect(code).not.toMatch(/^\s*(DELETE FROM|INSERT INTO public\.combination_recipe)/m);
    expect(code).toMatch(/UPDATE public\.combination_recipes cr\s+SET valid_from = NULL\s+FROM _jam2_launch_recipe r\s+WHERE cr\.id = r\.recipe_id;/);
  });

  it('재료·보상 컬렉션을 칸의 후보 배지와 보상 배지에서 다시 구해 표와 대조하고, 첫 공개 15개 안이며 켜져 있는지 확인한다', () => {
    expect(sql293).toContain('unnest(s.allowed_badge_ids) AS a(badge_id)');
    expect(sql293).toContain('unnest(cr.reward_badge_ids) AS a(badge_id)');
    expect(sql293).toContain('LEFT JOIN public.item_books ib ON ib.id = b.item_book_id');
    expect(sql293).toContain('LEFT JOIN public.tribes t ON t.id = ib.tribe_id');
    expect(sql293).toContain('f.tribe IS DISTINCT FROM c.ingredient_tribe OR f.book IS DISTINCT FROM c.ingredient_book');
    expect(sql293).toContain('f.tribe IS DISTINCT FROM c.reward_tribe OR f.book IS DISTINCT FROM c.reward_book');
    expect(sql293).toContain('재료 칸의 컬렉션이 위 표와 다르거나 후보가 없는 레시피가 %건입니다');
    expect(sql293).toContain('보상 배지의 컬렉션이 위 표와 다르거나 보상이 없는 레시피가 %건입니다');
    const openBooks = readInsertRows(sql293, '_jam2_launch_open_book');
    // 순서는 계획의 컬렉션 순서를 따른다
    expect(openBooks).toEqual(splitLaunchBooks(plan).initial.map((b) => [b.tribe, b.book]));
    expect(new Set(openBooks.map((r) => r.join('/')))).toEqual(new Set(INITIAL_OPEN_BOOKS.map((b) => `${b.tribe}/${b.book}`)));
    expect(sql293).toContain('FROM _jam2_launch_open_book o WHERE o.tribe = f.tribe AND o.book = f.book');
    expect(sql293).toContain('f.book_active IS NOT TRUE');
    expect(sql293).toContain('재료·보상 배지의 컬렉션 가운데 첫 공개 15개 밖이거나 꺼져 있는 것이 %개입니다');
  });

  it('7개 이름을 뺀 나머지 중 자리 값인 행이 정확히 52행이 아니면 멈춘다', () => {
    expect(sql293).toMatch(/WHERE r\.valid_from = TIMESTAMPTZ '2099-01-01 00:00:00\+09'\s+AND NOT EXISTS \(SELECT 1 FROM _jam2_launch_clue c WHERE c\.name = r\.name\);\s+IF v_n <> 52 THEN/);
    expect(sql293).toContain('열 단서를 뺀 나머지 중 공개 시작이 자리 값인 행이 %행입니다(기대 52행 = 80행 - 28행)');
    // 52행 검사는 백업·UPDATE보다 앞에 있다
    expect(sql293.indexOf('기대 52행 = 80행 - 28행')).toBeLessThan(sql293.indexOf("SELECT 'combination_recipe', cr.id, to_jsonb(cr)"));
  });

  it('열기 직전 행 전체를 백업 표에 combination_recipe 종류로 담고, 백업은 UPDATE보다 앞에 있다', () => {
    expect(sql293).toContain("SELECT 'combination_recipe', cr.id, to_jsonb(cr)");
    expect(sql293).toContain('ON CONFLICT (kind, row_id) DO UPDATE');
    expect(sql293.indexOf('to_jsonb(cr)')).toBeLessThan(sql293.indexOf('SET valid_from = NULL'));
    expect(sql293).not.toContain(RETIRE_BACKUP_TABLE);
  });

  it('끝 검사가 열린 28행, 자리 값으로 남은 52행, valid_from 밖 열 불변, 백업 28건을 확인한다', () => {
    const end = sql293.slice(sql293.indexOf('-- 6. 끝 검사'), sql293.lastIndexOf('-- 되돌림 SQL'));
    expect(end).toContain('끝 검사: 공개 시작이 비어 있는 열린 레시피가 %건입니다(기대 28)');
    expect(end).toContain("WHERE valid_from = TIMESTAMPTZ '2099-01-01 00:00:00+09'");
    expect(end).toContain('끝 검사: 공개 시작이 자리 값으로 남은 레시피가 %건입니다(기대 52)');
    expect(end).toContain("WHERE to_jsonb(cr) - 'valid_from' = s.snapshot - 'valid_from'");
    expect(end).toContain('끝 검사: valid_from 밖의 열이 백업과 같은 레시피가 %건입니다(기대 28)');
    expect(end).toContain("SELECT count(*) INTO v_n FROM public.launch_backup_20261026 WHERE kind = 'combination_recipe'");
    expect(end).toContain('끝 검사: 레시피 백업이 %건입니다(기대 28)');
  });

  it('파일 끝 되돌림 SQL(deploy-gate 표식)은 모두 주석이고 백업 표로 valid_from만 되돌리며 백업 표 지우기를 «둘 다 되돌린 뒤에만»이라고 적는다', () => {
    expect(sql293).toMatch(ROLLBACK_MARKER);
    const tail = rollbackTail(sql293);
    for (const line of tail.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--')).toBe(true);
    expect(tail).toContain("SET valid_from = (s.snapshot->>'valid_from')::timestamptz");
    expect(tail).toContain("s.kind = 'combination_recipe' AND s.row_id = cr.id");
    expect(tail).toContain('WHERE to_jsonb(cr) <> s.snapshot');
    expect(tail).toContain('292와 293을 모두 되돌린 뒤에만 지운다');
    expect(tail).toContain(`DROP TABLE IF EXISTS public.${LAUNCH_BACKUP_TABLE};`);
  });

  it('머리말에 적용 전·후 확인 SELECT가 있고 오픈 직전에 적용한다고 적혀 있으며 BEGIN/COMMIT은 쓰지 않는다', () => {
    expect(sql293).toContain('적용 전 확인 쿼리(읽기 전용 SELECT)');
    expect(sql293).toContain('적용 후 확인 쿼리(읽기 전용 SELECT)');
    expect(sql293).toContain('이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.');
    expect(sql293).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });

  it('원고의 7개 이름이 SQL에 한 글자도 다르지 않게 들어 있다', () => {
    for (const [name] of TICKET_OPEN_CLUES) expect(sql293.includes(q(name)), name).toBe(true);
    for (const name of TICKET_KEPT_CLUE_NAMES) expect(codeOnly(sql293).includes(q(name)), name).toBe(false);
  });

  it('같은 입력이면 같은 SQL이 나온다', () => {
    expect(genOpenRecipeSql(clues, plan)).toBe(genOpenRecipeSql(buildClues(), buildPlan()));
  });
});

describe('292·293 공통: 백업 표', () => {
  it('백업 표 이름은 launch_backup_20261026이고 282의 retire_backup_20261022와 다른 표다', () => {
    expect(LAUNCH_BACKUP_TABLE).toBe('launch_backup_20261026');
    expect(LAUNCH_BACKUP_TABLE).not.toBe(RETIRE_BACKUP_TABLE);
  });

  it('두 파일의 백업 표 정의(CREATE TABLE IF NOT EXISTS ~ COMMENT)가 한 글자도 다르지 않고 RLS를 켜고 권한을 회수한다', () => {
    const a = backupDefinition(sql292);
    const b = backupDefinition(sql293);
    expect(a.length).toBeGreaterThan(300);
    expect(a).toBe(b);
    expect(a).toContain(`CREATE TABLE IF NOT EXISTS public.${LAUNCH_BACKUP_TABLE}`);
    expect(a).toContain("CHECK (kind IN ('item_book', 'combination_recipe'))");
    expect(a).toContain('PRIMARY KEY (kind, row_id)');
    expect(a).toContain(`ALTER TABLE public.${LAUNCH_BACKUP_TABLE} ENABLE ROW LEVEL SECURITY`);
    expect(a).toContain(`REVOKE ALL ON public.${LAUNCH_BACKUP_TABLE} FROM anon, authenticated`);
  });
});

describe('292와 282는 서로를 깨지 않는다', () => {
  const keep282 = readInsertRows(sql282, '_jam2_keep').map((r) => `${r[0]}/${r[1]}`);
  const books292 = readInsertRows(sql292, '_jam2_launch_book').map((r) => `${r[0]}/${r[1]}`);

  it('282는 «계획 밖의 활성 컬렉션»만 끄고 292는 «계획 안의 컬렉션»만 끈다. 두 파일이 쓰는 계획 50개가 같아서 끄는 대상이 겹치지 않는다', () => {
    expect(keep282).toHaveLength(50);
    expect([...books292].sort()).toEqual([...keep282].sort());
    expect(sql282).toMatch(/WHERE ib\.is_active\s+AND ib\.id NOT IN \(SELECT book_id FROM _jam2_keep\)/);
    expect(sql292).toMatch(/FROM _jam2_launch_book lb\s+JOIN public\.item_books ib ON ib\.id = lb\.book_id\s+WHERE NOT lb\.is_initial AND ib\.is_active/);
    expect(sql292).not.toContain('NOT IN (SELECT book_id');
    expect(sql292).not.toContain('_jam2_keep');
    expect(sql282).not.toContain('_jam2_launch_book');
    expect(sql282).not.toContain('_jam2_close_book');
  });

  it('282의 끝 검사(계획 밖의 활성 0개)와 292의 끝 검사(계획 안의 켜진 것 15개)는 서로 다른 집합만 본다', () => {
    const end282 = sql282.slice(sql282.indexOf('-- 6. 끝 검사'), sql282.lastIndexOf('-- 되돌림 SQL'));
    const end292 = sql292.slice(sql292.indexOf('-- 6. 끝 검사'), sql292.lastIndexOf('-- 되돌림 SQL'));
    expect(end282).toContain('ib.is_active AND ib.id NOT IN (SELECT book_id FROM _jam2_keep)');
    expect(end282).not.toContain('_jam2_launch_book');
    expect(end292).toContain('FROM _jam2_launch_book lb JOIN public.item_books ib ON ib.id = lb.book_id');
    expect(end292).not.toContain('NOT IN (SELECT');
    // 292의 item_books 읽기는 모두 계획 컬렉션 표(_jam2_launch_book)나 끄는 대상 표(_jam2_close_book)와 이어져 있다
    for (const block of end292.split(/\n\s*\n/).filter((b) => b.includes('public.item_books'))) {
      expect(/_jam2_launch_book|_jam2_close_book/.test(block), block).toBe(true);
    }
  });

  it('임시 표 이름과 백업 표가 겹치지 않아 어느 쪽을 먼저 실행해도 된다', () => {
    const temps = (sql) => new Set(codeOnly(sql).match(/CREATE TEMP TABLE (_jam2_\w+)/g)?.map((s) => s.replace('CREATE TEMP TABLE ', '')));
    const t282 = temps(sql282);
    const t292 = temps(sql292);
    const t293 = temps(sql293);
    expect(t292.size).toBe(2);
    expect(t293.size).toBe(4);
    for (const n of t292) expect(t282.has(n) || t293.has(n), n).toBe(false);
    for (const n of t293) expect(t282.has(n), n).toBe(false);
    expect(sql282).not.toContain(LAUNCH_BACKUP_TABLE);
  });
});

describe('커밋된 마이그레이션 파일', () => {
  const outputs = buildOutputs(clues, plan);

  it('7-9의 마이그레이션은 292(컬렉션 끄기), 293(단서 레시피 열기) 두 파일이다', () => {
    expect(CLOSE_FILE).toEqual({ number: 292, file: '292_close_reserve_collections_at_launch.sql' });
    expect(OPEN_RECIPE_FILE).toEqual({ number: 293, file: '293_open_initial_clue_recipes_at_launch.sql' });
    expect(Object.keys(outputs)).toEqual(['292_close_reserve_collections_at_launch.sql', '293_open_initial_clue_recipes_at_launch.sql']);
  });

  it('생성기 결과와 저장소의 SQL 파일 두 개가 한 글자도 다르지 않다(생성기를 고치면 --write로 다시 만든다)', () => {
    for (const [file, text] of Object.entries(outputs)) {
      expect(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'), file).toBe(text);
    }
  });

  it('--dry는 파일을 쓰지 않고 «계획 50 / 열림 15 / 끄기 35», «단서 7개 / 28행 / 자리 값 52행»을 출력한다', () => {
    const script = fileURLToPath(new URL('../gen-launch-sql.mjs', import.meta.url));
    const before = Object.fromEntries(Object.keys(outputs).map((f) => [f, fs.statSync(path.join(MIGRATIONS_DIR, f)).mtimeMs]));
    const out = execFileSync(process.execPath, [script, '--dry'], { encoding: 'utf8' });
    expect(out).toContain('292 컬렉션 끄기: 계획 50 / 열림 15 / 끄기 35');
    expect(out).toContain('293 단서 레시피 열기: 단서 7개 / 28행 / 자리 값 52행');
    for (const [name] of TICKET_OPEN_CLUES) expect(out).toContain(name);
    for (const [f, mtime] of Object.entries(before)) expect(fs.statSync(path.join(MIGRATIONS_DIR, f)).mtimeMs, f).toBe(mtime);
  });

  it('292·293 번호를 쓰는 마이그레이션은 이 두 파일뿐이다', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^(292|293)_/.test(f));
    expect(files.sort()).toEqual(Object.keys(outputs).sort());
  });
});
