/**
 * JAM! 에셋 제너레이터 홈피드 카드 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260925_1413)
 *
 * 배지판(`registerRecord.mjs`)·미션판(`registerMissionRecord.mjs`)은 고치지 않는다. 전부 순수 함수이며 파일·DB에
 * 접근하지 않는다. 시각 표기·SQL 리터럴·기록 파일 이름은 배지판에서 가져다 쓰고(내용과 무관한 부품), 홈피드 전용인
 * 마이그레이션 파일명·기록 본문·요약만 여기서 만든다. 되돌림 표식(`-- 되돌림 SQL`)은 마이그레이션 규칙
 * (`.claude/skills/jam-work/references/db-migration-rules.md` §4)의 형식이다.
 *
 * 기존 주간 편성(티켓 20260923_2252)의 seed SQL 등록 경로와 이 스크립트 경로는 별개다(상위 티켓 1404 리스크:
 * 홈피드 등록 경로 이중화). 이 스크립트가 만든 카드는 등록 기록·SQL 머리·행의 `image_source = 'agent-generator'`로
 * 구분된다(seed SQL 등록 카드는 NULL).
 */
import { TODAY_LAYOUT_OPTIONS, TODAY_TEMPLATE_OPTIONS } from '../../src/lib/admin/today-sections'
import { AGENT_IMAGE_SOURCE } from './registerHomeFeedBundle.mjs'
import { RECORD_FILE_NAME, SQL_FILE_NAME, formatKst, sqlLiteral, toKstIso } from './registerRecord.mjs'

export { RECORD_FILE_NAME, SQL_FILE_NAME, formatKst, sqlLiteral, toKstIso }
export const RECORD_VERSION = 1

const labelOf = (options, value) => options.find((o) => o.value === value)?.label ?? value

/** 메인 세션이 SQL 기록을 옮겨 커밋할 마이그레이션 파일명(`seed_agent_home_feed_<slug>.sql`). */
export function homeFeedMigrationFileName(bundleId) {
  return `seed_agent_home_feed_${bundleId.replace(/[^a-z0-9]+/g, '_')}.sql`
}

/** 카드 요약 한 줄(등록 기록의 «묶음 요약»). */
export function summarizeHomeFeedBundle(bundle) {
  const { card } = bundle
  const parts = [`[${card.template_type}] ${card.title.trim()}`]
  parts.push(`${card.starts_at} ~ ${card.ends_at}`)
  parts.push(`노출 태그 ${card.exposure_tags.join(', ')}`)
  return parts.join(' · ')
}

/** SQL `--` 주석에 넣는 값을 한 줄로 만든다. 묶음 검증이 개행을 거절하지만, 기록 파일은 커밋되어 다시 실행될 수 있어
 * 주석 쪽에서도 한 번 더 막는다(개행이 있으면 뒷부분이 주석 밖의 문장이 된다). 사용자 입력은 이 함수를 거친 값만 주석에 쓴다. */
function commentSafe(value) {
  return String(value).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ')
}

/** 카드 insert용 SQL 리터럴. `badge_ids`는 UUID[] 컬럼이라 배열을 text[]가 아니라 uuid[]로 쓴다(text[]는 대입되지 않는다). */
function cardSqlLiteral(column, value) {
  if (column === 'badge_ids') {
    return value.length === 0 ? 'ARRAY[]::uuid[]' : `ARRAY[${value.map((v) => sqlLiteral(String(v))).join(', ')}]::uuid[]`
  }
  return sqlLiteral(value)
}

/**
 * 등록 기록 객체(`registration-record.json`)를 만든다.
 * `registered_at`은 KST(+09:00) ISO 문자열이다.
 */
export function buildHomeFeedRegistrationRecord({ bundle, cardId, payload, bucket, pngPath, webpPath, originalUrl, imageUrl, webpBytes, registeredAt }) {
  const { image, world_review: worldReview } = bundle
  return {
    record_version: RECORD_VERSION,
    bundle_id: bundle.bundle_id,
    author: bundle.author,
    bundle_created_at: bundle.created_at,
    registered_at: toKstIso(registeredAt),
    summary: summarizeHomeFeedBundle(bundle),
    card: {
      id: cardId,
      title: payload.title,
      template_type: payload.template_type,
      layout_type: payload.layout_type,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      is_active: payload.is_active,
      // 등록 경로 표지 — seed SQL 등록 카드(NULL)와 구분한다.
      image_source: AGENT_IMAGE_SOURCE,
    },
    world_review: {
      world_related: worldReview.world_related,
      winter_reviewed: worldReview.winter_reviewed,
      reason: worldReview.reason,
    },
    storage: { bucket, png_path: pngPath, webp_path: webpPath },
    urls: { original_png: originalUrl, cover_image_url: imageUrl },
    image: {
      seed: image.seed,
      preset_id: image.preset_id,
      bg_color: image.bg_color,
      end_color: image.end_color,
      text: image.text ?? null,
      // 묶음에 적은 그대로(상대 경로면 상대 경로로) 남긴다 — PC마다 다른 절대 경로가 기록에 박히지 않게 한다.
      source_path: image.path,
      original_bytes: image.bytes,
      webp_bytes: webpBytes,
    },
    color_rationale_link: bundle.color_rationale_link,
  }
}

/**
 * 등록과 동등한 INSERT 문 + 되돌림 SQL 주석 블록이 든 `registration.sql` 본문을 만든다.
 * 이미 등록이 끝난 기록이라 같은 id가 있으면 아무 일도 하지 않게(`ON CONFLICT DO NOTHING`) 둔다.
 */
export function buildHomeFeedRegistrationSql({ payload, record, undoTables }) {
  const columns = Object.keys(payload)
  const lines = [
    '-- 에셋 제너레이터 에이전트 홈피드 카드 등록 기록 (register-home-feed-card.mjs가 만든 파일, 티켓 20260925_1413)',
    `-- 등록 경로: 에이전트 등록 스크립트(image_source = ${AGENT_IMAGE_SOURCE}). 기존 주간 편성 seed SQL 등록 카드는 image_source가 NULL이에요.`,
    `-- 묶음: ${commentSafe(record.bundle_id)} / 작성자: ${commentSafe(record.author)} / 등록 시각(KST): ${commentSafe(record.registered_at)}`,
    `-- 카드: ${commentSafe(record.card.title)} (${commentSafe(record.card.id)})`,
    '-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).',
    `-- 이미지 파일(${commentSafe(record.storage.bucket)} 버킷): ${commentSafe(record.storage.png_path)}, ${commentSafe(record.storage.webp_path)}`,
    '--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.',
    `--   cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <${RECORD_FILE_NAME} 절대경로>`,
    `-- 메인 세션: 이 파일을 jam-web/supabase/migrations/${homeFeedMigrationFileName(record.bundle_id)} 로 옮겨 커밋해요.`,
    '',
    'INSERT INTO public.today_cards (',
    columns.map((c) => `  ${c}`).join(',\n'),
    ') VALUES (',
    columns.map((c) => `  ${cardSqlLiteral(c, payload[c])}`).join(',\n'),
    ')',
    'ON CONFLICT (id) DO NOTHING;',
    '',
    '-- 되돌림 SQL',
    `-- delete from public.today_cards where id = '${record.card.id}';`,
    `-- (이 SQL만으로는 저장소 파일이 남아요. ${undoTables.join(' · ')}에 이 id가 이미 붙었다면 지우지 말고 어드민에서 카드를 비활성으로 바꿔요. today_card_events는 카드를 지우면 card_id만 NULL로 바뀌어 어느 카드의 기록이었는지 알 수 없게 돼요.)`,
    '',
  ]
  return lines.join('\n')
}

function undoCommand(recordPath) {
  return `cd jam-web && npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo ${recordPath}`
}

/**
 * `--dry-run` 결과를 컨펌 자료로 읽을 수 있는 한국어 요약으로 만든다.
 * - `errors`: 고쳐야 할 사유 전체(묶음 검증 + 등록 기록 중복 + DB 읽기 검사 실패). 비어 있으면 통과다.
 * - `bundle`이 null이면(묶음 검증 실패) 사유만 보여 준다.
 */
export function formatHomeFeedDryRunSummary({ bundle, payload, errors, dbChecks, webp = /** @type {any} */ (undefined), recordDir }) {
  const lines = []
  lines.push('== 홈피드 카드 등록 묶음 검증 (--dry-run) ==')
  lines.push(errors.length === 0 ? '결과: 통과' : `결과: 실패 (${errors.length}건)`)

  if (errors.length > 0) {
    lines.push('', '[고쳐야 할 점]')
    for (const reason of errors) lines.push(`- ${reason}`)
  }

  if (bundle) {
    const { image, world_review: review } = bundle
    const list = (values) => (values.length > 0 ? values.join(', ') : '없음')

    lines.push(
      '',
      '[묶음]',
      `- 묶음 ID: ${bundle.bundle_id}`,
      `- 작성자: ${bundle.author}`,
      `- 작성 시각: ${formatKst(bundle.created_at)}`,
      `- 컬러 선택 근거: ${bundle.color_rationale_link}`,
      '',
      '[세계관 검수]',
      `- 세계관과 닿는 내용: ${review.world_related ? '있음' : '없음(순수 운영성)'}`,
      `- 윈터 검수: ${review.winter_reviewed ? '거침' : '거치지 않음'}`,
      `- 사유: ${review.reason}`,
      '',
      '[홈피드 카드]',
      `- 제목: ${payload.title}`,
      `- 부제: ${payload.subtitle ?? '없음'}`,
      `- 템플릿: ${labelOf(TODAY_TEMPLATE_OPTIONS, payload.template_type)}`,
      `- 노출 형태: ${labelOf(TODAY_LAYOUT_OPTIONS, payload.layout_type)}`,
      `- 컨텐츠 유형: ${payload.content_type_id ?? '없음'}`,
      `- 기간: ${formatKst(payload.starts_at)} ~ ${formatKst(payload.ends_at)}`,
      `- 노출 조건 태그: ${list(payload.exposure_tags)}`,
      `- 배지: ${list(payload.badge_ids)}`,
      `- 미션: ${payload.mission_id ?? '없음'}`,
      `- 컬렉션: ${payload.item_book_id ?? '없음'}`,
      `- 랭킹 모드: ${payload.ranking_mode_id ?? '없음'}`,
      `- 지역: ${payload.region_label ?? '없음'}`,
      `- 본문: ${payload.body_markdown ? `${payload.body_markdown.length}자` : '없음'}`,
      `- 이동 경로: ${payload.target_href ?? '없음(템플릿 규칙으로 자동 결정)'}`,
      `- 정렬 순서: ${payload.sort_order}`,
      `- 상태: ${payload.is_active ? '활성(기간이 되면 바로 노출)' : '비활성(어디에도 노출하지 않음)'}`,
      '',
      '[이미지]',
      `- 원본 PNG: ${image.abs_path} (${(image.bytes / 1024).toFixed(1)}KB)`,
      `- 프리셋 ID: ${image.preset_id}`,
      `- 시드: ${image.seed}`,
      `- 배경색 → 끝색: ${image.bg_color} → ${image.end_color}`,
      `- 텍스트: ${image.text ?? '기록 없음'}`,
      webp?.error
        ? `- WebP 변환 미리 확인: 실패 — ${webp.error}`
        : webp?.bytes !== undefined
          ? `- WebP 변환 미리 확인: 통과 (${(webp.bytes / 1024).toFixed(1)}KB, 긴 변 400px 이하)`
          : '- WebP 변환 미리 확인: 하지 않았어요',
      '',
      '[DB 읽기 검사]'
    )
    for (const check of dbChecks) {
      lines.push(`- ${check.label}: ${check.status}${check.detail ? ` — ${check.detail}` : ''}`)
    }

    const recordPath = `${recordDir}/${RECORD_FILE_NAME}`
    lines.push(
      '',
      '[등록 예정 내용]',
      '1. 저장소(images 버킷)에 원본 PNG 업로드: today_cards/asset-generator/<새 카드 id>.png',
      '2. 같은 폴더에 WebP 업로드: today_cards/asset-generator/<새 카드 id>.webp (cover_image_url은 이 파일을 가리켜요)',
      `3. today_cards 테이블에 행 1건 추가 (image_source = ${AGENT_IMAGE_SOURCE}, 기존 seed SQL 등록 카드는 NULL이라 구분돼요)`,
      `4. 묶음 폴더에 ${RECORD_FILE_NAME}·${SQL_FILE_NAME} 기록: ${recordDir}`,
      '',
      '[되돌림 SQL 미리보기]',
      "delete from public.today_cards where id = '<등록할 때 정해지는 카드 id>';",
      `저장소 파일은 SQL로 지울 수 없어요. 등록 뒤에는 ${undoCommand(recordPath)} 로 파일 2개와 카드 행을 함께 지워요.`
    )
  }

  lines.push('', 'DB·저장소에는 아무것도 쓰지 않았어요.')
  return lines.join('\n')
}
