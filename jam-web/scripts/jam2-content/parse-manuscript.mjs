#!/usr/bin/env node
/**
 * parse-manuscript.mjs — 트라이브 재구상 원고 5개를 읽어 컬렉션 50개와 아이템 450개를 JSON으로 만든다.
 * (티켓 20261022_1137, JAM 2.0 묶음 7의 7-6)
 *
 * 원고: docs/plan/jam2/tribe-rethink/manuscript/01~05 (트라이브마다 한 파일).
 *   - 1절 «컬렉션 10개» 표: 번호, 이름, 옛 이름, 출처, 한 줄 서사.
 *   - 6절 «6.N 컬렉션 이름»의 아이템 표: 번호, 이름, 옛 이름과 처리.
 *   - 6절 «#### N-M. 아이템 이름» 아래 등급 표: Common·Rare·Epic·Mystic 설명.
 * 원고는 읽기만 한다. 어긋나는 곳이 있으면 조용히 넘기지 않고 오류로 멈춘다.
 *
 * 사용법
 *   node scripts/jam2-content/parse-manuscript.mjs              # JSON을 표준 출력에 쓴다
 *   node scripts/jam2-content/parse-manuscript.mjs --out a.json # 파일에 쓴다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** 저장소 루트 기준 원고 폴더(작업 폴더 경로가 PC마다 달라도 이 파일 위치로 찾는다) */
export const MANUSCRIPT_DIR = path.resolve(HERE, '../../../docs/plan/jam2/tribe-rethink/manuscript');

/** 등급 키 — 원고의 표 머리글(Common·Rare·Epic·Mystic)과 DB의 badge_rarity 값은 대소문자만 다르다 */
export const RARITIES = ['common', 'rare', 'epic', 'mystic'];

const RARITY_LABELS = { Common: 'common', Rare: 'rare', Epic: 'epic', Mystic: 'mystic' };

/** 원고 6절 표의 «옛 이름과 처리»에서 찾는 처리 이름 */
const HANDLINGS = ['살림', '다듬음', '사물로 바꿈', '새로 씀'];

/** 표 한 줄을 칸으로 나눈다. `\|`는 칸 구분이 아니라 글자 `|`다. */
export function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let cell = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '\\' && body[i + 1] === '|') {
      cell += '|';
      i++;
    } else if (ch === '|') {
      cells.push(cell.trim());
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell.trim());
  return cells;
}

/** `from` 줄 뒤에서 처음 만나는 표를 읽어 데이터 행(머리글·구분선 제외)의 칸 배열로 돌려준다. */
export function readTable(lines, from, to = lines.length) {
  let i = from;
  while (i < to && !lines[i].trim().startsWith('|')) i++;
  if (i >= to) return null;
  const header = splitRow(lines[i]);
  i++;
  if (!/^\|?\s*:?-+/.test(lines[i] ?? '')) throw new Error(`표 구분선이 없습니다: ${lines[i - 1]}`);
  i++;
  const rows = [];
  while (i < to && lines[i].trim().startsWith('|')) {
    rows.push(splitRow(lines[i]));
    i++;
  }
  return { header, rows };
}

function mustCells(row, count, where) {
  if (row.length !== count) {
    throw new Error(`${where}: 칸 수가 ${count}개여야 하는데 ${row.length}개입니다 (${row.join(' | ').slice(0, 60)})`);
  }
}

/** «옛 이름, 처리(덧붙임)»에서 처리 이름만 꺼낸다. 괄호 안 덧붙임의 쉼표는 구분이 아니다. */
export function handlingOf(oldNameAndHandling) {
  const tail = oldNameAndHandling.replace(/\([^)]*\)/g, '').split(',').pop().trim();
  return HANDLINGS.find((h) => tail === h) ?? null;
}

/** 원고 한 파일을 읽어 트라이브 한 개의 구조로 만든다. */
export function parseTribeFile(text, fileName) {
  const lines = text.split('\n');
  const title = lines.find((l) => l.startsWith('# '));
  const titleMatch = title && title.match(/^# (.+) 컨텐츠 원고\s*$/);
  if (!titleMatch) throw new Error(`${fileName}: 제목(# 트라이브이름 컨텐츠 원고)을 찾지 못했습니다`);
  const tribeName = titleMatch[1].trim();

  // 1절 컬렉션 표
  const sec1 = lines.findIndex((l) => /^## 1\. 컬렉션 10개/.test(l));
  if (sec1 < 0) throw new Error(`${fileName}: «## 1. 컬렉션 10개» 절을 찾지 못했습니다`);
  const sec1Table = readTable(lines, sec1 + 1);
  if (!sec1Table || sec1Table.rows.length !== 10) {
    throw new Error(`${fileName}: 1절 표에 컬렉션 10개가 있어야 합니다 (${sec1Table?.rows.length ?? 0}개)`);
  }
  const collections = sec1Table.rows.map((row, idx) => {
    mustCells(row, 7, `${fileName} 1절 ${idx + 1}번`);
    const [no, name, oldRaw, origin, , summary] = row;
    if (Number(no) !== idx + 1) throw new Error(`${fileName} 1절: ${idx + 1}번 자리에 ${no}번이 있습니다`);
    // «(그대로)»는 옛 이름과 같다는 뜻, 빈 칸은 옛 컬렉션이 없는 새 컬렉션이다.
    let oldName = null;
    if (oldRaw === '(그대로)') oldName = name;
    else if (oldRaw !== '') oldName = oldRaw;
    if (!name || !summary) throw new Error(`${fileName} 1절 ${no}번: 이름 또는 한 줄 서사가 비었습니다`);
    return { no: Number(no), name, oldName, origin, summary, items: [] };
  });

  // 6절 아이템
  const sec6 = lines.findIndex((l) => /^## 6\. 아이템 배지/.test(l));
  if (sec6 < 0) throw new Error(`${fileName}: «## 6. 아이템 배지» 절을 찾지 못했습니다`);
  const heads = [];
  for (let i = sec6 + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^## /.test(l)) {
      heads.push({ kind: 'end', line: i });
      break;
    }
    let m;
    // 6.11(점검과 확인할 것)부터는 컬렉션이 아니라 점검 메모다.
    if ((m = l.match(/^### 6\.(\d+) (.+?)\s*$/)) && Number(m[1]) <= 10) {
      heads.push({ kind: 'book', line: i, no: Number(m[1]), name: m[2] });
    } else if (/^### /.test(l)) heads.push({ kind: 'end', line: i });
    else if ((m = l.match(/^#### (\d+)-(\d+)\. (.+?)\s*$/)))
      heads.push({ kind: 'item', line: i, book: Number(m[1]), no: Number(m[2]), name: m[3] });
  }

  // «### 6.N» 뒤의 아이템 표(번호, 이름, 옛 이름과 처리)
  const itemTableByBook = new Map();
  heads.forEach((h, k) => {
    if (h.kind !== 'book') return;
    const col = collections[h.no - 1];
    if (!col || col.name !== h.name) {
      throw new Error(`${fileName} 6.${h.no}: 1절 ${h.no}번 «${col?.name}»과 제목 «${h.name}»이 다릅니다`);
    }
    const next = heads[k + 1]?.line ?? lines.length;
    const table = readTable(lines, h.line + 1, next);
    if (!table || table.rows.length !== 9) {
      throw new Error(`${fileName} 6.${h.no}: 아이템 표에 9개가 있어야 합니다 (${table?.rows.length ?? 0}개)`);
    }
    itemTableByBook.set(h.no, table.rows);
  });
  if (itemTableByBook.size !== 10) throw new Error(`${fileName}: 6절 컬렉션 제목이 10개여야 합니다 (${itemTableByBook.size}개)`);

  // «#### N-M.» 아래 등급 표
  heads.forEach((h, k) => {
    if (h.kind !== 'item') return;
    const next = heads[k + 1]?.line ?? lines.length;
    const table = readTable(lines, h.line + 1, next);
    const where = `${fileName} ${h.book}-${h.no}`;
    if (!table || table.rows.length !== 4) throw new Error(`${where}: 등급 표에 4행이 있어야 합니다 (${table?.rows.length ?? 0}행)`);
    const descriptions = {};
    for (const row of table.rows) {
      mustCells(row, 2, where);
      const rarity = RARITY_LABELS[row[0]];
      if (!rarity) throw new Error(`${where}: 알 수 없는 등급 «${row[0]}»`);
      if (descriptions[rarity] !== undefined) throw new Error(`${where}: ${row[0]} 설명이 두 번 나옵니다`);
      if (!row[1]) throw new Error(`${where}: ${row[0]} 설명이 비었습니다`);
      descriptions[rarity] = row[1];
    }
    const tableRow = itemTableByBook.get(h.book)?.[h.no - 1];
    if (!tableRow) throw new Error(`${where}: 6.${h.book}절 아이템 표에 ${h.no}번이 없습니다`);
    mustCells(tableRow, 5, `${where} 아이템 표`);
    const [tableNo, tableName, oldNameAndHandling] = tableRow;
    if (Number(tableNo) !== h.no || tableName !== h.name) {
      throw new Error(`${where}: 아이템 표 «${tableNo}. ${tableName}»와 제목 «${h.name}»이 다릅니다`);
    }
    const col = collections[h.book - 1];
    if (col.items.length !== h.no - 1) throw new Error(`${where}: 아이템 번호가 순서대로 나오지 않습니다`);
    col.items.push({ no: h.no, name: h.name, oldNameAndHandling, handling: handlingOf(oldNameAndHandling), descriptions });
  });

  for (const col of collections) {
    if (col.items.length !== 9) {
      throw new Error(`${fileName} ${col.no}번 «${col.name}»: 아이템이 9개여야 하는데 ${col.items.length}개입니다`);
    }
  }

  return { name: tribeName, file: fileName, collections };
}

/** 원고 폴더의 01~05 파일을 모두 읽는다. */
export function parseManuscripts(dir = MANUSCRIPT_DIR) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^0[1-5] .+\.md$/.test(f.normalize('NFC')))
    .sort();
  if (files.length !== 5) throw new Error(`원고 파일 01~05가 5개여야 하는데 ${files.length}개입니다 (${dir})`);
  const tribes = files.map((f) => parseTribeFile(fs.readFileSync(path.join(dir, f), 'utf8'), f.normalize('NFC')));
  return { tribes };
}

/** 건수 요약 — 컬렉션 50, 아이템 450, 설명 1,800이어야 한다. */
export function countManuscript(parsed) {
  const collections = parsed.tribes.flatMap((t) => t.collections);
  const items = collections.flatMap((c) => c.items);
  const descriptions = items.reduce((n, it) => n + RARITIES.filter((r) => it.descriptions[r]).length, 0);
  return { tribes: parsed.tribes.length, collections: collections.length, items: items.length, descriptions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const parsed = parseManuscripts();
  const counts = countManuscript(parsed);
  console.error(`트라이브 ${counts.tribes}, 컬렉션 ${counts.collections}, 아이템 ${counts.items}, 설명 ${counts.descriptions}`);
  const outIdx = process.argv.indexOf('--out');
  const json = JSON.stringify(parsed, null, 2) + '\n';
  if (outIdx >= 0) fs.writeFileSync(path.resolve(process.argv[outIdx + 1]), json);
  else process.stdout.write(json);
}
