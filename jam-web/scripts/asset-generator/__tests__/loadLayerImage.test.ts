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

describe('loadLayerImage URL 보호', () => {
  const stream = (chunks: Buffer[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        chunks.forEach((b) => c.enqueue(new Uint8Array(b)));
        c.close();
      },
    });
  const LIMIT = 5 * 1024 * 1024;

  it('https가 아니면 요청하지 않고 거절한다', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      return new Response(PNG);
    };
    await expect(loadLayerImage('http://cdn.test/a.png', { fetchImpl })).rejects.toThrow('https만');
    expect(called).toBe(false);
  });

  it('정상 https 이미지는 스트리밍으로 읽어 통과한다', async () => {
    const fetchImpl = async () => new Response(stream([PNG.subarray(0, 4), PNG.subarray(4)]), { status: 200 });
    const r = await loadLayerImage('https://cdn.test/a.png', { fetchImpl });
    expect(r.mimeType).toBe('image/png');
    expect(r.data.equals(PNG)).toBe(true);
  });

  it('시간이 초과되면 중단한다', async () => {
    const fetchImpl = (_u: string, init: { signal: AbortSignal }) =>
      new Promise<Response>((_res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    await expect(loadLayerImage('https://cdn.test/a.png', { fetchImpl, timeoutMs: 20 })).rejects.toThrow('시간이 너무 오래');
  });

  it('Content-Length가 5MB를 넘으면 본문을 읽기 전에 거절한다', async () => {
    let read = false;
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': String(LIMIT + 1) }),
      arrayBuffer: async () => {
        read = true;
        return new ArrayBuffer(0);
      },
    });
    await expect(loadLayerImage('https://cdn.test/a.png', { fetchImpl })).rejects.toThrow('이미지가 너무 커요');
    expect(read).toBe(false);
  });

  it('헤더가 없거나 거짓이어도 스트리밍이 5MB를 넘으면 중단한다', async () => {
    const big = Buffer.alloc(1024 * 1024);
    const fetchImpl = async () => new Response(stream([PNG, big, big, big, big, big]), { status: 200 });
    await expect(loadLayerImage('https://cdn.test/a.png', { fetchImpl })).rejects.toThrow('이미지가 너무 커요');
  });

  it('오류 문구에 주소의 쿼리·해시가 없다', async () => {
    const url = 'https://cdn.test/a.png?token=SECRET#frag';
    const notFound = async () => new Response('', { status: 404 });
    const broken = async () => {
      throw new Error('연결 실패');
    };
    const notImage = async () => new Response('hello', { status: 200 });
    for (const fetchImpl of [notFound, broken, notImage]) {
      const err = await loadLayerImage(url, { fetchImpl }).then(() => new Error('통과하면 안 돼요'), (e) => e as Error);
      expect(err.message).toContain('https://cdn.test/a.png');
      expect(err.message).not.toContain('SECRET');
      expect(err.message).not.toContain('frag');
    }
    const insecure = await loadLayerImage('http://cdn.test/a.png?token=SECRET').then(() => new Error('통과하면 안 돼요'), (e) => e as Error);
    expect(insecure.message).not.toContain('SECRET');
  });
});

describe('detectImageMimeType', () => {
  it('내용으로 형식을 판별하고 모르면 null이다', () => {
    expect(detectImageMimeType(PNG)).toBe('image/png');
    expect(detectImageMimeType(SVG)).toBe('image/svg+xml');
    expect(detectImageMimeType(Buffer.from('hello'))).toBeNull();
  });
});
