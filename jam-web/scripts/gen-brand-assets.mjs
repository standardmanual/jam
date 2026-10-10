#!/usr/bin/env node
// 20260925_1125 — 브랜드 로고 SVG에서 앱에 적용하는 이미지 7개를 다시 만든다.
//   node jam-web/scripts/gen-brand-assets.mjs          # 7개 파일을 쓴다
//   node jam-web/scripts/gen-brand-assets.mjs --check  # 쓰지 않고 SVG와 맞는지만 검사한다
// 원본: docs/assets/brand/jam_logo.svg(검정 로고), j.svg(흰색 J). 로고가 바뀌면 이 스크립트를 다시 돌린다.
// ICO는 새 패키지 없이 PNG 내장 방식으로 직접 조립한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(WEB_ROOT, '..');

export const LOGO_SVG = path.join(REPO_ROOT, 'docs/assets/brand/jam_logo.svg');
export const J_SVG = path.join(REPO_ROOT, 'docs/assets/brand/j.svg');

// 기존 규격 유지 — TopNav의 width={2610} height={925}가 그대로 유효해야 한다.
export const LOGO_W = 2610;
export const LOGO_H = 925;
// 아이콘 안 J의 높이 비율. 옛 아이콘 실측값(68.5%)을 시작값으로 쓴다. 답답해 보이면 여기만 줄인다.
export const J_HEIGHT_RATIO = 0.685;
export const ICO_SIZES = [16, 32, 48];

export const TARGETS = {
  logoWhite: path.join(WEB_ROOT, 'public/jam-logo-white.png'),
  icon: path.join(WEB_ROOT, 'src/app/icon.png'),
  appleIcon: path.join(WEB_ROOT, 'src/app/apple-icon.png'),
  favicon: path.join(WEB_ROOT, 'src/app/favicon.ico'),
  dsLogoWhite: path.join(WEB_ROOT, 'design-system/assets/logo/jam-logo-white.png'),
  dsLogoBlack: path.join(WEB_ROOT, 'design-system/assets/logo/jam-logo-black.png'),
  dsUpload: path.join(WEB_ROOT, 'design-system/uploads/jam_logo.png'),
};

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** 로고 SVG를 높이 925로 렌더해 2610×925 투명 캔버스 가운데에 놓는다. color: 'black' | 'white'. */
export async function renderLogo(color) {
  const svg = fs.readFileSync(LOGO_SVG, 'utf8').replaceAll('fill="black"', `fill="${color}"`);
  const { data, info } = await sharp(Buffer.from(svg), { density: 300 })
    .resize({ height: LOGO_H })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((LOGO_W - info.width) / 2);
  return sharp({ create: { width: LOGO_W, height: LOGO_H, channels: 4, background: CLEAR } })
    .composite([{ input: data, left, top: 0 }])
    .png()
    .toBuffer();
}

/** 새 j.svg(흰색)를 캔버스 높이의 J_HEIGHT_RATIO로 렌더한다. */
export async function renderJ(size) {
  const targetH = Math.round(size * J_HEIGHT_RATIO);
  const { data, info } = await sharp(J_SVG, { density: 600 })
    .resize({ height: targetH })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 검정 배경 + 흰 J를 정중앙에 놓은 정사각 아이콘. shape: 'circle'(모서리 투명) | 'square'(전체 불투명). */
export async function renderIcon(size, shape) {
  const j = await renderJ(size);
  const base =
    shape === 'circle'
      ? sharp(
          Buffer.from(
            `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="black"/></svg>`,
          ),
        )
      : sharp({ create: { width: size, height: size, channels: 4, background: BLACK } });
  return base
    .composite([
      {
        input: j.data,
        left: Math.round((size - j.width) / 2),
        top: Math.round((size - j.height) / 2),
      },
    ])
    .png()
    .toBuffer();
}

/** PNG 버퍼들을 내장한 ICO를 만든다(Vista 이후 PNG 내장 형식). 각 PNG는 정사각이어야 한다. */
export function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = Buffer.alloc(16 * pngs.length);
  let offset = 6 + entries.length;
  pngs.forEach(({ size, data }, i) => {
    const e = i * 16;
    entries.writeUInt8(size >= 256 ? 0 : size, e);
    entries.writeUInt8(size >= 256 ? 0 : size, e + 1);
    entries.writeUInt8(0, e + 2);
    entries.writeUInt8(0, e + 3);
    entries.writeUInt16LE(1, e + 4);
    entries.writeUInt16LE(32, e + 6);
    entries.writeUInt32LE(data.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += data.length;
  });
  return Buffer.concat([header, entries, ...pngs.map((p) => p.data)]);
}

/** ICO 버퍼에서 내장 PNG를 꺼낸다. [{ size, data }] */
export function parseIco(buf) {
  const count = buf.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    const size = buf.readUInt8(e) || 256;
    const len = buf.readUInt32LE(e + 8);
    const off = buf.readUInt32LE(e + 12);
    out.push({ size, data: buf.subarray(off, off + len) });
  }
  return out;
}

/** 원하는 산출물 전부를 메모리에 만든다. */
export async function buildAll() {
  const white = await renderLogo('white');
  const black = await renderLogo('black');
  const favicon = buildIco(
    await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await renderIcon(size, 'circle') }))),
  );
  return {
    [TARGETS.logoWhite]: white,
    [TARGETS.icon]: await renderIcon(512, 'circle'),
    [TARGETS.appleIcon]: await renderIcon(180, 'square'),
    [TARGETS.favicon]: favicon,
    [TARGETS.dsLogoWhite]: white,
    [TARGETS.dsLogoBlack]: black,
    [TARGETS.dsUpload]: black,
  };
}

/** RGBA 원시 픽셀을 읽는다. */
export async function readRaw(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** 두 이진 마스크(길이 같음)에서 서로 다른 픽셀의 비율. */
export function diffRatio(a, b) {
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

/** 알파 마스크: 알파 > 127이면 1. */
export function alphaMask({ data }) {
  const m = new Uint8Array(data.length / 4);
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/** 아이콘 안 J 마스크: 불투명하면서 밝은(R > 127) 픽셀이면 1. */
export function jMask({ data }) {
  const m = new Uint8Array(data.length / 4);
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 127 && data[i * 4] > 127 ? 1 : 0;
  return m;
}

const MASK_TOLERANCE = 0.01;

/** 저장소 파일이 SVG와 맞는지 검사한다. 어긋난 항목의 설명 배열을 돌려준다(비어 있으면 통과). */
export async function checkAssets() {
  const problems = [];
  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p) : null);

  for (const [key, color] of [
    ['logoWhite', 'white'],
    ['dsLogoBlack', 'black'],
  ]) {
    const file = read(TARGETS[key]);
    if (!file) {
      problems.push(`${TARGETS[key]}: 파일 없음`);
      continue;
    }
    const actual = await readRaw(file);
    if (actual.width !== LOGO_W || actual.height !== LOGO_H) {
      problems.push(`${key}: 크기 ${actual.width}x${actual.height} (기대 ${LOGO_W}x${LOGO_H})`);
      continue;
    }
    const expected = await readRaw(await renderLogo(color));
    const ratio = diffRatio(alphaMask(actual), alphaMask(expected));
    if (ratio >= MASK_TOLERANCE) problems.push(`${key}: 알파 마스크가 SVG와 ${(ratio * 100).toFixed(2)}% 다름`);
  }

  const same = (a, b) => {
    const fa = read(TARGETS[a]);
    const fb = read(TARGETS[b]);
    if (!fa || !fb || !fa.equals(fb)) problems.push(`${a}와 ${b}의 바이트가 다름`);
  };
  same('dsLogoWhite', 'logoWhite');
  same('dsUpload', 'dsLogoBlack');

  const iconSpecs = [
    ['icon', 512, 'circle'],
    ['appleIcon', 180, 'square'],
  ];
  for (const [key, size, shape] of iconSpecs) {
    const file = read(TARGETS[key]);
    if (!file) {
      problems.push(`${TARGETS[key]}: 파일 없음`);
      continue;
    }
    problems.push(...(await checkIconPng(key, file, size, shape)));
  }

  const ico = read(TARGETS.favicon);
  if (!ico) {
    problems.push(`${TARGETS.favicon}: 파일 없음`);
  } else {
    const entries = parseIco(ico);
    const sizes = entries.map((e) => e.size).sort((a, b) => a - b);
    if (sizes.join() !== ICO_SIZES.join()) problems.push(`favicon: 내장 크기 ${sizes.join('·')} (기대 ${ICO_SIZES.join('·')})`);
    for (const e of entries) problems.push(...(await checkIconPng(`favicon(${e.size})`, e.data, e.size, 'circle')));
  }
  return problems;
}

async function checkIconPng(label, file, size, shape) {
  const actual = await readRaw(file);
  if (actual.width !== size || actual.height !== size) return [`${label}: 크기 ${actual.width}x${actual.height} (기대 ${size}x${size})`];
  const problems = [];
  const expected = await readRaw(await renderIcon(size, shape));
  const ratio = diffRatio(jMask(actual), jMask(expected));
  if (ratio >= MASK_TOLERANCE) problems.push(`${label}: J 마스크가 새 j.svg와 ${(ratio * 100).toFixed(2)}% 다름`);
  const shapeRatio = diffRatio(alphaMask(actual), alphaMask(expected));
  if (shapeRatio >= MASK_TOLERANCE) problems.push(`${label}: 바탕 도형(${shape})이 ${(shapeRatio * 100).toFixed(2)}% 다름`);
  return problems;
}

async function main() {
  if (process.argv.includes('--check')) {
    const problems = await checkAssets();
    if (problems.length) {
      console.error(`브랜드 이미지가 SVG와 맞지 않는다:\n- ${problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log('브랜드 이미지 7개가 SVG와 맞는다.');
    return;
  }
  const outputs = await buildAll();
  for (const [file, data] of Object.entries(outputs)) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
    console.log(`쓴 파일: ${path.relative(REPO_ROOT, file)} (${data.length} bytes)`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
