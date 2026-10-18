/**
 * 배지 등록 묶음 — 검증·배지 행 매핑 (티켓 20260924_2202)
 *
 * 검증 규칙의 정본은 docs/service/prd/asset-generator/REGISTRATION_BUNDLE.md다. 여기서는 규칙마다
 * «어떤 사유 문장이 나오는지»까지 확인한다(에이전트가 이 문장을 보고 묶음을 고친다).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  SUPPORTED_BADGE_TYPES,
  buildBadgeInsertPayload,
  findPreviousRecordError,
  readBundleFile,
  validateBundle,
} from '../registerBundle.mjs';

const FIXTURE_DIR = path.join(__dirname, '..', '__fixtures__', 'example-bundle');
// insert 페이로드 매핑은 라우트와 공용인 순수 함수로 옮겼다(티켓 20260925_0541 (b)) — 키 목록은 그 파일에서 읽는다.
const ROUTE_FILE = path.join(__dirname, '..', '..', '..', 'src', 'lib', 'admin', 'badge-insert-payload.ts');

let workDir: string;
let bundleFile: string;

beforeAll(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-bundle-test-'));
  fs.copyFileSync(path.join(FIXTURE_DIR, 'image.png'), path.join(workDir, 'image.png'));
  bundleFile = path.join(workDir, 'bundle.json');
});

afterAll(() => {
  fs.rmSync(workDir, { recursive: true, force: true });
});

interface RawBundle {
  badge: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

/** 예시 묶음과 같은 내용의 유효한 원본(테스트마다 복사해서 한 필드씩 망가뜨린다) */
function validRaw(): RawBundle {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, 'bundle.json'), 'utf8'));
}

function validate(raw: unknown) {
  return validateBundle(raw, { bundleFile });
}

describe('validateBundle — 통과', () => {
  it('예시 묶음은 통과하고 이미지 절대경로·크기가 붙는다', () => {
    const { errors, bundle } = validateBundle(readBundleFile(path.join(FIXTURE_DIR, 'bundle.json')), {
      bundleFile: path.join(FIXTURE_DIR, 'bundle.json'),
    });
    expect(errors).toEqual([]);
    expect(bundle.image.abs_path).toBe(path.join(FIXTURE_DIR, 'image.png'));
    expect(bundle.image.bytes).toBeGreaterThan(0);
    expect(bundle.badge.name).toBe('[TEST] 예시 산책 배지');
  });

  it('이미지 경로는 절대경로도 허용한다', () => {
    const raw = validRaw();
    raw.image.path = path.join(workDir, 'image.png');
    const { errors, bundle } = validate(raw);
    expect(errors).toEqual([]);
    expect(bundle.image.abs_path).toBe(path.join(workDir, 'image.png'));
  });

  it('활동 배지: 레벨형 + 계열 키 조합을 받는다', () => {
    const raw = validRaw();
    delete raw.badge.rarity;
    raw.badge.level = 2;
    raw.badge.family_key = 'walking:EXAMPLE';
    expect(validate(raw).errors).toEqual([]);
  });

  it('아이템 배지: 트라이브·컬렉션·드랍 가중치·유효 기간을 받는다', () => {
    const raw = validRaw();
    raw.badge = {
      name: '[TEST] 예시 아이템',
      description: '아이템 예시입니다.',
      type: 'item',
      rarity: 'rare',
      activity_types: ['running', 'cycling'],
      tribe_id: '22222222-2222-4222-8222-222222222222',
      item_book_id: '33333333-3333-4333-8333-333333333333',
      drop_weight: 2.5,
      valid_from: '2026-10-01T00:00:00+09:00',
      valid_until: '2026-10-31T23:59:59+09:00',
    };
    expect(validate(raw).errors).toEqual([]);
  });

  it('지원 유형은 activity와 item뿐이다', () => {
    expect(SUPPORTED_BADGE_TYPES).toEqual(['activity', 'item']);
  });
});

describe('validateBundle — 필수 항목·형식', () => {
  it('필수 항목이 없으면 항목마다 사유를 낸다', () => {
    const { errors, bundle } = validate({});
    expect(bundle).toBeNull();
    for (const key of ['bundle_id', 'author', 'created_at', 'color_rationale_link', 'badge', 'image']) {
      expect(errors).toContain(`${key}: 필수 항목이 없어요.`);
    }
  });

  it('badge·image 안의 필수 항목 누락도 각각 알린다', () => {
    const { errors } = validate({ ...validRaw(), badge: {}, image: {} });
    for (const key of ['name', 'description', 'type']) {
      expect(errors).toContain(`badge.${key}: 필수 항목이 없어요.`);
    }
    for (const key of ['path', 'seed', 'preset_id', 'bg_color', 'end_color']) {
      expect(errors).toContain(`image.${key}: 필수 항목이 없어요.`);
    }
  });

  it('작성자·배지 이름에 줄바꿈이나 제어 문자가 있으면 거절한다(SQL 주석 주입 방지)', () => {
    for (const bad of ['윤진\nDROP TABLE x;', '윤진\r\nx', '윤진\u2028x', '윤진\u0000x', '윤진\tx']) {
      const a = validRaw();
      a.author = bad;
      expect(validate(a).errors).toContain('author: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).');
      const b = validRaw();
      b.badge.name = bad;
      expect(validate(b).errors).toContain('badge.name: 줄바꿈이나 제어 문자를 쓸 수 없어요(한 줄로 적어 주세요).');
    }
    expect(validate(validRaw()).errors).toEqual([]);
  });

  it('최상위가 객체가 아니면 거절한다', () => {
    expect(validate([]).errors).toEqual(['묶음 파일의 최상위는 객체여야 해요.']);
  });

  it('알 수 없는 필드는 지원 필드 목록과 함께 알린다', () => {
    const raw = validRaw();
    raw.extra = 1;
    raw.badge.category = 'cafe';
    raw.image.foo = 'x';
    const { errors } = validate(raw);
    expect(errors.some((e) => e.startsWith('알 수 없는 최상위 필드예요 — extra'))).toBe(true);
    expect(errors.some((e) => e.includes('묶음이 지원하지 않는 필드예요 — category'))).toBe(true);
    expect(errors.some((e) => e.includes('image: 알 수 없는 필드예요 — foo'))).toBe(true);
  });

  it('bundle_id·created_at·color_rationale_link 형식 오류', () => {
    const raw = validRaw();
    raw.bundle_id = 'Bad ID';
    raw.created_at = '2026-09-25 10:30';
    raw.color_rationale_link = 'notes.md';
    const { errors } = validate(raw);
    expect(errors.some((e) => e.startsWith('bundle_id: 영문 소문자'))).toBe(true);
    expect(errors.some((e) => e.startsWith('created_at: 시간대가 붙은 ISO 8601'))).toBe(true);
    expect(errors.some((e) => e.startsWith('color_rationale_link: http(s) 주소이거나'))).toBe(true);
  });

  it('컬러 근거 링크는 https 주소도 허용한다', () => {
    const raw = validRaw();
    raw.color_rationale_link = 'https://example.com/doc';
    expect(validate(raw).errors).toEqual([]);
  });

  it('배지 이름·설명이 공백뿐이면 거절한다', () => {
    const raw = validRaw();
    raw.badge.name = '   ';
    raw.badge.description = '';
    const { errors } = validate(raw);
    expect(errors).toContain('badge.name: 비어 있지 않은 문자열이어야 해요.');
    expect(errors).toContain('badge.description: 비어 있지 않은 문자열이어야 해요.');
  });
});

describe('validateBundle — 이미지·색·시드·프리셋', () => {
  it('이미지 파일이 없으면 경로와 함께 알린다', () => {
    const raw = validRaw();
    raw.image.path = 'missing.png';
    const { errors } = validate(raw);
    expect(errors).toEqual([`image.path: 이미지 파일을 찾을 수 없어요: ${path.join(workDir, 'missing.png')}`]);
  });

  it('PNG가 아닌 파일은 확장자가 .png여도 거절한다', () => {
    fs.writeFileSync(path.join(workDir, 'fake.png'), 'not a png at all');
    const raw = validRaw();
    raw.image.path = 'fake.png';
    expect(validate(raw).errors).toEqual([`image.path: PNG 파일이 아니에요: ${path.join(workDir, 'fake.png')}`]);
  });

  it('빈 이미지 파일을 거절한다', () => {
    fs.writeFileSync(path.join(workDir, 'empty.png'), '');
    const raw = validRaw();
    raw.image.path = 'empty.png';
    expect(validate(raw).errors[0]).toContain('이미지 파일이 비어 있어요');
  });

  it('5MB를 넘는 이미지를 거절한다', () => {
    const big = Buffer.concat([fs.readFileSync(path.join(FIXTURE_DIR, 'image.png')), Buffer.alloc(5 * 1024 * 1024)]);
    fs.writeFileSync(path.join(workDir, 'big.png'), big);
    const raw = validRaw();
    raw.image.path = 'big.png';
    expect(validate(raw).errors[0]).toContain('5MB 이하만 등록할 수 있어요');
  });

  it('색이 #rrggbb 형식이 아니면 어느 필드인지 알린다', () => {
    const raw = validRaw();
    raw.image.bg_color = 'red';
    raw.image.end_color = '#ff4dff00';
    const { errors } = validate(raw);
    expect(errors).toContain('image.bg_color: #rrggbb 형식이어야 해요(받은 값: "red").');
    expect(errors).toContain('image.end_color: #rrggbb 형식이어야 해요(받은 값: "#ff4dff00").');
  });

  it('시드는 정수여야 한다', () => {
    for (const seed of [1.5, '123', Number.NaN]) {
      const raw = validRaw();
      raw.image.seed = seed;
      expect(validate(raw).errors.some((e) => e.startsWith('image.seed: 정수여야 해요'))).toBe(true);
    }
    const negative = validRaw();
    negative.image.seed = -7;
    expect(validate(negative).errors).toEqual([]);
  });

  it('프리셋 ID는 UUID 형식이어야 한다', () => {
    const raw = validRaw();
    raw.image.preset_id = 'preset-1';
    expect(validate(raw).errors).toEqual(['image.preset_id: 프리셋 ID(UUID) 형식이 아니에요(받은 값: "preset-1").']);
  });

  it('image.text는 선택이고 문자열이어야 한다', () => {
    const raw = validRaw();
    delete raw.image.text;
    expect(validate(raw).errors).toEqual([]);
    raw.image.text = 3;
    expect(validate(raw).errors).toEqual(['image.text: 문자열이어야 해요.']);
  });

  it('여러 오류를 한 번에 모아서 알린다', () => {
    const raw = validRaw();
    raw.image.bg_color = 'red';
    raw.image.seed = 1.5;
    raw.author = '';
    expect(validate(raw).errors).toHaveLength(3);
  });
});

describe('validateBundle — 배지 유형·규칙(어드민 API와 같은 검증 함수)', () => {
  it('checkin 배지는 POI 연결이 필요하다는 사유로 거절한다', () => {
    const raw = validRaw();
    raw.badge.type = 'checkin';
    expect(validate(raw).errors).toEqual([
      'badge.type: checkin 배지는 POI 연결이 필요해서 묶음으로 등록할 수 없어요(지원 유형: activity, item).',
    ]);
  });

  it('모르는 유형을 거절한다', () => {
    const raw = validRaw();
    raw.badge.type = 'mission';
    expect(validate(raw).errors).toEqual(['badge.type: activity 또는 item이어야 해요(받은 값: "mission").']);
  });

  it('등급과 레벨을 함께 주면 배타 규칙으로 거절한다', () => {
    const raw = validRaw();
    raw.badge.level = 3;
    const { errors } = validate(raw);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('badge.rarity/level:');
    expect(errors[0]).toContain('등급형과 레벨형은 함께 지정할 수 없습니다');
  });

  it('등급도 레벨도 없으면 거절한다', () => {
    const raw = validRaw();
    delete raw.badge.rarity;
    expect(validate(raw).errors[0]).toContain('배지 종류가 정해지지 않았습니다');
  });

  it('모르는 등급 값과 0 이하 레벨을 거절한다', () => {
    const badRarity = validRaw();
    badRarity.badge.rarity = 'legend';
    expect(validate(badRarity).errors[0]).toContain('등급 값(legend)을 알 수 없습니다');

    const badLevel = validRaw();
    delete badLevel.badge.rarity;
    badLevel.badge.level = 0;
    expect(validate(badLevel).errors[0]).toContain('레벨 값(0)이 올바르지 않습니다');
  });

  it('계열 키 형식이 틀리면 거절한다(쉼표·콜론 없음·# 접두어)', () => {
    for (const key of ['walking', 'walking:a,b', '#name:foo']) {
      const raw = validRaw();
      raw.badge.family_key = key;
      const { errors } = validate(raw);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`badge.family_key: 계열 키 형태(${key})가 올바르지 않아요`);
    }
  });

  it('엔진이 모르는 조건 필드를 저장 검증으로 거절한다', () => {
    const raw = validRaw();
    raw.badge.condition_json = { activity_type: 'walking', unknown_metric: 3 };
    const { errors } = validate(raw);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('badge.condition_json:');
    expect(errors[0]).toContain('unknown_metric');
  });

  it('아이템 배지에 누적 조건을 걸면 거절한다(드랍 후보 영구 제외 방지)', () => {
    const raw = validRaw();
    raw.badge.type = 'item';
    raw.badge.condition_json = { activity_type: 'walking', distance_km: 5 };
    const { errors } = validate(raw);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('아이템 배지에는 누적조건');
  });

  it('condition_json이 객체가 아니면 거절한다', () => {
    const raw = validRaw();
    raw.badge.condition_json = 'distance';
    expect(validate(raw).errors).toEqual(['badge.condition_json: 객체(또는 null)여야 해요.']);
  });

  it('숫자·배열·UUID·기간 필드 형식 오류', () => {
    const raw = validRaw();
    raw.badge.sort_order = -1;
    raw.badge.point_reward = 1.5;
    raw.badge.drop_weight = 0;
    raw.badge.activity_types = ['swimming'];
    raw.badge.tribe_id = 'tribe';
    raw.badge.item_book_id = 'book';
    raw.badge.valid_from = '2026-10-01';
    raw.badge.valid_until = '2026-09-01T00:00:00+09:00';
    const { errors } = validate(raw);
    expect(errors).toContain('badge.sort_order: 0 이상의 정수여야 해요.');
    expect(errors).toContain('badge.point_reward: 0 이상의 정수여야 해요.');
    expect(errors).toContain('badge.drop_weight: 0보다 큰 숫자여야 해요.');
    expect(errors.some((e) => e.startsWith('badge.activity_types:'))).toBe(true);
    expect(errors).toContain('badge.tribe_id: UUID 형식이어야 해요.');
    expect(errors).toContain('badge.item_book_id: UUID 형식이어야 해요.');
    expect(errors.some((e) => e.startsWith('badge.valid_from: 시간대가 붙은 ISO 8601'))).toBe(true);
  });

  it('유효 기간의 시작이 끝보다 늦으면 거절한다', () => {
    const raw = validRaw();
    raw.badge.valid_from = '2026-11-01T00:00:00+09:00';
    raw.badge.valid_until = '2026-10-01T00:00:00+09:00';
    expect(validate(raw).errors).toEqual(['badge.valid_from: valid_until보다 앞이어야 해요.']);
  });
});

describe('readBundleFile', () => {
  it('파일이 없으면 경로와 함께 알린다', () => {
    expect(() => readBundleFile(path.join(workDir, 'nope.json'))).toThrow('묶음 파일을 찾을 수 없어요');
  });

  it('JSON이 깨졌으면 알린다', () => {
    fs.writeFileSync(path.join(workDir, 'broken.json'), '{ "bundle_id": ');
    expect(() => readBundleFile(path.join(workDir, 'broken.json'))).toThrow('올바른 JSON이 아니에요');
  });
});

describe('buildBadgeInsertPayload', () => {
  const ARGS = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', imageUrl: 'https://cdn.test/x.webp?v=1' };

  it('필수 필드만 있으면 어드민 API와 같은 기본값이 채워진다', () => {
    const payload = buildBadgeInsertPayload({ name: '이름', description: '설명', type: 'activity', rarity: 'common' }, ARGS);
    expect(payload).toEqual({
      id: ARGS.id,
      name: '이름',
      description: '설명',
      type: 'activity',
      rarity: 'common',
      level: null,
      family_key: null,
      sort_order: 0,
      image_url: ARGS.imageUrl,
      image_source: 'agent-generator',
      activity_types: [],
      patch_available: false,
      patch_price_krw: null,
      condition_json: null,
      tribe_id: null,
      item_book_id: null,
      category: null,
      admin_category: null,
      show_on_map: true,
      drop_weight: 1,
      valid_from: null,
      valid_until: null,
      point_reward: 0,
      background_color: null,
      background_shader_id: null,
      background_image_url: null,
      background_video_url: null,
      background_animation: null,
      always_locked: false,
      unlock_required: null,
      is_hidden: false,
      branch_key: null,
    });
  });

  it('레벨형은 rarity를 null로 두고 level을 정수로 넣는다', () => {
    const payload = buildBadgeInsertPayload(
      { name: '이름', description: '설명', type: 'activity', level: 3, family_key: ' walking:K1 ' },
      ARGS
    );
    expect(payload.rarity).toBeNull();
    expect(payload.level).toBe(3);
    expect(payload.family_key).toBe('walking:K1');
  });

  it('지정한 값은 그대로 넣는다', () => {
    const payload = buildBadgeInsertPayload(
      {
        name: '이름',
        description: '설명',
        type: 'item',
        rarity: 'mystic',
        sort_order: 105,
        activity_types: ['running'],
        point_reward: 20,
        drop_weight: 0.5,
        condition_json: { activity_type: 'running' },
        tribe_id: '22222222-2222-4222-8222-222222222222',
        item_book_id: '33333333-3333-4333-8333-333333333333',
        valid_from: '2026-10-01T00:00:00+09:00',
        valid_until: '2026-10-31T00:00:00+09:00',
      },
      ARGS
    );
    expect(payload).toMatchObject({
      type: 'item',
      rarity: 'mystic',
      sort_order: 105,
      activity_types: ['running'],
      point_reward: 20,
      drop_weight: 0.5,
      condition_json: { activity_type: 'running' },
      tribe_id: '22222222-2222-4222-8222-222222222222',
      item_book_id: '33333333-3333-4333-8333-333333333333',
      valid_from: '2026-10-01T00:00:00+09:00',
      valid_until: '2026-10-31T00:00:00+09:00',
    });
  });

  it('라우트 키 목록 대조: 어드민 배지 생성 API의 insertPayload 키를 모두 포함한다', () => {
    const source = fs.readFileSync(ROUTE_FILE, 'utf8');
    const start = source.indexOf('return {\n    name,');
    expect(start).toBeGreaterThan(-1);
    const end = source.indexOf('\n  }\n', start);
    const routeKeys = [...source.slice(start, end).matchAll(/^ {4}([a-z_]+)[,:]/gm)].map((m) => m[1]);
    expect(routeKeys.length).toBeGreaterThan(20);

    const payload = buildBadgeInsertPayload({ name: '이름', description: '설명', type: 'activity', rarity: 'common' }, ARGS);
    const ourKeys = Object.keys(payload);
    expect(routeKeys.filter((key) => !ourKeys.includes(key))).toEqual([]);
    // 라우트에 없는 키는 등록 스크립트 고유의 셋뿐이다.
    expect(ourKeys.filter((key) => !routeKeys.includes(key)).sort()).toEqual(['id', 'image_source']);
  });
});

describe('findPreviousRecordError', () => {
  it('등록 기록이 있으면 이미 등록한 묶음으로 본다', () => {
    const dir = fs.mkdtempSync(path.join(workDir, 'rec-'));
    expect(findPreviousRecordError(dir)).toBeNull();
    fs.writeFileSync(path.join(dir, 'registration-record.json'), '{}');
    expect(findPreviousRecordError(dir)).toContain('이미 등록한 묶음으로 보여요');
  });
});
