#!/usr/bin/env node
/**
 * parse-pairing-doc.mjs — 짝짓기 표 문서(ITEMBOOK_REPLACEMENT_MAP.md)를 읽어 pairing.json 모양으로 바꾼다.
 * (티켓 20261022_1137, JAM 2.0 묶음 7의 7-6)
 *
 * 문서가 사람이 확인한 표이고 pairing.json은 SQL 생성기가 읽는 데이터다. 둘이 어긋나지 않게
 * 시험(__tests__/pairing.test.mjs)이 이 파서로 문서를 읽어 pairing.json과 비교한다.
 *
 * 문서의 4절 «컬렉션별 짝짓기 표»는 컬렉션 44개의 옛 배지 행과 새 아이템의 짝이고,
 * 5절은 새로 만드는 컬렉션 6개의 아이템 이름이다(옛 행이 없다).
 *
 * 사용법
 *   node scripts/jam2-content/parse-pairing-doc.mjs --write   # 문서에서 pairing.json을 다시 만든다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTable } from './parse-manuscript.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const PAIRING_DOC = path.resolve(HERE, '../../../docs/service/content/ITEMBOOK_REPLACEMENT_MAP.md');
export const PAIRING_JSON = path.join(HERE, 'pairing.json');

export const BASES = ['이름 일치', '이름 유사', '순서 짝'];

const ORIGINS = ['자리 확정(옮김)', '자리 확정(연결 바꿈)', '자리 확정', '자리 미정에서 고름'];

function cutBasis(cell) {
  const confirm = cell.startsWith('⚠');
  const basis = cell.replace(/^⚠\s*/, '').trim();
  return { basis, confirm };
}

function readRows(lines, from, to) {
  const table = readTable(lines, from, to);
  if (!table) return [];
  return table.rows;
}

/** 문서를 구조로 읽는다. 어긋나는 곳이 있으면 오류로 멈춘다. */
export function parsePairingDoc(text) {
  const lines = text.split('\n');

  // 2절 요약 표
  const sec2 = lines.findIndex((l) => /^## 2\. 요약/.test(l));
  const sec3 = lines.findIndex((l) => /^## 3\. /.test(l));
  const sec4 = lines.findIndex((l) => /^## 4\. /.test(l));
  const sec5 = lines.findIndex((l) => /^## 5\. /.test(l));
  if ([sec2, sec3, sec4, sec5].some((n) => n < 0)) throw new Error('문서의 2~5절 제목을 찾지 못했습니다');

  const summary = {};
  for (const row of readRows(lines, sec2 + 1, sec3)) {
    if (row.length !== 4) throw new Error(`2절 요약 표 칸 수가 4개여야 합니다: ${row.join(' | ')}`);
    summary[row[0]] = { count: Number(row[1]), held: Number(row[2]), slotted: Number(row[3]) };
  }

  // 3절 확인 대상 표 (컬렉션, "N. 새 아이템", 옛 배지, 보유, 장착, 근거)
  const confirmList = readRows(lines, sec3 + 1, sec4).map((row) => {
    if (row.length !== 6) throw new Error(`3절 표 칸 수가 6개여야 합니다: ${row.join(' | ')}`);
    const m = row[1].match(/^(\d+)\. (.+)$/);
    if (!m) throw new Error(`3절 새 아이템 칸 모양이 «번호. 이름»이 아닙니다: ${row[1]}`);
    return {
      collection: row[0],
      itemNo: Number(m[1]),
      itemName: m[2],
      oldBadgeName: row[2],
      held: Number(row[3]),
      slotted: Number(row[4]),
      basis: row[5]
    };
  });

  // 4절 컬렉션별 표
  const tribes = [];
  let tribe = null;
  let col = null;
  for (let i = sec4 + 1; i < sec5; i++) {
    const l = lines[i];
    let m;
    if ((m = l.match(/^### (.+?)\s*$/))) {
      tribe = { name: m[1], collections: [] };
      tribes.push(tribe);
      col = null;
    } else if ((m = l.match(/^#### (\d+)\. (.+?)\s*$/))) {
      if (!tribe) throw new Error(`트라이브 제목(### ) 없이 컬렉션 제목이 나옵니다: ${l}`);
      col = { no: Number(m[1]), name: m[2], oldBookName: null, origin: null, items: [] };
      tribe.collections.push(col);
    } else if ((m = l.match(/^옛 컬렉션: (.+)$/))) {
      if (!col) throw new Error(`컬렉션 제목 없이 «옛 컬렉션» 줄이 나옵니다: ${l}`);
      const raw = m[1];
      const origin = ORIGINS.find((o) => raw.endsWith(`(${o})`));
      if (!origin) throw new Error(`«옛 컬렉션» 줄의 출처를 읽지 못했습니다: ${raw}`);
      col.oldBookName = raw.slice(0, raw.length - origin.length - 2);
      col.origin = origin;
    } else if (l.startsWith('| 새 # |')) {
      if (!col) throw new Error(`컬렉션 제목 없이 표가 나옵니다: ${l}`);
      const rows = readRows(lines, i, sec5);
      for (const row of rows) {
        if (row.length !== 8) throw new Error(`4절 ${tribe.name} ${col.no}번 표 칸 수가 8개여야 합니다: ${row.join(' | ')}`);
        const { basis, confirm } = cutBasis(row[4]);
        col.items.push({
          no: Number(row[0]),
          name: row[1],
          handling: row[2],
          oldBadgeName: row[3],
          basis,
          confirm,
          held: Number(row[5]),
          slotted: Number(row[6]),
          oldState: row[7]
        });
      }
      i += rows.length + 1; // 머리글·구분선 다음 데이터 행까지 건너뛴다
    }
  }

  // 5절: 새 컬렉션의 아이템 이름
  for (let i = sec5 + 1; i < lines.length; i++) {
    const m = lines[i].match(/^- \*\*(.+?) (\d+)\. (.+?)\*\*: (.+)$/);
    if (!m) continue;
    const t = tribes.find((x) => x.name === m[1]);
    if (!t) throw new Error(`5절의 트라이브 «${m[1]}»가 4절에 없습니다`);
    const names = m[4].split(/, (?=\d+\. )/).map((s, k) => {
      const mm = s.match(/^(\d+)\. (.+)$/);
      if (!mm || Number(mm[1]) !== k + 1) throw new Error(`5절 ${m[1]} ${m[2]}번의 아이템 줄 모양이 틀렸습니다: ${s}`);
      return mm[2];
    });
    t.collections.push({
      no: Number(m[2]),
      name: m[3],
      oldBookName: null,
      origin: '새로 만듦',
      items: names.map((name, k) => ({ no: k + 1, name, handling: '새로 씀', oldBadgeName: null, basis: null, confirm: false }))
    });
  }
  for (const t of tribes) t.collections.sort((a, b) => a.no - b.no);

  return { tribes, summary, confirmList };
}

/** pairing.json 모양 — SQL 생성기가 읽는 최소 칸만 담는다. */
export function toPairingJson(parsed) {
  return {
    source: 'docs/service/content/ITEMBOOK_REPLACEMENT_MAP.md',
    snapshot: '2026-10-22',
    tribes: parsed.tribes.map((t) => ({
      name: t.name,
      collections: t.collections.map((c) => ({
        no: c.no,
        name: c.name,
        oldBookName: c.oldBookName,
        items: c.items.map((it) => ({
          no: it.no,
          name: it.name,
          oldBadgeName: it.oldBadgeName,
          basis: it.basis,
          confirm: it.confirm
        }))
      }))
    }))
  };
}

/** 아이템 한 개를 한 줄로 쓰는 JSON 글 — 컬렉션 50개, 아이템 450개가 3,500줄로 늘어나지 않게 한다. */
export function stringifyPairing(json) {
  const head = { source: json.source, snapshot: json.snapshot };
  const tribes = json.tribes.map((t) => {
    const cols = t.collections.map((c) => {
      const meta = JSON.stringify({ no: c.no, name: c.name, oldBookName: c.oldBookName }).slice(0, -1);
      const items = c.items.map((it) => `        ${JSON.stringify(it)}`).join(',\n');
      return `      ${meta},"items":[\n${items}\n      ]}`;
    });
    return `    {"name":${JSON.stringify(t.name)},"collections":[\n${cols.join(',\n')}\n    ]}`;
  });
  return `{"source":${JSON.stringify(head.source)},"snapshot":${JSON.stringify(head.snapshot)},"tribes":[\n${tribes.join(',\n')}\n]}\n`;
}

export function readPairingDoc(file = PAIRING_DOC) {
  return parsePairingDoc(fs.readFileSync(file, 'utf8'));
}

export function readPairingJson(file = PAIRING_JSON) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = toPairingJson(readPairingDoc());
  const text = stringifyPairing(json);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(PAIRING_JSON, text);
    console.error(`pairing.json을 썼습니다 (${PAIRING_JSON})`);
  } else {
    process.stdout.write(text);
  }
}
