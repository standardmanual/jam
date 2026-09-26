/**
 * asset-generator CLI — 프리셋 조회 경로 검증 (티켓 20260926_1204)
 * 가짜 fetch로 어드민 읽기 API 응답({ presets }, { preset })을 흉내 낸다.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  fetchPresetFromAdminApi,
  fetchPresetListFromAdminApi,
  normalizePreset,
  pickPresetSource,
  resolveEnv,
} from '../presetSource.mjs';

const TOKEN = 'secret-token-value';
const BASE = 'https://stage.example.app';

const textLayer = { id: 'l1', type: 'text', content: '저장된 문구', font: 'Pretendard', sizePct: 10 };
const imageLayer = { id: 'l2', type: 'image', assetUrl: 'https://cdn.example/a.png' };

// API 응답의 이미지 레이어는 이미 역직렬화돼 있어 overlayEnabled가 채워져 있다(티켓 20260926_1741)
const deserializedImageLayer = { ...imageLayer, overlayEnabled: false };

const apiPreset = {
  id: 'p1',
  name: '홈피드',
  targetType: 'home_feed',
  stageRatio: '4:5',
  layers: [textLayer, deserializedImageLayer],
  createdBy: 'u1',
  createdAt: '2026-09-26T00:00:00Z',
  updatedAt: '2026-09-26T00:00:00Z',
};

const dbRow = {
  id: 'p1',
  name: '홈피드',
  target_type: 'home_feed',
  stage_ratio: '4:5',
  layers: [textLayer, imageLayer],
  created_by: 'u1',
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
};

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

type FakeFetch = typeof fetch & { mock: { calls: unknown[][] } };

function fakeFetch(status: number, body: unknown = {}): FakeFetch {
  return vi.fn(async () => jsonResponse(status, body)) as unknown as FakeFetch;
}

describe('fetchPresetFromAdminApi', () => {
  it('200이면 정규화한 프리셋을 돌려준다', async () => {
    const fetchImpl = fakeFetch(200, { preset: apiPreset });
    const preset = await fetchPresetFromAdminApi({ baseUrl: BASE, token: TOKEN, presetId: 'p1', fetchImpl });
    expect(preset).toEqual(apiPreset);
  });

  it('요청 URL·헤더가 맞고 baseUrl 끝 슬래시는 제거하며 presetId는 인코딩한다', async () => {
    const fetchImpl = fakeFetch(200, { preset: apiPreset });
    await fetchPresetFromAdminApi({ baseUrl: `${BASE}/`, token: TOKEN, presetId: 'a b/c', fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(`${BASE}/api/admin/asset-generator/presets/a%20b%2Fc`);
    expect(init.headers['x-admin-read-token']).toBe(TOKEN);
  });

  it('404면 프리셋을 찾을 수 없다는 한국어 오류를 던진다', async () => {
    await expect(
      fetchPresetFromAdminApi({ baseUrl: BASE, token: TOKEN, presetId: 'nope', fetchImpl: fakeFetch(404) })
    ).rejects.toThrow('프리셋을 찾을 수 없어요: nope');
  });

  it.each([401, 403])('%i면 접근 거부 오류를 던지고 토큰 값은 메시지에 없다', async (status) => {
    const err = await fetchPresetFromAdminApi({
      baseUrl: BASE,
      token: TOKEN,
      presetId: 'p1',
      fetchImpl: fakeFetch(status),
    }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('접근을 거부했어요');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('네트워크 오류면 연결 실패 한국어 오류를 던지고 토큰 값은 메시지에 없다', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('fetch failed');
    }) as unknown as typeof fetch;
    const err = await fetchPresetFromAdminApi({ baseUrl: BASE, token: TOKEN, presetId: 'p1', fetchImpl }).catch(
      (e: Error) => e
    );
    expect((err as Error).message).toContain('연결하지 못했어요');
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it('그 밖의 상태 코드는 상태 코드를 담은 오류를 던진다', async () => {
    await expect(
      fetchPresetFromAdminApi({ baseUrl: BASE, token: TOKEN, presetId: 'p1', fetchImpl: fakeFetch(500) })
    ).rejects.toThrow('상태 코드 500');
  });
});

describe('normalizePreset', () => {
  it('DB 행 경로와 API 응답 경로가 같은 형태를 만든다', () => {
    const fromRow = normalizePreset(dbRow);
    const fromApi = normalizePreset(apiPreset);
    expect(fromRow).toEqual(fromApi);
    expect(Object.keys(fromRow).sort()).toEqual(
      ['createdAt', 'createdBy', 'id', 'layers', 'name', 'stageRatio', 'targetType', 'updatedAt'].sort()
    );
  });

  it('DB 행은 역직렬화를 한 번만 거친다(텍스트 content는 유지된다)', () => {
    const fromRow = normalizePreset(dbRow);
    expect(fromRow.layers[0].content).toBe('저장된 문구');
    expect(fromRow.layers[1]).toEqual(deserializedImageLayer);
  });

  it('API 응답은 layers를 다시 역직렬화하지 않고 그대로 둔다', () => {
    const withContent = { ...apiPreset, layers: [{ ...textLayer, content: '그대로' }] };
    expect(normalizePreset(withContent).layers[0].content).toBe('그대로');
  });
});

describe('fetchPresetListFromAdminApi', () => {
  it('targetType=home_feed 쿼리로 호출하고 presets 배열을 돌려준다', async () => {
    const fetchImpl = fakeFetch(200, { presets: [{ id: 'p1', name: '홈피드' }] });
    const presets = await fetchPresetListFromAdminApi({
      baseUrl: BASE,
      token: TOKEN,
      targetType: 'home_feed',
      fetchImpl,
    });
    expect(presets).toEqual([{ id: 'p1', name: '홈피드' }]);
    const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(`${BASE}/api/admin/asset-generator/presets?targetType=home_feed`);
    expect(init.headers['x-admin-read-token']).toBe(TOKEN);
  });

  it('403이면 접근 거부 오류를 던진다', async () => {
    await expect(
      fetchPresetListFromAdminApi({ baseUrl: BASE, token: TOKEN, targetType: 'home_feed', fetchImpl: fakeFetch(403) })
    ).rejects.toThrow('접근을 거부했어요');
  });
});

describe('resolveEnv · pickPresetSource', () => {
  const apiEnv = { ADMIN_API_BASE_URL: BASE, ADMIN_API_READ_TOKEN: TOKEN };
  const roleEnv = { NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'role-key' };

  it('process.env가 .env.local보다 우선한다', () => {
    expect(resolveEnv({ A: 'file', B: 'file' }, { A: 'proc' })).toEqual({ A: 'proc', B: 'file' });
  });

  it('API 변수가 둘 다 있으면 서비스 롤 키 없이도 admin-api를 고른다', () => {
    expect(pickPresetSource(apiEnv)).toEqual({ source: 'admin-api', baseUrl: BASE, token: TOKEN });
  });

  it('API 변수와 서비스 롤 변수가 모두 있으면 admin-api가 우선한다', () => {
    expect(pickPresetSource({ ...apiEnv, ...roleEnv }).source).toBe('admin-api');
  });

  it('API 변수가 하나라도 없고 서비스 롤 변수가 있으면 service-role을 고른다', () => {
    expect(pickPresetSource({ ADMIN_API_BASE_URL: BASE, ...roleEnv }).source).toBe('service-role');
    expect(pickPresetSource(roleEnv)).toEqual({
      source: 'service-role',
      supabaseUrl: roleEnv.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey: roleEnv.SUPABASE_SERVICE_ROLE_KEY,
    });
  });

  it('둘 다 불가하면 없는 변수명을 나열한 한국어 오류를 던진다', () => {
    expect(() => pickPresetSource({ ADMIN_API_BASE_URL: BASE })).toThrow(
      /ADMIN_API_READ_TOKEN.*NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY/
    );
  });
});
