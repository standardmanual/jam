/**
 * asset-generator 서버 렌더 `renderCardPng` 검증 (티켓 20260926_1341·20260926_1824, 캐시 키 20260927_0124)
 *
 * 프리셋 조회 두 경로(admin-api·service-role)는 스텁으로 배선을 확인하고, 그림은 실제 @napi-rs/canvas로 그려
 * 투명 PNG의 알파·원본 비율·컬러 오버레이·`--img01` 원본 교체를 실제 픽셀로 확인한다. 글꼴 다운로드는 스텁이다.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { loadImageAsCanvas } from '../serverCanvas';

const loadFontStub = vi.hoisted(() => vi.fn<(font: unknown) => Promise<undefined>>(async () => undefined));
vi.mock('../fonts.mjs', () => ({ createServerFontLoader: () => loadFontStub }));

import { renderCardPng } from '../renderCard.mjs';

const BG = '#112233';
const ADMIN_ENV = { ADMIN_API_BASE_URL: 'https://admin.test/', ADMIN_API_READ_TOKEN: 'tok-secret' };
const ROLE_ENV = { NEXT_PUBLIC_SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_ROLE_KEY: 'role-key' };

/** 왼쪽 절반만 지정한 색으로 칠하고 오른쪽 절반은 투명한 w×h PNG */
function halfTransparentPng(w: number, h: number, color: string): Buffer {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w / 2, h);
  return canvas.toBuffer('image/png');
}

const dataUrl = (png: Buffer) => `data:image/png;base64,${png.toString('base64')}`;

const imageLayer = (id: string, assetUrl: string, extra: Record<string, unknown> = {}) => ({
  type: 'image', id, assetUrl, xPct: 50, yPct: 50, widthPct: 50, rotationDeg: 0, opacityPct: 100, ...extra,
});

const textLayer = (id: string, font = { family: 'Noto Sans KR', weight: 700 }) => ({
  type: 'text', id, content: '글자', font, sizePct: 5, letterSpacing: 0, lineHeight: 1.2, align: 'center', color: '#ffffff',
  xPct: 50, yPct: 20, rotationDeg: 0, opacityPct: 100,
});

const apiPreset = (layers: unknown[], stageRatio = '1:1') => ({
  id: 'p1', name: '테스트', targetType: 'badge', stageRatio, layers, createdBy: 'u', createdAt: 'a', updatedAt: 'b',
});

function adminDeps(layers: unknown[], stageRatio = '1:1') {
  const fetchImpl = vi.fn<(url: string, init?: unknown) => Promise<unknown>>(async () => ({ ok: true, status: 200, json: async () => ({ preset: apiPreset(layers, stageRatio) }) }));
  return { env: ADMIN_ENV, fetchImpl };
}

type Pixel = [number, number, number, number];
async function pixelAt(png: Buffer, x: number, y: number): Promise<Pixel> {
  const canvas = await loadImageAsCanvas(png);
  const d = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  return [d[0], d[1], d[2], d[3]];
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'render-card-test-'));
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const ARGS = { preset: 'p1', bg: BG, end: BG, seed: 1 };

describe('renderCardPng 프리셋 조회 경로', () => {
  it('admin-api 경로: 읽기 토큰 헤더로 프리셋 URL을 호출하고 반환 계약을 지킨다', async () => {
    const deps = adminDeps([]);
    const result = await renderCardPng(ARGS, deps);
    expect(deps.fetchImpl).toHaveBeenCalledWith('https://admin.test/api/admin/asset-generator/presets/p1', {
      headers: { 'x-admin-read-token': 'tok-secret' },
    });
    expect(result.presetSource).toBe('admin-api');
    expect(result.seed).toBe(1);
    expect(result.stage).toEqual({ w: 1280, h: 1280 });
    expect(result.layers).toEqual({ applied: [], saved: [] });
    expect(result.buffer.subarray(1, 4).toString()).toBe('PNG');
  });

  it('admin-api 경로: 비율 16:9는 스테이지 크기에 반영된다', async () => {
    const result = await renderCardPng(ARGS, adminDeps([], '16:9'));
    expect(result.stage).toEqual({ w: 1280, h: 720 });
  });

  it('service-role 경로: asset_presets를 id로 조회하고 직렬화된 행을 정규화한다', async () => {
    const row = {
      id: 'p1', name: '테스트', target_type: 'badge', stage_ratio: '4:5', layers: [], created_by: 'u', created_at: 'a', updated_at: 'b',
    };
    const maybeSingle = vi.fn(async () => ({ data: row, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    const createClient = vi.fn(() => ({ from }));
    const result = await renderCardPng({ ...ARGS, seed: 5 }, { env: ROLE_ENV, createClient });
    expect(createClient).toHaveBeenCalledWith('https://db.test', 'role-key');
    expect(from).toHaveBeenCalledWith('asset_presets');
    expect(eq).toHaveBeenCalledWith('id', 'p1');
    expect(result.presetSource).toBe('service-role');
    expect(result.stage).toEqual({ w: 1024, h: 1280 });
  });

  it('service-role 경로: 조회 오류·없는 프리셋은 한국어 오류다', async () => {
    const make = (res: unknown) => ({
      env: ROLE_ENV,
      createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) }),
    });
    await expect(renderCardPng(ARGS, make({ data: null, error: { message: 'boom' } }))).rejects.toThrow('프리셋 조회에 실패했어요: boom');
    await expect(renderCardPng(ARGS, make({ data: null, error: null }))).rejects.toThrow('프리셋을 찾을 수 없어요: p1');
  });

  it('두 경로 변수가 모두 있으면 admin-api가 우선이다', async () => {
    const deps = { ...adminDeps([]), env: { ...ROLE_ENV, ...ADMIN_ENV }, createClient: vi.fn() };
    const result = await renderCardPng(ARGS, deps);
    expect(result.presetSource).toBe('admin-api');
    expect(deps.createClient).not.toHaveBeenCalled();
  });

  it('프리셋을 조회할 환경변수가 없으면 오류다', async () => {
    await expect(renderCardPng(ARGS, { env: {} })).rejects.toThrow('환경변수가 없어요');
  });

  it('시스템 기본 글꼴이 아닌 텍스트 레이어는 글꼴을 먼저 등록한다', async () => {
    loadFontStub.mockClear();
    await renderCardPng(ARGS, adminDeps([textLayer('t1')]));
    expect(loadFontStub).toHaveBeenCalledWith({ family: 'Noto Sans KR', weight: 700 });
  });
});

describe('renderCardPng 실제 캔버스 결과', () => {
  // 1:1 스테이지 1280, 이미지 200×100을 widthPct 50 → 640×320, 중심 (640, 640). 왼쪽 절반(x 320~640)만 불투명.
  const png = halfTransparentPng(200, 100, '#ff0000');

  it('투명한 영역은 알파가 유지되어 배경이 비치고 불투명한 영역은 이미지 색이다', async () => {
    const { buffer } = await renderCardPng(ARGS, adminDeps([imageLayer('i1', dataUrl(png))]));
    expect(await pixelAt(buffer, 480, 640)).toEqual([255, 0, 0, 255]); // 불투명 절반
    expect(await pixelAt(buffer, 800, 640)).toEqual([0x11, 0x22, 0x33, 255]); // 투명 절반 = 배경
  });

  it('세로 크기는 원본 비율로 정해진다(640×320)', async () => {
    const { buffer } = await renderCardPng(ARGS, adminDeps([imageLayer('i1', dataUrl(png))]));
    expect(await pixelAt(buffer, 480, 640 - 150)).toEqual([255, 0, 0, 255]); // 위쪽 경계 안
    expect(await pixelAt(buffer, 480, 640 - 170)).toEqual([0x11, 0x22, 0x33, 255]); // 위쪽 경계 밖
    expect(await pixelAt(buffer, 480, 640 + 150)).toEqual([255, 0, 0, 255]);
    expect(await pixelAt(buffer, 480, 640 + 170)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('overlayEnabled면 overlayColor가 불투명한 부분에만 입혀지고 투명한 부분은 그대로다', async () => {
    const layer = imageLayer('i1', dataUrl(png), { overlayEnabled: true, overlayColor: '#00ff00' });
    const { buffer } = await renderCardPng(ARGS, adminDeps([layer]));
    expect(await pixelAt(buffer, 480, 640)).toEqual([0, 255, 0, 255]);
    expect(await pixelAt(buffer, 800, 640)).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('overlayEnabled가 꺼져 있으면 overlayColor가 있어도 원래 색이다', async () => {
    const layer = imageLayer('i1', dataUrl(png), { overlayEnabled: false, overlayColor: '#00ff00' });
    const { buffer } = await renderCardPng(ARGS, adminDeps([layer]));
    expect(await pixelAt(buffer, 480, 640)).toEqual([255, 0, 0, 255]);
  });

  it('같은 시드·같은 입력이면 PNG 바이트가 같다', async () => {
    const a = await renderCardPng(ARGS, adminDeps([imageLayer('i1', dataUrl(png))]));
    const b = await renderCardPng(ARGS, adminDeps([imageLayer('i1', dataUrl(png))]));
    expect(a.buffer.equals(b.buffer)).toBe(true);
  });

  it('--img01 원본은 그 번호 레이어에만 쓰이고, 같은 assetUrl을 가진 다른 이미지 레이어는 저장된 원본을 쓴다', async () => {
    const replacement = path.join(tmpDir, 'blue.png');
    fs.writeFileSync(replacement, halfTransparentPng(200, 100, '#0000ff'));
    const saved = dataUrl(png);
    // 목록 순서: img01(위쪽, y 25%), img02(아래쪽, y 75%) — 둘 다 같은 assetUrl
    const layers = [imageLayer('i1', saved, { yPct: 25 }), imageLayer('i2', saved, { yPct: 75 })];
    const result = await renderCardPng({ ...ARGS, values: { img01: replacement } }, adminDeps(layers));
    expect(result.layers).toEqual({ applied: ['img01'], saved: ['img02'] });
    expect(await pixelAt(result.buffer, 480, 320)).toEqual([0, 0, 255, 255]); // img01 = 교체 원본
    expect(await pixelAt(result.buffer, 480, 960)).toEqual([255, 0, 0, 255]); // img02 = 저장된 원본
  });

  it('불러올 수 없는 저장 이미지는 레이어 원본 오류로 멈춘다', async () => {
    const layers = [imageLayer('i1', 'data:image/png;base64,AAAA')];
    await expect(renderCardPng(ARGS, adminDeps(layers))).rejects.toThrow('프리셋 이미지 레이어 원본을 불러오지 못했어요');
  });
});
