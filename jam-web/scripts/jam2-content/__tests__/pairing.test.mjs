// 티켓 20261022_1137(7-6): 짝짓기 데이터(pairing.json)가 짝짓기 표 문서·원고와 일치하는지 검사한다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseManuscripts } from '../parse-manuscript.mjs';
import {
  BASES,
  PAIRING_DOC,
  PAIRING_JSON,
  parsePairingDoc,
  readPairingDoc,
  readPairingJson,
  stringifyPairing,
  toPairingJson
} from '../parse-pairing-doc.mjs';

const doc = readPairingDoc();
const json = readPairingJson();
const manuscript = parseManuscripts();
const collections = json.tribes.flatMap((t) => t.collections.map((c) => ({ tribe: t.name, ...c })));
const overwriteCollections = collections.filter((c) => c.oldBookName !== null);

describe('pairing.json은 짝짓기 표 문서와 같다', () => {
  it('문서에서 만든 데이터가 pairing.json과 한 글자도 다르지 않다', () => {
    expect(toPairingJson(doc)).toEqual(json);
  });

  it('pairing.json의 글이 문서에서 다시 만든 글과 같다(손으로 고친 흔적이 없다)', () => {
    expect(fs.readFileSync(PAIRING_JSON, 'utf8')).toBe(stringifyPairing(toPairingJson(doc)));
  });

  it('문서의 요약표(2절) 건수·보유·장착이 컬렉션별 표(4절)의 합과 같다', () => {
    const sum = {};
    for (const t of doc.tribes) {
      for (const c of t.collections) {
        for (const it of c.items) {
          if (!it.basis) continue;
          const s = (sum[it.basis] ??= { count: 0, held: 0, slotted: 0 });
          s.count++;
          s.held += it.held;
          s.slotted += it.slotted;
        }
      }
    }
    for (const basis of BASES) expect(sum[basis]).toEqual(doc.summary[basis]);
    expect(doc.summary['합계']).toEqual({ count: 396, held: 1030, slotted: 63 });
    expect(sum['이름 일치'].count).toBe(269);
    expect(sum['이름 유사'].count).toBe(16);
    expect(sum['순서 짝'].count).toBe(111);
  });

  it('사용자 확인이 필요한 짝 28개(3절)가 컬렉션별 표(4절)의 ⚠ 표시와 같다', () => {
    const flagged = [];
    for (const t of doc.tribes) {
      for (const c of t.collections) {
        for (const it of c.items) {
          if (it.confirm) flagged.push({ collection: c.name, itemNo: it.no, itemName: it.name, oldBadgeName: it.oldBadgeName, held: it.held, slotted: it.slotted, basis: it.basis });
        }
      }
    }
    expect(flagged).toHaveLength(28);
    expect(flagged).toEqual(doc.confirmList);
    expect(flagged.reduce((n, f) => n + f.slotted, 0)).toBe(13);
    expect(flagged.reduce((n, f) => n + f.held, 0)).toBe(84);
  });

  it('문서 해석기는 모양이 틀린 문서를 조용히 넘기지 않는다', () => {
    const text = fs.readFileSync(PAIRING_DOC, 'utf8');
    expect(() => parsePairingDoc(text.replace('## 4. 컬렉션별 짝짓기 표', '## 9. 컬렉션별 짝짓기 표'))).toThrow('제목을 찾지 못했습니다');
    expect(() => parsePairingDoc(text.replace('| 1 | 엎어 둔 휴대폰 | 사물로 바꿈 |', '| 1 | 엎어 둔 휴대폰 |'))).toThrow('칸 수');
  });
});

describe('짝짓기의 일관성', () => {
  it('트라이브 5개, 컬렉션 50개(옛 컬렉션이 있는 44개와 새로 만드는 6개), 아이템 450개다', () => {
    expect(json.tribes).toHaveLength(5);
    expect(collections).toHaveLength(50);
    expect(overwriteCollections).toHaveLength(44);
    expect(collections.flatMap((c) => c.items)).toHaveLength(450);
  });

  it('옛 컬렉션이 있는 컬렉션은 옛 배지 행 9개와 새 아이템 9개가 한 번씩 짝지어진다', () => {
    for (const c of overwriteCollections) {
      const where = `${c.tribe} ${c.no}번 ${c.name}`;
      expect(c.items.map((i) => i.no), where).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(c.items.every((i) => typeof i.oldBadgeName === 'string' && i.oldBadgeName.length > 0), where).toBe(true);
      expect(new Set(c.items.map((i) => i.oldBadgeName)).size, `${where}: 옛 배지 이름이 겹친다`).toBe(9);
      expect(new Set(c.items.map((i) => i.name)).size, `${where}: 새 아이템 이름이 겹친다`).toBe(9);
    }
  });

  it('396개 짝은 근거가 «이름 일치 269, 이름 유사 16, 순서 짝 111»이다', () => {
    const count = {};
    for (const c of overwriteCollections) for (const i of c.items) count[i.basis] = (count[i.basis] ?? 0) + 1;
    expect(count).toEqual({ '이름 일치': 269, '이름 유사': 16, '순서 짝': 111 });
  });

  it('새로 만드는 컬렉션 6개의 아이템 54개에는 옛 배지가 없다', () => {
    const fresh = collections.filter((c) => c.oldBookName === null);
    expect(fresh).toHaveLength(6);
    for (const c of fresh) {
      expect(c.items).toHaveLength(9);
      expect(c.items.every((i) => i.oldBadgeName === null && i.basis === null)).toBe(true);
    }
  });

  it('옛 컬렉션 이름 44개는 겹치지 않고, 새 컬렉션 이름 50개도 겹치지 않는다', () => {
    expect(new Set(overwriteCollections.map((c) => c.oldBookName)).size).toBe(44);
    expect(new Set(collections.map((c) => c.name)).size).toBe(50);
  });

  it('새 컬렉션 이름이 다른 컬렉션의 옛 이름과 겹치지 않는다(이름으로 옛 행을 찾을 때 헷갈리지 않는다)', () => {
    const own = new Map(overwriteCollections.map((c) => [c.oldBookName, c.name]));
    for (const c of collections) {
      if (own.has(c.name)) expect(own.get(c.name), `«${c.name}»이 다른 컬렉션의 옛 이름과 같다`).toBe(c.name);
    }
  });

  it('공용 DB 이름이 원고와 다른 컬렉션은 «무명(無名)을 쫓는 야식가들» 하나다', () => {
    const diffs = [];
    for (const t of manuscript.tribes) {
      for (const mc of t.collections) {
        const pc = json.tribes.find((x) => x.name === t.name).collections.find((c) => c.no === mc.no);
        if (mc.oldName !== null && mc.oldName !== pc.oldBookName) diffs.push([mc.oldName, pc.oldBookName]);
      }
    }
    expect(diffs).toEqual([['무명(無名)을 쫓는 야식가들', '무명無名을 쫓는 야식가들']]);
  });

  it('모든 이름이 한글 완성형(NFC)이고 앞뒤 공백이 없다', () => {
    const names = collections.flatMap((c) => [c.name, c.oldBookName ?? '', ...c.items.flatMap((i) => [i.name, i.oldBadgeName ?? ''])]);
    for (const s of names) {
      expect(s).toBe(s.normalize('NFC'));
      expect(s).toBe(s.trim());
    }
  });
});

describe('pairing.json은 원고와 같다', () => {
  it('컬렉션·아이템 이름이 원고와 같다(옛 이름은 위 DB 이름 예외만 다르다)', () => {
    for (const mt of manuscript.tribes) {
      const pt = json.tribes.find((x) => x.name === mt.name);
      expect(pt.collections.map((c) => c.name)).toEqual(mt.collections.map((c) => c.name));
      for (const mc of mt.collections) {
        const pc = pt.collections.find((c) => c.no === mc.no);
        expect(pc.items.map((i) => i.name), `${mt.name} ${mc.no}번`).toEqual(mc.items.map((i) => i.name));
        expect(pc.oldBookName === null, `${mt.name} ${mc.no}번`).toBe(mc.oldName === null);
      }
    }
  });

  it('문서의 «원고 처리» 열이 원고 6절의 처리와 같다(옛 행이 있는 396개)', () => {
    for (const t of doc.tribes) {
      const mt = manuscript.tribes.find((x) => x.name === t.name);
      for (const c of t.collections) {
        const mc = mt.collections.find((x) => x.no === c.no);
        for (const it of c.items) {
          if (it.oldBadgeName === null) continue;
          expect(it.handling, `${t.name} ${c.no}-${it.no}`).toBe(mc.items.find((x) => x.no === it.no).handling);
        }
      }
    }
  });
});
