// 티켓 20261022_1137(7-6): SQL 생성기 — 행 수, 안전장치, 커밋된 SQL 파일과 생성 결과의 일치를 검사한다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKGROUND_COLUMNS,
  BACKUP_FILE,
  BACKUP_TABLE,
  DB_NAME_OVERRIDES,
  FIRST_ROUND_TRIBES,
  MIGRATIONS_DIR,
  TRIBE_FILES,
  buildOutputs,
  buildPlan,
  countPlan,
  countTribe,
  genBackupSql,
  genTribeSql,
  q
} from '../gen-content-sql.mjs';
import { MANUSCRIPT_DIR, RARITIES, parseManuscripts } from '../parse-manuscript.mjs';
import { readPairingJson } from '../parse-pairing-doc.mjs';

const plan = buildPlan();
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

describe('계획: 원고와 짝짓기 데이터를 합친다', () => {
  it('공용 DB 이름이 원고와 다른 컬렉션은 «무명(無名)을 쫓는 야식가들» 하나로 선언돼 있다', () => {
    expect(DB_NAME_OVERRIDES).toEqual({ '무명(無名)을 쫓는 야식가들': '무명無名을 쫓는 야식가들' });
    const book = plan.tribes[0].books[0];
    expect(book.name).toBe('무명을 쫓는 야식가들');
    expect(book.oldName).toBe('무명無名을 쫓는 야식가들');
  });

  it('원고와 짝짓기가 어긋나면 멈춘다', () => {
    const manuscript = parseManuscripts();
    const json = readPairingJson();
    const broken = structuredClone(json);
    broken.tribes[0].collections[0].items[0].name = '다른 이름';
    expect(() => buildPlan(manuscript, broken)).toThrow('아이템 이름');
    const broken2 = structuredClone(json);
    broken2.tribes[0].collections[0].oldBookName = '무명(無名)을 쫓는 야식가들';
    expect(() => buildPlan(manuscript, broken2)).toThrow('옛 컬렉션 이름');
    const broken3 = structuredClone(json);
    broken3.tribes[2].collections[6].oldBookName = '없는 컬렉션';
    expect(() => buildPlan(manuscript, broken3)).toThrow('옛 컬렉션 이름');
  });
});

describe('건수', () => {
  it('컬렉션 50개(덮어쓰기 44, 새로 6), 옛 행 덮어쓰기 396, 새 행 1,404, 배지 합계 1,800이다', () => {
    expect(countPlan(plan)).toEqual({
      books: 50,
      overwriteBooks: 44,
      newBooks: 6,
      items: 450,
      overwriteBadges: 396,
      newItems: 54,
      newBadges: 1404,
      totalBadges: 1800
    });
  });

  it('트라이브마다 배지 합계는 360개이고 새 행은 컬렉션 구성에 따라 270~306개다', () => {
    const per = Object.fromEntries(plan.tribes.map((t) => [t.name, countTribe(t)]));
    for (const c of Object.values(per)) expect(c.totalBadges).toBe(360);
    expect(per['한입만 연구회']).toMatchObject({ overwriteBooks: 10, newBooks: 0, overwriteBadges: 90, newBadges: 270 });
    expect(per['비사이드 레코즈']).toMatchObject({ overwriteBooks: 6, newBooks: 4, overwriteBadges: 54, newBadges: 306 });
    expect(per['혼자들']).toMatchObject({ overwriteBooks: 8, newBooks: 2, overwriteBadges: 72, newBadges: 288 });
  });
});

describe('생성된 SQL이 계획을 그대로 담는다', () => {
  for (const name of Object.keys(TRIBE_FILES)) {
    it(`${name}: 컬렉션·아이템 값이 계획과 같고 옛 이름 유무가 계획과 같다`, () => {
      const tribe = plan.tribes.find((t) => t.name === name);
      const sql = genTribeSql(plan, name);

      const bookRows = readInsertRows(sql, '_jam2_book');
      expect(bookRows).toEqual(tribe.books.map((b) => [b.no, b.name, b.oldName, b.summary]));

      const itemRows = readInsertRows(sql, '_jam2_item');
      expect(itemRows).toEqual(
        tribe.books.flatMap((b) => b.items.map((i) => [b.no, i.no, i.name, i.oldName, ...RARITIES.map((r) => i.descriptions[r])]))
      );
      expect(itemRows).toHaveLength(90);

      const c = countTribe(tribe);
      expect(itemRows.filter((r) => r[3] !== null)).toHaveLength(c.overwriteBadges);
      expect(itemRows.filter((r) => r[3] === null)).toHaveLength(c.newItems);
      expect(bookRows.filter((r) => r[2] === null)).toHaveLength(c.newBooks);
    });
  }

  it('설명 1,800개가 다섯 트라이브 SQL에 한 번씩 들어 있다', () => {
    let found = 0;
    for (const name of Object.keys(TRIBE_FILES)) {
      const sql = genTribeSql(plan, name);
      for (const t of plan.tribes.filter((x) => x.name === name)) {
        for (const b of t.books) for (const i of b.items) for (const r of RARITIES) if (sql.includes(q(i.descriptions[r]))) found++;
      }
    }
    expect(found).toBe(1800);
  });

  it('같은 입력이면 같은 SQL이 나온다', () => {
    expect(genTribeSql(plan, '한입만 연구회')).toBe(genTribeSql(buildPlan(), '한입만 연구회'));
    expect(genBackupSql(plan)).toBe(genBackupSql(buildPlan()));
  });
});

describe('안전장치', () => {
  const sqls = {
    backup: genBackupSql(plan),
    ...Object.fromEntries(Object.keys(TRIBE_FILES).map((n) => [n, genTribeSql(plan, n)]))
  };

  for (const [key, sql] of Object.entries(sqls)) {
    it(`${key}: 배지·컬렉션 id를 적지 않고 BEGIN/COMMIT도 쓰지 않는다`, () => {
      expect(sql).not.toMatch(UUID);
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
    });

    it(`${key}: 파일 끝에 되돌림 SQL이 있고 백업 표를 쓴다(deploy-gate 표식)`, () => {
      expect(sql).toMatch(ROLLBACK_MARKER);
      const tail = sql.slice(sql.lastIndexOf('-- 되돌림 SQL'));
      expect(tail).toContain(BACKUP_TABLE);
      // 되돌림 SQL 아래는 모두 주석이라 실수로 실행되지 않는다
      for (const line of tail.split('\n').filter((l) => l.trim() !== '')) expect(line.startsWith('--')).toBe(true);
    });

    it(`${key}: 머리말에 적용 전·후 확인 SELECT가 있다`, () => {
      expect(sql).toContain('적용 전 확인 쿼리(읽기 전용 SELECT)');
      expect(sql).toContain('적용 후 확인 쿼리(읽기 전용 SELECT)');
    });
  }

  for (const name of Object.keys(TRIBE_FILES)) {
    const sql = sqls[name];
    it(`${name}: 이름으로 찾고 기대와 다르면 멈추며, 새 트라이브가 없어도 멈춘다`, () => {
      expect(sql).toContain(`SELECT id AS tribe_id FROM public.tribes WHERE name = ${q(name)}`);
      expect(sql).toContain(`트라이브 «${name}»가 %개입니다(1개여야 합니다)`);
      expect(sql).toContain('book_matches IS DISTINCT FROM 1');
      expect(sql).toContain('old_badge_matches IS DISTINCT FROM 1');
      expect(sql).toContain('<> 9');
      expect(sql).toContain("b.rarity IS DISTINCT FROM 'common'");
      expect(sql).toContain('끝 검사');
    });

    it(`${name}: badges.tribe_id와 item_books.tribe_id를 함께 새 트라이브로 바꾼다`, () => {
      expect(sql).toMatch(/UPDATE public\.item_books ib[\s\S]*?tribe_id\s+= c\.tribe_id[\s\S]*?tier_mode\s+= true/);
      expect(sql).toMatch(/UPDATE public\.badges b[\s\S]*?tribe_id\s+= c\.tribe_id/);
    });

    it(`${name}: 이미지는 비우고 소프트 삭제를 풀며, point_reward는 건드리지 않는다`, () => {
      const upd = sql.slice(sql.indexOf('UPDATE public.badges b'), sql.indexOf('-- 5.'));
      expect(upd).toContain('image_url    = NULL');
      expect(upd).toContain('image_source = NULL');
      expect(upd).toContain('deleted_at   = NULL');
      expect(upd).not.toContain('point_reward');
      expect(upd).not.toContain('reward_points');
      const bookUpd = sql.slice(sql.indexOf('UPDATE public.item_books ib'), sql.indexOf('UPDATE public.badges b'));
      expect(bookUpd).not.toContain('reward_points');
      expect(bookUpd).not.toContain('reward_badge_id');
      expect(bookUpd).toContain('story_text   = NULL');
    });

    it(`${name}: 새 배지 행은 point_reward와 이미지를 넣지 않는다`, () => {
      for (const m of sql.matchAll(/INSERT INTO public\.badges \(([\s\S]*?)\)\s*SELECT/g)) {
        expect(m[1]).not.toContain('point_reward');
        expect(m[1]).not.toContain('image_url');
        expect(m[1]).not.toContain('image_source');
      }
    });

    it(`${name}: 덮어쓰는 컬렉션과 옛 배지 행의 배경 칸 ${BACKGROUND_COLUMNS.length}개를 모두 NULL로 비운다`, () => {
      const bookUpd = sql.match(/UPDATE public\.item_books ib[\s\S]*?;/)[0];
      const badgeUpd = sql.match(/UPDATE public\.badges b[\s\S]*?;/)[0];
      for (const c of BACKGROUND_COLUMNS) {
        expect(bookUpd, `컬렉션 ${c}`).toMatch(new RegExp(`^\\s+${c} = NULL,?$`, 'm'));
        expect(badgeUpd, `배지 ${c}`).toMatch(new RegExp(`^\\s+${c} = NULL,?$`, 'm'));
      }
      // 덮어쓰기 UPDATE는 두 표 모두 이 칸들을 한 번씩만 건드리고, 값을 채우는 대입은 없다
      for (const upd of [bookUpd, badgeUpd]) {
        expect(upd.match(/background_\w+ = /g)).toHaveLength(BACKGROUND_COLUMNS.length);
        expect(upd).not.toMatch(/background_\w+ = (?!NULL)/);
      }
    });

    it(`${name}: 새 행은 배경 칸을 따로 넣지 않아 기본값(NULL)을 쓴다`, () => {
      const inserts = [...sql.matchAll(/INSERT INTO public\.(?:badges|item_books) \(([\s\S]*?)\)\s*(?:SELECT|VALUES)/g)];
      expect(inserts.length).toBeGreaterThan(0);
      for (const m of inserts) expect(m[1]).not.toContain('background');
    });

    it(`${name}: 끝 검사가 컬렉션과 배지 전체의 배경 칸이 비었는지 확인한다`, () => {
      const endCheck = sql.slice(sql.indexOf('-- 6. 끝 검사'), sql.lastIndexOf('-- 되돌림 SQL'));
      expect(endCheck).toContain('DROP TABLE _jam2_new_badge');
      for (const c of BACKGROUND_COLUMNS) {
        expect(endCheck, `컬렉션 ${c}`).toContain(`ib.${c} IS NULL`);
        expect(endCheck, `배지 ${c}`).toContain(`b.${c} IS NULL`);
      }
    });

    it(`${name}: 되돌림 SQL이 배경 칸 ${BACKGROUND_COLUMNS.length}개를 백업 값으로 복원한다(JSONB 칸은 JSON null을 SQL NULL로)`, () => {
      const tail = sql.slice(sql.lastIndexOf('-- 되돌림 SQL'));
      for (const c of BACKGROUND_COLUMNS) {
        const restore =
          c === 'background_animation' ? `${c} = NULLIF(s.snapshot->'${c}', 'null'::jsonb)` : `${c} = s.snapshot->>'${c}'`;
        // 배지 되돌림과 컬렉션 되돌림에 한 번씩
        expect(tail.split(restore).length - 1, c).toBe(2);
      }
    });

    it(`${name}: 머리말이 배경 칸 비우기를 설명하고 적용 전·후 확인 SELECT가 배경 칸을 센다`, () => {
      const head = sql.slice(0, sql.indexOf('\nDROP TABLE IF EXISTS pg_temp._jam2_ctx'));
      expect(head).toContain(`배경 칸 ${BACKGROUND_COLUMNS.length}개(${BACKGROUND_COLUMNS.join(', ')})`);
      expect(head.split('AS books_with_background').length - 1).toBe(2);
      expect(head.split('AS badges_with_background').length - 1).toBe(2);
      expect(head).toContain('배경 칸이 남은 컬렉션·배지 (0, 0)');
    });
  }

  it('새 컬렉션이 있는 트라이브만 컬렉션 INSERT와 new_item_book 기록을 만든다', () => {
    expect(sqls['한입만 연구회']).not.toContain('INSERT INTO public.item_books');
    expect(sqls['한입만 연구회']).not.toContain("'new_item_book', k.book_id");
    for (const n of ['비사이드 레코즈', '혼자들']) {
      expect(sqls[n]).toContain('INSERT INTO public.item_books');
      expect(sqls[n]).toContain("'new_item_book', k.book_id");
      expect(sqls[n]).toContain('DELETE FROM public.item_books');
    }
  });

  it('백업 SQL은 컬렉션 44개와 옛 배지 396개를 이름으로 찾는다', () => {
    const rows = readInsertRows(sqls.backup, '_jam2_backup_plan');
    expect(rows).toHaveLength(396);
    expect(new Set(rows.map((r) => `${r[0]}/${r[1]}`)).size).toBe(44);
    expect(sqls.backup).toContain("CHECK (kind IN ('item_book', 'badge', 'new_item_book', 'new_badge'))");
    expect(sqls.backup).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sqls.backup).toContain('REVOKE ALL ON');
  });

  it('백업 SQL은 행을 통째로(to_jsonb) 담아 배경 칸의 옛 값도 되돌림에 쓸 수 있다', () => {
    expect(sqls.backup).toContain('to_jsonb(ib)');
    expect(sqls.backup).toContain('to_jsonb(b)');
    expect(sqls.backup).toContain(`배경 칸 ${BACKGROUND_COLUMNS.length}개(${BACKGROUND_COLUMNS.join(', ')})`);
  });

  it('배경 칸 다섯 열은 생성 타입의 badges·item_books 두 표에 모두 있다(열 이름 오타 방지)', () => {
    const generated = fs.readFileSync(path.resolve(MIGRATIONS_DIR, '../../src/types/database.generated.ts'), 'utf8');
    const rowColumns = (table) => {
      const start = generated.indexOf(`      ${table}: {\n        Row: {\n`);
      expect(start, `${table} Row를 찾지 못했습니다`).toBeGreaterThanOrEqual(0);
      const end = generated.indexOf('        Insert: {', start);
      return [...generated.slice(start, end).matchAll(/^ {10}(\w+): /gm)].map((m) => m[1]);
    };
    expect(BACKGROUND_COLUMNS).toHaveLength(5);
    for (const table of ['badges', 'item_books']) {
      const cols = rowColumns(table);
      for (const c of BACKGROUND_COLUMNS) expect(cols, `${table}.${c}`).toContain(c);
    }
  });

  it('q는 작은따옴표를 겹쳐 쓰고 NUL 글자를 거부한다', () => {
    expect(q("좋아요' 하트")).toBe("'좋아요'' 하트'");
    expect(q('')).toBe("''");
    expect(() => q('a\0b')).toThrow();
    expect(() => q(null)).toThrow();
  });
});

describe('커밋된 마이그레이션 파일', () => {
  const allTribes = Object.keys(TRIBE_FILES);
  // 1회 몫(275, 276)에 2회 몫(277~280, 트라이브 네 개)을 더한 여섯 파일 전체
  const outputs = buildOutputs(plan, allTribes);

  it('1회 몫은 백업 표 SQL(275)과 한입만 연구회(276) 두 파일이다', () => {
    expect(Object.keys(buildOutputs(plan, FIRST_ROUND_TRIBES))).toEqual([BACKUP_FILE.file, TRIBE_FILES['한입만 연구회'].file]);
    expect(BACKUP_FILE.number).toBe(275);
    expect(TRIBE_FILES['한입만 연구회'].number).toBe(276);
  });

  it('2회 몫은 찰칵단(277)·비사이드 레코즈(278)·소나무 잡화점(279)·혼자들(280) 네 파일이다', () => {
    expect(TRIBE_FILES).toEqual({
      '한입만 연구회': { number: 276, file: '276_tribe_content_hanipman.sql' },
      찰칵단: { number: 277, file: '277_tribe_content_chalkak.sql' },
      '비사이드 레코즈': { number: 278, file: '278_tribe_content_bside.sql' },
      '소나무 잡화점': { number: 279, file: '279_tribe_content_sonamu.sql' },
      혼자들: { number: 280, file: '280_tribe_content_honjadeul.sql' }
    });
    expect(Object.keys(outputs)).toEqual([
      '275_content_overwrite_backup.sql',
      '276_tribe_content_hanipman.sql',
      '277_tribe_content_chalkak.sql',
      '278_tribe_content_bside.sql',
      '279_tribe_content_sonamu.sql',
      '280_tribe_content_honjadeul.sql'
    ]);
  });

  it('생성기 결과와 저장소의 SQL 파일 여섯 개가 한 글자도 다르지 않다(생성기를 고치면 --write로 다시 만든다)', () => {
    for (const [file, text] of Object.entries(outputs)) {
      expect(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'), file).toBe(text);
    }
  });

  it('275~280 번호를 쓰는 마이그레이션은 이 여섯 파일뿐이다', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^(27[5-9]|280)_/.test(f));
    expect(files.sort()).toEqual(Object.keys(outputs).sort());
  });

  it('커밋된 다섯 파일의 설명 1,800개가 원고 글자와 한 글자도 다르지 않다', () => {
    const manuscript = parseManuscripts();
    const rawNames = fs.readdirSync(MANUSCRIPT_DIR);
    let checked = 0;
    for (const mt of manuscript.tribes) {
      const file = TRIBE_FILES[mt.name].file;
      const rows = readInsertRows(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'), '_jam2_item');
      const expected = mt.collections.flatMap((c) => c.items.map((i) => ({ book: c.no, item: i })));
      expect(rows, file).toHaveLength(expected.length);

      // 원고 파일의 원문(파서를 거치지 않은 글자)
      const rawName = rawNames.find((f) => f.normalize('NFC') === mt.file);
      expect(rawName, `${mt.name} 원고 파일`).toBeTruthy();
      const raw = fs.readFileSync(path.join(MANUSCRIPT_DIR, rawName), 'utf8');

      rows.forEach((row, k) => {
        const { book, item } = expected[k];
        const where = `${file} ${book}-${item.no}`;
        expect(row.slice(0, 3), where).toEqual([book, item.no, item.name]);
        RARITIES.forEach((r, ri) => {
          const text = row[4 + ri];
          expect(text, `${where} ${r}`).toBe(item.descriptions[r]); // 파서 결과와 같다
          expect(raw.includes(text), `${where} ${r}: 원고 원문에 없다`).toBe(true); // 원문에 그대로 있다
          checked++;
        });
      });
    }
    expect(checked).toBe(1800);
  });

  it('파일 번호가 겹치지 않는다(전체 마이그레이션의 번호 접두어가 유일하다)', () => {
    const nums = fs
      .readdirSync(MIGRATIONS_DIR)
      // 되돌림 짝 파일(`NNN_이름_down.sql`)은 본 파일과 번호를 나눈다(db-migration-rules.md §4의 둘째 형식)
      .filter((f) => !f.endsWith('_down.sql'))
      .map((f) => f.match(/^(\d{3})_/)?.[1])
      .filter(Boolean)
      .filter((n) => Number(n) >= 271);
    expect(new Set(nums).size).toBe(nums.length);
  });
});
