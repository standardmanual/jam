/**
 * asset-generator CLI — 프리셋 목록 출력 검증 (티켓 20260926_1209)
 * 인자 검증·환경변수 누락 메시지·출력 형식·가짜 fetch로 home_feed 필터를 확인한다.
 */
import { describe, expect, it, vi } from 'vitest';
import { formatPresetLine, parseListArgs, requireApiEnv } from '../list-presets.mjs';
import { fetchPresetListFromAdminApi } from '../presetSource.mjs';

describe('parseListArgs', () => {
  it('생략하면 전체 목록(targetType 없음)이다', () => {
    expect(parseListArgs([])).toEqual({ targetType: undefined });
  });

  it.each(['badge', 'mission', 'collection', 'home_feed'])('허용값 %s를 받는다', (t) => {
    expect(parseListArgs(['--target-type', t])).toEqual({ targetType: t });
  });

  it('허용값 밖이면 허용값을 안내하는 한국어 오류를 던진다', () => {
    expect(() => parseListArgs(['--target-type', 'poster'])).toThrow(/올바르지 않아요: poster.*home_feed/);
  });

  it('값이 없으면 오류를 던진다', () => {
    expect(() => parseListArgs(['--target-type'])).toThrow(/값이 필요해요/);
  });

  it('알 수 없는 인자는 오류를 던진다', () => {
    expect(() => parseListArgs(['--type', 'badge'])).toThrow(/알 수 없는 인자예요: --type/);
  });
});

describe('requireApiEnv', () => {
  it('두 변수가 있으면 baseUrl·token을 돌려준다', () => {
    expect(requireApiEnv({ ADMIN_API_BASE_URL: 'https://x.app', ADMIN_API_READ_TOKEN: 't' })).toEqual({
      baseUrl: 'https://x.app',
      token: 't',
    });
  });

  it('없는 변수명을 모두 나열한다', () => {
    expect(() => requireApiEnv({})).toThrow(/ADMIN_API_BASE_URL·ADMIN_API_READ_TOKEN/);
    expect(() => requireApiEnv({ ADMIN_API_BASE_URL: 'https://x.app' })).toThrow(/ADMIN_API_READ_TOKEN/);
  });

  it('서비스 롤 변수만 있어도 통과시키지 않는다', () => {
    expect(() => requireApiEnv({ NEXT_PUBLIC_SUPABASE_URL: 'u', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow(
      /ADMIN_API_BASE_URL/
    );
  });
});

describe('formatPresetLine', () => {
  it('id · 이름 · 비율 형식이다', () => {
    expect(formatPresetLine({ id: 'p1', name: '홈피드', stageRatio: '1:1' })).toBe('p1 · 홈피드 · 1:1');
  });

  it('이름의 개행은 공백으로 바꾼다', () => {
    expect(formatPresetLine({ id: 'p1', name: '홈\n피드\r\n카드', stageRatio: '4:5' })).toBe('p1 · 홈 피드 카드 · 4:5');
  });
});

describe('가짜 fetch로 home_feed 목록 출력', () => {
  it('targetType 쿼리를 붙여 호출하고 홈피드 프리셋 id가 든 줄을 만든다', async () => {
    const mock = vi.fn(async (_url: string, _init: unknown) => ({
      ok: true,
      status: 200,
      json: async () => ({
        presets: [
          { id: '51aa4673-f723-4929-ac20-a302202b7aa7', name: '홈피드', targetType: 'home_feed', stageRatio: '4:5' },
        ],
      }),
    }));
    const fetchImpl = mock as unknown as typeof fetch;
    const presets = await fetchPresetListFromAdminApi({
      baseUrl: 'https://stage.example.app',
      token: 'tok',
      targetType: 'home_feed',
      fetchImpl,
    });
    expect(mock).toHaveBeenCalledWith(
      'https://stage.example.app/api/admin/asset-generator/presets?targetType=home_feed',
      { headers: { 'x-admin-read-token': 'tok' } }
    );
    expect(presets.map(formatPresetLine)).toEqual(['51aa4673-f723-4929-ac20-a302202b7aa7 · 홈피드 · 4:5']);
  });
});
