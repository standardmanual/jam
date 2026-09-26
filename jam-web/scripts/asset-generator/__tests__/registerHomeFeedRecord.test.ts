/**
 * 홈피드 카드 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260925_1413)
 *
 * 시각 표기·SQL 리터럴 자체(배지판에서 가져다 쓰는 부품)는 다시 시험하지 않고, 홈피드 필드가 그 부품을 거쳐
 * 올바른 SQL·기록·요약이 되는지만 본다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildTodayCardInsertPayload } from '../registerHomeFeedBundle.mjs';
import {
  buildHomeFeedRegistrationRecord,
  buildHomeFeedRegistrationSql,
  formatHomeFeedDryRunSummary,
  homeFeedMigrationFileName,
  summarizeHomeFeedBundle,
} from '../registerHomeFeedRecord.mjs';

const CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const BADGE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MISSION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const IMAGE_URL = `https://cdn.test/storage/v1/object/public/images/today_cards/asset-generator/${CARD_ID}.webp?v=1790300000000`;
const UNDO_TABLES = ['today_card_events'];

interface SampleBundle {
  world_review: Record<string, unknown>;
  card: Record<string, unknown>;
  image: Record<string, unknown>;
  [key: string]: unknown;
}

function sampleBundle(): SampleBundle {
  return {
    bundle_id: '2026-10-05-weekly-mission-card',
    author: '윤진',
    created_at: '2026-09-25T10:30:00+09:00',
    color_rationale_link: 'jam-doc/planning/content/TRIBES.md',
    world_review: { world_related: true, winter_reviewed: true, reason: "트라이브 표현이 있어 윈터가 검수했습니다. 'OK'" },
    card: {
      title: "이번 주 롱런's 챌린지",
      subtitle: '30km에 도전해 보세요',
      template_type: 'progress_nudge',
      layout_type: 'shortcut',
      badge_ids: [BADGE_ID],
      mission_id: MISSION_ID,
      content_type_id: 'T07',
      target_href: '/missions/weekly',
      exposure_tags: ['all', 'has_participating_mission'],
      starts_at: '2026-10-05T00:00:00+09:00',
      ends_at: '2026-10-12T00:00:00+09:00',
      sort_order: 2,
      is_active: true,
    },
    image: {
      path: 'image.png',
      abs_path: '/tmp/bundle/image.png',
      bytes: 2048,
      seed: 20260925,
      preset_id: '11111111-1111-4111-8111-111111111111',
      bg_color: '#ff1a00',
      end_color: '#ff4dff',
      text: '롱런',
      subtext: '30km 도전',
    },
  };
}

function payloadOf(bundle: SampleBundle) {
  return buildTodayCardInsertPayload(bundle.card, { id: CARD_ID, coverImageUrl: IMAGE_URL });
}

const registered = {
  cardId: CARD_ID,
  bucket: 'images',
  pngPath: `today_cards/asset-generator/${CARD_ID}.png`,
  webpPath: `today_cards/asset-generator/${CARD_ID}.webp`,
  originalUrl: `https://cdn.test/images/today_cards/asset-generator/${CARD_ID}.png`,
  imageUrl: IMAGE_URL,
  webpBytes: 1024,
  registeredAt: new Date(Date.UTC(2026, 8, 25, 1, 31, 2)),
};

function recordOf(bundle = sampleBundle()) {
  return buildHomeFeedRegistrationRecord({ bundle, payload: payloadOf(bundle), ...registered });
}

describe('homeFeedMigrationFileName · summarizeHomeFeedBundle', () => {
  it('묶음 ID의 영문·숫자가 아닌 문자를 밑줄로 바꿔 seed_agent_home_feed_ 파일명을 만든다', () => {
    expect(homeFeedMigrationFileName('2026-10-05-weekly-mission-card')).toBe('seed_agent_home_feed_2026_10_05_weekly_mission_card.sql');
  });

  it('요약 한 줄에 템플릿·제목·기간·노출 태그가 들어간다', () => {
    const line = summarizeHomeFeedBundle(sampleBundle());
    expect(line).toContain("[progress_nudge] 이번 주 롱런's 챌린지");
    expect(line).toContain('2026-10-05T00:00:00+09:00 ~ 2026-10-12T00:00:00+09:00');
    expect(line).toContain('노출 태그 all, has_participating_mission');
  });
});

describe('buildHomeFeedRegistrationRecord', () => {
  it('카드 id·저장 경로·URL·세계관 검수 기록·이미지 재현 정보를 담고 등록 경로 표지(image_source)를 남긴다', () => {
    const record = recordOf();
    expect(record).toMatchObject({
      record_version: 1,
      bundle_id: '2026-10-05-weekly-mission-card',
      author: '윤진',
      registered_at: '2026-09-25T10:31:02+09:00',
      card: {
        id: CARD_ID,
        title: "이번 주 롱런's 챌린지",
        template_type: 'progress_nudge',
        layout_type: 'shortcut',
        is_active: true,
        image_source: 'agent-generator',
      },
      world_review: { world_related: true, winter_reviewed: true },
      storage: { bucket: 'images', png_path: registered.pngPath, webp_path: registered.webpPath },
      urls: { original_png: registered.originalUrl, cover_image_url: IMAGE_URL },
      image: { seed: 20260925, source_path: 'image.png', original_bytes: 2048, webp_bytes: 1024, text: '롱런', subtext: '30km 도전' },
    });
    expect(record.card.starts_at).toBe('2026-10-04T15:00:00.000Z');
    expect(record.urls).not.toHaveProperty('image_url');
  });
});

describe('buildHomeFeedRegistrationSql', () => {
  function sqlOf(bundle = sampleBundle()) {
    return buildHomeFeedRegistrationSql({ payload: payloadOf(bundle), record: recordOf(bundle), undoTables: UNDO_TABLES });
  }

  it('INSERT INTO public.today_cards와 ON CONFLICT DO NOTHING을 낸다', () => {
    const sql = sqlOf();
    expect(sql).toContain('INSERT INTO public.today_cards (');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING;');
    expect(sql).toContain(`'${CARD_ID}'`);
    expect(sql).toContain('  cover_image_url');
    expect(sql).not.toContain('  image_url');
  });

  it('작은따옴표는 두 번 쓰고, 배지 목록은 uuid[], 노출 태그는 text[] 리터럴로 쓴다(text[]는 uuid[] 컬럼에 들어가지 않는다)', () => {
    const sql = sqlOf();
    expect(sql).toContain("'이번 주 롱런''s 챌린지'");
    expect(sql).toContain(`ARRAY['${BADGE_ID}']::uuid[]`);
    expect(sql).toContain("ARRAY['all', 'has_participating_mission']::text[]");
  });

  it('배지가 없으면 빈 uuid[] 배열이다', () => {
    const bundle = sampleBundle();
    bundle.card.badge_ids = [];
    expect(sqlOf(bundle)).toContain('ARRAY[]::uuid[]');
  });

  it('값이 없는 필드는 NULL, 이미지 출처는 agent-generator이고 머리 주석에 등록 경로가 적힌다', () => {
    const bundle = sampleBundle();
    delete bundle.card.item_book_id;
    const sql = sqlOf(bundle);
    expect(sql).toContain('  NULL');
    expect(sql).toContain("  'agent-generator'");
    expect(sql).toContain('-- 등록 경로: 에이전트 등록 스크립트(image_source = agent-generator). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.');
  });

  it('파일 끝에 되돌림 표식과 삭제 SQL, 붙은 노출·열람 기록 안내가 있다', () => {
    const sql = sqlOf();
    expect(sql).toContain('-- 되돌림 SQL');
    expect(sql).toContain(`-- delete from public.today_cards where id = '${CARD_ID}';`);
    expect(sql).toContain('today_card_events');
    expect(sql).toContain('register-home-feed-card.mjs --undo');
    expect(sql.indexOf('-- 되돌림 SQL')).toBeGreaterThan(sql.indexOf('ON CONFLICT'));
  });

  it('줄바꿈이 섞인 값도 주석 밖의 실행 가능한 문장이 되지 않는다', () => {
    const bundle = sampleBundle();
    bundle.author = '윤진\ndrop table public.today_cards;';
    bundle.card.title = '제목\r\ndelete from public.today_cards;';
    const sql = sqlOf(bundle);
    const lines = sql.split('\n');
    // 작성자·제목은 주석에도 들어가는 값이다 — 개행이 공백으로 바뀌어 한 줄 주석 안에 머문다.
    expect(lines.filter((line) => /^drop table/i.test(line))).toEqual([]);
    expect(lines.find((line) => line.startsWith('-- 묶음:'))).toContain('작성자: 윤진 drop table public.today_cards;');
    expect(lines.find((line) => line.startsWith('-- 카드:'))).toContain('제목 delete from public.today_cards;');
    // 제목은 값으로도 들어가지만 작은따옴표 문자열 리터럴 안이라 실행되지 않는다.
    expect(sql).toContain("'제목\r\ndelete from public.today_cards;'");
  });
});

describe('formatHomeFeedDryRunSummary', () => {
  const dbChecks = [
    { label: '제목·시작 일시 중복', status: '통과', detail: '' },
    { label: '미션 존재', status: '건너뜀', detail: '서비스 키(.env.local)가 없어 DB를 읽지 않았어요' },
  ];

  function summaryOf(overrides: Record<string, unknown> = {}, bundle = sampleBundle()) {
    const payload = buildTodayCardInsertPayload(bundle.card, { id: '<id>', coverImageUrl: '<url>' });
    return formatHomeFeedDryRunSummary({ bundle, payload, errors: [], dbChecks, webp: { bytes: 4096 }, recordDir: '/tmp/bundle', ...overrides });
  }

  it('통과하면 묶음·세계관 검수·카드·이미지·DB 검사·등록 예정·되돌림 미리보기를 보여 준다', () => {
    const text = summaryOf();
    expect(text).toContain('결과: 통과');
    expect(text).toContain('- 묶음 ID: 2026-10-05-weekly-mission-card');
    expect(text).toContain('- 작성 시각: 2026-09-25 10:30:00 KST');
    expect(text).toContain('- 세계관과 닿는 내용: 있음');
    expect(text).toContain('- 윈터 검수: 거침');
    expect(text).toContain("- 제목: 이번 주 롱런's 챌린지");
    expect(text).toContain('- 템플릿: 진행 알림 (progress_nudge)');
    expect(text).toContain('- 노출 형태: 바로가기형 — 이미지 없는 짧은 CTA');
    expect(text).toContain('- 컨텐츠 유형: T07');
    expect(text).toContain('- 기간: 2026-10-05 00:00:00 KST ~ 2026-10-12 00:00:00 KST');
    expect(text).toContain('- 노출 조건 태그: all, has_participating_mission');
    expect(text).toContain(`- 배지: ${BADGE_ID}`);
    expect(text).toContain(`- 미션: ${MISSION_ID}`);
    expect(text).toContain('- 이동 경로: /missions/weekly');
    expect(text).toContain('- 상태: 활성(기간이 되면 바로 노출)');
    expect(text).toContain('- 시드: 20260925');
    expect(text).toContain('- 설명 텍스트: 30km 도전');
    expect(text).toContain('- WebP 변환 미리 확인: 통과 (4.0KB, 긴 변 400px 이하)');
    expect(text).toContain('- 제목·시작 일시 중복: 통과');
    expect(text).toContain('- 미션 존재: 건너뜀 — 서비스 키(.env.local)가 없어 DB를 읽지 않았어요');
    expect(text).toContain('today_cards/asset-generator/<새 카드 id>.png');
    expect(text).toContain('image_source = agent-generator');
    expect(text).toContain("delete from public.today_cards where id = '<등록할 때 정해지는 카드 id>';");
    expect(text).toContain('register-home-feed-card.mjs --undo /tmp/bundle/registration-record.json');
    expect(text.trimEnd().endsWith('DB·저장소에는 아무것도 쓰지 않았어요.')).toBe(true);
  });

  it('DB 읽기 검사를 건너뛰었으면 첫 줄에 건너뜀을 적고 다시 돌리라는 안내를 넣는다(배지판과 같은 표기)', () => {
    const lines = summaryOf().split('\n');
    expect(lines[1]).toBe('결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)');
    expect(lines[2]).toContain('컨펌 근거로 쓰지 말고');
    expect(lines[2]).toContain('서비스 키가 있는 환경(메인 폴더)에서 다시 돌려요');
  });

  it('건너뜀이 없으면 첫 줄이 기존과 같고 안내가 없다', () => {
    const text = summaryOf({ dbChecks: [{ label: '제목·시작 일시 중복', status: '통과', detail: '' }] });
    expect(text.split('\n')[1]).toBe('결과: 통과');
    expect(text).not.toContain('컨펌 근거로 쓰지 말고');
  });

  it('비활성 카드·참조 없는 카드를 알아볼 수 있게 적는다', () => {
    const bundle = sampleBundle();
    Object.assign(bundle.card, { is_active: false, badge_ids: [], mission_id: undefined, target_href: undefined, template_type: 'drop_alert' });
    bundle.world_review = { world_related: false, winter_reviewed: false, reason: '순수 운영성' };
    const text = summaryOf({}, bundle);
    expect(text).toContain('- 상태: 비활성(어디에도 노출하지 않음)');
    expect(text).toContain('- 배지: 없음');
    expect(text).toContain('- 미션: 없음');
    expect(text).toContain('- 이동 경로: 없음(템플릿 규칙으로 자동 결정)');
    expect(text).toContain('- 세계관과 닿는 내용: 없음(순수 운영성)');
    expect(text).toContain('- 윈터 검수: 거치지 않음');
  });

  it('실패하면 사유 전체를 보여 주고, 묶음이 없으면 사유만 보여 준다', () => {
    const failed = summaryOf({ errors: ['미션 존재: 없어요', '카드 오류'] });
    expect(failed).toContain('결과: 실패 (2건)');
    expect(failed).toContain('- 미션 존재: 없어요');
    const noBundle = formatHomeFeedDryRunSummary({ bundle: null, payload: null, errors: ['card.title: 필수 항목이 없어요.'], dbChecks: [], recordDir: '/tmp/x' });
    expect(noBundle).toContain('- card.title: 필수 항목이 없어요.');
    expect(noBundle).not.toContain('[홈피드 카드]');
    expect(noBundle).toContain('DB·저장소에는 아무것도 쓰지 않았어요.');
  });

  it('WebP 변환 실패와 미확인 상태를 구분해 적는다', () => {
    expect(summaryOf({ webp: { error: 'bad image' } })).toContain('- WebP 변환 미리 확인: 실패 — bad image');
    expect(summaryOf({ webp: undefined })).toContain('- WebP 변환 미리 확인: 하지 않았어요');
  });
});

describe('제어·개행 문자 정규식 원본 (티켓 20260926_0120)', () => {
  it.each(['registerHomeFeedRecord.mjs', 'registerHomeFeedBundle.mjs'])('%s에 범위 문자를 다시 적지 않는다(원본은 registerBundle.mjs 한 곳)', (file) => {
    const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf-8');
    expect(source).not.toMatch(/\\u2028|\\u0085/);
  });
});
