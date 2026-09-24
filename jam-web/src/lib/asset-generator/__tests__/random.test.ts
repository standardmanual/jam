/**
 * asset-generator/random — deriveRibbonFromSeed 결정성 검증 (티켓 20260924_2201, PRD §11)
 *
 * 마스터 시드 하나에서 리본 랜덤 속성 전부(배경색·끝색 포함)와 곡선 시드(반환값의 seed
 * 필드)를 결정적으로 뽑는지 확인한다 — 에이전트 CLI와 어드민 "전체 무작위"·"시드 불러오기"가
 * 이 함수를 공유한다.
 */
import { describe, expect, it } from 'vitest';
import { deriveRibbonFromSeed } from '../random';

describe('deriveRibbonFromSeed (PRD §11)', () => {
  it('같은 시드는 항상 같은 값을 낸다(배경색·끝색·곡선 시드 포함)', () => {
    const a = deriveRibbonFromSeed(12345);
    const b = deriveRibbonFromSeed(12345);
    expect(a).toEqual(b);
  });

  it('다른 시드는 다른 값을 낸다', () => {
    const a = deriveRibbonFromSeed(1);
    const b = deriveRibbonFromSeed(2);
    expect(a).not.toEqual(b);
  });

  it('randomizeRibbonConfig와 같은 값 범위를 만족한다', () => {
    // 여러 시드에 걸쳐 각 필드가 randomizeRibbonConfig의 범위(random.ts) 안에 있는지 확인한다.
    for (let seed = 0; seed < 50; seed++) {
      const v = deriveRibbonFromSeed(seed);
      expect(v.sizePct).toBeGreaterThanOrEqual(12);
      expect(v.sizePct).toBeLessThanOrEqual(40);
      expect(Number.isInteger(v.sizePct)).toBe(true);

      expect(v.blurPct === 0 || (v.blurPct >= 5 && v.blurPct <= 35)).toBe(true);
      expect(Number.isInteger(v.blurPct)).toBe(true);

      expect(v.rotationDeg).toBeGreaterThanOrEqual(-180);
      expect(v.rotationDeg).toBeLessThanOrEqual(180);

      expect(['h', 'v', 'r']).toContain(v.direction);
      expect(typeof v.followPath).toBe('boolean');

      expect(v.irregularityPct).toBeGreaterThanOrEqual(0);
      expect(v.irregularityPct).toBeLessThanOrEqual(100);

      expect(v.seed).toBeGreaterThanOrEqual(0);
      expect(v.seed).toBeLessThan(1e9);

      expect(v.speed).toBeGreaterThanOrEqual(1000);
      expect(v.speed).toBeLessThanOrEqual(2000);
      expect(v.speed % 10).toBe(0);

      expect(v.gap).toBeGreaterThanOrEqual(4);
      expect(v.gap).toBeLessThanOrEqual(30);

      expect(v.count).toBeGreaterThanOrEqual(200);
      expect(v.count).toBeLessThanOrEqual(800);
      expect(v.count % 5).toBe(0);

      expect(v.linkStartToBackground).toBe(true);
      expect(v.backgroundColor).toMatch(/^#[0-9a-f]{6}$/);
      expect(v.endColor).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
