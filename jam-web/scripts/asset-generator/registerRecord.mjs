/**
 * JAM! 에셋 제너레이터 배지 등록 — 등록 기록·되돌림 SQL·dry-run 요약 생성 (티켓 20260924_2202)
 *
 * 전부 순수 함수다(파일·DB에 접근하지 않는다). 등록 기록·되돌림 SQL 형식은 홈피드 카드 등록
 * 선례(티켓 20260923_2252, `docs/operations/reports/weekly/2026-W39.md` 「등록 기록」)를
 * 따른다: 무엇을 어느 id로 등록했는지 표로 남기고, 되돌림 SQL을 함께 적는다. 마이그레이션 규칙의
 * 되돌림 표식(`-- 되돌림 SQL`, `.claude/skills/jam-work/references/db-migration-rules.md` §4)을
 * SQL 파일 끝에 그대로 쓴다.
 */
import { AGENT_IMAGE_SOURCE, CONTROL_OR_LINE_BREAK } from './registerBundle.mjs'

export const RECORD_FILE_NAME = 'registration-record.json'
export const SQL_FILE_NAME = 'registration.sql'
export const RECORD_VERSION = 1

const BADGE_TYPE_LABEL = { activity: '활동 배지', item: '아이템 배지' }

function kstParts(dateLike) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(dateLike))
  const pick = (type) => parts.find((p) => p.type === type).value
  return { y: pick('year'), mo: pick('month'), d: pick('day'), h: pick('hour'), mi: pick('minute'), s: pick('second') }
}

/** 사람이 읽는 KST 표기: `2026-09-25 10:30:00 KST` */
export function formatKst(dateLike) {
  const t = kstParts(dateLike)
  return `${t.y}-${t.mo}-${t.d} ${t.h}:${t.mi}:${t.s} KST`
}

/** 기계가 읽는 KST 표기: `2026-09-25T10:30:00+09:00` */
export function toKstIso(dateLike) {
  const t = kstParts(dateLike)
  return `${t.y}-${t.mo}-${t.d}T${t.h}:${t.mi}:${t.s}+09:00`
}

/** 메인 세션이 SQL 기록을 옮겨 커밋할 마이그레이션 파일명(`seed_agent_badge_<slug>.sql`). */
export function migrationFileName(bundleId) {
  return `seed_agent_badge_${bundleId.replace(/[^a-z0-9]+/g, '_')}.sql`
}

/** 조건·배지 요약 한 줄(등록 기록의 «묶음 요약»). */
export function summarizeBundle(bundle) {
  const { badge } = bundle
  const kind = badge.rarity ? badge.rarity : `Lv.${badge.level}`
  const parts = [`[${badge.type}] ${badge.name}`, kind]
  if (badge.family_key) parts.push(badge.family_key)
  parts.push(badge.condition_json ? `조건 ${JSON.stringify(badge.condition_json)}` : '조건 없음')
  return parts.join(' · ')
}

/** SQL 리터럴 하나를 만든다. 배열은 text[], 객체는 jsonb로 쓴다. */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) {
    return value.length === 0 ? "ARRAY[]::text[]" : `ARRAY[${value.map((v) => sqlLiteral(String(v))).join(', ')}]::text[]`
  }
  if (typeof value === 'object') return `${sqlString(JSON.stringify(value))}::jsonb`
  return sqlString(String(value))
}

function sqlString(text) {
  return `'${text.replace(/'/g, "''")}'`
}

// 개행·제어 문자가 이어진 구간 전체를 공백 하나로 바꾸는 정규식. 문자 범위는 묶음 검증과 같은 원본(`CONTROL_OR_LINE_BREAK`)에서 만든다.
const CONTROL_OR_LINE_BREAK_RUN = new RegExp(`${CONTROL_OR_LINE_BREAK.source}+`, 'g')

/** SQL `--` 주석에 넣는 값을 한 줄로 만든다. 묶음 검증이 개행을 거절하지만, 기록 파일은 커밋되어 다시 실행될 수 있어
 * 주석 쪽에서도 한 번 더 막는다(개행이 있으면 뒷부분이 주석 밖의 문장이 된다). */
function commentSafe(value) {
  return String(value).replace(CONTROL_OR_LINE_BREAK_RUN, ' ')
}

/**
 * SQL `--` 주석 한 줄을 만드는 태그드 템플릿. 보간된 값은 전부 `commentSafe`를 거치므로,
 * 주석 줄은 이 태그로만 쓰면 값 하나를 빠뜨려 개행이 새는 일이 없다(티켓 20260925_0549).
 */
function sqlComment(strings, ...values) {
  return strings.reduce((line, text, i) => line + text + (i < values.length ? commentSafe(values[i]) : ''), '')
}

/**
 * 등록 기록 객체(`registration-record.json`)를 만든다.
 * `registered_at`은 KST(+09:00) ISO 문자열이다.
 */
export function buildRegistrationRecord({ bundle, badgeId, bucket, pngPath, webpPath, originalUrl, imageUrl, webpBytes, registeredAt }) {
  const { badge, image } = bundle
  return {
    record_version: RECORD_VERSION,
    bundle_id: bundle.bundle_id,
    author: bundle.author,
    bundle_created_at: bundle.created_at,
    registered_at: toKstIso(registeredAt),
    summary: summarizeBundle(bundle),
    badge: {
      id: badgeId,
      name: badge.name,
      type: badge.type,
      rarity: badge.rarity ?? null,
      level: badge.level ?? null,
      family_key: badge.family_key ?? null,
      image_source: AGENT_IMAGE_SOURCE,
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
 * `undoTables`: 되돌림 전에 참조를 확인하는 표 이름(`src/lib/admin/registerChecks/references.ts`의 `BADGE_UNDO_REFERENCES`가 원본이라 호출부가 넘긴다).
 */
export function buildRegistrationSql({ payload, record, undoTables }) {
  const columns = Object.keys(payload)
  const lines = [
    sqlComment`-- 에셋 제너레이터 에이전트 배지 등록 기록 (register-badge.mjs가 만든 파일, 티켓 20260924_2202)`,
    sqlComment`-- 묶음: ${record.bundle_id} / 작성자: ${record.author} / 등록 시각(KST): ${record.registered_at}`,
    sqlComment`-- 배지: ${record.badge.name} (${record.badge.id})`,
    sqlComment`-- 이미 등록이 끝난 기록이에요. 같은 id가 있으면 아무 일도 하지 않아요(ON CONFLICT DO NOTHING).`,
    sqlComment`-- 이미지 파일(${record.storage.bucket} 버킷): ${record.storage.png_path}, ${record.storage.webp_path}`,
    sqlComment`--   저장소 파일은 SQL로 지울 수 없어요. 되돌릴 때는 아래 명령을 써요.`,
    sqlComment`--   cd jam-web && npx tsx scripts/asset-generator/register-badge.mjs --undo <${RECORD_FILE_NAME} 절대경로>`,
    sqlComment`-- 메인 세션: 이 파일을 jam-web/supabase/migrations/${migrationFileName(record.bundle_id)} 로 옮겨 커밋해요.`,
    '',
    'INSERT INTO public.badges (',
    columns.map((c) => `  ${c}`).join(',\n'),
    ') VALUES (',
    columns.map((c) => `  ${sqlLiteral(payload[c])}`).join(',\n'),
    ')',
    'ON CONFLICT (id) DO NOTHING;',
    '',
    '-- 되돌림 SQL',
    sqlComment`-- delete from public.badges where id = '${record.badge.id}';`,
    sqlComment`-- (이 SQL만으로는 저장소 파일이 남아요. ${[...new Set(undoTables)].join(' · ')}에 이 id가 이미 붙었다면 지우지 말고 어드민에서 소프트 삭제해요. 일부는 삭제 시 함께 사라지거나 연결이 끊기고, 일부는 삭제가 막혀요.)`,
    '',
  ]
  return lines.join('\n')
}

function undoCommand(recordPath) {
  return `cd jam-web && npx tsx scripts/asset-generator/register-badge.mjs --undo ${recordPath}`
}

/**
 * `--dry-run` 결과를 컨펌 자료로 읽을 수 있는 한국어 요약으로 만든다.
 * - `errors`: 고쳐야 할 사유 전체(묶음 검증 + 등록 기록 중복 + DB 읽기 검사 실패). 비어 있으면 통과다.
 * - `bundle`이 null이면(묶음 검증 실패) 사유만 보여 준다.
 */
export function formatDryRunSummary({ bundle, payload, errors, dbChecks, webp, recordDir }) {
  const lines = []
  // DB 읽기 검사를 건너뛴 요약(서비스 키 없음)은 중복·존재 검사가 빠진 결과라, 첫 줄에서 «통과»만 읽히지 않게 함께 적는다(티켓 20260925_0542).
  const dbChecksSkipped = dbChecks.some((check) => check.status === '건너뜀')
  lines.push('== 배지 등록 묶음 검증 (--dry-run) ==')
  lines.push(
    errors.length > 0
      ? `결과: 실패 (${errors.length}건)`
      : dbChecksSkipped
        ? '결과: 통과 (DB 읽기 검사는 건너뜀 — 서비스 키 없음)'
        : '결과: 통과'
  )
  if (dbChecksSkipped) {
    lines.push('※ DB 읽기 검사(이름 중복·트라이브·컬렉션 존재)가 빠진 요약이에요. 컨펌 근거로 쓰지 말고, 서비스 키가 있는 환경(메인 폴더)에서 다시 돌려요.')
  }

  if (errors.length > 0) {
    lines.push('', '[고쳐야 할 점]')
    for (const reason of errors) lines.push(`- ${reason}`)
  }

  if (bundle) {
    const { image } = bundle
    const kind = payload.rarity ? `등급형 ${payload.rarity}` : `레벨형 Lv.${payload.level}`

    lines.push(
      '',
      '[묶음]',
      `- 묶음 ID: ${bundle.bundle_id}`,
      `- 작성자: ${bundle.author}`,
      `- 작성 시각: ${formatKst(bundle.created_at)}`,
      `- 컬러 선택 근거: ${bundle.color_rationale_link}`,
      '',
      '[배지]',
      `- 이름: ${payload.name}`,
      `- 설명: ${payload.description}`,
      `- 유형: ${BADGE_TYPE_LABEL[payload.type] ?? payload.type} (${payload.type})`,
      `- 종류: ${kind}`,
      `- 계열 키: ${payload.family_key ?? '없음'}`,
      `- 정렬 순서: ${payload.sort_order}`,
      `- 종목: ${payload.activity_types.length > 0 ? payload.activity_types.join(', ') : '지정 없음'}`,
      `- 획득 조건: ${payload.condition_json ? JSON.stringify(payload.condition_json) : '없음'}`,
      `- 보상 포인트: ${payload.point_reward}`,
      `- 드랍 가중치: ${payload.drop_weight}`,
      `- 트라이브: ${payload.tribe_id ?? '없음'}`,
      `- 컬렉션(아이템북): ${payload.item_book_id ?? '없음'}`,
      `- 유효 기간: ${payload.valid_from ?? '제한 없음'} ~ ${payload.valid_until ?? '제한 없음'}`,
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
          ? `- WebP 변환 미리 확인: 통과 (${(webp.bytes / 1024).toFixed(1)}KB, 긴 변 1280px 이하)`
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
      '1. 저장소(images 버킷)에 원본 PNG 업로드: badges/asset-generator/<새 배지 id>.png',
      '2. 같은 폴더에 WebP 업로드: badges/asset-generator/<새 배지 id>.webp (image_url은 이 파일을 가리켜요)',
      `3. badges 테이블에 행 1건 추가 (image_source = ${AGENT_IMAGE_SOURCE})`,
      `4. 묶음 폴더에 ${RECORD_FILE_NAME}·${SQL_FILE_NAME} 기록: ${recordDir}`,
      '',
      '[되돌림 SQL 미리보기]',
      "delete from public.badges where id = '<등록할 때 정해지는 배지 id>';",
      `저장소 파일은 SQL로 지울 수 없어요. 등록 뒤에는 ${undoCommand(recordPath)} 로 파일 2개와 배지 행을 함께 지워요.`
    )
  }

  lines.push('', 'DB·저장소에는 아무것도 쓰지 않았어요.')
  return lines.join('\n')
}
