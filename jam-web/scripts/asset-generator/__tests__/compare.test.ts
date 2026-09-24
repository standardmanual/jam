/**
 * asset-generator/compare — PNG 비교 로직 검증 (티켓 20260924_2201)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comparePngs } from '../compare.mjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jam-compare-test-'));
const redPath = path.join(tmpDir, 'red.png');
const redCopyPath = path.join(tmpDir, 'red-copy.png');
const bluePath = path.join(tmpDir, 'blue.png');
const bigPath = path.join(tmpDir, 'big.png');

beforeAll(async () => {
  const red = { create: { width: 10, height: 10, channels: 4 as const, background: { r: 255, g: 0, b: 0, alpha: 1 } } };
  const blue = { create: { width: 10, height: 10, channels: 4 as const, background: { r: 0, g: 0, b: 255, alpha: 1 } } };
  await sharp(red).png().toFile(redPath);
  await sharp(red).png().toFile(redCopyPath);
  await sharp(blue).png().toFile(bluePath);
  await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toFile(bigPath);
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('comparePngs', () => {
  it('완전히 같은 이미지는 diffRatio 0, maxDiff 0을 낸다', async () => {
    const result = await comparePngs(redPath, redCopyPath);
    expect(result.sameSize).toBe(true);
    expect(result.diffRatio).toBe(0);
    expect(result.maxDiff).toBe(0);
  });

  it('완전히 다른 색은 diffRatio 1, maxDiff가 255다', async () => {
    const result = await comparePngs(redPath, bluePath);
    expect(result.sameSize).toBe(true);
    expect(result.diffRatio).toBe(1);
    expect(result.maxDiff).toBe(255);
  });

  it('크기가 다르면 sameSize가 false이고 픽셀 비교를 하지 않는다', async () => {
    const result = await comparePngs(redPath, bigPath);
    expect(result.sameSize).toBe(false);
    expect(result.diffRatio).toBeNull();
    expect(result.maxDiff).toBeNull();
  });
});
