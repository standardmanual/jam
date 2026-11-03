// 티켓 20261103_1712 — 「SVG 파일」 모드 기본 로고 상수 시험.
// vitest는 node 환경이라 DOMParser가 없어, 브라우저가 해 줄 일을 @xmldom/xmldom으로 대신한다.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DOMParser as XmlDomParser, XMLSerializer as XmlSerializer } from '@xmldom/xmldom';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { svgToOutline } from '@/lib/logo-3d/svgOutline';
import { DEFAULT_LOGO_SVG, DEFAULT_LOGO_SVG_LABEL } from '../logo3dDefaultSvg';
import { logo3dFileName } from '../logo3dConfig';

const LOGO_FILE = readFileSync(path.resolve(__dirname, '../../../../../design-system/assets/logo/jam-logo.svg'), 'utf8');

const globals = globalThis as Record<string, unknown>;
const original = { DOMParser: globals.DOMParser, XMLSerializer: globals.XMLSerializer };

beforeAll(() => {
  globals.DOMParser = XmlDomParser;
  globals.XMLSerializer = XmlSerializer;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterAll(() => {
  globals.DOMParser = original.DOMParser;
  globals.XMLSerializer = original.XMLSerializer;
  vi.restoreAllMocks();
});

const stripSpace = (s: string) => s.replace(/\s+/g, '');

describe('DEFAULT_LOGO_SVG', () => {
  it('디자인시스템 로고 파일과 공백 차이를 빼고 같다 (다르면 상수를 새 로고로 갱신)', () => {
    expect(stripSpace(DEFAULT_LOGO_SVG)).toBe(stripSpace(LOGO_FILE));
  });

  it('svgToOutline에 넣으면 J·A·M 세 영역이 나오고 A에만 구멍이 1개 있다', () => {
    const result = svgToOutline(DEFAULT_LOGO_SVG);
    expect(result.error).toBeNull();
    expect(result.outline).toHaveLength(3);
    expect(result.outline.map((p) => p.holes.length).sort()).toEqual([0, 0, 1]);
  });

  it('기본 로고 label로 PNG 파일명이 logo-3d-jam-logo-{비율}.png가 된다', () => {
    expect(logo3dFileName(DEFAULT_LOGO_SVG_LABEL, '16:9')).toBe('logo-3d-jam-logo-16x9.png');
  });
});
