/**
 * asset-generator CLI — 이미지 레이어 원본 불러오기 검증 (티켓 20260927_0100)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectImageMimeType, loadLayerImage } from '../loadLayerImage.mjs';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest')]);
const SVG = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-layer-image-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('loadLayerImage', () => {
  it('이미지 경계: 5MB 이하 파일은 통과하고 1바이트라도 넘으면 거절한다', async () => {
    const limit = 5 * 1024 * 1024;
    const at = Buffer.concat([PNG, Buffer.alloc(limit - PNG.length)]);
    fs.writeFileSync(path.join(dir, 'at.png'), at);
    expect((await loadLayerImage(path.join(dir, 'at.png'))).data.length).toBe(limit);
    fs.writeFileSync(path.join(dir, 'over.png'), Buffer.concat([at, Buffer.from([0])]));
    await expect(loadLayerImage(path.join(dir, 'over.png'))).rejects.toThrow('이미지가 너무 커요');
  });

  it('PNG·SVG 파일을 읽어 형식과 함께 돌려준다', async () => {
    fs.writeFileSync(path.join(dir, 'a.png'), PNG);
    fs.writeFileSync(path.join(dir, 'b.svg'), SVG);
    expect(await loadLayerImage(path.join(dir, 'a.png'))).toEqual({ data: PNG, mimeType: 'image/png' });
    expect(await loadLayerImage(path.join(dir, 'b.svg'))).toEqual({ data: SVG, mimeType: 'image/svg+xml' });
  });

  it('없는 파일은 한국어 오류다', async () => {
    await expect(loadLayerImage(path.join(dir, 'none.png'))).rejects.toThrow('이미지 파일을 찾을 수 없어요');
  });

  it('5MB를 넘는 파일은 오류다', async () => {
    const big = path.join(dir, 'big.png');
    fs.writeFileSync(big, Buffer.concat([PNG, Buffer.alloc(5 * 1024 * 1024)]));
    await expect(loadLayerImage(big)).rejects.toThrow('이미지가 너무 커요');
  });

  it('PNG·SVG가 아니면 오류다', async () => {
    const jpg = path.join(dir, 'c.jpg');
    fs.writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]));
    await expect(loadLayerImage(jpg)).rejects.toThrow('지원하지 않는 이미지 형식이에요');
  });

  it('http(s) URL은 내려받아 같은 검증을 한다', async () => {
    const ok = async () => ({ ok: true, status: 200, arrayBuffer: async () => PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.length) });
    const result = await loadLayerImage('https://cdn.test/a.png?x=1', { fetchImpl: ok });
    expect(result.mimeType).toBe('image/png');
    expect(result.data.equals(PNG)).toBe(true);

    const notFound = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) });
    await expect(loadLayerImage('https://cdn.test/none.png', { fetchImpl: notFound })).rejects.toThrow('HTTP 404');
    const broken = async () => {
      throw new Error('연결 실패');
    };
    await expect(loadLayerImage('https://cdn.test/a.png', { fetchImpl: broken })).rejects.toThrow('이미지를 내려받지 못했어요(연결 실패)');
  });
});

describe('detectImageMimeType', () => {
  it('내용으로 형식을 판별하고 모르면 null이다', () => {
    expect(detectImageMimeType(PNG)).toBe('image/png');
    expect(detectImageMimeType(SVG)).toBe('image/svg+xml');
    expect(detectImageMimeType(Buffer.from('hello'))).toBeNull();
  });
});
