/**
 * asset-generator 서버 글꼴 로더 — 순수 함수 검증 (티켓 20260924_2201)
 *
 * 네트워크(구글 폰트 다운로드)가 필요한 부분(downloadGoogleFontTtf·ensureFontCached)은 여기서
 * 검증하지 않는다 — 캐시 경로 계산·URL 생성·응답 파싱만 순수 함수로 확인한다.
 */
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildGoogleFontCssUrl, extractTtfUrl, getFontCachePath } from '../fonts.mjs';

describe('getFontCachePath', () => {
  it('family·weight로 os.tmpdir() 아래 캐시 파일 경로를 계산한다', () => {
    const result = getFontCachePath('Roboto', 700);
    expect(result).toBe(path.join(os.tmpdir(), 'jam-asset-generator-fonts', 'Roboto-700.ttf'));
  });

  it('공백·특수문자가 있는 family 이름을 파일 시스템에 안전한 이름으로 바꾼다', () => {
    const result = getFontCachePath('Noto Sans KR', 400);
    expect(result).toBe(path.join(os.tmpdir(), 'jam-asset-generator-fonts', 'Noto_Sans_KR-400.ttf'));
  });
});

describe('buildGoogleFontCssUrl', () => {
  it('family의 공백을 +로 바꾸고 굵기를 wght 파라미터에 넣는다', () => {
    const url = buildGoogleFontCssUrl('Noto Sans KR', 700);
    expect(url).toBe('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&display=swap');
  });
});

describe('extractTtfUrl', () => {
  it('css2 응답 본문에서 TTF 파일 주소를 뽑는다', () => {
    const css = `@font-face {\n  src: url(https://fonts.gstatic.com/s/roboto/v51/abc.ttf) format('truetype');\n}`;
    expect(extractTtfUrl(css)).toBe('https://fonts.gstatic.com/s/roboto/v51/abc.ttf');
  });

  it('TTF 주소가 없으면 한국어 오류를 던진다', () => {
    expect(() => extractTtfUrl('')).toThrow('TTF');
  });
});
