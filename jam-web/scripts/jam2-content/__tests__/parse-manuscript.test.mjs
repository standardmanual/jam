// 티켓 20261022_1137(7-6): 원고 파서 — 컬렉션 50개, 아이템 450개, 설명 1,800개를 읽는다.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MANUSCRIPT_DIR,
  RARITIES,
  countManuscript,
  handlingOf,
  parseManuscripts,
  parseTribeFile,
  readTable,
  splitRow
} from '../parse-manuscript.mjs';

const parsed = parseManuscripts();
const collections = parsed.tribes.flatMap((t) => t.collections);
const items = collections.flatMap((c) => c.items);

describe('원고 파서: 건수', () => {
  it('트라이브 5개, 컬렉션 50개, 아이템 450개, 설명 1,800개를 읽는다', () => {
    expect(countManuscript(parsed)).toEqual({ tribes: 5, collections: 50, items: 450, descriptions: 1800 });
  });

  it('트라이브 이름과 순서는 원고 01~05와 같다', () => {
    expect(parsed.tribes.map((t) => t.name)).toEqual(['한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들']);
  });

  it('트라이브마다 컬렉션 10개(번호 1~10), 컬렉션마다 아이템 9개(번호 1~9)다', () => {
    for (const t of parsed.tribes) {
      expect(t.collections.map((c) => c.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      for (const c of t.collections) expect(c.items.map((i) => i.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    }
  });

  it('아이템마다 4등급 설명이 모두 있고 서로 다르다', () => {
    for (const it of items) {
      const texts = RARITIES.map((r) => it.descriptions[r]);
      expect(texts.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
      expect(new Set(texts).size).toBe(4);
    }
  });

  it('옛 컬렉션이 있는 것은 44개, 새로 만드는 것은 6개(비사이드 7~10, 혼자들 9~10)다', () => {
    expect(collections.filter((c) => c.oldName !== null)).toHaveLength(44);
    const fresh = parsed.tribes.flatMap((t) => t.collections.filter((c) => c.oldName === null).map((c) => `${t.name} ${c.no}`));
    expect(fresh).toEqual(['비사이드 레코즈 7', '비사이드 레코즈 8', '비사이드 레코즈 9', '비사이드 레코즈 10', '혼자들 9', '혼자들 10']);
  });

  it('«(그대로)»는 옛 이름이 새 이름과 같은 것으로 읽는다', () => {
    const same = collections.find((c) => c.name === '편의점 심야 만찬');
    expect(same.oldName).toBe('편의점 심야 만찬');
    const renamed = collections.find((c) => c.name === '새벽 무렵의 국밥');
    expect(renamed.oldName).toBe('새벽 라이딩 끝의 국밥');
  });

  it('원고가 «살림·다듬음»이라 한 아이템은 89개(살림 66, 다듬음 23)다', () => {
    const count = (h) => items.filter((i) => i.handling === h).length;
    expect(count('살림')).toBe(66);
    expect(count('다듬음')).toBe(23);
    expect(items.every((i) => i.handling !== null)).toBe(true);
  });

  it('컬렉션 이름과 아이템 이름이 중복되지 않는다', () => {
    expect(new Set(collections.map((c) => c.name)).size).toBe(50);
    for (const c of collections) expect(new Set(c.items.map((i) => i.name)).size).toBe(9);
  });

  it('글에 마크다운 기호나 앞뒤 공백, 한글 조합형이 섞이지 않는다', () => {
    const texts = [
      ...collections.flatMap((c) => [c.name, c.summary]),
      ...items.flatMap((i) => [i.name, ...RARITIES.map((r) => i.descriptions[r])])
    ];
    for (const s of texts) {
      expect(s).toBe(s.trim());
      expect(s).toBe(s.normalize('NFC'));
      expect(s).not.toMatch(/[*`\\]|\|/);
    }
  });
});

describe('원고 파서: 어긋나면 멈춘다', () => {
  const file = fs.readdirSync(MANUSCRIPT_DIR).find((f) => f.normalize('NFC').startsWith('01 '));
  const text = fs.readFileSync(path.join(MANUSCRIPT_DIR, file), 'utf8');

  it('알 수 없는 등급 이름이 있으면 오류다', () => {
    expect(() => parseTribeFile(text.replace('| Rare |', '| Rarer |'), '01 test')).toThrow('알 수 없는 등급');
  });

  it('등급 설명이 빠지면 오류다', () => {
    expect(() => parseTribeFile(text.replace('| Mystic |', '| Rare |'), '01 test')).toThrow('두 번 나옵니다');
  });

  it('아이템 제목이 표의 이름과 다르면 오류다', () => {
    expect(() => parseTribeFile(text.replace('#### 1-1. 엎어 둔 휴대폰', '#### 1-1. 엎은 휴대폰'), '01 test')).toThrow('다릅니다');
  });

  it('컬렉션 제목이 1절 이름과 다르면 오류다', () => {
    expect(() => parseTribeFile(text.replace('### 6.1 무명을 쫓는 야식가들', '### 6.1 무명을 쫓는 손님들'), '01 test')).toThrow('다릅니다');
  });
});

describe('표 읽기 도우미', () => {
  it('splitRow는 \\|를 칸 구분이 아닌 글자로 읽는다', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
  });

  it('readTable은 머리글과 구분선을 빼고 데이터 행만 돌려준다', () => {
    const lines = ['글', '| x | y |', '|---|---|', '| 1 | 2 |', '| 3 | 4 |', '', '| 5 | 6 |'];
    expect(readTable(lines, 0).rows).toEqual([
      ['1', '2'],
      ['3', '4']
    ]);
  });

  it('handlingOf는 괄호 속 쉼표를 구분으로 보지 않는다', () => {
    expect(handlingOf('단톡방 알림, 사물로 바꿈')).toBe('사물로 바꿈');
    expect(handlingOf('살림(띄어쓰기만 바로잡음)')).toBe('살림');
    expect(handlingOf('옛 아이템 없음, 새로 씀 (이름 그대로, Mystic 변경)')).toBe('새로 씀');
    expect(handlingOf('하늘 언덕(처음 이름 스키장갑 클립, 새로 씀), 사물로 바꿈')).toBe('사물로 바꿈');
  });
});
