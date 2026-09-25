/**
 * JAM! 에셋 제너레이터 배지 등록 — DB 읽기 검사·등록·되돌림·명령 실행 흐름 (티켓 20260924_2202)
 *
 * Supabase 클라이언트와 WebP 변환기·UUID 생성기·시각 함수를 인자로 받아, 스텁으로 순서와 실패
 * 처리를 검증할 수 있게 했다(`__tests__/registerFlow.test.ts`). 실제 클라이언트를 만드는 곳은
 * `register-badge.mjs` 하나뿐이다.
 *
 * ## 등록 순서와 실패 처리 (티켓 20260924_2202 요구사항)
 * 1. 묶음 검증 → DB 읽기 검사(이름 중복·트라이브·컬렉션 존재) — 여기서 하나라도 실패하면 아무것도 쓰지 않는다.
 * 2. 새 배지 id를 미리 정한다(이미지 저장 경로에 쓰려고).
 * 3. 이미지 업로드(원본 PNG → WebP). 하나라도 실패하면 이미 올라간 파일을 지우고 끝낸다.
 * 4. 배지 행 insert. 실패하면 올라간 이미지 2개를 지우고 끝낸다.
 * 5. 등록 기록 파일 출력(호출부). 이 단계가 실패해도 이미 등록은 끝났으므로 기록 내용을 화면에 그대로 찍는다.
 * 이미지를 먼저 올리는 이유: image_url이 없는 배지 행이 잠시라도 보이지 않게 하려는 것이다(행이 먼저
 * 생기면 insert 성공 뒤 업로드가 실패했을 때 깨진 이미지 배지가 서비스에 노출된다).
 */
import fs from 'node:fs'
import path from 'node:path'

import { findCheckinBadgeNamesNotFoundError } from '../../src/lib/admin/badge-validation'
import { APPLY_GENERATED_IMAGE_BUCKET } from '../../src/lib/admin/applyGeneratedImageConstants'

import {
  AGENT_IMAGE_SOURCE,
  UUID_PATTERN,
  buildBadgeInsertPayload,
  findPreviousRecordError,
  readBundleFile,
  validateBundle,
} from './registerBundle.mjs'
import {
  RECORD_FILE_NAME,
  SQL_FILE_NAME,
  buildRegistrationRecord,
  buildRegistrationSql,
  formatDryRunSummary,
  migrationFileName,
} from './registerRecord.mjs'

export const STORAGE_BUCKET = APPLY_GENERATED_IMAGE_BUCKET

/**
 * 되돌림 전에 «이 배지가 아직 아무 데도 쓰이지 않았는지» 읽는 관계 표(티켓 20260925_0540). `badges`를 가리키는 외래 키
 * 10곳 전부다(운영 DB `pg_constraint` 조회 2026-09-25, 생성 타입 `database.generated.ts`와 테스트로 대조한다).
 * - 삭제 차단(NO ACTION, DB가 막아 주지만 --undo가 중간에 실패하면 저장소 파일과 행이 어긋날 수 있어 미리 읽는다):
 *   user_activity_badges · inventory_items · poi_drops · poi.linked_badge_id · point_transactions.source_badge_id
 * - 연쇄 삭제(CASCADE, 지우면 유저 기록이 경고 없이 함께 사라짐): user_checkin_badge_earns · user_item_book_slots
 * - 연결 해제(SET NULL, 조용히 연결이 끊김): item_books.reward_badge_id · item_books.required_activity_badge_id · missions.gated_badge_id
 * 조회는 각 표의 배지 id 컬럼으로 센다(표마다 `id` 컬럼 유무가 달라 컬럼을 그대로 쓴다).
 * 참조 표를 바꿀 때는 이 목록만 고친다 — 코드·SQL 기록 주석은 이 상수에서 나온다.
 */
export const UNDO_REFERENCE_TABLES = [
  { table: 'user_activity_badges', column: 'badge_id', effect: '삭제 차단' },
  { table: 'inventory_items', column: 'badge_id', effect: '삭제 차단' },
  { table: 'poi_drops', column: 'badge_id', effect: '삭제 차단' },
  { table: 'poi', column: 'linked_badge_id', effect: '삭제 차단' },
  { table: 'point_transactions', column: 'source_badge_id', effect: '삭제 차단' },
  { table: 'user_checkin_badge_earns', column: 'badge_id', effect: '연쇄 삭제' },
  { table: 'user_item_book_slots', column: 'badge_id', effect: '연쇄 삭제' },
  { table: 'item_books', column: 'reward_badge_id', effect: '연결 해제' },
  { table: 'item_books', column: 'required_activity_badge_id', effect: '연결 해제' },
  { table: 'missions', column: 'gated_badge_id', effect: '연결 해제' },
]

const errorMessage = (e) => (e instanceof Error ? e.message : String(e))

/** 2200 적용 API(`api/admin/asset-generator/apply/route.ts`)와 같은 저장 경로 규칙. */
export function storagePathsFor(badgeId) {
  return {
    pngPath: `badges/asset-generator/${badgeId}.png`,
    webpPath: `badges/asset-generator/${badgeId}.webp`,
  }
}

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 */
export async function runDbChecks({ supabase, badge }) {
  const checks = []
  const errors = []

  const add = async (label, applicable, run) => {
    if (!applicable) {
      checks.push({ label, status: '해당 없음', detail: '' })
      return
    }
    if (!supabase) {
      checks.push({ label, status: '건너뜀', detail: '서비스 키(.env.local)가 없어 DB를 읽지 않았어요' })
      return
    }
    let failure
    try {
      failure = await run()
    } catch (e) {
      failure = `DB 조회에 실패했어요: ${errorMessage(e)}`
    }
    if (failure) {
      checks.push({ label, status: '실패', detail: failure })
      errors.push(`${label}: ${failure}`)
    } else {
      checks.push({ label, status: '통과', detail: '' })
    }
  }

  await add('이름 중복', true, async () => {
    const { data, error } = await supabase.from('badges').select('id').eq('name', badge.name).is('deleted_at', null).limit(1)
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    if (data && data.length > 0) {
      return `같은 이름의 배지가 이미 있어요(id: ${data[0].id}). 기존 배지 갱신은 이 스크립트 범위 밖이라 중복으로 거절해요.`
    }
    return null
  })

  await add('트라이브 존재', Boolean(badge.tribe_id), async () => {
    const { data, error } = await supabase.from('tribes').select('id').eq('id', badge.tribe_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `tribe_id에 해당하는 트라이브가 없어요: ${badge.tribe_id}`
  })

  await add('컬렉션 존재', Boolean(badge.item_book_id), async () => {
    const { data, error } = await supabase.from('item_books').select('id').eq('id', badge.item_book_id).maybeSingle()
    if (error) return `DB 조회에 실패했어요: ${error.message}`
    return data ? null : `item_book_id에 해당하는 컬렉션이 없어요: ${badge.item_book_id}`
  })

  const checkinNames = badge.condition_json?.checkin_badge_count?.checkin_badge_names
  await add('체크인 배지 이름 목록', Array.isArray(checkinNames) && checkinNames.length > 0, async () => {
    // 어드민 API와 같은 함수를 그대로 쓴다(조회 자체가 실패하면 함수가 통과로 본다 — 발급 시점이 안전망이다).
    return findCheckinBadgeNamesNotFoundError(badge.condition_json ?? null, supabase)
  })

  return { checks, errors }
}

async function uploadFile(storage, filePath, buffer, contentType, label) {
  let result
  try {
    result = await storage.upload(filePath, buffer, { contentType, upsert: false })
  } catch (e) {
    throw new Error(`${label} 업로드에 실패했어요: ${errorMessage(e)}`)
  }
  if (result?.error) throw new Error(`${label} 업로드에 실패했어요: ${result.error.message}`)
}

/** 올라간 파일을 지운다. 실패하면 사유 문자열을, 성공(또는 지울 것 없음)이면 null을 돌려준다. */
async function removeUploaded(storage, paths) {
  if (paths.length === 0) return null
  try {
    const { error } = await storage.remove(paths)
    return error ? error.message : null
  } catch (e) {
    return errorMessage(e)
  }
}

/**
 * 이미지 2개를 올리고 배지 행을 만든다(순서·실패 처리는 파일 머리말). DB 읽기 검사는 호출부가 먼저
 * 끝낸 뒤 부른다. 실패하면 한국어 메시지의 Error를 던진다.
 *
 * 인자: `supabase`(서비스 키 클라이언트, 스텁 가능), `bundle`(`validateBundle`이 돌려준 정규화된 묶음),
 * `convertToWebp`(`convertBadgeImageToWebp`), `randomUUID`, `now`(밀리초 시각 — WebP 주소의 `?v=`
 * 캐시 무효화 값과 등록 시각으로 쓴다).
 * 반환: `{ badgeId, payload, bucket, pngPath, webpPath, originalUrl, imageUrl, webpBytes, registeredAt }`.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 .mjs를 import할 때 추론이 좁아져 호출이
 * 막히는 것을 피한다.)
 */
export async function registerBadge({ supabase, bundle, convertToWebp, randomUUID, now }) {
  const png = fs.readFileSync(bundle.image.abs_path)
  // 변환 실패는 업로드 전에 드러나야 정리할 파일이 없다.
  let webp
  try {
    webp = await convertToWebp(png)
  } catch (e) {
    throw new Error(`이미지를 WebP로 변환하지 못했어요: ${errorMessage(e)}`)
  }

  const badgeId = randomUUID()
  const { pngPath, webpPath } = storagePathsFor(badgeId)
  const storage = supabase.storage.from(STORAGE_BUCKET)

  const uploaded = []
  try {
    await uploadFile(storage, pngPath, png, 'image/png', '원본 이미지')
    uploaded.push(pngPath)
    await uploadFile(storage, webpPath, webp, 'image/webp', 'WebP 이미지')
    uploaded.push(webpPath)
  } catch (e) {
    const cleanupError = await removeUploaded(storage, uploaded)
    const note = cleanupError
      ? `올라간 파일을 지우지 못했어요. 직접 지워 주세요(${uploaded.join(', ')}): ${cleanupError}`
      : uploaded.length === 0
        ? '저장소에는 아무것도 남지 않았고, 배지 행은 만들지 않았어요.'
        : '올라간 파일은 지웠고, 배지 행은 만들지 않았어요.'
    throw new Error(`${errorMessage(e)} ${note}`)
  }

  const registeredAtMs = now()
  const originalUrl = storage.getPublicUrl(pngPath).data.publicUrl
  // 같은 경로로 다시 올리는 일은 없지만, 2200 적용 API·recraft 등록 스크립트와 같은 캐시 무효화 쿼리를 붙인다.
  const imageUrl = `${storage.getPublicUrl(webpPath).data.publicUrl}?v=${registeredAtMs}`
  const payload = buildBadgeInsertPayload(bundle.badge, { id: badgeId, imageUrl })

  let insertError
  try {
    const result = await supabase.from('badges').insert(payload)
    insertError = result?.error ?? null
  } catch (e) {
    insertError = e instanceof Error ? e : new Error(String(e))
  }
  if (insertError) {
    const cleanupError = await removeUploaded(storage, uploaded)
    throw new Error(
      `배지 행 등록에 실패했어요: ${insertError.message} ${cleanupError ? `올라간 이미지 파일을 지우지 못했어요. 직접 지워 주세요(${uploaded.join(', ')}): ${cleanupError}` : '올라간 이미지 파일 2개는 지웠어요.'}`
    )
  }

  return {
    badgeId,
    payload,
    bucket: STORAGE_BUCKET,
    pngPath,
    webpPath,
    originalUrl,
    imageUrl,
    webpBytes: webp.length,
    registeredAt: new Date(registeredAtMs),
  }
}

/** 되돌림 기록 파일(`registration-record.json`)이 삭제해도 되는 형태인지 본다. 문제가 있으면 사유를, 없으면 null. */
export function findRecordUndoError(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return '등록 기록의 최상위는 객체여야 해요.'
  const id = record.badge?.id
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return '등록 기록에 배지 id(badge.id)가 없거나 UUID 형식이 아니에요.'
  const { bucket, png_path: pngPath, webp_path: webpPath } = record.storage ?? {}
  const expected = storagePathsFor(id)
  // 기록이 손상됐거나 바뀌었어도 엉뚱한 파일을 지우지 않도록 경로를 규칙 그대로만 허용한다.
  if (bucket !== STORAGE_BUCKET || pngPath !== expected.pngPath || webpPath !== expected.webpPath) {
    return `등록 기록의 저장소 경로가 규칙(${STORAGE_BUCKET}/${expected.pngPath}, ${expected.webpPath})과 달라요.`
  }
  return null
}

/**
 * 등록한 배지를 되돌린다: 배지 행과 저장소 파일 2개를 지운다.
 * 삭제 전에 참조 관계(`UNDO_REFERENCE_TABLES`)를 읽어서 하나라도 붙어 있으면 아무것도 지우지
 * 않고 Error로 중단한다. 참조를 읽지 못해도 중단한다(확인 못 한 채 지우지 않는다).
 * 배지 행을 먼저 지운다 — 행 삭제가 막히면(외래 키 등) 이미지는 그대로 남아 배지가 깨지지 않는다.
 *
 * 반환: `{ badgeId, rowFound, references: [{ table, column, effect, count }], rowDeleted, filesRemoved, warnings }`.
 * `dryRun`이면 참조 확인까지만 하고 아무것도 지우지 않는다.
 */
export async function undoRegistration({ supabase, record, dryRun }) {
  const recordError = findRecordUndoError(record)
  if (recordError) throw new Error(recordError)

  const badgeId = record.badge.id
  const { bucket, png_path: pngPath, webp_path: webpPath } = record.storage

  const { data: row, error: rowError } = await supabase.from('badges').select('id, name, image_source').eq('id', badgeId).maybeSingle()
  if (rowError) throw new Error(`배지 행을 읽지 못해서 중단했어요: ${rowError.message}`)
  if (row && row.image_source !== AGENT_IMAGE_SOURCE) {
    throw new Error(`이 배지는 에이전트 등록(image_source=${AGENT_IMAGE_SOURCE})이 아니라서 지우지 않아요(현재 값: ${row.image_source ?? '없음'}).`)
  }

  const references = []
  if (row) {
    for (const { table, column, effect } of UNDO_REFERENCE_TABLES) {
      const { count, error } = await supabase.from(table).select(column, { count: 'exact', head: true }).eq(column, badgeId)
      if (error) throw new Error(`${table}.${column} 참조를 확인하지 못해서 중단했어요(확인 없이 지우지 않아요): ${error.message}`)
      if (count && count > 0) references.push({ table, column, effect, count })
    }
    if (references.length > 0) {
      const detail = references.map((r) => `${r.table}.${r.column} ${r.count}건(${r.effect})`).join(', ')
      throw new Error(
        `이미 사용자 데이터나 다른 항목의 연결이 붙어서 되돌리지 않고 중단했어요 — ${detail}. 삭제 대신 어드민에서 배지를 소프트 삭제해 주세요.`
      )
    }
  }

  const result = { badgeId, rowFound: Boolean(row), references, rowDeleted: false, filesRemoved: false, warnings: [] }
  if (dryRun) return result

  if (row) {
    const { error: deleteError } = await supabase.from('badges').delete().eq('id', badgeId).eq('image_source', AGENT_IMAGE_SOURCE)
    if (deleteError) throw new Error(`배지 행을 지우지 못해서 중단했어요(이미지 파일은 그대로 뒀어요): ${deleteError.message}`)
    result.rowDeleted = true
  } else {
    result.warnings.push('배지 행이 이미 없어서 저장소 파일만 정리해요.')
  }

  const removeError = await removeUploaded(supabase.storage.from(bucket), [pngPath, webpPath])
  if (removeError) {
    result.warnings.push(`이미지 파일을 지우지 못했어요. 직접 지워 주세요(${pngPath}, ${webpPath}): ${removeError}`)
  } else {
    result.filesRemoved = true
  }
  return result
}

/** 등록 기록(json)과 SQL을 묶음 폴더(또는 --record-dir)에 쓴다. 기록 파일은 덮어쓰지 않는다. */
export function writeRegistrationFiles({ recordDir, record, sql }) {
  fs.mkdirSync(recordDir, { recursive: true })
  const recordPath = path.join(recordDir, RECORD_FILE_NAME)
  const sqlPath = path.join(recordDir, SQL_FILE_NAME)
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' })
  fs.writeFileSync(sqlPath, sql, { flag: 'wx' })
  return { recordPath, sqlPath }
}

/**
 * `--bundle` 모드 실행. 종료 코드를 돌려준다(0 성공, 1 실패).
 * - `--dry-run`: 검증 + (supabase가 있으면) 읽기 전용 DB 검사 + 요약 출력. DB·저장소·파일에 쓰지 않는다.
 * - 그 외: 검증 → DB 검사 → 업로드 → insert → 기록 파일. supabase가 없으면 실행하지 않는다.
 *
 * 인자: `args`(parseRegisterArgs 결과), `supabase`(서비스 키 클라이언트, dry-run에서는 null 가능 — DB
 * 검사를 건너뛴다), `convertToWebp`·`randomUUID`·`now`(`registerBadge`와 같다), `out`(`{ log, error }`).
 */
export async function runRegister({ args, supabase, convertToWebp, randomUUID, now, out }) {
  const bundleFile = args.bundle
  const recordDir = args.recordDir ?? path.dirname(bundleFile)

  let raw
  try {
    raw = readBundleFile(bundleFile)
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  const { errors: bundleErrors, bundle } = validateBundle(raw, { bundleFile })
  const errors = [...bundleErrors]
  const previousRecordError = findPreviousRecordError(recordDir)
  if (previousRecordError) errors.push(previousRecordError)

  if (!args.dryRun && !supabase) {
    out.error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없어서 등록할 수 없어요. (검증만 하려면 --dry-run을 붙여 주세요.)')
    return 1
  }

  // 묶음 자체가 틀렸으면 DB를 읽을 필요도 없다.
  let dbChecks = []
  let webp
  let payload = null
  if (bundle) {
    const dbResult = await runDbChecks({ supabase, badge: bundle.badge })
    dbChecks = dbResult.checks
    errors.push(...dbResult.errors)
    payload = buildBadgeInsertPayload(bundle.badge, { id: '<등록할 때 정해지는 배지 id>', imageUrl: '<WebP 공개 주소>' })

    if (args.dryRun) {
      try {
        const converted = await convertToWebp(fs.readFileSync(bundle.image.abs_path))
        webp = { bytes: converted.length }
      } catch (e) {
        webp = { error: errorMessage(e) }
        errors.push(`이미지를 WebP로 변환하지 못했어요: ${errorMessage(e)}`)
      }
    }
  }

  if (args.dryRun) {
    out.log(formatDryRunSummary({ bundle, payload, errors, dbChecks, webp, recordDir }))
    return errors.length === 0 ? 0 : 1
  }

  if (errors.length > 0) {
    out.error(['등록하지 않았어요. 고쳐야 할 점:', ...errors.map((reason) => `- ${reason}`)].join('\n'))
    return 1
  }

  let registered
  try {
    registered = await registerBadge({ supabase, bundle, convertToWebp, randomUUID, now })
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  const record = buildRegistrationRecord({ bundle, ...registered })
  const sql = buildRegistrationSql({ payload: registered.payload, record, undoTables: UNDO_REFERENCE_TABLES.map((r) => r.table) })
  try {
    const { recordPath, sqlPath } = writeRegistrationFiles({ recordDir, record, sql })
    out.log(
      [
        `등록했어요: ${record.badge.name} (${record.badge.id})`,
        `- 이미지: ${record.urls.image_url}`,
        `- 등록 기록: ${recordPath}`,
        `- SQL 기록: ${sqlPath}`,
        `- 다음: SQL 기록을 jam-web/supabase/migrations/${migrationFileName(bundle.bundle_id)} 로 옮겨 커밋해요.`,
        `- 되돌리기: cd jam-web && npx tsx scripts/asset-generator/register-badge.mjs --undo ${recordPath}`,
      ].join('\n')
    )
    return 0
  } catch (e) {
    // 등록은 끝났는데 기록 파일을 못 썼다 — 기록 내용을 화면에 남겨 수동으로 옮길 수 있게 한다.
    out.error(`배지는 등록됐지만 기록 파일을 쓰지 못했어요: ${errorMessage(e)}\n아래 내용을 ${RECORD_FILE_NAME}·${SQL_FILE_NAME}로 직접 저장해 주세요.`)
    out.log(JSON.stringify(record, null, 2))
    out.log(sql)
    return 1
  }
}

/** `--undo` 모드 실행. 종료 코드를 돌려준다(0 성공, 1 실패·중단). */
export async function runUndo({ args, supabase, out }) {
  const recordPath = args.undo
  let record
  try {
    if (!fs.existsSync(recordPath) || !fs.statSync(recordPath).isFile()) {
      out.error(`등록 기록 파일을 찾을 수 없어요: ${recordPath}`)
      return 1
    }
    record = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
  } catch (e) {
    out.error(`등록 기록을 읽지 못했어요: ${errorMessage(e)}`)
    return 1
  }

  if (!supabase) {
    out.error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없어서 되돌릴 수 없어요.')
    return 1
  }

  let result
  try {
    result = await undoRegistration({ supabase, record, dryRun: args.dryRun })
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  if (args.dryRun) {
    out.log(
      [
        '== 되돌림 검증 (--dry-run) ==',
        `배지 id: ${result.badgeId}`,
        result.rowFound ? `참조 확인: ${UNDO_REFERENCE_TABLES.length}곳 모두 없음 — 지워도 안전해요.` : '배지 행이 이미 없어요. 저장소 파일만 정리할 대상이에요.',
        `지울 대상: badges 행 1건(있을 때), 저장소 파일 2개(${record.storage.png_path}, ${record.storage.webp_path})`,
        'DB·저장소에는 아무것도 쓰지 않았어요.',
      ].join('\n')
    )
    return 0
  }

  const lines = [`되돌렸어요: ${record.badge.name ?? ''} (${result.badgeId})`]
  lines.push(`- 배지 행: ${result.rowDeleted ? '삭제했어요' : '이미 없었어요'}`)
  lines.push(`- 저장소 파일 2개: ${result.filesRemoved ? '삭제했어요' : '삭제하지 못했어요'}`)
  for (const warning of result.warnings) lines.push(`- 주의: ${warning}`)
  out.log(lines.join('\n'))
  return result.filesRemoved ? 0 : 1
}
