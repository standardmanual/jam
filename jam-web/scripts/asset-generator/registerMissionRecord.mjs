/**
 * JAM! 에셋 제너레이터 미션 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260925_1412)
 *
 * 배지판(`registerRecord.mjs`, 수정 금지)의 미션 필드판이다. 전부 순수 함수이며 파일·DB에 접근하지 않는다.
 * 시각 표기·SQL 리터럴·기록 파일 이름은 배지판에서 가져다 쓰고(내용과 무관한 부품), 미션 전용인
 * 마이그레이션 파일명·기록 본문·요약만 여기서 만든다. 되돌림 표식(`-- 되돌림 SQL`)은 마이그레이션 규칙
 * (`.claude/skills/jam-work/references/db-migration-rules.md` §4)의 형식이다.
 */
import { AGENT_IMAGE_SOURCE } from './registerMissionBundle.mjs'
import { RECORD_FILE_NAME, SQL_FILE_NAME, formatKst, sqlLiteral, toKstIso } from './registerRecord.mjs'

export { RECORD_FILE_NAME, SQL_FILE_NAME, formatKst, sqlLiteral, toKstIso }
export const RECORD_VERSION = 1

const STATUS_DISPLAY_LABEL = { ranking: '랭킹형', achievement: '달성형', individual: '개인형' }
const EXPOSURE_MODE_LABEL = {
  hidden: '숨김(서비스 어디에도 노출하지 않음)',
  start_date: '시작일에 노출',
  scheduled: '지정한 시각에 노출',
}

/** 메인 세션이 SQL 기록을 옮겨 커밋할 마이그레이션 파일명(`seed_agent_mission_<slug>.sql`). */
export function missionMigrationFileName(bundleId) {
  return `seed_agent_mission_${bundleId.replace(/[^a-z0-9]+/g, '_')}.sql`
}

/** 조건·미션 요약 한 줄(등록 기록의 «묶음 요약»). */
export function summarizeMissionBundle(bundle) {
  const { mission } = bundle
  const parts = [`[${mission.mission_type}] ${mission.title}`]
  parts.push(`${mission.starts_at} ~ ${mission.ends_at ?? '종료일 없음'}`)
  parts.push(`조건 ${JSON.stringify(mission.condition_json)}`)
  return parts.join(' · ')
}

/** SQL `--` 주석에 넣는 값을 한 줄로 만든다. 묶음 검증이 개행을 거절하지만, 기록 파일은 커밋되어 다시 실행될 수 있어
 * 주석 쪽에서도 한 번 더 막는다(개행이 있으면 뒷부분이 주석 밖의 문장이 된다). 사용자 입력은 이 함수를 거친 값만 주석에 쓴다. */
function commentSafe(value) {
  return String(value).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]+/g, ' ')
}

/** 미션 insert용 SQL 리터럴. `reward_badge_ids`는 UUID[] 컬럼이라 배열을 text[]가 아니라 uuid[]로 쓴다(text[]는 대입되지 않는다). */
function missionSqlLiteral(column, value) {
  if (column === 'reward_badge_ids') {
    return value.length === 0 ? "ARRAY[]::uuid[]" : `ARRAY[${value.map((v) => sqlLiteral(String(v))).join(', ')}]::uuid[]`
  }
  return sqlLiteral(value)
}

/**
 * 등록 기록 객체(`registration-record.json`)를 만든다.
 * `registered_at`은 KST(+09:00) ISO 문자열이다.
 */
export function buildMissionRegistrationRecord({ bundle, missionId, bucket, pngPath, webpPath, originalUrl, imageUrl, webpBytes, registeredAt }) {
  const { mission, image, world_review: worldReview } = bundle
  return {
    record_version: RECORD_VERSION,
    bundle_id: bundle.bundle_id,
    author: bundle.author,
    bundle_created_at: bundle.created_at,
    registered_at: toKstIso(registeredAt),
    summary: summarizeMissionBundle(bundle),
    mission: {
      id: missionId,
      title: mission.title,
      mission_type: mission.mission_type,
      status_display_type: mission.status_display_type ?? 'ranking',
      exposure_mode: mission.exposure_mode ?? 'start_date',
      starts_at: mission.starts_at,
      ends_at: mission.ends_at ?? null,
      image_source: AGENT_IMAGE_SOURCE,
    },
    world_review: {
      world_related: worldReview.world_related,
      winter_reviewed: worldReview.winter_reviewed,
      reason: worldReview.reason,
    },
    storage: { bucket, png_path: pngPath, webp_path: webpPath },
    urls: { original_png: originalUrl, image_url: imageUrl },
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
export function buildMissionRegistrationSql({ payload, record, undoTables }) {
  const columns = Object.keys(payload)
  const lines = [
    '-- 에셋 제너레이터 에이전트 미션 등록 기록 (register-mission.mjs가 만든 파일, 티켓 20260925_1412)',
    `-- 묶음: ${commentSafe(record.bundle_id)} / 작성자: ${commentSafe(record.author)} / 등록 시각(KST): ${commentSafe(record.registered_at)}`,
    `-- 미션: ${commentSafe(record.mission.title)} (${commentSafe(record.mission.id)})`,
    '-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).',
    `-- 이미지 파일(${commentSafe(record.storage.bucket)} 버킷): ${commentSafe(record.storage.png_path)}, ${commentSafe(record.storage.webp_path)}`,
    '--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.',
    `--   cd jam-web && npx tsx scripts/asset-generator/register-mission.mjs --undo <${RECORD_FILE_NAME} 절대경로>`,
    `-- 메인 세션: 이 파일을 jam-web/supabase/migrations/${missionMigrationFileName(record.bundle_id)} 로 옮겨 커밋해요.`,
    '',
    'INSERT INTO public.missions (',
    columns.map((c) => `  ${c}`).join(',\n'),
    ') VALUES (',
    columns.map((c) => `  ${missionSqlLiteral(c, payload[c])}`).join(',\n'),
    ')',
    'ON CONFLICT (id) DO NOTHING;',
    '',
    '-- 되돌림 SQL',
    `-- delete from public.missions where id = '${record.mission.id}';`,
    `-- (이 SQL만으로는 저장소 파일이 남아요. ${undoTables.join(' · ')}에 이 id가 이미 붙었다면 지우지 말고 어드민에서 노출을 숨김으로 바꿔요. 일부는 삭제 시 함께 사라지거나 삭제가 막혀요.)`,
    '',
  ]
  return lines.join('\n')
}

function undoCommand(recordPath) {
  return `cd jam-web && npx tsx scripts/asset-generator/register-mission.mjs --undo ${recordPath}`
}

/**
 * `--dry-run` 결과를 컨펌 자료로 읽을 수 있는 한국어 요약으로 만든다.
 * - `errors`: 고쳐야 할 사유 전체(묶음 검증 + 등록 기록 중복 + DB 읽기 검사 실패). 비어 있으면 통과다.
 * - `warnings`: 등록은 되지만 알아야 할 고지(예: 판정에 영향이 없는 조건 필드).
 * - `bundle`이 null이면(묶음 검증 실패) 사유만 보여 준다.
 */
export function formatMissionDryRunSummary({ bundle, payload, errors, warnings = /** @type {any} */ (undefined), dbChecks, webp = /** @type {any} */ (undefined), recordDir }) {
  const lines = []
  lines.push('== 미션 등록 묶음 검증 (--dry-run) ==')
  lines.push(errors.length === 0 ? '결과: 통과' : `결과: 실패 (${errors.length}건)`)

  if (errors.length > 0) {
    lines.push('', '[고쳐야 할 점]')
    for (const reason of errors) lines.push(`- ${reason}`)
  }
  if (warnings && warnings.length > 0) {
    lines.push('', '[알아둘 점]')
    for (const notice of warnings) lines.push(`- ${notice}`)
  }

  if (bundle) {
    const { image, world_review: review } = bundle
    const gate = payload.gate_axis ? `${payload.gate_axis} · ${payload.gate_stage}` : '게이트 미션 아님'

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
      '[미션]',
      `- 제목: ${payload.title}`,
      `- 설명: ${payload.description}`,
      `- 유형: ${payload.mission_type}`,
      `- 달성 조건: ${JSON.stringify(payload.condition_json)}`,
      `- 표시 방식: ${STATUS_DISPLAY_LABEL[payload.status_display_type] ?? payload.status_display_type}${payload.visible_rank_count ? ` (상위 ${payload.visible_rank_count}명 노출)` : ''}`,
      `- 기간: ${formatKst(payload.starts_at)} ~ ${payload.ends_at ? formatKst(payload.ends_at) : '종료일 없음(상시)'}`,
      `- 최대 완료 횟수: ${payload.max_completions ?? '제한 없음'}`,
      `- 보상 포인트: ${payload.reward_points ?? '없음'}`,
      `- 보상 배지: ${payload.reward_badge_ids.length > 0 ? payload.reward_badge_ids.join(', ') : '없음'}`,
      `- 게이트: ${gate}`,
      `- 노출 조건: ${payload.visibility_rule_json ? JSON.stringify(payload.visibility_rule_json) : '없음'}`,
      `- 노출 모드: ${EXPOSURE_MODE_LABEL[payload.exposure_mode] ?? payload.exposure_mode}${payload.exposure_at ? ` (${formatKst(payload.exposure_at)})` : ''}`,
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
      '1. 저장소(images 버킷)에 원본 PNG 업로드: missions/asset-generator/<새 미션 id>.png',
      '2. 같은 폴더에 WebP 업로드: missions/asset-generator/<새 미션 id>.webp (image_url은 이 파일을 가리켜요)',
      `3. missions 테이블에 행 1건 추가 (image_source = ${AGENT_IMAGE_SOURCE})`,
      `4. 묶음 폴더에 ${RECORD_FILE_NAME}·${SQL_FILE_NAME} 기록: ${recordDir}`,
      '',
      '[되돌림 SQL 미리보기]',
      "delete from public.missions where id = '<등록할 때 정해지는 미션 id>';",
      `저장소 파일은 SQL로 지울 수 없어요. 등록 뒤에는 ${undoCommand(recordPath)} 로 파일 2개와 미션 행을 함께 지워요.`
    )
  }

  lines.push('', 'DB·저장소에는 아무것도 쓰지 않았어요.')
  return lines.join('\n')
}
