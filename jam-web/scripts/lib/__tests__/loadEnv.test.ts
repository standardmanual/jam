import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { loadEnv } from '../loadEnv.mjs';

const ENV_PATH = path.resolve(__dirname, '..', '..', '..', '.env.local');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadEnv', () => {
  it('jam-web/.env.local이 없으면 빈 객체를 돌려준다', () => {
    const exists = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    expect(loadEnv()).toEqual({});
    expect(exists).toHaveBeenCalledWith(ENV_PATH);
  });

  it('KEY=값과 KEY="값"을 읽고 따옴표를 벗긴다', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('A_1=plain\nB_2="quoted value"\nC=\n');
    expect(loadEnv()).toEqual({ A_1: 'plain', B_2: 'quoted value', C: '' });
  });

  it('주석·소문자 키·형식이 다른 줄은 무시한다', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('# 주석\nlower=x\nno equals\nOK=1');
    expect(loadEnv()).toEqual({ OK: '1' });
  });
});
