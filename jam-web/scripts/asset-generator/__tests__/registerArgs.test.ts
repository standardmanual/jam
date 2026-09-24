/**
 * 배지 등록 스크립트 — 인자 파싱 검증 (티켓 20260924_2202)
 */
import { describe, expect, it } from 'vitest';
import { parseRegisterArgs } from '../registerArgs.mjs';

const BUNDLE = '/tmp/bundles/a/bundle.json';
const RECORD = '/tmp/bundles/a/registration-record.json';

describe('parseRegisterArgs', () => {
  it('--bundle만 주면 등록 모드다(dry-run 아님)', () => {
    expect(parseRegisterArgs(['--bundle', BUNDLE])).toEqual({
      mode: 'register',
      bundle: BUNDLE,
      undo: undefined,
      recordDir: undefined,
      dryRun: false,
    });
  });

  it('--dry-run은 값 없는 플래그이고 위치와 무관하다', () => {
    expect(parseRegisterArgs(['--dry-run', '--bundle', BUNDLE]).dryRun).toBe(true);
    expect(parseRegisterArgs(['--bundle', BUNDLE, '--dry-run']).dryRun).toBe(true);
  });

  it('--record-dir을 --bundle과 함께 받는다', () => {
    const result = parseRegisterArgs(['--bundle', BUNDLE, '--record-dir', '/tmp/records']);
    expect(result.recordDir).toBe('/tmp/records');
  });

  it('--undo는 되돌림 모드다', () => {
    const result = parseRegisterArgs(['--undo', RECORD]);
    expect(result.mode).toBe('undo');
    expect(result.undo).toBe(RECORD);
    expect(result.dryRun).toBe(false);
  });

  it('--undo와 --dry-run을 함께 받는다', () => {
    expect(parseRegisterArgs(['--undo', RECORD, '--dry-run']).dryRun).toBe(true);
  });

  it('인자가 없으면 사용법을 안내한다', () => {
    expect(() => parseRegisterArgs([])).toThrow('--bundle 또는 --undo가 필요해요');
  });

  it('--bundle과 --undo를 함께 주면 거절한다', () => {
    expect(() => parseRegisterArgs(['--bundle', BUNDLE, '--undo', RECORD])).toThrow('함께 쓸 수 없어요');
  });

  it('--undo에 --record-dir을 주면 거절한다', () => {
    expect(() => parseRegisterArgs(['--undo', RECORD, '--record-dir', '/tmp/x'])).toThrow('--record-dir은 --bundle과 함께만');
  });

  it('상대 경로는 거절한다', () => {
    expect(() => parseRegisterArgs(['--bundle', 'bundle.json'])).toThrow('--bundle는 절대 경로');
    expect(() => parseRegisterArgs(['--undo', 'rec.json'])).toThrow('--undo는 절대 경로');
    expect(() => parseRegisterArgs(['--bundle', BUNDLE, '--record-dir', 'records'])).toThrow('--record-dir는 절대 경로');
  });

  it('값이 빠진 인자를 알려 준다', () => {
    expect(() => parseRegisterArgs(['--bundle'])).toThrow('--bundle 값이 필요해요');
    expect(() => parseRegisterArgs(['--bundle', '--dry-run'])).toThrow('--bundle 값이 필요해요');
  });

  it('모르는 인자와 형식이 틀린 인자를 거절한다', () => {
    expect(() => parseRegisterArgs(['--bundle', BUNDLE, '--force'])).toThrow('알 수 없는 인자예요: --force');
    expect(() => parseRegisterArgs(['bundle.json'])).toThrow('인자 형식이 올바르지 않아요');
  });
});
