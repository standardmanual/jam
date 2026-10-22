#!/usr/bin/env node
/**
 * gen-recipe-sql.mjs — 단서 레시피 입력 SQL(281, 단서 20개 × 4등급 = 80건)과 쓰지 않는 컬렉션·옛 레시피 끄기 SQL(282)을 만든다.
 * (티켓 20261022_1138, JAM 2.0 묶음 7의 7-7, 1회 몫. 등급 올리기 SQL(283)은 2회에 이 파일에 더한다)
 *
 * 입력: 단서 레시피 원고 07(parse-clue-recipes.mjs)과 7-6 계획(gen-content-sql.mjs의 buildPlan: 원고 01~05의 컬렉션 50개).
 * 출력: 마이그레이션 파일 2개. 파일만 쓰고 실행하지 않는다 — 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다.
 *       생성기는 DB를 읽지 않는다. 실제 건수는 SQL 안에서 이름으로 판별하고, 기대와 다르면 SQL이 오류로 멈춘다.
 *
 * SQL의 원칙 (7-6과 같다)
 *   - 배지·컬렉션·레시피는 id가 아니라 이름으로 찾고, 찾은 수가 기대와 다르면 오류로 멈춘다.
 *   - 한 번의 호출로 통째로 실행하는 한 트랜잭션이다(BEGIN/COMMIT은 쓰지 않는다. 롤백 실측이 파일 뒤에
 *     일부러 오류를 붙여 같은 호출로 실행하기 때문이다).
 *   - 끄기는 직전 상태를 백업 표에 기록하고, 되돌림 SQL이 그 표를 쓴다.
 *
 * 사용법
 *   node scripts/jam2-content/gen-recipe-sql.mjs --dry    # 파일 없이 건수만 출력
 *   node scripts/jam2-content/gen-recipe-sql.mjs --write  # 281, 282를 마이그레이션 폴더에 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS_DIR, buildPlan, countPlan, q } from './gen-content-sql.mjs';
import { parseClueManuscript, countClues } from './parse-clue-recipes.mjs';

export const TICKET = '20261022_1138';

/** 마이그레이션 번호와 파일 이름. 번호는 시작 때 origin/staging 기준으로 비어 있음을 확인했다(2026-10-22: 281~284 비어 있고 285는 7-1이 썼다). */
export const CLUE_FILE = { number: 281, file: '281_clue_recipes.sql' };
export const RETIRE_FILE = { number: 282, file: '282_retire_unused_collections_and_old_recipes.sql' };

/** 성공 포인트 = 재료 수 × 10 (믹스 실패 포인트 10 기준, docs/service/content/COMBINE_RECIPES.md 4절의 기존 기준, 사용자 결정 2026-10-22) */
export const POINTS_PER_INGREDIENT = 10;

/**
 * 단서 레시피의 등급 4개. 컬렉션의 등급은 유저가 처음 꽂은 아이템 배지의 등급으로 정해지고 그 뒤로는 같은 등급만 꽂을 수 있어서
 * (운영 로직 8.3절), 단서마다 4등급 레시피를 하나씩 만든다. 재료와 보상은 레시피와 같은 등급이고 이름·설명·성공 포인트는 4등급이 같다
 * (사용자 정정 2026-10-22: Common 20건 → 4등급 80건).
 */
export const CLUE_TIERS = ['common', 'rare', 'epic', 'mystic'];

/** 공개 시작의 먼 미래 자리 값(사용자 결정 2026-10-22, 가정 다). 오픈 직전 SQL(7-9 목록)이 실제 오픈 시각으로 바꾼다. */
export const CLUE_VALID_FROM = '2099-01-01 00:00:00+09';
const VALID_FROM_SQL = `TIMESTAMPTZ '${CLUE_VALID_FROM}'`;

/** 끄기 직전 상태를 담는 백업 표. 7-6의 표(content_overwrite_backup_20261022)는 kind 제약이 레시피를 담지 못하고 6-4 정리 때 지워져서 따로 만든다. */
export const RETIRE_BACKUP_TABLE = 'retire_backup_20261022';

/** 7-6 적용 뒤 공용 DB의 컬렉션 수(옛 100 + 새 6). 티켓 20261022_1137 전체 마무리 점검(카리나, 2026-10-22)에서 읽은 값이다. */
export const BOOKS_IN_DB_AFTER_7_6 = 106;

/**
 * 끄기 대상: 계획 밖 컬렉션(106 − 50 = 56개) 가운데 지금 켜져 있는 것. 56개 전부가 아니다 — 옛 트라이브를 끌 때
 * 37개가 이미 꺼져 있었다. 켜진 19개는 아직 켜진 옛 트라이브 3곳의 것이다(낭만 미식가 2, 숲속의 갱단 8, 아스팔트 레인저 9).
 * 티켓 20261022_1138 1회 롤백 실측(카리나, 2026-10-22)에서 공용 DB를 읽어 확인한 값이다. 처음에는 56으로 적었고
 * 실측에서 SQL의 건수 검사가 멈춰 고쳤다. 오픈 직전에 적용할 때 실제 건수가 달라지면 SQL이 멈춘다.
 */
export const ACTIVE_UNPLANNED_BOOKS_IN_DB = 19;

/** 오픈 때 끄는 옛 레시피 3건(트라이브 단독 레시피). docs/service/content/COMBINE_RECIPES.md 4절, seed_combine_recipes_r1_r3.sql */
export const OLD_RECIPE_NAMES = ['무명 트럭의 불맛 흔적', '블랙 트랙 입구의 채비', '살롱의 장물 시세'];

/** SQL 주석 블록 — 모든 줄을 `-- `로 시작해 실수로 실행되지 않게 한다. */
function commentBlock(lines) {
  return lines.map((l) => (l === '' ? '--' : `-- ${l}`)).join('\n');
}

// ────────────────────────────────────────────────────────────
// 계획 만들기
// ────────────────────────────────────────────────────────────

/** 재료·보상 한 개를 7-6 계획의 트라이브·컬렉션·아이템 이름으로 푼다. 원고 07의 번호와 이름이 어긋나면 멈춘다. */
function resolveRef(plan, tribeName, ref, where) {
  const tribe = plan.tribes.find((t) => t.name === tribeName);
  if (!tribe) throw new Error(`${where}: 계획에 트라이브 «${tribeName}»가 없습니다`);
  const book = tribe.books.find((b) => b.no === ref.book);
  if (!book) throw new Error(`${where}: «${tribeName}»에 ${ref.book}번 컬렉션이 없습니다`);
  const item = book.items.find((i) => i.no === ref.item);
  if (!item) throw new Error(`${where}: «${book.name}»에 ${ref.item}번 아이템이 없습니다`);
  if (item.name !== ref.name) {
    throw new Error(`${where}: 원고 07의 «${ref.book}-${ref.item} ${ref.name}»가 트라이브 원고의 «${item.name}»와 다릅니다`);
  }
  return { tribe: tribeName, bookNo: book.no, bookName: book.name, itemNo: item.no, itemName: item.name };
}

/** 단서 레시피 20건을 DB에서 찾을 이름(트라이브, 컬렉션, 아이템)으로 푼다. */
export function buildClues(parsed = parseClueManuscript(), plan = buildPlan()) {
  return parsed.clues.map((c) => {
    const where = `${c.code}`;
    const ingredients = c.ingredients.map((ing) => resolveRef(plan, c.fromTribe, ing, `${where} 재료`));
    const reward = resolveRef(plan, c.toTribe, c.reward, `${where} 보상`);
    return {
      no: c.no,
      code: c.code,
      name: c.name,
      description: c.description,
      points: ingredients.length * POINTS_PER_INGREDIENT,
      ingredients,
      reward
    };
  });
}

/** 단서 레시피 건수: 단서 × 등급 4개가 레시피이고, 칸과 성공 포인트 합계도 등급 수만큼 곱해진다. */
export function countClueRecipes(clues) {
  const tiers = CLUE_TIERS.length;
  const slotsPerTier = clues.reduce((n, c) => n + c.ingredients.length, 0);
  const pointsPerTier = clues.reduce((n, c) => n + c.points, 0);
  return {
    clues: clues.length,
    tiers,
    recipes: clues.length * tiers,
    slotsPerTier,
    slots: slotsPerTier * tiers,
    points: pointsPerTier * tiers
  };
}

/** 7-6 계획의 컬렉션 50개(트라이브 이름, 새 컬렉션 이름) */
export function planBooks(plan) {
  return plan.tribes.flatMap((t) => t.books.map((b) => ({ tribe: t.name, book: b.name })));
}

/** 끄기 SQL의 건수 기대: 계획 컬렉션 50개, 끄기 대상 19개(계획 밖 56개 가운데 켜진 것), 옛 레시피 3건 */
export function retireExpectation(plan) {
  const planned = countPlan(plan).books;
  return {
    plannedBooks: planned,
    retireBooks: ACTIVE_UNPLANNED_BOOKS_IN_DB,
    alreadyOffBooks: BOOKS_IN_DB_AFTER_7_6 - planned - ACTIVE_UNPLANNED_BOOKS_IN_DB,
    oldRecipes: OLD_RECIPE_NAMES.length
  };
}

// ────────────────────────────────────────────────────────────
// 281 — 단서 레시피 80건 (단서 20개 × 등급 4개)
// ────────────────────────────────────────────────────────────

export function genClueSql(clues) {
  const n = countClueRecipes(clues);
  const T = CLUE_TIERS.length;
  const byCount = { 3: 0, 4: 0, 5: 0 };
  for (const c of clues) byCount[c.ingredients.length]++;
  const clueNames = clues.map((c) => q(c.name)).join(', ');
  const tierValues = CLUE_TIERS.map((r, i) => `  (${q(r)}, ${i})`).join(',\n');
  const tierLabels = CLUE_TIERS.join('·');
  const perTier = CLUE_TIERS.map((r) => `${r} ${n.clues}`).join(', ');

  const header = commentBlock([
    CLUE_FILE.file,
    `JAM 2.0 묶음 7 · 7-7: 단서 레시피 ${n.recipes}건 입력 (단서 ${n.clues}개 × 등급 ${T}개, 티켓 ${TICKET})`,
    '',
    '이 파일은 gen-recipe-sql.mjs가 단서 레시피 원고(docs/plan/jam2/tribe-rethink/manuscript/07 단서 레시피.md)와',
    '트라이브 원고 01~05에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다',
    '(node scripts/jam2-content/gen-recipe-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    '하는 일 (한 트랜잭션, 파일만 쓰고 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다)',
    `  1. 레시피 ${n.recipes}건(combination_recipes): 단서마다 ${tierLabels} 레시피를 하나씩 만든다(${n.clues}개 × ${T}등급). 재료와 보상은 레시피와 같은 등급이다.`,
    '     컬렉션의 등급은 유저가 처음 꽂은 아이템 배지의 등급으로 정해지고 그 뒤로는 같은 등급만 꽂을 수 있어서(운영 로직 8.3절),',
    '     한 등급뿐이면 다른 등급으로 컬렉션을 채우는 유저는 쓸 수 없다. 그래서 4등급을 모두 만든다(사용자 정정 2026-10-22).',
    '     이름·설명은 원고 07의 5절 값 그대로이고 4등급이 같다. 보상 배지는 도착 트라이브의 같은 이름·같은 등급 아이템 배지 1개다.',
    `     성공 포인트는 칸 수 × ${POINTS_PER_INGREDIENT}이고 모든 등급에 같다(재료 3개 ${3 * POINTS_PER_INGREDIENT}, 4개 ${4 * POINTS_PER_INGREDIENT}, 5개 ${5 * POINTS_PER_INGREDIENT}. 단서 기준 재료 3개 ${byCount[3]}건, 4개 ${byCount[4]}건, 5개 ${byCount[5]}건).`,
    '     reward_locked는 false(결과를 열린 채 지급), allow_no_reward는 false(보상 없음 허용 끔), valid_until은 비운다.',
    `  2. 재료 칸 ${n.slots}개(combination_recipe_slots, 단서 기준 ${n.slotsPerTier}개 × ${T}등급): 재료마다 칸 하나, badge_type은 item, 후보(allowed_badge_ids)는 출발 트라이브의 같은 이름·레시피와 같은 등급 아이템 배지 1개.`,
    '     slot_order는 원고의 재료 순서대로 0부터 매긴다(어드민 저장 코드와 같다).',
    `  3. 공개 시작(valid_from)은 ${CLUE_VALID_FROM} 자리 값(2099-01-01 00:00 KST)이다. 일반 유저와 프로덕션에는 보이지 않고,`,
    '     운영자만 staging 믹스 화면에서 공개 전 시험 믹스를 할 수 있다. 오픈 직전 SQL(7-9 목록)이 valid_from을 실제 오픈 시각으로 바꾼다.',
    `     ${n.recipes}건 모두 숨겨 넣으므로 오픈 때 등급별로 따로 열 수 있다.`,
    '     컬렉션을 트라이브마다 3개로 줄일 때는 재료와 보상 컬렉션이 모두 열리는 날에 공개 시각을 맞춘다(자동 연동 코드는 없다).',
    '',
    '찾는 방법과 멈추는 조건',
    '  - 재료·보상 배지는 id가 아니라 «트라이브 이름, 컬렉션 이름, 아이템 이름, 레시피의 등급(type item, 삭제되지 않음)»으로 찾는다.',
    '    7-6의 트라이브 SQL(276~280)이 같은 이름의 아이템 배지를 4등급으로 모두 만들어 두었다.',
    `  - 재료 ${n.slots}개와 보상 ${n.recipes}개가 각각 등급마다 한 건씩 맞지 않으면(0건이거나 2건 이상) 멈춘다. 오류 문구에 맞지 않은 등급을 적는다.`,
    '  - 단서 레시피와 같은 이름의 레시피가 이미 있으면 멈춘다. 이 파일은 한 번만 적용한다.',
    '  - 재료 배지가 같은 레시피의 보상 배지와 같으면 멈춘다.',
    '  - 끝에서 레시피·칸·포인트·공개 시작·보상과 재료의 등급(레시피의 등급과 같음)·같은 (이름, 보상 등급) 중복 없음을 검사하고 어긋나면 전체를 되돌린다(트랜잭션).',
    '',
    '적용 순서: 7-6의 다섯 트라이브 SQL(276~280)을 적용한 뒤. 282(끄기)와는 순서가 상관없다(282는 오픈 직전에 적용한다).',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    '  -- 기존 레시피는 옛 트라이브 단독 레시피 3건이고, 자리 값 공개 시작을 가진 레시피는 없다 (3, 0)',
    '  SELECT count(*) AS recipes,',
    `         count(*) FILTER (WHERE valid_from = ${VALID_FROM_SQL}) AS clue_placeholder FROM public.combination_recipes;`,
    `  -- 단서 레시피 이름과 같은 레시피가 없다 (0)`,
    `  SELECT count(*) FROM public.combination_recipes WHERE name IN (${clueNames});`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  -- 단서 레시피 ${n.recipes}건: 자리 값 공개 시작, 종료 없음, 열린 채 지급 (${n.recipes})`,
    '  SELECT count(*) FROM public.combination_recipes',
    `   WHERE valid_from = ${VALID_FROM_SQL} AND valid_until IS NULL AND NOT reward_locked AND NOT allow_no_reward;`,
    `  -- 보상 배지의 등급별 레시피 수 (${perTier})`,
    '  SELECT rb.rarity, count(*) FROM public.combination_recipes r',
    '    JOIN public.badges rb ON rb.id = r.reward_badge_ids[1]',
    `   WHERE r.valid_from = ${VALID_FROM_SQL} GROUP BY rb.rarity ORDER BY rb.rarity;`,
    `  -- 재료 칸 ${n.slots}개, 후보는 모두 1개 (${n.slots}, 1)`,
    '  SELECT count(*), max(array_length(s.allowed_badge_ids, 1)) FROM public.combination_recipe_slots s',
    `    JOIN public.combination_recipes r ON r.id = s.recipe_id WHERE r.valid_from = ${VALID_FROM_SQL};`,
    `  -- 성공 포인트가 칸 수 × ${POINTS_PER_INGREDIENT}이 아닌 레시피 (0행)`,
    '  SELECT r.name, r.reward_points, count(s.id) AS slots FROM public.combination_recipes r',
    '    JOIN public.combination_recipe_slots s ON s.recipe_id = r.id',
    `   WHERE r.valid_from = ${VALID_FROM_SQL}`,
    `   GROUP BY r.id HAVING r.reward_points <> count(s.id) * ${POINTS_PER_INGREDIENT};`,
    '  -- 보상이 아이템 배지가 아니거나 삭제된 레시피 (0)',
    '  SELECT count(*) FROM public.combination_recipes r',
    '    CROSS JOIN LATERAL unnest(r.reward_badge_ids) AS rb(id)',
    '    JOIN public.badges b ON b.id = rb.id',
    `   WHERE r.valid_from = ${VALID_FROM_SQL} AND (b.type <> 'item' OR b.deleted_at IS NOT NULL);`,
    '  -- 재료 칸의 후보가 아이템 배지가 아니거나 삭제됐거나, 같은 레시피의 보상 배지와 등급이 다른 칸 (0)',
    '  SELECT count(*) FROM public.combination_recipe_slots s',
    '    JOIN public.combination_recipes r ON r.id = s.recipe_id',
    '    JOIN public.badges rb ON rb.id = r.reward_badge_ids[1]',
    '    CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS ab(id)',
    '    JOIN public.badges b ON b.id = ab.id',
    `   WHERE r.valid_from = ${VALID_FROM_SQL} AND (b.type <> 'item' OR b.deleted_at IS NOT NULL OR b.rarity <> rb.rarity);`,
    `  -- 전체 레시피: 옛 3건 + 단서 ${n.recipes}건 (${3 + n.recipes})`,
    '  SELECT count(*) FROM public.combination_recipes;'
  ]);

  const clueValues = clues
    .map(
      (c) =>
        `  (${c.no}, ${q(c.code)}, ${q(c.name)}, ${q(c.description)}, ${c.points}, ${q(c.reward.tribe)}, ${q(c.reward.bookName)}, ${q(c.reward.itemName)})`
    )
    .join(',\n');
  const slotValues = clues
    .flatMap((c) =>
      c.ingredients.map(
        (ing, k) => `  (${c.no}, ${k}, ${q(ing.tribe)}, ${q(ing.bookName)}, ${q(ing.itemName)})`
      )
    )
    .join(',\n');

  const body = `
-- ----------------------------------------------------------------
-- 0. 작업용 임시 표
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_recipe_slot;
DROP TABLE IF EXISTS pg_temp._jam2_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_clue_slot;
DROP TABLE IF EXISTS pg_temp._jam2_clue;
DROP TABLE IF EXISTS pg_temp._jam2_tier;

-- 등급 ${T}개: 단서마다 이 등급별로 레시피를 하나씩 만든다. 재료와 보상은 레시피와 같은 등급이다
CREATE TEMP TABLE _jam2_tier (
  rarity    public.badge_rarity PRIMARY KEY,
  tier_ord  INTEGER NOT NULL
);

INSERT INTO _jam2_tier (rarity, tier_ord) VALUES
${tierValues};

-- 단서 ${n.clues}개: 번호, 코드, 이름, 설명, 성공 포인트, 보상 배지를 찾을 이름(트라이브, 컬렉션, 아이템)
CREATE TEMP TABLE _jam2_clue (
  no              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT NOT NULL,
  points          INTEGER NOT NULL,
  reward_tribe    TEXT NOT NULL,
  reward_book     TEXT NOT NULL,
  reward_item     TEXT NOT NULL
);

INSERT INTO _jam2_clue (no, code, name, description, points, reward_tribe, reward_book, reward_item) VALUES
${clueValues};

-- 단서의 재료 ${n.slotsPerTier}개: 단서 번호, 칸 순서(0부터), 재료 배지를 찾을 이름(트라이브, 컬렉션, 아이템)
CREATE TEMP TABLE _jam2_clue_slot (
  clue_no     INTEGER NOT NULL REFERENCES _jam2_clue (no),
  slot_order  INTEGER NOT NULL,
  tribe       TEXT NOT NULL,
  book_name   TEXT NOT NULL,
  item_name   TEXT NOT NULL,
  PRIMARY KEY (clue_no, slot_order)
);

INSERT INTO _jam2_clue_slot (clue_no, slot_order, tribe, book_name, item_name) VALUES
${slotValues};

-- 레시피 ${n.recipes}건 = 단서 ${n.clues}개 × 등급 ${T}개. 레시피 id는 여기서 한 번 만들고, 보상 배지는 레시피의 등급으로 찾는다
CREATE TEMP TABLE _jam2_recipe (
  clue_no         INTEGER NOT NULL REFERENCES _jam2_clue (no),
  rarity          public.badge_rarity NOT NULL REFERENCES _jam2_tier (rarity),
  recipe_id       UUID NOT NULL DEFAULT gen_random_uuid(),
  reward_tribe    TEXT NOT NULL,
  reward_book     TEXT NOT NULL,
  reward_item     TEXT NOT NULL,
  reward_id       UUID,
  reward_matches  INTEGER,
  PRIMARY KEY (clue_no, rarity)
);

INSERT INTO _jam2_recipe (clue_no, rarity, reward_tribe, reward_book, reward_item)
SELECT c.no, t.rarity, c.reward_tribe, c.reward_book, c.reward_item
  FROM _jam2_clue c
 CROSS JOIN _jam2_tier t
 ORDER BY c.no, t.tier_ord;

-- 재료 칸 ${n.slots}개 = 단서의 재료 ${n.slotsPerTier}개 × 등급 ${T}개. 재료 배지는 레시피의 등급으로 찾는다
CREATE TEMP TABLE _jam2_recipe_slot (
  clue_no        INTEGER NOT NULL,
  rarity         public.badge_rarity NOT NULL,
  slot_order     INTEGER NOT NULL,
  tribe          TEXT NOT NULL,
  book_name      TEXT NOT NULL,
  item_name      TEXT NOT NULL,
  badge_id       UUID,
  badge_matches  INTEGER,
  PRIMARY KEY (clue_no, rarity, slot_order),
  FOREIGN KEY (clue_no, rarity) REFERENCES _jam2_recipe (clue_no, rarity)
);

INSERT INTO _jam2_recipe_slot (clue_no, rarity, slot_order, tribe, book_name, item_name)
SELECT s.clue_no, t.rarity, s.slot_order, s.tribe, s.book_name, s.item_name
  FROM _jam2_clue_slot s
 CROSS JOIN _jam2_tier t
 ORDER BY s.clue_no, t.tier_ord, s.slot_order;

-- ----------------------------------------------------------------
-- 1. 이름과 등급으로 배지를 찾고, 등급마다 한 건씩 찾지 못하면 멈춘다
-- ----------------------------------------------------------------
UPDATE _jam2_recipe_slot s
   SET badge_matches = (SELECT count(*)
                          FROM public.badges b
                          JOIN public.item_books ib ON ib.id = b.item_book_id
                          JOIN public.tribes t ON t.id = ib.tribe_id
                         WHERE t.name = s.tribe AND ib.name = s.book_name AND b.name = s.item_name
                           AND b.type = 'item' AND b.rarity = s.rarity AND b.deleted_at IS NULL),
       badge_id      = (SELECT b.id
                          FROM public.badges b
                          JOIN public.item_books ib ON ib.id = b.item_book_id
                          JOIN public.tribes t ON t.id = ib.tribe_id
                         WHERE t.name = s.tribe AND ib.name = s.book_name AND b.name = s.item_name
                           AND b.type = 'item' AND b.rarity = s.rarity AND b.deleted_at IS NULL
                         ORDER BY b.created_at LIMIT 1);

UPDATE _jam2_recipe c
   SET reward_matches = (SELECT count(*)
                           FROM public.badges b
                           JOIN public.item_books ib ON ib.id = b.item_book_id
                           JOIN public.tribes t ON t.id = ib.tribe_id
                          WHERE t.name = c.reward_tribe AND ib.name = c.reward_book AND b.name = c.reward_item
                            AND b.type = 'item' AND b.rarity = c.rarity AND b.deleted_at IS NULL),
       reward_id      = (SELECT b.id
                           FROM public.badges b
                           JOIN public.item_books ib ON ib.id = b.item_book_id
                           JOIN public.tribes t ON t.id = ib.tribe_id
                          WHERE t.name = c.reward_tribe AND ib.name = c.reward_book AND b.name = c.reward_item
                            AND b.type = 'item' AND b.rarity = c.rarity AND b.deleted_at IS NULL
                          ORDER BY b.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
  v_tiers TEXT;
BEGIN
  SELECT count(*), string_agg(DISTINCT rarity::text, ', ') INTO v_bad, v_tiers
    FROM _jam2_recipe_slot WHERE badge_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '재료 배지를 이름과 등급으로 한 건씩 찾지 못한 것이 %개입니다(등급: %. 기대: ${n.slots}개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나, 그 등급의 같은 이름 아이템 배지가 없거나, 둘 이상 있습니다.', v_bad, v_tiers;
  END IF;

  SELECT count(*), string_agg(DISTINCT rarity::text, ', ') INTO v_bad, v_tiers
    FROM _jam2_recipe WHERE reward_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '보상 배지를 이름과 등급으로 한 건씩 찾지 못한 것이 %개입니다(등급: %. 기대: ${n.recipes}개 모두 1건).', v_bad, v_tiers;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _jam2_recipe_slot s JOIN _jam2_recipe c ON c.clue_no = s.clue_no AND c.rarity = s.rarity
   WHERE s.badge_id = c.reward_id;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '재료 배지가 같은 레시피의 보상 배지와 같은 것이 %개입니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.combination_recipes r JOIN _jam2_clue c ON c.name = r.name;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '단서 레시피와 같은 이름의 레시피가 이미 %건 있습니다. 이 파일은 한 번만 적용합니다.', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 레시피 ${n.recipes}건과 재료 칸 ${n.slots}개 넣기 (공개 시작은 먼 미래 자리 값)
-- ----------------------------------------------------------------
INSERT INTO public.combination_recipes (id, name, description, reward_points, reward_badge_ids, valid_from)
SELECT r.recipe_id, c.name, c.description, c.points, ARRAY[r.reward_id], ${VALID_FROM_SQL}
  FROM _jam2_recipe r
  JOIN _jam2_clue c ON c.no = r.clue_no
  JOIN _jam2_tier t ON t.rarity = r.rarity
 ORDER BY c.no, t.tier_ord;

INSERT INTO public.combination_recipe_slots (recipe_id, slot_order, badge_type, allowed_badge_ids)
SELECT r.recipe_id, s.slot_order, 'item', ARRAY[s.badge_id]
  FROM _jam2_recipe_slot s
  JOIN _jam2_recipe r ON r.clue_no = s.clue_no AND r.rarity = s.rarity
  JOIN _jam2_tier t ON t.rarity = s.rarity
 ORDER BY s.clue_no, t.tier_ord, s.slot_order;

-- ----------------------------------------------------------------
-- 3. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
  v_pairs INTEGER;
BEGIN
  -- 레시피 ${n.recipes}건: 이름·설명·성공 포인트·보상 배지가 계획과 같고, 자리 값 공개 시작, 종료 없음, 열린 채 지급, 보상 없음 허용 꺼짐
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_recipe r ON r.recipe_id = cr.id
    JOIN _jam2_clue c ON c.no = r.clue_no
   WHERE cr.name = c.name AND cr.description = c.description AND cr.reward_points = c.points
     AND cr.reward_badge_ids = ARRAY[r.reward_id]
     AND cr.valid_from = ${VALID_FROM_SQL} AND cr.valid_until IS NULL
     AND NOT cr.reward_locked AND NOT cr.allow_no_reward;
  IF v_n <> ${n.recipes} THEN
    RAISE EXCEPTION '끝 검사: 계획과 같은 레시피가 %건입니다(기대 ${n.recipes}).', v_n;
  END IF;

  -- 재료 칸 ${n.slots}개
  SELECT count(*) INTO v_n FROM public.combination_recipe_slots cs WHERE cs.recipe_id IN (SELECT recipe_id FROM _jam2_recipe);
  IF v_n <> ${n.slots} THEN
    RAISE EXCEPTION '끝 검사: 단서 레시피의 칸이 %개입니다(기대 ${n.slots}).', v_n;
  END IF;

  -- 칸의 순서와 후보가 계획과 같다: item 칸, 후보는 재료 배지 1개
  SELECT count(*) INTO v_n
    FROM public.combination_recipe_slots cs
    JOIN _jam2_recipe r ON r.recipe_id = cs.recipe_id
    JOIN _jam2_recipe_slot x ON x.clue_no = r.clue_no AND x.rarity = r.rarity AND x.slot_order = cs.slot_order
   WHERE cs.badge_type = 'item' AND cs.allowed_badge_ids = ARRAY[x.badge_id];
  IF v_n <> ${n.slots} THEN
    RAISE EXCEPTION '끝 검사: 계획과 같은 칸이 %개입니다(기대 ${n.slots}).', v_n;
  END IF;

  -- 성공 포인트 = 칸 수 × ${POINTS_PER_INGREDIENT}
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_recipe r ON r.recipe_id = cr.id
   WHERE cr.reward_points = ${POINTS_PER_INGREDIENT} * (SELECT count(*) FROM public.combination_recipe_slots cs WHERE cs.recipe_id = cr.id);
  IF v_n <> ${n.recipes} THEN
    RAISE EXCEPTION '끝 검사: 성공 포인트가 칸 수 × ${POINTS_PER_INGREDIENT}인 레시피가 %건입니다(기대 ${n.recipes}).', v_n;
  END IF;

  -- 보상 배지는 레시피의 등급과 같은 등급의 아이템 배지 1개다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_recipe r ON r.recipe_id = cr.id
    JOIN public.badges b ON b.id = cr.reward_badge_ids[1]
   WHERE array_length(cr.reward_badge_ids, 1) = 1
     AND b.type = 'item' AND b.rarity = r.rarity AND b.deleted_at IS NULL;
  IF v_n <> ${n.recipes} THEN
    RAISE EXCEPTION '끝 검사: 보상 배지의 등급이 레시피의 등급과 같은 레시피가 %건입니다(기대 ${n.recipes}).', v_n;
  END IF;

  -- 재료 칸의 후보는 레시피의 등급과 같은 등급의 아이템 배지 1개다
  SELECT count(*) INTO v_n
    FROM public.combination_recipe_slots cs
    JOIN _jam2_recipe r ON r.recipe_id = cs.recipe_id
    JOIN public.badges b ON b.id = cs.allowed_badge_ids[1]
   WHERE array_length(cs.allowed_badge_ids, 1) = 1
     AND b.type = 'item' AND b.rarity = r.rarity AND b.deleted_at IS NULL;
  IF v_n <> ${n.slots} THEN
    RAISE EXCEPTION '끝 검사: 후보의 등급이 레시피의 등급과 같은 칸이 %개입니다(기대 ${n.slots}).', v_n;
  END IF;

  -- 같은 (이름, 보상 등급) 중복이 없다: 이름 ${n.clues}개 × 등급 ${T}개 = ${n.recipes}쌍이 모두 다르고, 이 이름의 레시피는 ${n.recipes}건뿐이다
  SELECT count(*), count(DISTINCT (cr.name, b.rarity)) INTO v_n, v_pairs
    FROM public.combination_recipes cr
    JOIN public.badges b ON b.id = cr.reward_badge_ids[1]
   WHERE cr.name IN (SELECT name FROM _jam2_clue);
  IF v_n <> ${n.recipes} OR v_pairs <> ${n.recipes} THEN
    RAISE EXCEPTION '끝 검사: 단서 이름의 레시피가 %건, 이름과 보상 등급이 서로 다른 쌍이 %개입니다(기대 둘 다 ${n.recipes}).', v_n, v_pairs;
  END IF;
END $$;

DROP TABLE _jam2_recipe_slot;
DROP TABLE _jam2_recipe;
DROP TABLE _jam2_clue_slot;
DROP TABLE _jam2_clue;
DROP TABLE _jam2_tier;
`;

  const rollback = commentBlock([
    '되돌림 SQL',
    `단서 레시피 ${n.recipes}건만 지운다. 칸(combination_recipe_slots)은 외래키 ON DELETE CASCADE로 함께 지워진다. 한 번의 호출로 통째로 실행한다.`,
    '공개 시작을 실제 오픈 시각으로 바꾼 뒤라면 유저가 이미 믹스했을 수 있다. 그때는 먼저 user_combine_success_logs와 user_combine_fail_logs를 확인하고,',
    '배지 조건(condition_json.recipe_first_success)이 이 레시피를 가리키는지도 확인한다(삭제 가드와 같다).',
    '',
    `1) 지우기 (자리 값 공개 시작인 상태에서는 정확히 ${n.recipes}건이 지워진다. 공개 시작을 이미 바꿨다면 valid_from 조건을 뺀다)`,
    `DELETE FROM public.combination_recipes WHERE valid_from = ${VALID_FROM_SQL} AND name IN (${clueNames});`,
    '',
    `2) 되돌린 뒤 확인: 아래 둘이 모두 0이어야 한다`,
    `SELECT count(*) FROM public.combination_recipes WHERE name IN (${clueNames});`,
    `SELECT count(*) FROM public.combination_recipes WHERE valid_from = ${VALID_FROM_SQL};`
  ]);

  return `${header}\n${body}\n${rollback}\n`;
}

// ────────────────────────────────────────────────────────────
// 282 — 쓰지 않는 컬렉션 끄기와 옛 레시피 3건 끄기
// ────────────────────────────────────────────────────────────

export function genRetireSql(plan) {
  const books = planBooks(plan);
  const e = retireExpectation(plan);
  const tribeNames = [...new Set(books.map((b) => b.tribe))];
  const tribeList = tribeNames.map(q).join(', ');
  const oldList = OLD_RECIPE_NAMES.map(q).join(', ');
  const B = RETIRE_BACKUP_TABLE;

  const header = commentBlock([
    RETIRE_FILE.file,
    `JAM 2.0 묶음 7 · 7-7: 쓰지 않는 컬렉션 ${e.retireBooks}개와 옛 레시피 ${e.oldRecipes}건 끄기 (티켓 ${TICKET})`,
    '',
    '이 파일은 gen-recipe-sql.mjs가 7-6 계획(원고 01~05의 컬렉션 50개)에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다',
    '(node scripts/jam2-content/gen-recipe-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    '이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.',
    '',
    '하는 일 (한 트랜잭션, 파일만 쓰고 실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다)',
    `  1. 컬렉션 ${e.retireBooks}개 끄기: «활성 컬렉션 가운데 7-6 계획의 컬렉션 ${e.plannedBooks}개에 들지 않는 것»의 is_active를 false로 바꾼다.`,
    '     지우지 않는다(소프트 삭제). 컬렉션 안의 배지와 유저가 이미 받은 기록은 그대로다. 다른 열은 건드리지 않는다.',
    `  2. 옛 레시피 ${e.oldRecipes}건 끄기(트라이브 단독 레시피, 운영 로직 15장 4절): valid_until을 이 SQL이 실행되는 시각(now())으로 채운다.`,
    '     지우지 않는다. 이미 받은 보상·포인트·배지는 그대로다.',
    `  3. 끄기 직전 상태를 백업 표 ${B}에 기록하고(컬렉션은 행 전체, 레시피는 행 전체), 되돌림 SQL이 그 표를 쓴다.`,
    '     7-6의 백업 표는 kind 제약이 레시피를 담지 못하고 6-4 정리 때 지워지므로 쓰지 않고 이 파일이 따로 만든다.',
    '',
    '찾는 방법과 멈추는 조건',
    `  - 계획 컬렉션 ${e.plannedBooks}개는 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다(7-6 SQL을 적용하기 전이라면 여기서 멈춘다).`,
    `  - 끄기 대상은 계획 컬렉션이 아닌 활성 컬렉션이다. 공용 DB에서 ${e.retireBooks}개다(2026-10-22 롤백 실측: 계획 밖 컬렉션 ${BOOKS_IN_DB_AFTER_7_6 - e.plannedBooks}개 가운데 ${e.alreadyOffBooks}개는 옛 트라이브를 끌 때 이미 꺼져 있고, 켜진 것은 낭만 미식가 2, 숲속의 갱단 8, 아스팔트 레인저 9).`,
    `    ${e.retireBooks}개가 아니면 멈춘다(그 사이 컬렉션이 늘었거나 이미 꺼진 것이 있다는 뜻이다. 실제 건수를 확인한 뒤 판단한다).`,
    `  - 옛 레시피는 이름으로 찾고 ${e.oldRecipes}건이 한 건씩 맞지 않으면 멈춘다. 이미 종료 시각이 있거나 공개 전이면 멈춘다.`,
    '  - 끝에서 끈 컬렉션 수, 활성으로 남은 비계획 컬렉션, 옛 레시피의 종료 시각, 백업 건수를 검사하고 어긋나면 전체를 되돌린다(트랜잭션).',
    '  - 적용된 뒤에는 끄기 대상이 0개가 되므로 같은 파일을 다시 실행하면 멈춘다.',
    '',
    '적용 순서: 7-6의 다섯 트라이브 SQL(276~280) 적용 뒤, 오픈 직전. 281(단서 레시피)과는 순서가 상관없다.',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    `  -- 새 트라이브 ${tribeNames.length}곳의 컬렉션이 ${e.plannedBooks}개다 (${e.plannedBooks}). 몸통의 1단계 검사가 이름 한 건씩으로 정확히 확인한다`,
    '  SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id',
    `   WHERE t.name IN (${tribeList});`,
    `  -- 끄기 대상 후보: 새 트라이브 밖의 활성 컬렉션 (${e.retireBooks})`,
    '  SELECT count(*) FROM public.item_books ib LEFT JOIN public.tribes t ON t.id = ib.tribe_id',
    `   WHERE ib.is_active AND (t.name IS NULL OR t.name NOT IN (${tribeList}));`,
    `  -- 옛 레시피 ${e.oldRecipes}건은 종료 시각이 비어 있다 (${e.oldRecipes}행, valid_until 모두 NULL)`,
    `  SELECT name, valid_from, valid_until FROM public.combination_recipes WHERE name IN (${oldList});`,
    `  -- 백업 표가 아직 없다`,
    `  SELECT to_regclass('public.${B}');                                  -- NULL`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  -- 끈 컬렉션 ${e.retireBooks}개가 모두 꺼져 있다 (${e.retireBooks})`,
    `  SELECT count(*) FROM public.item_books ib JOIN public.${B} s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE NOT ib.is_active;`,
    '  -- 새 트라이브 밖에 활성 컬렉션이 남지 않았다 (0)',
    '  SELECT count(*) FROM public.item_books ib LEFT JOIN public.tribes t ON t.id = ib.tribe_id',
    `   WHERE ib.is_active AND (t.name IS NULL OR t.name NOT IN (${tribeList}));`,
    `  -- 옛 레시피 ${e.oldRecipes}건에 종료 시각이 채워졌다 (${e.oldRecipes}행)`,
    `  SELECT name, valid_until FROM public.combination_recipes WHERE name IN (${oldList}) AND valid_until IS NOT NULL;`,
    `  -- 백업 건수 (combination_recipe ${e.oldRecipes}, item_book ${e.retireBooks})`,
    `  SELECT kind, count(*) FROM public.${B} GROUP BY kind ORDER BY kind;`
  ]);

  const keepValues = books.map((b) => `  (${q(b.tribe)}, ${q(b.book)})`).join(',\n');
  const oldValues = OLD_RECIPE_NAMES.map((name) => `  (${q(name)})`).join(',\n');

  const body = `
-- ----------------------------------------------------------------
-- 0. 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.${B} (
  kind          TEXT NOT NULL CHECK (kind IN ('item_book', 'combination_recipe')),
  row_id        UUID NOT NULL,
  snapshot      JSONB NOT NULL,
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id)
);

ALTER TABLE public.${B} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.${B} FROM anon, authenticated;

COMMENT ON TABLE public.${B} IS
  'JAM 2.0 7-7 끄기 되돌림용 백업(티켓 ${TICKET}). item_book·combination_recipe는 끄기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 1. 7-6 계획의 컬렉션 ${e.plannedBooks}개를 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_old_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_retire_book;
DROP TABLE IF EXISTS pg_temp._jam2_keep;

CREATE TEMP TABLE _jam2_keep (
  tribe    TEXT NOT NULL,
  book     TEXT NOT NULL,
  book_id  UUID,
  matches  INTEGER,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_keep (tribe, book) VALUES
${keepValues};

UPDATE _jam2_keep k
   SET matches = (SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book),
       book_id = (SELECT ib.id FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book ORDER BY ib.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_keep WHERE matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${e.plannedBooks}개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(DISTINCT book_id) INTO v_bad FROM _jam2_keep;
  IF v_bad <> ${e.plannedBooks} THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션이 서로 다른 행 %개로 맞아야 합니다(기대 ${e.plannedBooks}).', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 끄기 대상 = 활성 컬렉션 가운데 계획 컬렉션이 아닌 것. ${e.retireBooks}개가 아니면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_retire_book AS
  SELECT ib.id AS book_id
    FROM public.item_books ib
   WHERE ib.is_active
     AND ib.id NOT IN (SELECT book_id FROM _jam2_keep);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_retire_book;
  IF v_n <> ${e.retireBooks} THEN
    RAISE EXCEPTION '끄기 대상 컬렉션이 %개입니다(기대 ${e.retireBooks}개: 계획 밖 컬렉션 가운데 켜진 것, 2026-10-22 실측). 실제 건수를 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 옛 레시피 ${e.oldRecipes}건을 이름으로 찾고, 한 건씩 맞지 않거나 이미 종료·공개 전이면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_old_recipe (
  name       TEXT PRIMARY KEY,
  recipe_id  UUID,
  matches    INTEGER
);

INSERT INTO _jam2_old_recipe (name) VALUES
${oldValues};

UPDATE _jam2_old_recipe o
   SET matches   = (SELECT count(*) FROM public.combination_recipes r WHERE r.name = o.name),
       recipe_id = (SELECT r.id FROM public.combination_recipes r WHERE r.name = o.name ORDER BY r.created_at LIMIT 1);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_old_recipe WHERE matches IS DISTINCT FROM 1;
  IF v_n > 0 THEN
    RAISE EXCEPTION '옛 레시피를 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${e.oldRecipes}개 모두 1건).', v_n;
  END IF;

  SELECT count(*) INTO v_n
    FROM public.combination_recipes r JOIN _jam2_old_recipe o ON o.recipe_id = r.id
   WHERE r.valid_until IS NOT NULL OR (r.valid_from IS NOT NULL AND r.valid_from >= now());
  IF v_n > 0 THEN
    RAISE EXCEPTION '옛 레시피 중 이미 종료 시각이 있거나 공개 전인 것이 %건입니다(기대: 모두 공개 중, 종료 시각 없음).', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 끄기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 끄기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.${B} (kind, row_id, snapshot)
SELECT 'item_book', ib.id, to_jsonb(ib)
  FROM public.item_books ib
  JOIN _jam2_retire_book r ON r.book_id = ib.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

INSERT INTO public.${B} (kind, row_id, snapshot)
SELECT 'combination_recipe', cr.id, to_jsonb(cr)
  FROM public.combination_recipes cr
  JOIN _jam2_old_recipe o ON o.recipe_id = cr.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 끄기: 컬렉션은 is_active만, 옛 레시피는 valid_until만 바꾼다
-- ----------------------------------------------------------------
UPDATE public.item_books ib
   SET is_active = false
  FROM _jam2_retire_book r
 WHERE ib.id = r.book_id;

UPDATE public.combination_recipes cr
   SET valid_until = now()
  FROM _jam2_old_recipe o
 WHERE cr.id = o.recipe_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 끈 컬렉션 ${e.retireBooks}개가 모두 꺼져 있다
  SELECT count(*) INTO v_n
    FROM public.item_books ib JOIN _jam2_retire_book r ON r.book_id = ib.id
   WHERE NOT ib.is_active;
  IF v_n <> ${e.retireBooks} THEN
    RAISE EXCEPTION '끝 검사: 꺼진 컬렉션이 %개입니다(기대 ${e.retireBooks}).', v_n;
  END IF;

  -- 활성으로 남은 컬렉션은 모두 계획 컬렉션이다
  SELECT count(*) INTO v_n
    FROM public.item_books ib
   WHERE ib.is_active AND ib.id NOT IN (SELECT book_id FROM _jam2_keep);
  IF v_n <> 0 THEN
    RAISE EXCEPTION '끝 검사: 계획 밖의 활성 컬렉션이 %개 남았습니다(기대 0).', v_n;
  END IF;

  -- 옛 레시피 ${e.oldRecipes}건에 종료 시각이 채워졌다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_old_recipe o ON o.recipe_id = cr.id
   WHERE cr.valid_until IS NOT NULL;
  IF v_n <> ${e.oldRecipes} THEN
    RAISE EXCEPTION '끝 검사: 종료 시각이 채워진 옛 레시피가 %건입니다(기대 ${e.oldRecipes}).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.${B} WHERE kind = 'item_book';
  IF v_n <> ${e.retireBooks} THEN RAISE EXCEPTION '끝 검사: 컬렉션 백업이 %건입니다(기대 ${e.retireBooks}).', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.${B} WHERE kind = 'combination_recipe';
  IF v_n <> ${e.oldRecipes} THEN RAISE EXCEPTION '끝 검사: 레시피 백업이 %건입니다(기대 ${e.oldRecipes}).', v_n; END IF;
END $$;

DROP TABLE _jam2_old_recipe;
DROP TABLE _jam2_retire_book;
DROP TABLE _jam2_keep;
`;

  const rollback = commentBlock([
    '되돌림 SQL',
    `끈 컬렉션과 옛 레시피를 백업 표 ${B}의 값으로 되돌린다. 한 번의 호출로 통째로 실행한다.`,
    '끈 뒤에 운영자가 같은 컬렉션이나 레시피를 따로 바꿨다면 아래 확인 쿼리가 0이 아닐 수 있다. 그때는 달라진 행을 보고 판단한다.',
    '',
    '1) 끈 컬렉션 되돌리기 (is_active)',
    'UPDATE public.item_books ib',
    "   SET is_active = (s.snapshot->>'is_active')::boolean",
    `  FROM public.${B} s`,
    " WHERE s.kind = 'item_book' AND s.row_id = ib.id;",
    '',
    '2) 옛 레시피 되돌리기 (valid_until. 백업이 JSON null이면 SQL NULL로 돌아간다)',
    'UPDATE public.combination_recipes cr',
    "   SET valid_until = (s.snapshot->>'valid_until')::timestamptz",
    `  FROM public.${B} s`,
    " WHERE s.kind = 'combination_recipe' AND s.row_id = cr.id;",
    '',
    '3) 되돌린 뒤 확인: 아래 둘이 모두 0이어야 한다 (백업 값과 다른 행)',
    `SELECT count(*) FROM public.item_books ib JOIN public.${B} s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE to_jsonb(ib) <> s.snapshot;`,
    `SELECT count(*) FROM public.combination_recipes cr JOIN public.${B} s ON s.kind = 'combination_recipe' AND s.row_id = cr.id WHERE to_jsonb(cr) <> s.snapshot;`,
    '',
    '4) 백업 표가 더 필요 없으면 지운다',
    `DROP TABLE IF EXISTS public.${B};`
  ]);

  return `${header}\n${body}\n${rollback}\n`;
}

// ────────────────────────────────────────────────────────────
// 파일 쓰기와 명령줄
// ────────────────────────────────────────────────────────────

/** 이번 회에 쓰는 파일 목록 (이름 → 내용) */
export function buildOutputs(clues = buildClues(), plan = buildPlan()) {
  return {
    [CLUE_FILE.file]: genClueSql(clues),
    [RETIRE_FILE.file]: genRetireSql(plan)
  };
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseClueManuscript();
  const plan = buildPlan();
  const clues = buildClues(parsed, plan);

  if (args.includes('--dry')) {
    const pc = countClues(parsed);
    const n = countClueRecipes(clues);
    console.log(
      `281 단서 레시피: 단서 ${n.clues}개 × 등급 ${n.tiers}개(${CLUE_TIERS.join(', ')}) = ${n.recipes}건, 재료 칸 ${n.slots}개 (단서 기준 ${n.slotsPerTier}개 × ${n.tiers}. 재료 3개 ${pc.byIngredients[3]}건, 4개 ${pc.byIngredients[4]}건, 5개 ${pc.byIngredients[5]}건), 성공 포인트 합계 ${n.points}`
    );
    for (const c of clues) {
      console.log(`  ${c.code} ${c.name}: 재료 ${c.ingredients.length}개, 성공 포인트 ${c.points}, 보상 ${c.reward.tribe}/${c.reward.bookName}/${c.reward.itemName}`);
    }
    const e = retireExpectation(plan);
    console.log(`282 끄기: 계획 컬렉션 ${e.plannedBooks}개를 남기고, 끄기 대상 ${e.retireBooks}개(계획 밖 ${BOOKS_IN_DB_AFTER_7_6 - e.plannedBooks}개 가운데 켜진 것), 옛 레시피 ${e.oldRecipes}건`);
    return;
  }

  if (args.includes('--write')) {
    const outputs = buildOutputs(clues, plan);
    for (const [file, text] of Object.entries(outputs)) {
      fs.writeFileSync(path.join(MIGRATIONS_DIR, file), text);
      console.error(`${file} 쓰기 완료 (${text.split('\n').length}줄)`);
    }
    return;
  }

  console.error('사용법: --dry | --write');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
