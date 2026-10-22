#!/usr/bin/env node
/**
 * gen-content-sql.mjs — 트라이브 컨텐츠 입력 SQL(마이그레이션 파일)을 만든다.
 * (티켓 20261022_1137, JAM 2.0 묶음 7의 7-6)
 *
 * 입력: 원고(parse-manuscript.mjs)와 짝짓기 데이터(pairing.json)를 합친 계획.
 * 출력: 백업 표 SQL 1개(275)와 트라이브별 SQL(276~280). 파일만 쓰고 실행하지 않는다 —
 *       실행은 롤백 실측과 사용자 승인 뒤 카리나가 한다.
 *
 * SQL의 원칙
 *   - 옛 행은 배지 id가 아니라 «컬렉션의 옛 이름과 옛 배지 이름»으로 찾고, 찾은 수가 기대(컬렉션 1건, 배지 1건씩,
 *     컬렉션마다 배지 9개)와 다르면 오류로 멈춘다. 새 트라이브는 이름으로 찾되 없으면 멈춘다.
 *   - 한 번의 호출로 통째로 실행하는 한 트랜잭션이다(BEGIN/COMMIT은 쓰지 않는다. 롤백 실측이 파일 뒤에
 *     일부러 오류를 붙여 같은 호출로 실행하기 때문이다).
 *   - 덮어쓰기 직전 상태를 백업 표에 기록하고, 되돌림 SQL이 그 표를 쓴다.
 *
 * 사용법
 *   node scripts/jam2-content/gen-content-sql.mjs --dry                 # 파일 없이 다섯 트라이브의 건수만 출력
 *   node scripts/jam2-content/gen-content-sql.mjs --write               # 1회 몫(275, 276)을 마이그레이션 폴더에 쓴다
 *   node scripts/jam2-content/gen-content-sql.mjs --write --tribe 찰칵단 # 지정한 트라이브(2회 이후)를 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseManuscripts, RARITIES } from './parse-manuscript.mjs';
import { readPairingJson } from './parse-pairing-doc.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(HERE, '../../supabase/migrations');

export const BACKUP_TABLE = 'content_overwrite_backup_20261022';
export const TICKET = '20261022_1137';

/** 원고의 옛 이름과 공용 DB 이름이 다른 컬렉션(카리나가 공용 DB를 읽어 확인했다, 2026-10-22) */
export const DB_NAME_OVERRIDES = { '무명(無名)을 쫓는 야식가들': '무명無名을 쫓는 야식가들' };

/** 마이그레이션 번호와 파일 이름. 번호는 시작 때 origin/staging의 마지막 번호(274) 다음부터 매겼다. */
export const BACKUP_FILE = { number: 275, file: '275_content_overwrite_backup.sql' };
export const TRIBE_FILES = {
  '한입만 연구회': { number: 276, file: '276_tribe_content_hanipman.sql' },
  찰칵단: { number: 277, file: '277_tribe_content_chalkak.sql' },
  '비사이드 레코즈': { number: 278, file: '278_tribe_content_bside.sql' },
  '소나무 잡화점': { number: 279, file: '279_tribe_content_sonamu.sql' },
  혼자들: { number: 280, file: '280_tribe_content_honjadeul.sql' }
};

/** 1회 몫 — 한입만 연구회 견본. 나머지 네 트라이브는 2회에 쓴다. */
export const FIRST_ROUND_TRIBES = ['한입만 연구회'];

const OLD_BOOK_ITEM_COUNT = 9;

/** SQL 문자열 글자 — 작은따옴표만 겹쳐 쓴다(standard_conforming_strings가 켜져 있어 \는 그대로다). */
export function q(s) {
  if (typeof s !== 'string') throw new Error(`문자열이 아닙니다: ${s}`);
  if (s.includes('\0')) throw new Error('NUL 글자가 있습니다');
  return `'${s.replace(/'/g, "''")}'`;
}

/** 원고와 짝짓기 데이터를 합쳐 계획을 만든다. 둘이 어긋나면 오류로 멈춘다. */
export function buildPlan(manuscript = parseManuscripts(), pairing = readPairingJson()) {
  const tribes = [];
  if (manuscript.tribes.length !== pairing.tribes.length) {
    throw new Error(`트라이브 수가 다릅니다: 원고 ${manuscript.tribes.length}, 짝짓기 ${pairing.tribes.length}`);
  }
  for (const mt of manuscript.tribes) {
    const pt = pairing.tribes.find((t) => t.name === mt.name);
    if (!pt) throw new Error(`짝짓기 데이터에 트라이브 «${mt.name}»가 없습니다`);
    if (pt.collections.length !== mt.collections.length) throw new Error(`${mt.name}: 컬렉션 수가 다릅니다`);
    const books = mt.collections.map((mc) => {
      const pc = pt.collections.find((c) => c.no === mc.no);
      const where = `${mt.name} ${mc.no}번`;
      if (!pc || pc.name !== mc.name) throw new Error(`${where}: 컬렉션 이름이 원고 «${mc.name}»와 짝짓기 «${pc?.name}»에서 다릅니다`);
      const expectedOld = mc.oldName === null ? null : (DB_NAME_OVERRIDES[mc.oldName] ?? mc.oldName);
      if (pc.oldBookName !== expectedOld) {
        throw new Error(`${where}: 옛 컬렉션 이름이 다릅니다 (원고 기준 «${expectedOld}», 짝짓기 «${pc.oldBookName}»)`);
      }
      const items = mc.items.map((mi) => {
        const pi = pc.items.find((i) => i.no === mi.no);
        if (!pi || pi.name !== mi.name) throw new Error(`${where} ${mi.no}번: 아이템 이름이 원고 «${mi.name}»와 짝짓기 «${pi?.name}»에서 다릅니다`);
        if ((pi.oldBadgeName === null) !== (pc.oldBookName === null)) {
          throw new Error(`${where} ${mi.no}번: 옛 배지 이름 유무가 컬렉션의 옛 이름 유무와 다릅니다`);
        }
        return { no: mi.no, name: mi.name, oldName: pi.oldBadgeName, descriptions: mi.descriptions };
      });
      if (pc.items.length !== items.length) throw new Error(`${where}: 아이템 수가 다릅니다`);
      return { no: mc.no, name: mc.name, oldName: pc.oldBookName, summary: mc.summary, items };
    });
    tribes.push({ name: mt.name, books });
  }
  return { tribes };
}

/** 트라이브 한 개의 건수 */
export function countTribe(tribe) {
  const books = tribe.books.length;
  const overwriteBooks = tribe.books.filter((b) => b.oldName !== null).length;
  const newBooks = books - overwriteBooks;
  const items = tribe.books.reduce((n, b) => n + b.items.length, 0);
  const overwriteBadges = tribe.books.reduce((n, b) => n + b.items.filter((i) => i.oldName !== null).length, 0);
  const newItems = items - overwriteBadges;
  const newBadges = overwriteBadges * 3 + newItems * 4;
  return { books, overwriteBooks, newBooks, items, overwriteBadges, newItems, newBadges, totalBadges: items * 4 };
}

/** 계획 전체의 건수 */
export function countPlan(plan) {
  const sum = { books: 0, overwriteBooks: 0, newBooks: 0, items: 0, overwriteBadges: 0, newItems: 0, newBadges: 0, totalBadges: 0 };
  for (const t of plan.tribes) {
    const c = countTribe(t);
    for (const k of Object.keys(sum)) sum[k] += c[k];
  }
  return sum;
}

function tribeByName(plan, name) {
  const t = plan.tribes.find((x) => x.name === name);
  if (!t) throw new Error(`계획에 트라이브 «${name}»가 없습니다`);
  return t;
}

/** SQL 주석 블록(머리말과 되돌림 SQL) — 모든 줄을 `-- `로 시작해 실수로 실행되지 않게 한다. */
function commentBlock(lines) {
  return lines.map((l) => (l === '' ? '--' : `-- ${l}`)).join('\n');
}

// ────────────────────────────────────────────────────────────
// 275 — 백업 표
// ────────────────────────────────────────────────────────────

export function genBackupSql(plan) {
  const pairs = [];
  for (const t of plan.tribes) {
    for (const b of t.books) {
      if (b.oldName === null) continue;
      for (const i of b.items) pairs.push({ tribe: t.name, book: b.oldName, badge: i.oldName });
    }
  }
  const bookCount = new Set(pairs.map((p) => `${p.tribe}/${p.book}`)).size;
  const badgeCount = pairs.length;

  const values = pairs.map((p) => `  (${q(p.tribe)}, ${q(p.book)}, ${q(p.badge)})`).join(',\n');

  const header = commentBlock([
    `${BACKUP_FILE.file}`,
    `JAM 2.0 묶음 7 · 7-6: 컬렉션·아이템 배지 덮어쓰기 전 백업 표 (티켓 ${TICKET})`,
    '',
    '이 파일은 gen-content-sql.mjs가 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다',
    '(node scripts/jam2-content/gen-content-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    `하는 일: 백업 표 ${BACKUP_TABLE}를 만들고, 덮어쓸 컬렉션 ${bookCount}개와 옛 아이템 배지 행 ${badgeCount}개의`,
    '현재 값을 통째로(to_jsonb) 복사한다. 7-6의 트라이브별 SQL(276~280)은 덮어쓰기 직전에 자기 대상 행의 상태를',
    '이 표에 다시 기록하고(ON CONFLICT DO UPDATE), 되돌림 SQL이 이 표로 옛 값을 되돌린다. 6-4의 오픈 뒤 정리 SQL 때 이 표를 지운다.',
    '',
    '표에 담는 종류(kind):',
    '  item_book      덮어쓴 컬렉션의 덮어쓰기 전 전체 행',
    '  badge          덮어쓴 옛 아이템 배지 행의 덮어쓰기 전 전체 행',
    '  new_item_book  덮어쓰기 SQL이 새로 만든 컬렉션 (snapshot 없음, 되돌림에서 지운다)',
    '  new_badge      덮어쓰기 SQL이 새로 넣은 배지 행 (snapshot 없음, 되돌림에서 지운다)',
    '',
    '찾는 방법: 배지 id가 아니라 «컬렉션의 옛 이름과 옛 배지 이름»으로 옛 행을 찾는다. 컬렉션이 이름으로 한 건씩 맞지 않거나,',
    `옛 배지가 한 건씩 맞지 않거나, 컬렉션의 배지가 9개가 아니면 오류로 멈춘다. 옛 이름이 이미 바뀐 뒤(7-6 SQL을 한 트라이브라도 적용한 뒤)에는`,
    '이 파일을 다시 실행할 수 없다(옛 이름을 못 찾아 멈춘다). 적용 전에 한 번만 실행한다.',
    '',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다(한 트랜잭션). 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    `  SELECT to_regclass('public.${BACKUP_TABLE}');                       -- NULL (아직 없다)`,
    `  SELECT count(*) FROM public.item_books WHERE tier_mode;               -- 0 (4등급이 켜진 컬렉션이 없다)`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  SELECT kind, count(*) FROM public.${BACKUP_TABLE} GROUP BY kind ORDER BY kind;`,
    `                                                                       -- badge ${badgeCount}, item_book ${bookCount}`,
    `  SELECT target_tribe, kind, count(*) FROM public.${BACKUP_TABLE} GROUP BY 1, 2 ORDER BY 1, 2;   -- 트라이브별 건수`
  ]);

  const body = `
-- ----------------------------------------------------------------
-- 1. 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.${BACKUP_TABLE} (
  kind          TEXT NOT NULL CHECK (kind IN ('item_book', 'badge', 'new_item_book', 'new_badge')),
  row_id        UUID NOT NULL,
  target_tribe  TEXT NOT NULL,
  snapshot      JSONB,
  backed_up_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, row_id),
  CHECK ((kind IN ('item_book', 'badge')) = (snapshot IS NOT NULL))
);

ALTER TABLE public.${BACKUP_TABLE} ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.${BACKUP_TABLE} FROM anon, authenticated;

COMMENT ON TABLE public.${BACKUP_TABLE} IS
  'JAM 2.0 7-6 덮어쓰기 되돌림용 백업(티켓 ${TICKET}). item_book·badge는 덮어쓰기 전 전체 행(snapshot), new_*는 새로 넣은 행의 id. 6-4의 오픈 뒤 정리 SQL 때 지운다. 서버(service role)만 읽고 쓴다.';

-- ----------------------------------------------------------------
-- 2. 덮어쓸 대상 목록 (트라이브, 옛 컬렉션 이름, 옛 배지 이름) ${badgeCount}행
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_backup_plan;

CREATE TEMP TABLE _jam2_backup_plan (
  tribe          TEXT NOT NULL,
  book_name      TEXT NOT NULL,
  badge_name     TEXT NOT NULL,
  book_id        UUID,
  book_matches   INTEGER,
  badge_id       UUID,
  badge_matches  INTEGER
);

INSERT INTO _jam2_backup_plan (tribe, book_name, badge_name) VALUES
${values};

-- ----------------------------------------------------------------
-- 3. 이름으로 옛 행을 찾고, 찾은 수가 기대와 다르면 멈춘다
-- ----------------------------------------------------------------
UPDATE _jam2_backup_plan p
   SET book_matches = (SELECT count(*) FROM public.item_books ib WHERE ib.name = p.book_name),
       book_id      = (SELECT ib.id FROM public.item_books ib WHERE ib.name = p.book_name ORDER BY ib.created_at LIMIT 1);

UPDATE _jam2_backup_plan p
   SET badge_matches = (SELECT count(*) FROM public.badges b WHERE b.item_book_id = p.book_id AND b.name = p.badge_name),
       badge_id      = (SELECT b.id FROM public.badges b WHERE b.item_book_id = p.book_id AND b.name = p.badge_name ORDER BY b.created_at LIMIT 1)
 WHERE p.book_matches = 1;

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(DISTINCT book_name) INTO v_bad FROM _jam2_backup_plan WHERE book_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '옛 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${bookCount}개 모두 1건). 이름이 이미 바뀌었거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM _jam2_backup_plan WHERE badge_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '옛 아이템 배지 행을 컬렉션 안에서 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${badgeCount}개 모두 1건).', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM (SELECT p.book_id FROM _jam2_backup_plan p GROUP BY p.book_id
           HAVING (SELECT count(*) FROM public.badges b WHERE b.item_book_id = p.book_id) <> ${OLD_BOOK_ITEM_COUNT}) x;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '아이템 배지가 ${OLD_BOOK_ITEM_COUNT}개가 아닌 옛 컬렉션이 %개 있습니다.', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 현재 값을 통째로 복사한다 (이미 있으면 지금 값으로 갱신 — 덮어쓰기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe, snapshot)
SELECT 'item_book', ib.id, p.tribe, to_jsonb(ib)
  FROM (SELECT DISTINCT tribe, book_id FROM _jam2_backup_plan) p
  JOIN public.item_books ib ON ib.id = p.book_id
ON CONFLICT (kind, row_id) DO UPDATE
  SET target_tribe = EXCLUDED.target_tribe, snapshot = EXCLUDED.snapshot, backed_up_at = now();

INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe, snapshot)
SELECT 'badge', b.id, p.tribe, to_jsonb(b)
  FROM _jam2_backup_plan p
  JOIN public.badges b ON b.id = p.badge_id
ON CONFLICT (kind, row_id) DO UPDATE
  SET target_tribe = EXCLUDED.target_tribe, snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 건수 검사
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_books  INTEGER;
  v_badges INTEGER;
BEGIN
  SELECT count(*) INTO v_books  FROM public.${BACKUP_TABLE} WHERE kind = 'item_book';
  SELECT count(*) INTO v_badges FROM public.${BACKUP_TABLE} WHERE kind = 'badge';
  IF v_books <> ${bookCount} OR v_badges <> ${badgeCount} THEN
    RAISE EXCEPTION '백업 건수가 기대와 다릅니다: 컬렉션 %개(기대 ${bookCount}), 배지 %개(기대 ${badgeCount}).', v_books, v_badges;
  END IF;
END $$;

DROP TABLE _jam2_backup_plan;

${commentBlock([
    '되돌림 SQL',
    '백업 표만 지운다. 7-6의 트라이브별 SQL(276~280)을 이미 적용했다면 그 되돌림을 먼저 실행한다(되돌림이 이 표를 읽는다).',
    `DROP TABLE IF EXISTS public.${BACKUP_TABLE};`
  ])}
`;

  return `${header}\n${body}`;
}

// ────────────────────────────────────────────────────────────
// 276~280 — 트라이브별 SQL
// ────────────────────────────────────────────────────────────

export function genTribeSql(plan, tribeName) {
  const tribe = tribeByName(plan, tribeName);
  const target = TRIBE_FILES[tribeName];
  if (!target) throw new Error(`파일 이름이 정해지지 않은 트라이브입니다: ${tribeName}`);
  const n = countTribe(tribe);
  const T = q(tribeName);
  const oldBooks = tribe.books.filter((b) => b.oldName !== null);
  const hasNewBooks = n.newBooks > 0;
  const hasOverwrite = n.overwriteBadges > 0;
  const hasNewItems = n.newItems > 0;

  const oldBookList = oldBooks.map((b) => q(b.oldName)).join(', ');

  const header = commentBlock([
    target.file,
    `JAM 2.0 묶음 7 · 7-6: «${tribeName}» 컬렉션 ${n.books}개와 아이템 배지 ${n.totalBadges}개 입력 (티켓 ${TICKET})`,
    '',
    '이 파일은 gen-content-sql.mjs가 원고(docs/plan/jam2/tribe-rethink/manuscript/)와 pairing.json에서 만든다.',
    '손으로 고치지 말고 생성기를 고쳐 다시 만든다(node scripts/jam2-content/gen-content-sql.mjs --write).',
    '시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    '하는 일 (한 트랜잭션, 파일만 쓰고 실행은 사용자 승인과 롤백 실측 뒤 카리나가 한다)',
    `  1. 컬렉션 ${n.overwriteBooks}개 덮어쓰기: 옛 컬렉션의 name ← 새 이름, description ← 한 줄 서사, tribe_id ← «${tribeName}»,`,
    '     is_active ← true, tier_mode ← true, story_text·image_url·image_source ← 비움. reward_points·reward_badge_id는 건드리지 않는다.',
    hasNewBooks
      ? `     새 컬렉션 ${n.newBooks}개는 같은 값으로 새로 만든다.`
      : '     이 트라이브에는 새로 만드는 컬렉션이 없다.',
    `  2. 옛 아이템 배지 행 ${n.overwriteBadges}개 덮어쓰기(Common): name ← 새 아이템 이름, description ← Common 설명, rarity ← common,`,
    '     deleted_at ← 비움, tribe_id ← 새 트라이브, image_url·image_source ← 비움. point_reward는 그대로 둔다.',
    `  3. 새 배지 행 ${n.newBadges}개: ${hasOverwrite ? `덮어쓴 행마다 Rare·Epic·Mystic ${n.overwriteBadges * 3}개` : ''}${hasOverwrite && hasNewItems ? ', ' : ''}${hasNewItems ? `새 아이템 ${n.newItems}개의 4등급 ${n.newItems * 4}개` : ''}.`,
    '     같은 이름이 4등급 모두 같고 설명만 등급마다 다르다. point_reward와 이미지는 비운다(포인트는 7-4가 일괄 적용).',
    hasOverwrite
      ? '     덮어쓴 행에서 유효기간·드랍 제외·가중치·활동 종류 같은 드랍 설정을 그대로 복사해 4등급이 같은 조건으로 나오게 한다.'
      : '     드랍 설정은 열의 기본값을 쓴다.',
    '',
    '찾는 방법과 멈추는 조건',
    '  - 옛 컬렉션은 이름(옛 이름)으로, 옛 아이템 배지는 «컬렉션 안의 옛 배지 이름»으로 찾는다. 배지 id는 쓰지 않는다.',
    `  - 컬렉션이 이름으로 한 건씩 맞지 않거나, 옛 배지가 한 건씩 맞지 않거나, 컬렉션의 배지가 ${OLD_BOOK_ITEM_COUNT}개가 아니면 멈춘다.`,
    `  - 트라이브 «${tribeName}»는 이름으로 찾고 없거나 둘 이상이면 멈춘다. 트라이브 등록(비활성)은 사용자가 트라이브 화면에서 먼저 한다.`,
    '  - 덮어쓸 컬렉션에 common이 아닌 등급의 배지가 꽂혀 있으면 멈춘다(켜기 전 점검, 7-8).',
    '  - 새 이름의 컬렉션이 이미 다른 행으로 있으면 멈춘다.',
    '  - 끝에서 컬렉션·배지·설명·등급별 수와 백업 건수를 검사하고 어긋나면 전체를 되돌린다(트랜잭션).',
    '  - 적용된 뒤에는 옛 이름이 바뀌어 있으므로 같은 파일을 다시 실행하면 옛 이름을 못 찾아 멈춘다.',
    '',
    '적용 순서: 275(백업 표) → 사용자가 새 트라이브를 비활성으로 등록 → 이 파일 → 읽기 전용 확인 → 사용자가 트라이브를 켠다.',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    '  -- 트라이브가 등록돼 있다 (1행)',
    `  SELECT id, name, is_active FROM public.tribes WHERE name = ${T};`,
    `  -- 옛 컬렉션 ${n.overwriteBooks}개가 이름으로 한 건씩 맞고 아이템 배지를 ${OLD_BOOK_ITEM_COUNT}개씩 가진다 (${n.overwriteBooks}행, matches 1, badges ${OLD_BOOK_ITEM_COUNT})`,
    '  SELECT n.name,',
    '         (SELECT count(*) FROM public.item_books ib WHERE ib.name = n.name) AS matches,',
    '         (SELECT count(*) FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id WHERE ib.name = n.name) AS badges',
    `    FROM (VALUES ${oldBooks.map((b) => `(${q(b.oldName)})`).join(', ')}) AS n(name);`,
    '  -- 꽂힌 배지 중 common이 아닌 것이 없다 (0)',
    '  SELECT count(*) FROM public.user_item_book_slots s',
    '    JOIN public.badges b ON b.id = s.badge_id JOIN public.item_books ib ON ib.id = s.item_book_id',
    `   WHERE ib.name IN (${oldBookList}) AND b.rarity <> 'common';`,
    '  -- 공개 설정을 눈으로 확인한다. 드랍 제외·유효기간·잠김·숨김이 있으면 새 행에도 같은 설정이 복사된다 (모두 0이면 기본 설정 그대로다)',
    '  SELECT count(DISTINCT ib.id) FILTER (WHERE ib.drop_excluded OR ib.valid_from IS NOT NULL OR ib.valid_until IS NOT NULL) AS books_with_setting,',
    '         count(*) FILTER (WHERE b.drop_excluded OR b.valid_from IS NOT NULL OR b.valid_until IS NOT NULL OR b.always_locked OR b.is_hidden) AS badges_with_setting',
    '    FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id',
    `   WHERE ib.name IN (${oldBookList});`,
    `  -- 백업 표가 있다 (275 적용 뒤)`,
    `  SELECT to_regclass('public.${BACKUP_TABLE}');                       -- NULL이 아니다`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  -- 컬렉션 ${n.books}개: 활성, 4등급, 배지 ${OLD_BOOK_ITEM_COUNT * 4}개씩 (${n.books}행)`,
    '  SELECT ib.name, ib.is_active, ib.tier_mode, count(b.id) AS badges',
    '    FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id',
    '    LEFT JOIN public.badges b ON b.item_book_id = ib.id',
    `   WHERE t.name = ${T} GROUP BY ib.id ORDER BY ib.name;`,
    `  -- 등급별 배지 수 (4행, 각 ${n.items})`,
    '  SELECT b.rarity, count(*) FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id',
    `    JOIN public.tribes t ON t.id = ib.tribe_id WHERE t.name = ${T} GROUP BY b.rarity ORDER BY b.rarity;`,
    '  -- 7-8 이름 점검: 4등급이 모두 있지 않은 이름 (0행)',
    '  SELECT b.item_book_id, b.name, count(DISTINCT b.rarity) FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id',
    `    JOIN public.tribes t ON t.id = ib.tribe_id WHERE t.name = ${T}`,
    '   GROUP BY b.item_book_id, b.name HAVING count(DISTINCT b.rarity) <> 4;',
    '  -- 이미지가 남았거나 소프트 삭제 상태인 배지 (0)',
    '  SELECT count(*) FROM public.badges b JOIN public.item_books ib ON ib.id = b.item_book_id',
    `    JOIN public.tribes t ON t.id = ib.tribe_id WHERE t.name = ${T}`,
    '     AND (b.image_url IS NOT NULL OR b.image_source IS NOT NULL OR b.deleted_at IS NOT NULL);',
    `  -- 백업 건수 (item_book ${n.overwriteBooks}, badge ${n.overwriteBadges}${hasNewBooks ? `, new_item_book ${n.newBooks}` : ''}, new_badge ${n.newBadges})`,
    `  SELECT kind, count(*) FROM public.${BACKUP_TABLE} WHERE target_tribe = ${T} GROUP BY kind ORDER BY kind;`
  ]);

  // 작업용 표의 값
  const bookValues = tribe.books
    .map((b) => `  (${b.no}, ${q(b.name)}, ${b.oldName === null ? 'NULL' : q(b.oldName)}, ${q(b.summary)})`)
    .join(',\n');
  const itemValues = tribe.books
    .flatMap((b) =>
      b.items.map(
        (i) =>
          `  (${b.no}, ${i.no}, ${q(i.name)}, ${i.oldName === null ? 'NULL' : q(i.oldName)}, ` +
          RARITIES.map((r) => q(i.descriptions[r])).join(', ') +
          ')'
      )
    )
    .join(',\n');

  const sections = [];

  sections.push(`
-- ----------------------------------------------------------------
-- 0. 작업용 임시 표
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_ctx;
DROP TABLE IF EXISTS pg_temp._jam2_book;
DROP TABLE IF EXISTS pg_temp._jam2_item;
DROP TABLE IF EXISTS pg_temp._jam2_new_badge;

-- 새 트라이브: 이름으로 찾는다
CREATE TEMP TABLE _jam2_ctx AS
  SELECT id AS tribe_id FROM public.tribes WHERE name = ${T};

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_ctx;
  IF v_n <> 1 THEN
    RAISE EXCEPTION '트라이브 «${tribeName}»가 %개입니다(1개여야 합니다). 트라이브 등록은 사용자가 트라이브 화면에서 먼저 합니다.', v_n;
  END IF;
END $$;

-- 컬렉션 ${n.books}개: 번호, 새 이름, 옛 이름(새로 만들면 NULL), 한 줄 서사
CREATE TEMP TABLE _jam2_book (
  no            INTEGER PRIMARY KEY,
  new_name      TEXT NOT NULL,
  old_name      TEXT,
  summary       TEXT NOT NULL,
  book_id       UUID,
  book_matches  INTEGER
);

INSERT INTO _jam2_book (no, new_name, old_name, summary) VALUES
${bookValues};

-- 아이템 ${n.items}개: 컬렉션 번호, 번호, 새 이름, 옛 배지 이름(새 행이면 NULL), 등급별 설명 4개
CREATE TEMP TABLE _jam2_item (
  book_no            INTEGER NOT NULL,
  no                 INTEGER NOT NULL,
  name               TEXT NOT NULL,
  old_name           TEXT,
  d_common           TEXT NOT NULL,
  d_rare             TEXT NOT NULL,
  d_epic             TEXT NOT NULL,
  d_mystic           TEXT NOT NULL,
  old_badge_id       UUID,
  old_badge_matches  INTEGER,
  PRIMARY KEY (book_no, no)
);

INSERT INTO _jam2_item (book_no, no, name, old_name, d_common, d_rare, d_epic, d_mystic) VALUES
${itemValues};
`);

  sections.push(`
-- ----------------------------------------------------------------
-- 1. 이름으로 옛 행을 찾고, 찾은 수가 기대와 다르면 멈춘다
-- ----------------------------------------------------------------
UPDATE _jam2_book k
   SET book_matches = (SELECT count(*) FROM public.item_books ib WHERE ib.name = k.old_name),
       book_id      = (SELECT ib.id FROM public.item_books ib WHERE ib.name = k.old_name ORDER BY ib.created_at LIMIT 1)
 WHERE k.old_name IS NOT NULL;

UPDATE _jam2_item i
   SET old_badge_matches = (SELECT count(*) FROM public.badges b WHERE b.item_book_id = k.book_id AND b.name = i.old_name),
       old_badge_id      = (SELECT b.id FROM public.badges b WHERE b.item_book_id = k.book_id AND b.name = i.old_name ORDER BY b.created_at LIMIT 1)
  FROM _jam2_book k
 WHERE k.no = i.book_no AND k.book_matches = 1 AND i.old_name IS NOT NULL;

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_book WHERE old_name IS NOT NULL AND book_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '옛 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${n.overwriteBooks}개 모두 1건). 이름이 이미 바뀌었거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad FROM _jam2_item WHERE old_name IS NOT NULL AND old_badge_matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '옛 아이템 배지 행을 컬렉션 안에서 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${n.overwriteBadges}개 모두 1건).', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _jam2_book k
   WHERE k.book_id IS NOT NULL
     AND (SELECT count(*) FROM public.badges b WHERE b.item_book_id = k.book_id) <> ${OLD_BOOK_ITEM_COUNT};
  IF v_bad > 0 THEN
    RAISE EXCEPTION '아이템 배지가 ${OLD_BOOK_ITEM_COUNT}개가 아닌 옛 컬렉션이 %개 있습니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM public.user_item_book_slots s
    JOIN public.badges b ON b.id = s.badge_id
   WHERE s.item_book_id IN (SELECT book_id FROM _jam2_book WHERE book_id IS NOT NULL)
     AND b.rarity IS DISTINCT FROM 'common';
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'common이 아닌 등급의 배지가 꽂힌 칸이 %개 있습니다. 4등급을 켜기 전에 꽂힌 등급을 정리해야 합니다.', v_bad;
  END IF;

  SELECT count(*) INTO v_bad
    FROM _jam2_book k
    JOIN public.item_books ib ON ib.name = k.new_name AND ib.id IS DISTINCT FROM k.book_id;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '새 이름과 같은 이름의 컬렉션이 이미 다른 행으로 %개 있습니다.', v_bad;
  END IF;
END $$;
`);

  sections.push(`
-- ----------------------------------------------------------------
-- 2. 덮어쓰기 직전 상태를 백업 표에 기록한다 (275가 만든 표. 이미 있으면 지금 값으로 갱신)
-- ----------------------------------------------------------------
INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe, snapshot)
SELECT 'item_book', ib.id, ${T}, to_jsonb(ib)
  FROM public.item_books ib
  JOIN _jam2_book k ON k.book_id = ib.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET target_tribe = EXCLUDED.target_tribe, snapshot = EXCLUDED.snapshot, backed_up_at = now();

INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe, snapshot)
SELECT 'badge', b.id, ${T}, to_jsonb(b)
  FROM public.badges b
  JOIN _jam2_item i ON i.old_badge_id = b.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET target_tribe = EXCLUDED.target_tribe, snapshot = EXCLUDED.snapshot, backed_up_at = now();
`);

  sections.push(`
-- ----------------------------------------------------------------
-- 3. 옛 컬렉션 ${n.overwriteBooks}개 덮어쓰기
-- ----------------------------------------------------------------
UPDATE public.item_books ib
   SET name         = k.new_name,
       description  = k.summary,
       tribe_id     = c.tribe_id,
       is_active    = true,
       tier_mode    = true,
       story_text   = NULL,
       image_url    = NULL,
       image_source = NULL
  FROM _jam2_book k
 CROSS JOIN _jam2_ctx c
 WHERE ib.id = k.book_id AND k.old_name IS NOT NULL;
`);

  if (hasNewBooks) {
    sections.push(`
-- ----------------------------------------------------------------
-- 3-1. 새 컬렉션 ${n.newBooks}개 만들기
-- ----------------------------------------------------------------
UPDATE _jam2_book SET book_id = gen_random_uuid() WHERE old_name IS NULL;

INSERT INTO public.item_books (id, name, description, tribe_id, is_active, tier_mode, story_text)
SELECT k.book_id, k.new_name, k.summary, c.tribe_id, true, true, NULL
  FROM _jam2_book k
 CROSS JOIN _jam2_ctx c
 WHERE k.old_name IS NULL
 ORDER BY k.no;

INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe)
SELECT 'new_item_book', k.book_id, ${T}
  FROM _jam2_book k
 WHERE k.old_name IS NULL
ON CONFLICT (kind, row_id) DO UPDATE SET target_tribe = EXCLUDED.target_tribe, backed_up_at = now();
`);
  }

  if (hasOverwrite) {
    sections.push(`
-- ----------------------------------------------------------------
-- 4. 옛 아이템 배지 행 ${n.overwriteBadges}개 덮어쓰기 (Common)
-- ----------------------------------------------------------------
UPDATE public.badges b
   SET name         = i.name,
       description  = i.d_common,
       rarity       = 'common',
       deleted_at   = NULL,
       tribe_id     = c.tribe_id,
       image_url    = NULL,
       image_source = NULL
  FROM _jam2_item i
 CROSS JOIN _jam2_ctx c
 WHERE b.id = i.old_badge_id;
`);
  }

  sections.push(`
-- ----------------------------------------------------------------
-- 5. 새 배지 행 ${n.newBadges}개 (${hasOverwrite ? 'Rare·Epic·Mystic' : ''}${hasOverwrite && hasNewItems ? ', ' : ''}${hasNewItems ? '새 아이템의 4등급' : ''})
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_new_badge AS
SELECT gen_random_uuid() AS id,
       i.book_no,
       i.no AS item_no,
       r.rarity,
       i.name,
       CASE r.rarity WHEN 'rare' THEN i.d_rare WHEN 'epic' THEN i.d_epic WHEN 'mystic' THEN i.d_mystic ELSE i.d_common END AS description,
       i.old_badge_id
  FROM _jam2_item i
 CROSS JOIN (VALUES ('common'), ('rare'), ('epic'), ('mystic')) AS r(rarity)
 WHERE i.old_badge_id IS NULL OR r.rarity <> 'common';
`);

  if (hasOverwrite) {
    sections.push(`
-- 덮어쓴 행이 있는 아이템: 드랍 설정은 덮어쓴 Common 행에서 그대로 복사한다. point_reward·이미지·잠김·숨김은 복사하지 않는다.
INSERT INTO public.badges (
  id, name, description, type, rarity, item_book_id, tribe_id,
  activity_types, category, admin_category, patch_available, patch_price_krw,
  drop_weight, drop_condition_json, drop_excluded, valid_from, valid_until, show_on_map, sort_order
)
SELECT nb.id, nb.name, nb.description, 'item'::public.badge_type, nb.rarity::public.badge_rarity, k.book_id, c.tribe_id,
       o.activity_types, o.category, o.admin_category, o.patch_available, o.patch_price_krw,
       o.drop_weight, o.drop_condition_json, o.drop_excluded, o.valid_from, o.valid_until, o.show_on_map, o.sort_order
  FROM _jam2_new_badge nb
  JOIN _jam2_book k ON k.no = nb.book_no
  JOIN public.badges o ON o.id = nb.old_badge_id
 CROSS JOIN _jam2_ctx c;
`);
  }
  if (hasNewItems) {
    sections.push(`
-- 옛 행이 없는 아이템: 드랍 설정은 열의 기본값을 쓴다.
INSERT INTO public.badges (id, name, description, type, rarity, item_book_id, tribe_id)
SELECT nb.id, nb.name, nb.description, 'item'::public.badge_type, nb.rarity::public.badge_rarity, k.book_id, c.tribe_id
  FROM _jam2_new_badge nb
  JOIN _jam2_book k ON k.no = nb.book_no
 CROSS JOIN _jam2_ctx c
 WHERE nb.old_badge_id IS NULL;
`);
  }

  sections.push(`
INSERT INTO public.${BACKUP_TABLE} (kind, row_id, target_tribe)
SELECT 'new_badge', nb.id, ${T}
  FROM _jam2_new_badge nb
ON CONFLICT (kind, row_id) DO UPDATE SET target_tribe = EXCLUDED.target_tribe, backed_up_at = now();
`);

  sections.push(`
-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 컬렉션 ${n.books}개: 새 이름·서사·트라이브, 활성, 4등급, 비운 칸
  SELECT count(*) INTO v_n
    FROM public.item_books ib
    JOIN _jam2_book k ON k.book_id = ib.id
   CROSS JOIN _jam2_ctx c
   WHERE ib.name = k.new_name AND ib.description = k.summary AND ib.tribe_id = c.tribe_id
     AND ib.is_active AND ib.tier_mode
     AND ib.story_text IS NULL AND ib.image_url IS NULL AND ib.image_source IS NULL;
  IF v_n <> ${n.books} THEN
    RAISE EXCEPTION '끝 검사: 새 값을 가진 컬렉션이 %개입니다(기대 ${n.books}).', v_n;
  END IF;

  -- 컬렉션 안의 배지 전체 ${n.totalBadges}개
  SELECT count(*) INTO v_n FROM public.badges b WHERE b.item_book_id IN (SELECT book_id FROM _jam2_book);
  IF v_n <> ${n.totalBadges} THEN
    RAISE EXCEPTION '끝 검사: 컬렉션 안의 배지가 %개입니다(기대 ${n.totalBadges}).', v_n;
  END IF;

  -- 이름·등급·설명·트라이브가 원고와 같고, 이미지가 없고, 삭제되지 않은 배지
  SELECT count(*) INTO v_n
    FROM public.badges b
    JOIN _jam2_book k ON k.book_id = b.item_book_id
    JOIN _jam2_item i ON i.book_no = k.no AND i.name = b.name
   CROSS JOIN _jam2_ctx c
   WHERE b.type = 'item' AND b.tribe_id = c.tribe_id AND b.deleted_at IS NULL
     AND b.image_url IS NULL AND b.image_source IS NULL
     AND b.description = CASE b.rarity WHEN 'common' THEN i.d_common WHEN 'rare' THEN i.d_rare WHEN 'epic' THEN i.d_epic ELSE i.d_mystic END;
  IF v_n <> ${n.totalBadges} THEN
    RAISE EXCEPTION '끝 검사: 원고와 같은 배지가 %개입니다(기대 ${n.totalBadges}).', v_n;
  END IF;

  -- 등급마다 ${n.items}개
  SELECT count(*) INTO v_n
    FROM (SELECT b.rarity FROM public.badges b
           WHERE b.item_book_id IN (SELECT book_id FROM _jam2_book)
           GROUP BY b.rarity HAVING count(*) = ${n.items}) x;
  IF v_n <> 4 THEN
    RAISE EXCEPTION '끝 검사: 등급마다 ${n.items}개인 등급이 %개입니다(기대 4).', v_n;
  END IF;

  -- 같은 컬렉션의 같은 이름이 4등급 모두 있다
  SELECT count(*) INTO v_n
    FROM (SELECT b.item_book_id, b.name FROM public.badges b
           WHERE b.item_book_id IN (SELECT book_id FROM _jam2_book)
           GROUP BY b.item_book_id, b.name HAVING count(DISTINCT b.rarity) = 4 AND count(*) = 4) x;
  IF v_n <> ${n.items} THEN
    RAISE EXCEPTION '끝 검사: 4등급이 모두 있는 이름이 %개입니다(기대 ${n.items}).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.${BACKUP_TABLE} WHERE target_tribe = ${T} AND kind = 'item_book';
  IF v_n <> ${n.overwriteBooks} THEN RAISE EXCEPTION '끝 검사: 컬렉션 백업이 %건입니다(기대 ${n.overwriteBooks}).', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.${BACKUP_TABLE} WHERE target_tribe = ${T} AND kind = 'badge';
  IF v_n <> ${n.overwriteBadges} THEN RAISE EXCEPTION '끝 검사: 배지 백업이 %건입니다(기대 ${n.overwriteBadges}).', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.${BACKUP_TABLE} WHERE target_tribe = ${T} AND kind = 'new_item_book';
  IF v_n <> ${n.newBooks} THEN RAISE EXCEPTION '끝 검사: 새 컬렉션 기록이 %건입니다(기대 ${n.newBooks}).', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.${BACKUP_TABLE} WHERE target_tribe = ${T} AND kind = 'new_badge';
  IF v_n <> ${n.newBadges} THEN RAISE EXCEPTION '끝 검사: 새 배지 기록이 %건입니다(기대 ${n.newBadges}).', v_n; END IF;
END $$;

DROP TABLE _jam2_new_badge;
DROP TABLE _jam2_item;
DROP TABLE _jam2_book;
DROP TABLE _jam2_ctx;
`);

  const rollback = commentBlock([
    '되돌림 SQL',
    `«${tribeName}»만 되돌린다. 백업 표 ${BACKUP_TABLE}(275)를 쓴다. 한 번의 호출로 통째로 실행한다.`,
    '새로 넣은 행을 유저가 이미 받았거나 꽂았다면 1)의 DELETE가 외래키 오류로 멈춘다. 그때는 유저 보유를 먼저 확인하고,',
    `지우는 대신 deleted_at을 채워 소프트 삭제한다(UPDATE public.badges SET deleted_at = now() WHERE id IN (SELECT row_id FROM public.${BACKUP_TABLE} WHERE kind = 'new_badge' AND target_tribe = ${T});).`,
    '',
    '1) 새로 넣은 행 지우기',
    `DELETE FROM public.badges WHERE id IN (SELECT row_id FROM public.${BACKUP_TABLE} WHERE kind = 'new_badge' AND target_tribe = ${T});`,
    ...(hasNewBooks
      ? [`DELETE FROM public.item_books WHERE id IN (SELECT row_id FROM public.${BACKUP_TABLE} WHERE kind = 'new_item_book' AND target_tribe = ${T});`]
      : []),
    '',
    '2) 덮어쓴 아이템 배지 행을 백업 값으로 되돌리기 (name, description, rarity, deleted_at, tribe_id, image_url, image_source)',
    'UPDATE public.badges b',
    "   SET name         = s.snapshot->>'name',",
    "       description  = s.snapshot->>'description',",
    "       rarity       = (s.snapshot->>'rarity')::public.badge_rarity,",
    "       deleted_at   = (s.snapshot->>'deleted_at')::timestamptz,",
    "       tribe_id     = (s.snapshot->>'tribe_id')::uuid,",
    "       image_url    = s.snapshot->>'image_url',",
    "       image_source = s.snapshot->>'image_source'",
    `  FROM public.${BACKUP_TABLE} s`,
    ` WHERE s.kind = 'badge' AND s.target_tribe = ${T} AND s.row_id = b.id;`,
    '',
    '3) 덮어쓴 컬렉션을 백업 값으로 되돌리기 (name, description, tribe_id, is_active, tier_mode, story_text, image_url, image_source)',
    'UPDATE public.item_books ib',
    "   SET name         = s.snapshot->>'name',",
    "       description  = s.snapshot->>'description',",
    "       tribe_id     = (s.snapshot->>'tribe_id')::uuid,",
    "       is_active    = (s.snapshot->>'is_active')::boolean,",
    "       tier_mode    = (s.snapshot->>'tier_mode')::boolean,",
    "       story_text   = s.snapshot->>'story_text',",
    "       image_url    = s.snapshot->>'image_url',",
    "       image_source = s.snapshot->>'image_source'",
    `  FROM public.${BACKUP_TABLE} s`,
    ` WHERE s.kind = 'item_book' AND s.target_tribe = ${T} AND s.row_id = ib.id;`,
    '',
    '4) 되돌린 뒤 확인: 아래 둘이 모두 0이어야 한다 (백업 값과 다른 행)',
    `SELECT count(*) FROM public.badges b JOIN public.${BACKUP_TABLE} s ON s.kind = 'badge' AND s.row_id = b.id AND s.target_tribe = ${T} WHERE to_jsonb(b) <> s.snapshot;`,
    `SELECT count(*) FROM public.item_books ib JOIN public.${BACKUP_TABLE} s ON s.kind = 'item_book' AND s.row_id = ib.id AND s.target_tribe = ${T} WHERE to_jsonb(ib) <> s.snapshot;`
  ]);

  return `${header}\n${sections.join('')}\n${rollback}\n`;
}

// ────────────────────────────────────────────────────────────
// 파일 쓰기와 명령줄
// ────────────────────────────────────────────────────────────

/** 이번 회에 쓰는 파일 목록 (이름 → 내용) */
export function buildOutputs(plan, tribeNames = FIRST_ROUND_TRIBES, { includeBackup = true } = {}) {
  const out = {};
  if (includeBackup) out[BACKUP_FILE.file] = genBackupSql(plan);
  for (const name of tribeNames) out[TRIBE_FILES[name].file] = genTribeSql(plan, name);
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const plan = buildPlan();

  if (args.includes('--dry')) {
    console.log('트라이브별 건수 (컬렉션 / 덮어쓰는 옛 행 / 새 배지 행 / 아이템×4등급)');
    for (const t of plan.tribes) {
      const c = countTribe(t);
      console.log(
        `  ${t.name}: 컬렉션 ${c.books}(덮어쓰기 ${c.overwriteBooks}, 새로 ${c.newBooks}) / 옛 행 ${c.overwriteBadges} / 새 행 ${c.newBadges} / 합계 ${c.totalBadges}`
      );
    }
    const s = countPlan(plan);
    console.log(
      `합계: 컬렉션 ${s.books}(덮어쓰기 ${s.overwriteBooks}, 새로 ${s.newBooks}), 옛 행 덮어쓰기 ${s.overwriteBadges}, 새 행 ${s.newBadges}, 배지 합계 ${s.totalBadges}`
    );
    return;
  }

  if (args.includes('--write')) {
    const tribeArgs = [];
    args.forEach((a, k) => {
      if (a === '--tribe') tribeArgs.push(args[k + 1]);
    });
    const tribes = tribeArgs.length > 0 ? tribeArgs : FIRST_ROUND_TRIBES;
    const outputs = buildOutputs(plan, tribes, { includeBackup: tribeArgs.length === 0 });
    for (const [file, text] of Object.entries(outputs)) {
      fs.writeFileSync(path.join(MIGRATIONS_DIR, file), text);
      console.error(`${file} 쓰기 완료 (${text.split('\n').length}줄)`);
    }
    return;
  }

  console.error('사용법: --dry | --write [--tribe 트라이브이름]');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
