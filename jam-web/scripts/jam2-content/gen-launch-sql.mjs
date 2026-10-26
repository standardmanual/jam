#!/usr/bin/env node
/**
 * gen-launch-sql.mjs — 오픈 직전에 적용하는 SQL 두 개를 만든다. (티켓 20261026_2026, JAM 2.0 묶음 7의 7-9)
 *   292  예약 컬렉션 35개 끄기: 7-6 계획 컬렉션 50개 가운데 첫 공개 15개를 뺀 35개의 is_active를 false로 바꾼다.
 *   293  첫 공개 단서 레시피 28건 열기: 단서 7개 × 등급 4개의 valid_from을 자리 값에서 NULL로 바꾼다.
 *
 * 입력: 7-6 계획(gen-content-sql.mjs의 buildPlan: 원고 01~05의 컬렉션 50개)과 단서 레시피 원고 07(gen-recipe-sql.mjs의 buildClues).
 * 출력: 마이그레이션 파일 2개. 파일만 쓰고 실행하지 않는다 — 실행은 오픈 직전에 카리나가 드라이런·롤백 실측과 함께 한다.
 *       생성기는 DB를 읽지 않는다. 실제 건수는 SQL 안에서 이름으로 판별하고, 기대와 다르면 SQL이 오류로 멈춘다.
 *
 * SQL의 원칙 (281·282와 같다)
 *   - 컬렉션과 레시피는 id가 아니라 이름으로 찾고, 찾은 수가 기대와 다르면 오류로 멈춘다.
 *   - 한 번의 호출로 통째로 실행하는 한 트랜잭션이다(BEGIN/COMMIT은 쓰지 않는다. 롤백 실측이 파일 뒤에
 *     일부러 오류를 붙여 같은 호출로 실행하기 때문이다).
 *   - 바꾸기 직전의 행 전체를 백업 표에 담고, 되돌림 SQL이 그 표를 쓴다. 바꾸는 열은 한 개뿐이고 끝 검사가 «나머지 열 불변»을 확인한다.
 *
 * 사용법
 *   node scripts/jam2-content/gen-launch-sql.mjs --dry    # 파일 없이 건수만 출력
 *   node scripts/jam2-content/gen-launch-sql.mjs --write  # 292, 293을 마이그레이션 폴더에 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATIONS_DIR, buildPlan, q } from './gen-content-sql.mjs';
import { CLUE_TIERS, CLUE_VALID_FROM, buildClues, commentBlock, planBooks } from './gen-recipe-sql.mjs';

export const TICKET = '20261026_2026';

/** 마이그레이션 번호와 파일 이름. 번호는 시작 때 origin/staging 기준으로 비어 있음을 확인했다(2026-10-26: 가장 높은 번호 291). */
export const CLOSE_FILE = { number: 292, file: '292_close_reserve_collections_at_launch.sql' };
export const OPEN_RECIPE_FILE = { number: 293, file: '293_open_initial_clue_recipes_at_launch.sql' };

/** 바꾸기 직전 상태를 담는 백업 표. 282의 retire_backup_20261022와는 별개 표다. 292와 293이 같은 정의로 만든다. */
export const LAUNCH_BACKUP_TABLE = 'launch_backup_20261026';

/** 281이 단서 레시피 80건에 넣은 공개 시작 자리 값(2099-01-01 00:00 KST)을 SQL 글자로 쓴 것 */
const VALID_FROM_SQL = `TIMESTAMPTZ '${CLUE_VALID_FROM}'`;

/** 오픈 때 여는 첫 공개 컬렉션 15개(트라이브마다 3개). 2026-10-25 사용자 확정, 이름은 2026-10-26 공용 DB에서 읽은 값이다. */
export const INITIAL_OPEN_BOOKS = [
  { tribe: '한입만 연구회', book: '무명을 쫓는 야식가들' },
  { tribe: '한입만 연구회', book: '비 오는 날의 기름 냄새' },
  { tribe: '한입만 연구회', book: '시장 골목의 전설' },
  { tribe: '찰칵단', book: '골목길 필름 스냅' },
  { tribe: '찰칵단', book: '노을 헌터의 기록' },
  { tribe: '찰칵단', book: '매직 아워' },
  { tribe: '비사이드 레코즈', book: '배터리 방전의 공포' },
  { tribe: '비사이드 레코즈', book: '아날로그 믹스테이프' },
  { tribe: '비사이드 레코즈', book: '삼십 초의 소리' },
  { tribe: '소나무 잡화점', book: '유리 칸 닦는 아침' },
  { tribe: '소나무 잡화점', book: '창고의 문구 상자' },
  { tribe: '소나무 잡화점', book: '행운의 잡동사니' },
  { tribe: '혼자들', book: '길거리 우체통의 편지' },
  { tribe: '혼자들', book: '짝 잃은 양말' },
  { tribe: '혼자들', book: '겨울잠의 안식처' }
];

/** 오픈 때 여는 단서 7개의 이름(재료와 보상 컬렉션이 모두 첫 공개 15개 안에 있는 것). 2026-10-26 공용 DB에서 읽은 값이다. */
export const EXPECTED_OPEN_CLUE_NAMES = [
  '노을 구석의 트럭',
  '노트 위의 별',
  '녹음 부스의 셔터 소리',
  '맨 아래 줄의 노트 12권',
  '벽장의 월세 봉투',
  '카세트 표지의 같은 글씨',
  '하은의 칸에 꽂힌 카세트'
];

const sameBook = (a, b) => a.tribe === b.tribe && a.book === b.book;
const isInitialBook = (b) => INITIAL_OPEN_BOOKS.some((i) => sameBook(i, b));

// ────────────────────────────────────────────────────────────
// 계획 만들기
// ────────────────────────────────────────────────────────────

/** 7-6 계획의 컬렉션 50개를 첫 공개 15개(initial)와 끄는 35개(reserve)로 가른다. 첫 공개 가운데 계획에 없는 것이 있으면 멈춘다. */
export function splitLaunchBooks(plan) {
  const all = planBooks(plan);
  if (new Set(INITIAL_OPEN_BOOKS.map((b) => `${b.tribe}/${b.book}`)).size !== INITIAL_OPEN_BOOKS.length) {
    throw new Error('첫 공개 컬렉션 목록에 같은 컬렉션이 두 번 들어 있습니다');
  }
  const missing = INITIAL_OPEN_BOOKS.filter((i) => !all.some((b) => sameBook(i, b)));
  if (missing.length > 0) {
    throw new Error(`첫 공개 컬렉션이 7-6 계획에 없습니다: ${missing.map((b) => `«${b.tribe} / ${b.book}»`).join(', ')}`);
  }
  const initial = all.filter(isInitialBook);
  const reserve = all.filter((b) => !isInitialBook(b));
  if (initial.length !== 15) throw new Error(`첫 공개 컬렉션이 ${initial.length}개입니다(기대 15)`);
  return { initial, reserve };
}

/**
 * 단서 20개 가운데 «재료의 컬렉션과 보상의 컬렉션이 모두 첫 공개 15개에 드는 것»을 고른다.
 * 단서마다 재료 컬렉션이 정확히 한 곳이어야 하고(아니면 멈춘다), 고른 이름이 EXPECTED_OPEN_CLUE_NAMES와 다르면 멈춘다.
 * 각 항목은 { name, ingredientBook: { tribe, book }, rewardBook: { tribe, book } }다.
 */
export function selectOpenClues(clues) {
  const resolved = clues.map((c) => {
    const books = [...new Map(c.ingredients.map((i) => [`${i.tribe}/${i.bookName}`, { tribe: i.tribe, book: i.bookName }])).values()];
    if (books.length !== 1) {
      throw new Error(`${c.code} ${c.name}: 재료 컬렉션이 ${books.length}곳입니다(기대 정확히 한 곳)`);
    }
    return { name: c.name, ingredientBook: books[0], rewardBook: { tribe: c.reward.tribe, book: c.reward.bookName } };
  });
  const open = resolved.filter((c) => isInitialBook(c.ingredientBook) && isInitialBook(c.rewardBook));
  const got = open.map((c) => c.name).sort();
  const want = [...EXPECTED_OPEN_CLUE_NAMES].sort();
  if (got.length !== want.length || got.some((n, i) => n !== want[i])) {
    throw new Error(`첫 공개 단서가 기대와 다릅니다(기대: ${want.join(', ')} / 계산: ${got.join(', ')})`);
  }
  return open;
}

/** 건수 기대: 계획 컬렉션 50, 열림 15, 끄기 35 / 단서 7개 × 등급 4개 = 열 레시피 28건, 자리 값으로 남는 레시피 52건, 단서 레시피 80건 */
export function launchExpectation(plan, clues) {
  const { initial, reserve } = splitLaunchBooks(plan);
  const openClues = selectOpenClues(clues).length;
  const tiers = CLUE_TIERS.length;
  const totalClueRecipes = clues.length * tiers;
  const openRecipes = openClues * tiers;
  return {
    plannedBooks: initial.length + reserve.length,
    openBooks: initial.length,
    closeBooks: reserve.length,
    openClues,
    openRecipes,
    keptRecipes: totalClueRecipes - openRecipes,
    totalClueRecipes
  };
}

// ────────────────────────────────────────────────────────────
// 292·293이 같이 쓰는 백업 표 정의 — 두 파일에서 한 글자도 다르지 않다
// ────────────────────────────────────────────────────────────

function backupTableSql() {
  const B = LAUNCH_BACKUP_TABLE;
  return `-- ----------------------------------------------------------------
-- 0. 백업 표 — 서버 전용(RLS 켜고 정책 없음, 클라이언트 권한 회수). 292와 293이 같은 정의를 쓴다
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
  'JAM 2.0 오픈 직전 SQL(292 컬렉션 끄기, 293 단서 레시피 열기) 되돌림용 백업(티켓 ${TICKET}). item_book은 끄기 직전, combination_recipe는 열기 직전 전체 행(snapshot)이다. 오픈 뒤 문제가 없으면 지운다. 서버(service role)만 읽고 쓴다.';
`;
}

// ────────────────────────────────────────────────────────────
// 292 — 예약 컬렉션 35개 끄기
// ────────────────────────────────────────────────────────────

export function genCloseSql(plan) {
  const { initial, reserve } = splitLaunchBooks(plan);
  const planned = initial.length + reserve.length;
  const nOpen = initial.length;
  const nClose = reserve.length;
  const B = LAUNCH_BACKUP_TABLE;
  const books = planBooks(plan);
  const tribeNames = [...new Set(books.map((b) => b.tribe))];
  const tribeList = tribeNames.map(q).join(', ');
  /** 확인 쿼리에 넣는 첫 공개 컬렉션 (트라이브, 컬렉션) 목록. 한 줄에 한 쌍씩 쓴다 */
  const pairLines = (indent) => initial.map((b, i) => `${indent}(${q(b.tribe)}, ${q(b.book)})${i < initial.length - 1 ? ',' : ''}`);

  const header = commentBlock([
    CLOSE_FILE.file,
    `JAM 2.0 묶음 7 · 7-9: 예약 컬렉션 ${nClose}개 끄기 (티켓 ${TICKET})`,
    '',
    '이 파일은 gen-launch-sql.mjs가 7-6 계획(원고 01~05의 컬렉션 50개)에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다',
    '(node scripts/jam2-content/gen-launch-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    '이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.',
    '',
    '하는 일 (한 트랜잭션, 파일만 쓰고 실행은 오픈 직전에 카리나가 드라이런·롤백 실측과 함께 한다)',
    `  1. 컬렉션 ${nClose}개 끄기: 오픈 때는 트라이브마다 10개 가운데 3개만 열고 7개는 꺼 둔 채 시작한다(${tribeNames.length}개 트라이브, ${nOpen}개 열림, ${nClose}개 꺼 둠).`,
    `     «7-6 계획의 컬렉션 ${planned}개 가운데 첫 공개 ${nOpen}개가 아니고 지금 켜져 있는 것»의 is_active를 false로 바꾼다.`,
    '     is_active 하나만 바꾼다. valid_from을 비롯한 다른 열은 건드리지 않는다(켜는 일은 운영자가 어드민에서 is_active로 한다, 2026-10-26 결정).',
    '     지우지 않는다(소프트 삭제). 컬렉션 안의 배지와 유저가 이미 받은 기록은 그대로다.',
    `  2. 끄기 직전의 행 전체를 백업 표 ${B}에 item_book 종류로 담고, 되돌림 SQL이 그 표를 쓴다.`,
    '',
    `첫 공개 컬렉션 ${nOpen}개 (트라이브, 컬렉션) — 끄지 않는다`,
    ...tribeNames.map((t) => `  ${t}: ${initial.filter((b) => b.tribe === t).map((b) => b.book).join(', ')}`),
    '',
    '찾는 방법과 멈추는 조건',
    `  - 계획 컬렉션 ${planned}개는 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다(7-6의 트라이브 SQL(276~280)이 적용되지 않았다면 여기서 멈춘다).`,
    `  - 첫 공개 ${nOpen}개가 모두 켜져 있지 않으면 멈춘다. 오픈 직전에 운영자가 따로 꺼 둔 것이 있다는 뜻이므로 사람이 보고 판단한다.`,
    `  - 끄기 대상은 «계획 컬렉션 가운데 첫 공개가 아니고 지금 켜져 있는 것»이다. ${nClose}개가 아니면 멈춘다.`,
    '    적용된 뒤에는 끄기 대상이 0개가 되므로 같은 파일을 다시 실행하면 멈춘다.',
    `  - 끝에서 끈 컬렉션 ${nClose}개가 꺼져 있는지, 계획 컬렉션 가운데 켜진 것이 정확히 첫 공개 ${nOpen}개인지, 끈 컬렉션의 is_active를 뺀 나머지 열이 백업과 같은지,`,
    `    백업이 ${nClose}건인지 검사하고 어긋나면 전체를 되돌린다(트랜잭션).`,
    '',
    '282(쓰지 않는 컬렉션 19개 끄기)와는 순서가 상관없다. 282는 «계획 밖의 활성 컬렉션»만 보고 이 파일은 «계획 안의 컬렉션»만 보므로 두 파일의 끝 검사가 서로를 깨지 않는다.',
    '적용 순서: 7-6의 다섯 트라이브 SQL(276~280) 적용 뒤, 오픈 직전. 293(첫 공개 단서 레시피 열기)과도 순서가 상관없다.',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    `  -- 첫 공개 컬렉션 ${nOpen}개가 모두 켜져 있다 (${nOpen})`,
    '  SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id',
    '   WHERE ib.is_active AND (t.name, ib.name) IN (',
    ...pairLines('         '),
    '   );',
    `  -- 새 트라이브 ${tribeNames.length}곳의 켜진 컬렉션 가운데 첫 공개를 뺀 것 (${nClose}. ${tribeNames.length}곳에 계획 밖 컬렉션이 없으면 몸통의 끄기 대상 건수와 같다)`,
    '  SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id',
    `   WHERE ib.is_active AND t.name IN (${tribeList}) AND (t.name, ib.name) NOT IN (`,
    ...pairLines('         '),
    '   );',
    '  -- 백업 표가 아직 없다',
    `  SELECT to_regclass('public.${B}');                                  -- NULL`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  -- 끈 컬렉션 ${nClose}개가 모두 꺼져 있다 (${nClose})`,
    `  SELECT count(*) FROM public.item_books ib JOIN public.${B} s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE NOT ib.is_active;`,
    `  -- 새 트라이브 ${tribeNames.length}곳에서 켜진 컬렉션은 첫 공개 ${nOpen}개뿐이다 (${nOpen}, 0)`,
    '  SELECT count(*) AS active_books,',
    '         count(*) FILTER (WHERE (t.name, ib.name) NOT IN (',
    ...pairLines('           '),
    '         )) AS active_not_initial',
    '    FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id',
    `   WHERE ib.is_active AND t.name IN (${tribeList});`,
    `  -- 백업 건수 (item_book ${nClose})`,
    `  SELECT kind, count(*) FROM public.${B} GROUP BY kind ORDER BY kind;`
  ]);

  const planValues = books
    .map((b) => `  (${q(b.tribe)}, ${q(b.book)}, ${isInitialBook(b) ? 'true' : 'false'})`)
    .join(',\n');

  const body = `
${backupTableSql()}
-- ----------------------------------------------------------------
-- 1. 7-6 계획의 컬렉션 ${planned}개를 «트라이브 이름과 컬렉션 이름»으로 찾고, 한 건씩 맞지 않으면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_close_book;
DROP TABLE IF EXISTS pg_temp._jam2_launch_book;

CREATE TEMP TABLE _jam2_launch_book (
  tribe       TEXT NOT NULL,
  book        TEXT NOT NULL,
  is_initial  BOOLEAN NOT NULL,
  book_id     UUID,
  matches     INTEGER,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_launch_book (tribe, book, is_initial) VALUES
${planValues};

UPDATE _jam2_launch_book k
   SET matches = (SELECT count(*) FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book),
       book_id = (SELECT ib.id FROM public.item_books ib JOIN public.tribes t ON t.id = ib.tribe_id
                   WHERE t.name = k.tribe AND ib.name = k.book ORDER BY ib.created_at LIMIT 1);

DO $$
DECLARE
  v_bad INTEGER;
BEGIN
  SELECT count(*) INTO v_bad FROM _jam2_launch_book WHERE matches IS DISTINCT FROM 1;
  IF v_bad > 0 THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션을 이름으로 한 건씩 찾지 못한 것이 %개입니다(기대: ${planned}개 모두 1건). 7-6의 트라이브 SQL(276~280)이 적용되지 않았거나 같은 이름이 둘 이상 있습니다.', v_bad;
  END IF;

  SELECT count(DISTINCT book_id) INTO v_bad FROM _jam2_launch_book;
  IF v_bad <> ${planned} THEN
    RAISE EXCEPTION '7-6 계획의 컬렉션이 서로 다른 행 %개로 맞아야 합니다(기대 ${planned}).', v_bad;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 첫 공개 ${nOpen}개가 모두 켜져 있는지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n
    FROM _jam2_launch_book lb JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE lb.is_initial AND ib.is_active;
  IF v_n <> ${nOpen} THEN
    RAISE EXCEPTION '첫 공개 컬렉션 중 켜져 있는 것이 %개입니다(기대 ${nOpen}개 모두 켜짐). 오픈 직전에 운영자가 따로 꺼 둔 것이 있는지 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 끄기 대상 = 계획 컬렉션 가운데 첫 공개가 아니고 지금 켜져 있는 것. ${nClose}개가 아니면 멈춘다
-- ----------------------------------------------------------------
CREATE TEMP TABLE _jam2_close_book AS
  SELECT lb.book_id
    FROM _jam2_launch_book lb
    JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE NOT lb.is_initial AND ib.is_active;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_close_book;
  IF v_n <> ${nClose} THEN
    RAISE EXCEPTION '끄기 대상 컬렉션이 %개입니다(기대 ${nClose}개: 계획 컬렉션 가운데 첫 공개가 아니고 켜진 것). 이미 적용했거나 운영자가 따로 바꾼 것이 있는지 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 끄기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 끄기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.${B} (kind, row_id, snapshot)
SELECT 'item_book', ib.id, to_jsonb(ib)
  FROM public.item_books ib
  JOIN _jam2_close_book c ON c.book_id = ib.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 끄기: is_active만 바꾼다 (valid_from을 비롯한 다른 열은 건드리지 않는다)
-- ----------------------------------------------------------------
UPDATE public.item_books ib
   SET is_active = false
  FROM _jam2_close_book c
 WHERE ib.id = c.book_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
  v_off INTEGER;
BEGIN
  -- 끈 컬렉션 ${nClose}개가 모두 꺼져 있다
  SELECT count(*) INTO v_n
    FROM public.item_books ib JOIN _jam2_close_book c ON c.book_id = ib.id
   WHERE NOT ib.is_active;
  IF v_n <> ${nClose} THEN
    RAISE EXCEPTION '끝 검사: 꺼진 컬렉션이 %개입니다(기대 ${nClose}).', v_n;
  END IF;

  -- 계획 컬렉션 가운데 켜진 것은 정확히 첫 공개 ${nOpen}개다
  SELECT count(*) FILTER (WHERE lb.is_initial), count(*) FILTER (WHERE NOT lb.is_initial) INTO v_n, v_off
    FROM _jam2_launch_book lb JOIN public.item_books ib ON ib.id = lb.book_id
   WHERE ib.is_active;
  IF v_n <> ${nOpen} OR v_off <> 0 THEN
    RAISE EXCEPTION '끝 검사: 계획 컬렉션 가운데 켜진 첫 공개가 %개, 켜진 첫 공개 밖이 %개입니다(기대 ${nOpen}, 0).', v_n, v_off;
  END IF;

  -- 끈 컬렉션 ${nClose}개의 is_active를 뺀 나머지 열이 백업과 같다
  SELECT count(*) INTO v_n
    FROM public.item_books ib
    JOIN _jam2_close_book c ON c.book_id = ib.id
    JOIN public.${B} s ON s.kind = 'item_book' AND s.row_id = ib.id
   WHERE to_jsonb(ib) - 'is_active' = s.snapshot - 'is_active';
  IF v_n <> ${nClose} THEN
    RAISE EXCEPTION '끝 검사: is_active 밖의 열이 백업과 같은 컬렉션이 %개입니다(기대 ${nClose}).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.${B} WHERE kind = 'item_book';
  IF v_n <> ${nClose} THEN
    RAISE EXCEPTION '끝 검사: 컬렉션 백업이 %건입니다(기대 ${nClose}).', v_n;
  END IF;
END $$;

DROP TABLE _jam2_close_book;
DROP TABLE _jam2_launch_book;
`;

  const rollback = commentBlock([
    '되돌림 SQL',
    `끈 컬렉션 ${nClose}개를 백업 표 ${B}의 is_active로 되돌린다. 한 번의 호출로 통째로 실행한다.`,
    `오픈 뒤 운영자가 어드민에서 이 ${nClose}개 가운데 일부를 이미 켰다면 이 UPDATE는 그것도 백업 값(켜짐)으로 맞춘다. 일부만 되돌리려면 row_id 조건을 더한다.`,
    '',
    '1) 끈 컬렉션 되돌리기 (is_active)',
    'UPDATE public.item_books ib',
    "   SET is_active = (s.snapshot->>'is_active')::boolean",
    `  FROM public.${B} s`,
    " WHERE s.kind = 'item_book' AND s.row_id = ib.id;",
    '',
    '2) 되돌린 뒤 확인: 아래가 0이어야 한다 (백업 값과 다른 행)',
    `SELECT count(*) FROM public.item_books ib JOIN public.${B} s ON s.kind = 'item_book' AND s.row_id = ib.id WHERE to_jsonb(ib) <> s.snapshot;`,
    '',
    `3) 백업 표 지우기: 293(첫 공개 단서 레시피 열기)도 같은 표 ${B}를 쓰므로 292와 293을 모두 되돌린 뒤에만 지운다`,
    `DROP TABLE IF EXISTS public.${B};`
  ]);

  return `${header}\n${body}\n${rollback}\n`;
}

// ────────────────────────────────────────────────────────────
// 293 — 첫 공개 단서 레시피 28건 열기
// ────────────────────────────────────────────────────────────

export function genOpenRecipeSql(clues, plan) {
  const open = selectOpenClues(clues);
  const e = launchExpectation(plan, clues);
  const { initial } = splitLaunchBooks(plan);
  const T = CLUE_TIERS.length;
  const B = LAUNCH_BACKUP_TABLE;
  const names = open.map((c) => q(c.name)).join(', ');
  const nameValues = open
    .map((c) => `  (${q(c.name)}, ${q(c.ingredientBook.tribe)}, ${q(c.ingredientBook.book)}, ${q(c.rewardBook.tribe)}, ${q(c.rewardBook.book)})`)
    .join(',\n');
  const openBookValues = initial.map((b) => `  (${q(b.tribe)}, ${q(b.book)})`).join(',\n');

  const header = commentBlock([
    OPEN_RECIPE_FILE.file,
    `JAM 2.0 묶음 7 · 7-9: 첫 공개 단서 레시피 ${e.openRecipes}건 열기 (단서 ${e.openClues}개 × 등급 ${T}개, 티켓 ${TICKET})`,
    '',
    '이 파일은 gen-launch-sql.mjs가 단서 레시피 원고(docs/plan/jam2/tribe-rethink/manuscript/07 단서 레시피.md)와',
    '7-6 계획에서 만든다. 손으로 고치지 말고 생성기를 고쳐 다시 만든다',
    '(node scripts/jam2-content/gen-launch-sql.mjs --write). 시험이 생성 결과와 이 파일이 같은지 비교한다.',
    '',
    '이 파일은 오픈 직전에 적용한다(7-9 목록). 지금 적용하지 않는다.',
    '',
    '하는 일 (한 트랜잭션, 파일만 쓰고 실행은 오픈 직전에 카리나가 드라이런·롤백 실측과 함께 한다)',
    `  1. 281이 넣은 단서 레시피 ${e.totalClueRecipes}건(단서 ${clues.length}개 × 등급 ${T}개)은 모두 공개 시작 자리 값(${CLUE_VALID_FROM}, 2099-01-01 00:00 KST)이다.`,
    `     이 가운데 재료 컬렉션과 보상 컬렉션이 모두 첫 공개 컬렉션 ${initial.length}개 안에 있는 단서 ${e.openClues}개(${e.openRecipes}건)만 valid_from을 NULL로 바꿔 연다.`,
    `     나머지 단서 ${clues.length - e.openClues}개(${e.keptRecipes}건)는 재료나 보상 컬렉션이 꺼 두는 컬렉션에 있어서 자리 값으로 남긴다. 오픈 뒤 운영자가 컬렉션을 켤 때 따로 연다.`,
    '     valid_from 하나만 바꾼다. valid_until, 칸(combination_recipe_slots), 보상 열은 건드리지 않는다.',
    `  2. 열기 직전의 행 전체를 백업 표 ${B}에 combination_recipe 종류로 담고(${e.openRecipes}건), 되돌림 SQL이 그 표를 쓴다.`,
    '',
    `열 단서 ${e.openClues}개 (이름 / 재료 컬렉션 / 보상 컬렉션) — 이름마다 ${T}행`,
    ...open.map((c) => `  ${c.name} / ${c.ingredientBook.tribe}·${c.ingredientBook.book} / ${c.rewardBook.tribe}·${c.rewardBook.book}`),
    '',
    '찾는 방법과 멈추는 조건',
    `  - ${e.openClues}개 이름을 combination_recipes.name으로 찾는다. 이름마다 정확히 ${T}행이어야 하고, ${T}행 모두 valid_from이 자리 값이며 valid_until이 비어 있어야 한다.`,
    '    하나라도 어긋나면 멈춘다(이미 열었거나 281이 적용되지 않았다는 뜻이다).',
    '  - 이름마다 재료 컬렉션과 보상 컬렉션을 DB에서 다시 구한다(칸의 allowed_badge_ids → badges.item_book_id → item_books → tribes, 보상은 reward_badge_ids로 같은 경로).',
    '    위 표의 컬렉션과 정확히 같지 않으면 멈춘다. 그리고 그 컬렉션이 첫 공개 컬렉션에 들지 않거나 is_active가 아니면 멈춘다.',
    '    이 검사는 292보다 먼저 실행해도 292 뒤에 실행해도 통과한다(첫 공개 컬렉션은 어느 쪽이든 켜져 있다).',
    `  - 열기 전에, ${e.openClues}개 이름을 뺀 나머지 중 valid_from이 자리 값인 행이 정확히 ${e.keptRecipes}행인지 확인한다(${e.totalClueRecipes}행 - ${e.openRecipes}행). 아니면 다른 세션이 레시피를 건드렸다는 뜻이므로 멈춘다.`,
    `  - 끝에서 ${e.openRecipes}행의 valid_from이 NULL인지, 자리 값으로 남은 행이 ${e.keptRecipes}행인지, ${e.openRecipes}행의 valid_from을 뺀 나머지 열이 백업과 같은지, 백업이 ${e.openRecipes}건인지 검사하고`,
    '    어긋나면 전체를 되돌린다(트랜잭션).',
    '  - 적용된 뒤에는 자리 값인 행이 없어지므로 같은 파일을 다시 실행하면 멈춘다.',
    '',
    '적용 순서: 281(단서 레시피 입력) 적용 뒤, 오픈 직전. 292(예약 컬렉션 끄기)와는 순서가 상관없다.',
    '실행: BEGIN/COMMIT 없이 한 번의 호출로 통째로 실행한다. 롤백 실측은 이 파일 뒤에 일부러 오류를 내는 문장을 붙여 같은 호출로 실행한다.',
    '',
    '적용 전 확인 쿼리(읽기 전용 SELECT):',
    `  -- 열 단서 ${e.openClues}개 이름의 행이 모두 자리 값 공개 시작이고 종료 시각이 없다 (${e.openRecipes})`,
    '  SELECT count(*) FROM public.combination_recipes',
    `   WHERE name IN (${names}) AND valid_from = ${VALID_FROM_SQL} AND valid_until IS NULL;`,
    `  -- 열 단서를 뺀 자리 값 행 (${e.keptRecipes})`,
    '  SELECT count(*) FROM public.combination_recipes',
    `   WHERE valid_from = ${VALID_FROM_SQL} AND name NOT IN (${names});`,
    `  -- 백업 표 (292보다 먼저 실행하면 NULL, 292 뒤에는 표 이름)`,
    `  SELECT to_regclass('public.${B}');`,
    '',
    '적용 후 확인 쿼리(읽기 전용 SELECT):',
    `  -- 열린 레시피 ${e.openRecipes}건: 공개 시작이 비어 있다 (${e.openRecipes})`,
    '  SELECT count(*) FROM public.combination_recipes',
    `   WHERE name IN (${names}) AND valid_from IS NULL;`,
    `  -- 자리 값으로 남은 레시피 (${e.keptRecipes})`,
    `  SELECT count(*) FROM public.combination_recipes WHERE valid_from = ${VALID_FROM_SQL};`,
    `  -- 백업 건수 (combination_recipe ${e.openRecipes})`,
    `  SELECT kind, count(*) FROM public.${B} GROUP BY kind ORDER BY kind;`
  ]);

  const body = `
${backupTableSql()}
-- ----------------------------------------------------------------
-- 1. 열 단서 ${e.openClues}개를 이름으로 찾고, 이름마다 정확히 ${T}행이 자리 값 공개 시작인지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp._jam2_launch_ref;
DROP TABLE IF EXISTS pg_temp._jam2_launch_recipe;
DROP TABLE IF EXISTS pg_temp._jam2_launch_open_book;
DROP TABLE IF EXISTS pg_temp._jam2_launch_clue;

-- 열 단서 ${e.openClues}개: 이름과, 위 표에서 정한 재료 컬렉션·보상 컬렉션(트라이브 이름, 컬렉션 이름)
CREATE TEMP TABLE _jam2_launch_clue (
  name              TEXT PRIMARY KEY,
  ingredient_tribe  TEXT NOT NULL,
  ingredient_book   TEXT NOT NULL,
  reward_tribe      TEXT NOT NULL,
  reward_book       TEXT NOT NULL,
  recipe_rows       INTEGER,
  placeholder_rows  INTEGER
);

INSERT INTO _jam2_launch_clue (name, ingredient_tribe, ingredient_book, reward_tribe, reward_book) VALUES
${nameValues};

UPDATE _jam2_launch_clue c
   SET recipe_rows      = (SELECT count(*) FROM public.combination_recipes r WHERE r.name = c.name),
       placeholder_rows = (SELECT count(*) FROM public.combination_recipes r
                            WHERE r.name = c.name AND r.valid_from = ${VALID_FROM_SQL} AND r.valid_until IS NULL);

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_launch_clue WHERE recipe_rows IS DISTINCT FROM ${T};
  IF v_n > 0 THEN
    RAISE EXCEPTION '단서 레시피를 이름으로 찾았을 때 ${T}행이 아닌 이름이 %개입니다(기대: ${e.openClues}개 모두 ${T}행). 281이 적용되지 않았거나 같은 이름의 레시피가 따로 있습니다.', v_n;
  END IF;

  SELECT count(*) INTO v_n FROM _jam2_launch_clue WHERE placeholder_rows IS DISTINCT FROM ${T};
  IF v_n > 0 THEN
    RAISE EXCEPTION '${T}행이 모두 공개 시작 자리 값(${CLUE_VALID_FROM})이고 종료 시각이 비어 있어야 하는데 그렇지 않은 이름이 %개입니다. 이미 열었거나 운영자가 바꾼 레시피가 있습니다.', v_n;
  END IF;
END $$;

CREATE TEMP TABLE _jam2_launch_recipe AS
  SELECT r.id AS recipe_id, r.name
    FROM public.combination_recipes r
    JOIN _jam2_launch_clue c ON c.name = r.name;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n FROM _jam2_launch_recipe;
  IF v_n <> ${e.openRecipes} THEN
    RAISE EXCEPTION '열 레시피가 %건입니다(기대 ${e.openRecipes}건 = ${e.openClues}개 이름 × ${T}행).', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 2. 재료 컬렉션과 보상 컬렉션을 DB에서 다시 구해 위 표와 대조하고, 모두 첫 공개 ${initial.length}개에 들고 켜져 있는지 확인한다
-- ----------------------------------------------------------------
-- 첫 공개 컬렉션 ${initial.length}개 (트라이브 이름, 컬렉션 이름)
CREATE TEMP TABLE _jam2_launch_open_book (
  tribe  TEXT NOT NULL,
  book   TEXT NOT NULL,
  PRIMARY KEY (tribe, book)
);

INSERT INTO _jam2_launch_open_book (tribe, book) VALUES
${openBookValues};

-- 레시피마다 칸의 후보 배지(재료)와 보상 배지가 속한 컬렉션. 배지나 컬렉션을 찾지 못하면 이름이 NULL로 남아 아래 대조에서 걸린다
CREATE TEMP TABLE _jam2_launch_ref AS
SELECT r.recipe_id, 'ingredient'::text AS part, t.name AS tribe, ib.name AS book, ib.is_active AS book_active
  FROM _jam2_launch_recipe r
  JOIN public.combination_recipe_slots s ON s.recipe_id = r.recipe_id
 CROSS JOIN LATERAL unnest(s.allowed_badge_ids) AS a(badge_id)
  LEFT JOIN public.badges b ON b.id = a.badge_id
  LEFT JOIN public.item_books ib ON ib.id = b.item_book_id
  LEFT JOIN public.tribes t ON t.id = ib.tribe_id
UNION ALL
SELECT r.recipe_id, 'reward'::text, t.name, ib.name, ib.is_active
  FROM _jam2_launch_recipe r
  JOIN public.combination_recipes cr ON cr.id = r.recipe_id
 CROSS JOIN LATERAL unnest(cr.reward_badge_ids) AS a(badge_id)
  LEFT JOIN public.badges b ON b.id = a.badge_id
  LEFT JOIN public.item_books ib ON ib.id = b.item_book_id
  LEFT JOIN public.tribes t ON t.id = ib.tribe_id;

DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 재료: 레시피마다 칸의 후보가 있고, 후보가 모두 위 표의 재료 컬렉션 한 곳이다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_recipe r JOIN _jam2_launch_clue c ON c.name = r.name
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_ref f WHERE f.recipe_id = r.recipe_id AND f.part = 'ingredient')
      OR EXISTS (SELECT 1 FROM _jam2_launch_ref f
                  WHERE f.recipe_id = r.recipe_id AND f.part = 'ingredient'
                    AND (f.tribe IS DISTINCT FROM c.ingredient_tribe OR f.book IS DISTINCT FROM c.ingredient_book));
  IF v_n > 0 THEN
    RAISE EXCEPTION '재료 칸의 컬렉션이 위 표와 다르거나 후보가 없는 레시피가 %건입니다(기대 0건). 레시피의 재료가 바뀌었는지 확인한 뒤 판단합니다.', v_n;
  END IF;

  -- 보상: 레시피마다 보상 배지가 있고, 보상이 모두 위 표의 보상 컬렉션 한 곳이다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_recipe r JOIN _jam2_launch_clue c ON c.name = r.name
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_ref f WHERE f.recipe_id = r.recipe_id AND f.part = 'reward')
      OR EXISTS (SELECT 1 FROM _jam2_launch_ref f
                  WHERE f.recipe_id = r.recipe_id AND f.part = 'reward'
                    AND (f.tribe IS DISTINCT FROM c.reward_tribe OR f.book IS DISTINCT FROM c.reward_book));
  IF v_n > 0 THEN
    RAISE EXCEPTION '보상 배지의 컬렉션이 위 표와 다르거나 보상이 없는 레시피가 %건입니다(기대 0건). 레시피의 보상이 바뀌었는지 확인한 뒤 판단합니다.', v_n;
  END IF;

  -- 재료·보상 컬렉션이 모두 첫 공개 ${initial.length}개에 들고 켜져 있다
  SELECT count(*) INTO v_n
    FROM _jam2_launch_ref f
   WHERE NOT EXISTS (SELECT 1 FROM _jam2_launch_open_book o WHERE o.tribe = f.tribe AND o.book = f.book)
      OR f.book_active IS NOT TRUE;
  IF v_n > 0 THEN
    RAISE EXCEPTION '재료·보상 배지의 컬렉션 가운데 첫 공개 ${initial.length}개 밖이거나 꺼져 있는 것이 %개입니다(기대 0개). 컬렉션이 꺼진 채로 레시피를 열면 유저가 쓸 수 없습니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 3. 열 단서를 뺀 나머지 중 공개 시작이 자리 값인 행이 정확히 ${e.keptRecipes}행인지 확인한다. 아니면 멈춘다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  SELECT count(*) INTO v_n
    FROM public.combination_recipes r
   WHERE r.valid_from = ${VALID_FROM_SQL}
     AND NOT EXISTS (SELECT 1 FROM _jam2_launch_clue c WHERE c.name = r.name);
  IF v_n <> ${e.keptRecipes} THEN
    RAISE EXCEPTION '열 단서를 뺀 나머지 중 공개 시작이 자리 값인 행이 %행입니다(기대 ${e.keptRecipes}행 = ${e.totalClueRecipes}행 - ${e.openRecipes}행). 다른 세션이 레시피를 건드렸을 수 있습니다. 실제 건수를 확인한 뒤 판단합니다.', v_n;
  END IF;
END $$;

-- ----------------------------------------------------------------
-- 4. 열기 직전 상태를 백업 표에 기록한다 (이미 있으면 지금 값으로 갱신 — 열기 전이므로 지금이 원본이다)
-- ----------------------------------------------------------------
INSERT INTO public.${B} (kind, row_id, snapshot)
SELECT 'combination_recipe', cr.id, to_jsonb(cr)
  FROM public.combination_recipes cr
  JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
ON CONFLICT (kind, row_id) DO UPDATE
  SET snapshot = EXCLUDED.snapshot, backed_up_at = now();

-- ----------------------------------------------------------------
-- 5. 열기: valid_from만 NULL로 바꾼다 (valid_until, 칸, 보상 열은 건드리지 않는다)
-- ----------------------------------------------------------------
UPDATE public.combination_recipes cr
   SET valid_from = NULL
  FROM _jam2_launch_recipe r
 WHERE cr.id = r.recipe_id;

-- ----------------------------------------------------------------
-- 6. 끝 검사 — 어긋나면 오류로 멈추고 트랜잭션 전체가 되돌아간다
-- ----------------------------------------------------------------
DO $$
DECLARE
  v_n INTEGER;
BEGIN
  -- 열린 레시피 ${e.openRecipes}행의 공개 시작이 비어 있다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
   WHERE cr.valid_from IS NULL;
  IF v_n <> ${e.openRecipes} THEN
    RAISE EXCEPTION '끝 검사: 공개 시작이 비어 있는 열린 레시피가 %건입니다(기대 ${e.openRecipes}).', v_n;
  END IF;

  -- 자리 값으로 남은 행이 ${e.keptRecipes}행이다
  SELECT count(*) INTO v_n FROM public.combination_recipes WHERE valid_from = ${VALID_FROM_SQL};
  IF v_n <> ${e.keptRecipes} THEN
    RAISE EXCEPTION '끝 검사: 공개 시작이 자리 값으로 남은 레시피가 %건입니다(기대 ${e.keptRecipes}).', v_n;
  END IF;

  -- 열린 ${e.openRecipes}행의 valid_from을 뺀 나머지 열이 백업과 같다
  SELECT count(*) INTO v_n
    FROM public.combination_recipes cr
    JOIN _jam2_launch_recipe r ON r.recipe_id = cr.id
    JOIN public.${B} s ON s.kind = 'combination_recipe' AND s.row_id = cr.id
   WHERE to_jsonb(cr) - 'valid_from' = s.snapshot - 'valid_from';
  IF v_n <> ${e.openRecipes} THEN
    RAISE EXCEPTION '끝 검사: valid_from 밖의 열이 백업과 같은 레시피가 %건입니다(기대 ${e.openRecipes}).', v_n;
  END IF;

  -- 백업 건수
  SELECT count(*) INTO v_n FROM public.${B} WHERE kind = 'combination_recipe';
  IF v_n <> ${e.openRecipes} THEN
    RAISE EXCEPTION '끝 검사: 레시피 백업이 %건입니다(기대 ${e.openRecipes}).', v_n;
  END IF;
END $$;

DROP TABLE _jam2_launch_ref;
DROP TABLE _jam2_launch_recipe;
DROP TABLE _jam2_launch_open_book;
DROP TABLE _jam2_launch_clue;
`;

  const rollback = commentBlock([
    '되돌림 SQL',
    `연 레시피 ${e.openRecipes}건을 백업 표 ${B}의 valid_from(자리 값)으로 되돌린다. 한 번의 호출로 통째로 실행한다.`,
    '연 뒤에 유저가 이미 믹스했을 수 있다. 그때는 먼저 user_combine_success_logs와 user_combine_fail_logs를 확인하고,',
    '배지 조건(condition_json.recipe_first_success)이 이 레시피를 가리키는지도 확인한다(삭제 가드와 같다).',
    '연 뒤에 운영자가 같은 레시피의 공개 시작을 따로 바꿨다면 아래 확인 쿼리가 0이 아닐 수 있다. 그때는 달라진 행을 보고 판단한다.',
    '',
    '1) 연 레시피 되돌리기 (valid_from)',
    'UPDATE public.combination_recipes cr',
    "   SET valid_from = (s.snapshot->>'valid_from')::timestamptz",
    `  FROM public.${B} s`,
    " WHERE s.kind = 'combination_recipe' AND s.row_id = cr.id;",
    '',
    '2) 되돌린 뒤 확인: 아래가 0이어야 한다 (백업 값과 다른 행)',
    `SELECT count(*) FROM public.combination_recipes cr JOIN public.${B} s ON s.kind = 'combination_recipe' AND s.row_id = cr.id WHERE to_jsonb(cr) <> s.snapshot;`,
    '',
    `3) 백업 표 지우기: 292(예약 컬렉션 끄기)도 같은 표 ${B}를 쓰므로 292와 293을 모두 되돌린 뒤에만 지운다`,
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
    [CLOSE_FILE.file]: genCloseSql(plan),
    [OPEN_RECIPE_FILE.file]: genOpenRecipeSql(clues, plan)
  };
}

function main() {
  const args = process.argv.slice(2);
  const plan = buildPlan();
  const clues = buildClues(undefined, plan);

  if (args.includes('--dry')) {
    const e = launchExpectation(plan, clues);
    console.log(`292 컬렉션 끄기: 계획 ${e.plannedBooks} / 열림 ${e.openBooks} / 끄기 ${e.closeBooks}`);
    console.log(
      `293 단서 레시피 열기: 단서 ${e.openClues}개 / ${e.openRecipes}행 / 자리 값 ${e.keptRecipes}행 남김 (단서 레시피 전체 ${e.totalClueRecipes}행)`
    );
    for (const c of selectOpenClues(clues)) {
      console.log(`  ${c.name}: 재료 ${c.ingredientBook.tribe}/${c.ingredientBook.book} → 보상 ${c.rewardBook.tribe}/${c.rewardBook.book}`);
    }
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
