#!/usr/bin/env node
/**
 * parse-clue-recipes.mjs — 단서 레시피 원고(07)를 읽어 단서 레시피 20건을 JSON으로 만든다.
 * (티켓 20261022_1138, JAM 2.0 묶음 7의 7-7)
 *
 * 원고: docs/plan/jam2/tribe-rethink/manuscript/07 단서 레시피.md
 *   - 2절 «재료와 보상의 짝» 표: 번호(R01~R20), 방향, 단서, 재료(3~5개와 «(N개)»), 보상 1개.
 *     재료와 보상은 «컬렉션 번호-아이템 번호 이름»으로 적혀 있다.
 *   - 5절 «이름과 설명» 표: 번호, 보이스, 이름, 설명, 근거.
 * 원고는 읽기만 한다. 어긋나는 곳이 있으면 조용히 넘기지 않고 오류로 멈춘다.
 * 재료·보상의 번호와 이름이 트라이브 원고(01~05)와 같은지는 gen-recipe-sql.mjs가 계획과 맞춰 본다.
 *
 * 사용법
 *   node scripts/jam2-content/parse-clue-recipes.mjs              # JSON을 표준 출력에 쓴다
 *   node scripts/jam2-content/parse-clue-recipes.mjs --out a.json # 파일에 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANUSCRIPT_DIR, readTable } from './parse-manuscript.mjs';

/** 원고 방향 칸의 짧은 이름 → 트라이브 이름(원고 07 2절 아래 설명) */
export const TRIBE_BY_SHORT_NAME = {
  미식: '한입만 연구회',
  사진: '찰칵단',
  음악: '비사이드 레코즈',
  물건: '소나무 잡화점',
  내향인: '혼자들'
};

export const CLUE_COUNT = 20;
export const MIN_INGREDIENTS = 3;
export const MAX_INGREDIENTS = 5;
/** 레시피 설명 최대 글자 수 — 코드의 MAX_DESCRIPTION_LENGTH(src/lib/combine/recipe-payload.ts)와 같다 */
export const MAX_DESCRIPTION_LENGTH = 500;

/** 원고 07의 파일 이름을 폴더에서 찾는다(파일 이름의 한글 정규화 방식이 PC마다 달라도 찾는다). */
export function findClueFile(dir = MANUSCRIPT_DIR) {
  const found = fs.readdirSync(dir).filter((f) => /^07 .+\.md$/.test(f.normalize('NFC')));
  if (found.length !== 1) throw new Error(`원고 07 파일이 1개여야 하는데 ${found.length}개입니다 (${dir})`);
  return found[0];
}

/** `5-6 젓가락 포장지` 한 개를 읽는다. */
export function parseItemRef(text, where) {
  const m = text.trim().match(/^(\d+)-(\d+) (.+)$/);
  if (!m) throw new Error(`${where}: «컬렉션 번호-아이템 번호 이름» 형식이 아닙니다 (${text})`);
  const book = Number(m[1]);
  const item = Number(m[2]);
  if (book < 1 || book > 10) throw new Error(`${where}: 컬렉션 번호는 1~10이어야 합니다 (${text})`);
  if (item < 1 || item > 9) throw new Error(`${where}: 아이템 번호는 1~9여야 합니다 (${text})`);
  return { book, item, name: m[3].trim() };
}

/** `a, b, c (3개)` 재료 칸을 읽는다. «(N개)» 표기가 실제 개수와 같아야 한다. */
export function parseIngredients(text, where) {
  const m = text.trim().match(/^(.+) \((\d+)개\)$/);
  if (!m) throw new Error(`${where}: 재료 칸 끝에 «(N개)» 표기가 있어야 합니다 (${text.slice(0, 40)})`);
  const items = m[1].split(/,\s+/).map((part) => parseItemRef(part, where));
  if (items.length !== Number(m[2])) {
    throw new Error(`${where}: 재료 개수 표기 ${m[2]}개와 실제 ${items.length}개가 다릅니다`);
  }
  return items;
}

function sectionRange(lines, startPattern, endPattern, label) {
  const start = lines.findIndex((l) => startPattern.test(l));
  if (start < 0) throw new Error(`원고 07: «${label}» 절을 찾지 못했습니다`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (endPattern.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

function mustCells(row, count, where) {
  if (row.length !== count) {
    throw new Error(`${where}: 칸 수가 ${count}개여야 하는데 ${row.length}개입니다 (${row.join(' | ').slice(0, 60)})`);
  }
}

/** 원고 07 한 파일의 글을 읽어 단서 레시피 20건으로 만든다. */
export function parseClueRecipes(text, fileName = '07 단서 레시피.md') {
  const lines = text.split('\n');

  const sec2 = sectionRange(lines, /^## 2\. 재료와 보상의 짝/, /^## 3\. /, '2. 재료와 보상의 짝');
  const pairTable = readTable(lines, sec2.start + 1, sec2.end);
  if (!pairTable || pairTable.rows.length !== CLUE_COUNT) {
    throw new Error(`${fileName} 2절: 표에 단서 ${CLUE_COUNT}건이 있어야 합니다 (${pairTable?.rows.length ?? 0}건)`);
  }

  const sec5 = sectionRange(lines, /^## 5\. 이름과 설명/, /^## 6\. /, '5. 이름과 설명');
  const textTable = readTable(lines, sec5.start + 1, sec5.end);
  if (!textTable || textTable.rows.length !== CLUE_COUNT) {
    throw new Error(`${fileName} 5절: 표에 이름과 설명 ${CLUE_COUNT}건이 있어야 합니다 (${textTable?.rows.length ?? 0}건)`);
  }

  const clues = pairTable.rows.map((row, idx) => {
    const no = idx + 1;
    const code = `R${String(no).padStart(2, '0')}`;
    const where = `${fileName} 2절 ${code}`;
    mustCells(row, 5, where);
    const [rowCode, direction, clue, ingredientsRaw, rewardRaw] = row;
    if (rowCode !== code) throw new Error(`${where}: ${no}번째 줄의 번호가 ${rowCode}입니다 (${code}여야 합니다)`);

    const dir = direction.split('→').map((s) => s.trim());
    if (dir.length !== 2 || !TRIBE_BY_SHORT_NAME[dir[0]] || !TRIBE_BY_SHORT_NAME[dir[1]]) {
      throw new Error(`${where}: 방향 «${direction}»을 읽지 못했습니다`);
    }
    if (dir[0] === dir[1]) throw new Error(`${where}: 출발과 도착 트라이브가 같습니다`);

    const ingredients = parseIngredients(ingredientsRaw, where);
    if (ingredients.length < MIN_INGREDIENTS || ingredients.length > MAX_INGREDIENTS) {
      throw new Error(`${where}: 재료는 ${MIN_INGREDIENTS}~${MAX_INGREDIENTS}개여야 하는데 ${ingredients.length}개입니다`);
    }
    const seen = new Set();
    for (const ing of ingredients) {
      const key = `${ing.book}-${ing.item}`;
      if (seen.has(key)) throw new Error(`${where}: 같은 재료 ${key}가 두 번 나옵니다`);
      seen.add(key);
    }

    // 재료는 출발 트라이브, 보상은 도착 트라이브의 아이템 배지라 서로 겹칠 수 없다(출발과 도착이 같으면 위에서 멈춘다).
    const reward = parseItemRef(rewardRaw, `${where} 보상`);

    // 5절의 같은 번호 줄
    const textRow = textTable.rows[idx];
    const textWhere = `${fileName} 5절 ${code}`;
    mustCells(textRow, 5, textWhere);
    const [textCode, voice, name, description] = textRow;
    if (textCode !== code) throw new Error(`${textWhere}: ${no}번째 줄의 번호가 ${textCode}입니다 (${code}여야 합니다)`);
    if (!name) throw new Error(`${textWhere}: 이름이 비었습니다`);
    if (!description) throw new Error(`${textWhere}: 설명이 비었습니다`);
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      throw new Error(`${textWhere}: 설명이 ${description.length}자입니다 (${MAX_DESCRIPTION_LENGTH}자까지 쓸 수 있습니다)`);
    }

    return {
      no,
      code,
      fromShort: dir[0],
      toShort: dir[1],
      fromTribe: TRIBE_BY_SHORT_NAME[dir[0]],
      toTribe: TRIBE_BY_SHORT_NAME[dir[1]],
      clue,
      ingredients,
      reward,
      voice,
      name,
      description
    };
  });

  const names = new Set();
  for (const c of clues) {
    if (names.has(c.name)) throw new Error(`${fileName} 5절: 레시피 이름 «${c.name}»이 두 번 나옵니다`);
    names.add(c.name);
  }

  return { file: fileName, clues };
}

/** 원고 폴더의 07 파일을 읽는다. */
export function parseClueManuscript(dir = MANUSCRIPT_DIR) {
  const raw = findClueFile(dir);
  return parseClueRecipes(fs.readFileSync(path.join(dir, raw), 'utf8'), raw.normalize('NFC'));
}

/** 건수 요약 — 단서 20건, 재료 칸 86개(3개 2건·4개 10건·5개 8건)다. */
export function countClues(parsed) {
  const byIngredients = { 3: 0, 4: 0, 5: 0 };
  let slots = 0;
  for (const c of parsed.clues) {
    byIngredients[c.ingredients.length]++;
    slots += c.ingredients.length;
  }
  return { clues: parsed.clues.length, slots, byIngredients };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseClueManuscript();
  const c = countClues(parsed);
  console.error(
    `단서 ${c.clues}건, 재료 칸 ${c.slots}개 (3개 ${c.byIngredients[3]}건, 4개 ${c.byIngredients[4]}건, 5개 ${c.byIngredients[5]}건)`
  );
  const outIdx = process.argv.indexOf('--out');
  const json = JSON.stringify(parsed, null, 2) + '\n';
  if (outIdx >= 0) fs.writeFileSync(path.resolve(process.argv[outIdx + 1]), json);
  else process.stdout.write(json);
}
