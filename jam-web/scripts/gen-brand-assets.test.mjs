// 20260925_1125 — 브랜드 이미지 7개가 새 로고 SVG에서 만든 규격과 맞는지 검사한다.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ICO_SIZES,
  TARGETS,
  alphaMask,
  buildIco,
  checkAssets,
  diffRatio,
  jMask,
  parseIco,
  readRaw,
  renderIcon,
} from './gen-brand-assets.mjs';

const read = (p) => fs.readFileSync(p);
const px = ({ data, width }, x, y) => Array.from(data.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));

describe('브랜드 이미지 규격', () => {
  it('로고 PNG는 2610×925 RGBA에 배경이 투명하고 색이 각각 흰색·검정이다', async () => {
    const white = await readRaw(read(TARGETS.logoWhite));
    const black = await readRaw(read(TARGETS.dsLogoBlack));
    for (const img of [white, black]) {
      expect([img.width, img.height]).toEqual([2610, 925]);
      expect(px(img, 2609, 0)[3]).toBe(0);
    }
    // 가운데 줄에서 불투명 픽셀의 색을 확인한다
    const opaque = (img) => {
      for (let x = 0; x < img.width; x++) {
        const p = px(img, x, 700);
        if (p[3] === 255) return p;
      }
      return null;
    };
    expect(opaque(white)?.slice(0, 3)).toEqual([255, 255, 255]);
    expect(opaque(black)?.slice(0, 3)).toEqual([0, 0, 0]);
  });

  it('디자인시스템 사본은 원본과 바이트가 같다', () => {
    expect(read(TARGETS.dsLogoWhite).equals(read(TARGETS.logoWhite))).toBe(true);
    expect(read(TARGETS.dsUpload).equals(read(TARGETS.dsLogoBlack))).toBe(true);
  });

  it('icon.png는 512×512, 원 밖 모서리가 투명하고 중앙이 불투명하다', async () => {
    const img = await readRaw(read(TARGETS.icon));
    expect([img.width, img.height]).toEqual([512, 512]);
    expect(px(img, 0, 0)[3]).toBe(0);
    expect(px(img, 511, 511)[3]).toBe(0);
    expect(px(img, 256, 4)[3]).toBe(255);
  });

  it('apple-icon.png는 180×180이고 모서리까지 불투명한 검정이다', async () => {
    const img = await readRaw(read(TARGETS.appleIcon));
    expect([img.width, img.height]).toEqual([180, 180]);
    expect(px(img, 0, 0)).toEqual([0, 0, 0, 255]);
    expect(px(img, 179, 179)).toEqual([0, 0, 0, 255]);
  });

  it('favicon.ico는 16·32·48이 내장돼 있고 각 도형은 원이다', async () => {
    const entries = parseIco(read(TARGETS.favicon));
    expect(entries.map((e) => e.size).sort((a, b) => a - b)).toEqual(ICO_SIZES);
    for (const e of entries) {
      const img = await readRaw(e.data);
      expect([img.width, img.height]).toEqual([e.size, e.size]);
      expect(px(img, 0, 0)[3]).toBe(0);
    }
  });

  it('아이콘 안 J는 새 j.svg 모양과 같고 다른 형태(좌우 반전)와는 다르다', async () => {
    const icon = await readRaw(read(TARGETS.icon));
    const fresh = await readRaw(await renderIcon(512, 'circle'));
    const mask = jMask(icon);
    expect(diffRatio(mask, jMask(fresh))).toBeLessThan(0.01);
    // 검사가 느슨하지 않은지: 좌우 반전한 J는 1%를 넘게 달라야 한다
    const mirrored = new Uint8Array(mask.length);
    for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) mirrored[y * 512 + x] = mask[y * 512 + (511 - x)];
    expect(diffRatio(mask, mirrored)).toBeGreaterThan(0.01);
  });

  it('저장소 파일과 SVG가 어긋난 곳이 없다(--check와 같은 검사)', async () => {
    expect(await checkAssets()).toEqual([]);
  });

  it('buildIco는 헤더·항목·PNG를 올바른 오프셋으로 조립한다', async () => {
    const a = await renderIcon(16, 'circle');
    const b = await renderIcon(32, 'circle');
    const ico = buildIco([
      { size: 16, data: a },
      { size: 32, data: b },
    ]);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(2);
    const parsed = parseIco(ico);
    expect(parsed[0].data.equals(a)).toBe(true);
    expect(parsed[1].data.equals(b)).toBe(true);
    expect(alphaMask(await readRaw(parsed[1].data)).length).toBe(32 * 32);
  });
});
