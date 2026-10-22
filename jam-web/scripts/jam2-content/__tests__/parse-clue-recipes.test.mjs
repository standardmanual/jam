// 티켓 20261022_1138(7-7): 단서 레시피 원고(07) 파서 — 20건, 재료 수 분포, 이름·설명 누락과 이름 중복 검사.
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MANUSCRIPT_DIR } from '../parse-manuscript.mjs';
import {
  CLUE_COUNT,
  MAX_DESCRIPTION_LENGTH,
  TRIBE_BY_SHORT_NAME,
  countClues,
  findClueFile,
  parseClueManuscript,
  parseClueRecipes,
  parseIngredients,
  parseItemRef
} from '../parse-clue-recipes.mjs';

const parsed = parseClueManuscript();
const rawName = findClueFile();
const rawText = fs.readFileSync(path.join(MANUSCRIPT_DIR, rawName), 'utf8');

/** 원고 글을 한 군데만 바꿔 파서에 넣는다. 바꿀 곳이 없으면 시험이 틀린 것이므로 먼저 확인한다. */
function broken(from, to) {
  expect(rawText.includes(from), `바꿀 글이 원고에 없습니다: ${from}`).toBe(true);
  return () => parseClueRecipes(rawText.replace(from, to));
}

describe('원고 07에서 단서 레시피 20건을 읽는다', () => {
  it('20건이고 번호가 R01~R20 순서다', () => {
    expect(CLUE_COUNT).toBe(20);
    expect(parsed.clues).toHaveLength(20);
    expect(parsed.clues.map((c) => c.code)).toEqual(Array.from({ length: 20 }, (_, i) => `R${String(i + 1).padStart(2, '0')}`));
  });

  it('20건 모두 이름과 설명이 있고, 설명은 코드의 상한 500자 이내이며, 이름이 겹치지 않는다', () => {
    for (const c of parsed.clues) {
      expect(c.name, c.code).not.toBe('');
      expect(c.description, c.code).not.toBe('');
      expect(c.description.length, c.code).toBeLessThanOrEqual(MAX_DESCRIPTION_LENGTH);
    }
    expect(new Set(parsed.clues.map((c) => c.name)).size).toBe(20);
  });

  it('이름과 설명이 5절 표의 글자와 같다(첫 줄과 마지막 줄)', () => {
    expect(parsed.clues[0]).toMatchObject({ code: 'R01', name: '노트 위의 별', voice: '혼자들' });
    expect(parsed.clues[0].description.startsWith('엔드롤에서는 접시 옆에 젓가락 포장지로 접은 별이 놓입니다.')).toBe(true);
    expect(parsed.clues[19]).toMatchObject({ code: 'R20', name: '빨래방 노트 사이의 봉투' });
    for (const c of parsed.clues) {
      expect(rawText.includes(`| ${c.name}`), `${c.code} 이름이 원문에 없다`).toBe(true);
      expect(rawText.includes(c.description), `${c.code} 설명이 원문에 없다`).toBe(true);
    }
  });

  it('재료는 3~5개이고 분포는 3개 2건(R05, R07), 4개 10건, 5개 8건이며 칸은 모두 86개다', () => {
    for (const c of parsed.clues) {
      expect(c.ingredients.length, c.code).toBeGreaterThanOrEqual(3);
      expect(c.ingredients.length, c.code).toBeLessThanOrEqual(5);
    }
    expect(countClues(parsed)).toEqual({ clues: 20, slots: 86, byIngredients: { 3: 2, 4: 10, 5: 8 } });
    expect(parsed.clues.filter((c) => c.ingredients.length === 3).map((c) => c.code)).toEqual(['R05', 'R07']);
  });

  it('원문의 «(N개)» 표기와 «컬렉션-아이템» 표기를 파서와 따로 다시 세어도 같다', () => {
    const rows = rawText.split('\n').filter((l) => /^\| R\d\d \| \S+ → \S+ \|/.test(l));
    expect(rows).toHaveLength(20);
    rows.forEach((row, k) => {
      const cells = row.split('|').map((s) => s.trim());
      const declared = Number(cells[4].match(/\((\d+)개\)\s*$/)[1]);
      const counted = (cells[4].match(/\d+-\d+ /g) ?? []).length;
      expect(counted, cells[1]).toBe(declared);
      expect(parsed.clues[k].ingredients, cells[1]).toHaveLength(declared);
    });
  });

  it('나가는 단서는 음악 5개, 내향인 3개, 나머지 4개씩이고 들어오는 단서는 트라이브마다 4개다', () => {
    const out = {};
    const incoming = {};
    for (const c of parsed.clues) {
      out[c.fromShort] = (out[c.fromShort] ?? 0) + 1;
      incoming[c.toShort] = (incoming[c.toShort] ?? 0) + 1;
    }
    expect(out).toEqual({ 미식: 4, 사진: 4, 음악: 5, 물건: 4, 내향인: 3 });
    expect(incoming).toEqual({ 미식: 4, 사진: 4, 음악: 4, 물건: 4, 내향인: 4 });
    expect(Object.values(TRIBE_BY_SHORT_NAME)).toEqual(['한입만 연구회', '찰칵단', '비사이드 레코즈', '소나무 잡화점', '혼자들']);
  });

  it('출발과 도착 트라이브가 다르고, 한 단서의 재료는 한 컬렉션 안에서 골랐고 서로 겹치지 않는다', () => {
    for (const c of parsed.clues) {
      expect(c.fromTribe, c.code).not.toBe(c.toTribe);
      expect(new Set(c.ingredients.map((i) => i.book)).size, `${c.code} 재료 컬렉션`).toBe(1);
      expect(new Set(c.ingredients.map((i) => `${i.book}-${i.item}`)).size, c.code).toBe(c.ingredients.length);
    }
  });

  it('R01은 미식 → 내향인이고 재료 5개(5-6 젓가락 포장지 …), 보상 4-2 접이식 테이블이다', () => {
    const r01 = parsed.clues[0];
    expect([r01.fromTribe, r01.toTribe]).toEqual(['한입만 연구회', '혼자들']);
    expect(r01.ingredients[0]).toEqual({ book: 5, item: 6, name: '젓가락 포장지' });
    expect(r01.ingredients).toHaveLength(5);
    expect(r01.reward).toEqual({ book: 4, item: 2, name: '접이식 테이블' });
  });
});

describe('표기 읽기', () => {
  it('«컬렉션 번호-아이템 번호 이름»을 읽고, 형식이 다르거나 번호가 범위 밖이면 멈춘다', () => {
    expect(parseItemRef('5-6 젓가락 포장지', 'x')).toEqual({ book: 5, item: 6, name: '젓가락 포장지' });
    expect(() => parseItemRef('젓가락 포장지', 'x')).toThrow('형식');
    expect(() => parseItemRef('11-1 가나다', 'x')).toThrow('컬렉션 번호');
    expect(() => parseItemRef('1-10 가나다', 'x')).toThrow('아이템 번호');
  });

  it('«(N개)»와 실제 개수가 다르거나 표기가 없으면 멈춘다', () => {
    expect(parseIngredients('1-1 가, 1-2 나, 1-3 다 (3개)', 'x')).toHaveLength(3);
    expect(() => parseIngredients('1-1 가, 1-2 나, 1-3 다 (4개)', 'x')).toThrow('다릅니다');
    expect(() => parseIngredients('1-1 가, 1-2 나, 1-3 다', 'x')).toThrow('(N개)');
  });
});

describe('원고가 어긋나면 조용히 넘기지 않고 멈춘다', () => {
  it('재료 개수 표기가 실제와 다르다', () => {
    expect(broken('5-3 양파 장아찌 (5개)', '5-3 양파 장아찌 (4개)')).toThrow('개수 표기');
  });

  it('재료가 3개 미만이거나 5개를 넘는다', () => {
    expect(broken('2-8 압정 한 줌, 2-5 현상소 영수증, 2-4 인화 타이머 (3개)', '2-8 압정 한 줌, 2-5 현상소 영수증 (2개)')).toThrow('3~5개');
    expect(broken('5-3 양파 장아찌 (5개)', '5-3 양파 장아찌, 5-1 바삭한 해물파전 (6개)')).toThrow('3~5개');
  });

  it('같은 재료가 두 번 나온다', () => {
    expect(broken('5-3 양파 장아찌 (5개)', '5-6 젓가락 포장지 (5개)')).toThrow('두 번');
  });

  it('레시피 이름이 겹친다', () => {
    expect(() => parseClueRecipes(rawText.replace(/\| R02 \| 찰칵단\s+\| 노을 구석의 트럭\s+\|/, '| R02 | 찰칵단 | 노트 위의 별 |'))).toThrow('두 번 나옵니다');
  });

  it('이름 또는 설명이 비었다', () => {
    const lines = rawText.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('| R03 |') && l.includes('무명의 손글씨 번호표') && l.includes('소나무 잡화점'));
    expect(idx).toBeGreaterThan(0);
    const noDescription = [...lines];
    noDescription[idx] = '| R03 | 소나무 잡화점 | 무명의 손글씨 번호표 |  | 근거 |';
    expect(() => parseClueRecipes(noDescription.join('\n'))).toThrow('설명이 비었습니다');
    const noName = [...lines];
    noName[idx] = '| R03 | 소나무 잡화점 |  | 설명입니다. | 근거 |';
    expect(() => parseClueRecipes(noName.join('\n'))).toThrow('이름이 비었습니다');
  });

  it('설명이 코드의 상한 500자를 넘는다', () => {
    const lines = rawText.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('| R03 |') && l.includes('무명의 손글씨 번호표') && l.includes('소나무 잡화점'));
    const tooLong = [...lines];
    tooLong[idx] = `| R03 | 소나무 잡화점 | 무명의 손글씨 번호표 | ${'가'.repeat(501)} | 근거 |`;
    expect(() => parseClueRecipes(tooLong.join('\n'))).toThrow('501자');
  });

  it('번호 순서가 어긋나거나 방향을 읽지 못하거나 절이 없다', () => {
    expect(broken('| R01 | 미식 → 내향인', '| R02 | 미식 → 내향인')).toThrow('번호가 R02');
    expect(broken('미식 → 내향인', '미식 → 우주')).toThrow('방향');
    expect(broken('미식 → 내향인', '미식 → 미식')).toThrow('같습니다');
    expect(broken('## 5. 이름과 설명', '## 5. 다른 제목')).toThrow('절을 찾지 못했습니다');
  });

  it('표가 20건이 아니다', () => {
    const lines = rawText.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('| R20 | 미식') || (l.startsWith('| R20 |') && l.includes('내향인 → 사진')));
    expect(idx).toBeGreaterThan(0);
    const fewer = lines.filter((_, k) => k !== idx);
    expect(() => parseClueRecipes(fewer.join('\n'))).toThrow('20건');
  });
});
