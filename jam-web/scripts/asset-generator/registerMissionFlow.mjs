/**
 * JAM! 에셋 제너레이터 미션 등록 — DB 읽기 검사·등록·되돌림·명령 실행 흐름 (티켓 20260925_1412)
 *
 * 배지판(`registerFlow.mjs`)의 미션 버전이다. Supabase 클라이언트와 WebP 변환기·UUID 생성기·
 * 시각 함수를 인자로 받아, 스텁으로 순서와 실패 처리를 검증할 수 있게 했다
 * (`__tests__/registerMissionFlow.test.ts`). 실제 클라이언트를 만드는 곳은 `register-mission.mjs` 하나뿐이다.
 * 배지판에서는 `STORAGE_BUCKET`·`writeRegistrationFiles`(내용과 무관한 부품)만 가져오고, 배지 전용으로 묶인
 * 업로드·삭제 보조 함수(비공개)는 여기에 다시 적었다.
 *
 * ## 등록 순서와 실패 처리 (배지와 같다)
 * 1. 묶음 검증 → DB 읽기 검사(제목 중복·보상 배지 존재와 종류·조건 배지·조건 장소 존재 — `src/lib/admin/registerChecks/mission.ts`) — 하나라도 실패하면 아무것도 쓰지 않는다.
 *    보상 배지는 숨김 배지·체크인 배지를 쓸 수 없다(티켓 20261019_1313 2회). 판정은 어드민 미션 저장 라우트와 같은 함수다(`src/lib/missions/reward-badges.ts`).
 * 2. 새 미션 id를 미리 정한다(이미지 저장 경로에 쓰려고).
 * 3. 이미지 업로드(원본 PNG → WebP). 하나라도 실패하면 이미 올라간 파일을 지우고 끝낸다.
 * 4. 미션 행 insert. 실패하면 올라간 이미지 2개를 지우고 끝낸다.
 * 5. 등록 기록 파일 출력(호출부). 이 단계가 실패해도 이미 등록은 끝났으므로 기록 내용을 화면에 그대로 찍는다.
 * 이미지를 먼저 올리는 이유: image_url이 없는 미션 행이 잠시라도 보이지 않게 하려는 것이다.
 */
import fs from 'node:fs'
import path from 'node:path'

import { runMissionDbChecks as runMissionDbChecksImpl } from '../../src/lib/admin/registerChecks/mission'
import {
  MISSION_UNDO_REFERENCE_TABLES as UNDO_REFERENCE_TABLES,
  findMissionUndoReferences,
} from '../../src/lib/admin/registerChecks/references'
import { STORAGE_BUCKET, writeRegistrationFiles } from './registerFlow.mjs'
import {
  AGENT_IMAGE_SOURCE,
  UUID_PATTERN,
  buildMissionInsertPayload,
  findPreviousRecordError,
  readBundleFile,
  validateMissionBundle,
} from './registerMissionBundle.mjs'
import {
  RECORD_FILE_NAME,
  SQL_FILE_NAME,
  buildMissionRegistrationRecord,
  buildMissionRegistrationSql,
  formatMissionDryRunSummary,
  missionMigrationFileName,
} from './registerMissionRecord.mjs'

export { STORAGE_BUCKET }

/**
 * 되돌림 전 참조 확인 목록의 원본은 `src/lib/admin/registerChecks/references.ts`의 `MISSION_UNDO_REFERENCE_TABLES`다
 * (티켓 20261002_0827 — 서버도 같은 목록을 쓰게 옮겼다). 여기서는 기존 이름으로 다시 내보낸다.
 */
export { UNDO_REFERENCE_TABLES }

const errorMessage = (e) => (e instanceof Error ? e.message : String(e))

/** 2200 적용 API(`api/admin/asset-generator/apply/route.ts`)와 같은 저장 경로 규칙(`missions` 접두사). */
export function missionStoragePathsFor(missionId) {
  return {
    pngPath: `missions/asset-generator/${missionId}.png`,
    webpPath: `missions/asset-generator/${missionId}.webp`,
  }
}

/**
 * DB를 읽어야 알 수 있는 검사를 돌린다(읽기 전용). `supabase`가 null이면 «건너뜀»으로 표시한다.
 * 반환: `{ checks: [{ label, status, detail }], errors: string[] }` — status는 통과·실패·건너뜀·해당 없음.
 * 검사 본문은 `src/lib/admin/registerChecks/mission.ts`에 있다(티켓 20261002_0827). TS 함수를 그대로 다시 내보내지 않고 JS
 * 래퍼를 두는 이유: 테스트의 호출이 TS 시그니처로 typecheck되면 손으로 만든 스텁이 통과하지 못한다.
 */
export async function runMissionDbChecks({ supabase, mission }) {
  return runMissionDbChecksImpl({ supabase, mission })
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
 * 이미지 2개를 올리고 미션 행을 만든다(순서·실패 처리는 파일 머리말). DB 읽기 검사는 호출부가 먼저 끝낸 뒤 부른다.
 * 실패하면 한국어 메시지의 Error를 던진다.
 *
 * 인자: `supabase`(서비스 키 클라이언트, 스텁 가능), `bundle`(`validateMissionBundle`이 돌려준 정규화된 묶음),
 * `convertToWebp`(`convertBadgeImageToWebp` — 적용 API가 미션에도 같은 변환기를 쓴다), `randomUUID`, `now`(밀리초
 * 시각 — WebP 주소의 `?v=` 캐시 무효화 값과 등록 시각으로 쓴다).
 * 반환: `{ missionId, payload, bucket, pngPath, webpPath, originalUrl, imageUrl, webpBytes, registeredAt }`.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 .mjs를 import할 때 추론이 좁아져 호출이 막히는 것을 피한다.)
 */
export async function registerMission({ supabase, bundle, convertToWebp, randomUUID, now }) {
  const png = fs.readFileSync(bundle.image.abs_path)
  // 변환 실패는 업로드 전에 드러나야 정리할 파일이 없다.
  let webp
  try {
    webp = await convertToWebp(png)
  } catch (e) {
    throw new Error(`이미지를 WebP로 변환하지 못했어요: ${errorMessage(e)}`)
  }

  const missionId = randomUUID()
  const { pngPath, webpPath } = missionStoragePathsFor(missionId)
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
        ? '저장소에는 아무것도 남지 않았고, 미션 행은 만들지 않았어요.'
        : '올라간 파일은 지웠고, 미션 행은 만들지 않았어요.'
    throw new Error(`${errorMessage(e)} ${note}`)
  }

  const registeredAtMs = now()
  const originalUrl = storage.getPublicUrl(pngPath).data.publicUrl
  // 같은 경로로 다시 올리는 일은 없지만, 2200 적용 API·배지 등록과 같은 캐시 무효화 쿼리를 붙인다.
  const imageUrl = `${storage.getPublicUrl(webpPath).data.publicUrl}?v=${registeredAtMs}`
  const payload = buildMissionInsertPayload(bundle.mission, { id: missionId, imageUrl })

  let insertError
  try {
    const result = await supabase.from('missions').insert(payload)
    insertError = result?.error ?? null
  } catch (e) {
    insertError = e instanceof Error ? e : new Error(String(e))
  }
  if (insertError) {
    const cleanupError = await removeUploaded(storage, uploaded)
    throw new Error(
      `미션 행 등록에 실패했어요: ${insertError.message} ${cleanupError ? `올라간 이미지 파일을 지우지 못했어요. 직접 지워 주세요(${uploaded.join(', ')}): ${cleanupError}` : '올라간 이미지 파일 2개는 지웠어요.'}`
    )
  }

  return {
    missionId,
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
export function findMissionRecordUndoError(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) return '등록 기록의 최상위는 객체여야 해요.'
  const id = record.mission?.id
  if (typeof id !== 'string' || !UUID_PATTERN.test(id)) return '등록 기록에 미션 id(mission.id)가 없거나 UUID 형식이 아니에요.'
  const { bucket, png_path: pngPath, webp_path: webpPath } = record.storage ?? {}
  const expected = missionStoragePathsFor(id)
  // 기록이 손상됐거나 바뀌었어도 엉뚱한 파일을 지우지 않도록 경로를 규칙 그대로만 허용한다.
  if (bucket !== STORAGE_BUCKET || pngPath !== expected.pngPath || webpPath !== expected.webpPath) {
    return `등록 기록의 저장소 경로가 규칙(${STORAGE_BUCKET}/${expected.pngPath}, ${expected.webpPath})과 달라요.`
  }
  return null
}

/**
 * 등록한 미션을 되돌린다: 미션 행과 저장소 파일 2개를 지운다.
 * 삭제 전에 사용자 데이터가 붙었는지(`UNDO_REFERENCE_TABLES`) 읽어서 하나라도 있으면 아무것도 지우지 않고 Error로
 * 중단한다. 참조를 읽지 못해도 중단한다(확인 못 한 채 지우지 않는다). 미션 행을 먼저 지운다 — 행 삭제가 막히면
 * (외래 키 등) 이미지는 그대로 남아 미션이 깨지지 않는다.
 *
 * 반환: `{ missionId, rowFound, references: [{ table, count }], rowDeleted, filesRemoved, warnings }`.
 * `dryRun`이면 참조 확인까지만 하고 아무것도 지우지 않는다.
 */
export async function undoMissionRegistration({ supabase, record, dryRun }) {
  const recordError = findMissionRecordUndoError(record)
  if (recordError) throw new Error(recordError)

  const missionId = record.mission.id
  const { bucket, png_path: pngPath, webp_path: webpPath } = record.storage

  const { data: row, error: rowError } = await supabase.from('missions').select('id, title, image_source').eq('id', missionId).maybeSingle()
  if (rowError) throw new Error(`미션 행을 읽지 못해서 중단했어요: ${rowError.message}`)
  if (row && row.image_source !== AGENT_IMAGE_SOURCE) {
    throw new Error(`이 미션은 에이전트 등록(image_source=${AGENT_IMAGE_SOURCE})이 아니라서 지우지 않아요(현재 값: ${row.image_source ?? '없음'}).`)
  }

  // 참조 확인(붙어 있으면 Error로 중단)은 `registerChecks/references.ts`의 `findMissionUndoReferences`다.
  const references = row ? await findMissionUndoReferences(supabase, missionId) : []

  const result = { missionId, rowFound: Boolean(row), references, rowDeleted: false, filesRemoved: false, warnings: [] }
  if (dryRun) return result

  if (row) {
    const { error: deleteError } = await supabase.from('missions').delete().eq('id', missionId).eq('image_source', AGENT_IMAGE_SOURCE)
    if (deleteError) throw new Error(`미션 행을 지우지 못해서 중단했어요(이미지 파일은 그대로 뒀어요): ${deleteError.message}`)
    result.rowDeleted = true
  } else {
    result.warnings.push('미션 행이 이미 없어서 저장소 파일만 정리해요.')
  }

  const removeError = await removeUploaded(supabase.storage.from(bucket), [pngPath, webpPath])
  if (removeError) {
    result.warnings.push(`이미지 파일을 지우지 못했어요. 직접 지워 주세요(${pngPath}, ${webpPath}): ${removeError}`)
  } else {
    result.filesRemoved = true
  }
  return result
}

/**
 * `--bundle` 모드 실행. 종료 코드를 돌려준다(0 성공, 1 실패).
 * - `--dry-run`: 검증 + (supabase가 있으면) 읽기 전용 DB 검사 + 요약 출력. DB·저장소·파일에 쓰지 않는다.
 * - 그 외: 검증 → DB 검사 → 업로드 → insert → 기록 파일. supabase가 없으면 실행하지 않는다.
 *
 * 인자: `args`(parseRegisterArgs 결과), `supabase`(서비스 키 클라이언트, dry-run에서는 null 가능 — DB 검사를
 * 건너뛴다), `convertToWebp`·`randomUUID`·`now`(`registerMission`과 같다), `out`(`{ log, error }`).
 */
export async function runMissionRegister({ args, supabase, convertToWebp, randomUUID, now, out }) {
  const bundleFile = args.bundle
  const recordDir = args.recordDir ?? path.dirname(bundleFile)

  let raw
  try {
    raw = readBundleFile(bundleFile)
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  const { errors: bundleErrors, warnings, bundle } = validateMissionBundle(raw, { bundleFile })
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
    const dbResult = await runMissionDbChecks({ supabase, mission: bundle.mission })
    dbChecks = dbResult.checks
    errors.push(...dbResult.errors)
    payload = buildMissionInsertPayload(bundle.mission, { id: '<등록할 때 정해지는 미션 id>', imageUrl: '<WebP 공개 주소>' })

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
    out.log(formatMissionDryRunSummary({ bundle, payload, errors, warnings, dbChecks, webp, recordDir }))
    return errors.length === 0 ? 0 : 1
  }

  if (errors.length > 0) {
    out.error(['등록하지 않았어요. 고쳐야 할 점:', ...errors.map((reason) => `- ${reason}`)].join('\n'))
    return 1
  }

  let registered
  try {
    registered = await registerMission({ supabase, bundle, convertToWebp, randomUUID, now })
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  const record = buildMissionRegistrationRecord({ bundle, ...registered })
  const sql = buildMissionRegistrationSql({
    payload: registered.payload,
    record,
    undoTables: UNDO_REFERENCE_TABLES.map((r) => r.table),
  })
  try {
    const { recordPath, sqlPath } = writeRegistrationFiles({ recordDir, record, sql })
    const lines = [
      `등록했어요: ${record.mission.title} (${record.mission.id})`,
      `- 이미지: ${record.urls.image_url}`,
      `- 등록 기록: ${recordPath}`,
      `- SQL 기록: ${sqlPath}`,
      `- 다음: SQL 기록을 jam-web/supabase/migrations/${missionMigrationFileName(bundle.bundle_id)} 로 옮겨 커밋해요.`,
      `- 되돌리기: cd jam-web && npx tsx scripts/asset-generator/register-mission.mjs --undo ${recordPath}`,
    ]
    for (const notice of warnings) lines.push(`- 알아둘 점: ${notice}`)
    out.log(lines.join('\n'))
    return 0
  } catch (e) {
    // 등록은 끝났는데 기록 파일을 못 썼다 — 기록 내용을 화면에 남겨 수동으로 옮길 수 있게 한다.
    out.error(`미션은 등록됐지만 기록 파일을 쓰지 못했어요: ${errorMessage(e)}\n아래 내용을 ${RECORD_FILE_NAME}·${SQL_FILE_NAME}로 직접 저장해 주세요.`)
    out.log(JSON.stringify(record, null, 2))
    out.log(sql)
    return 1
  }
}

/** `--undo` 모드 실행. 종료 코드를 돌려준다(0 성공, 1 실패·중단). */
export async function runMissionUndo({ args, supabase, out }) {
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
    result = await undoMissionRegistration({ supabase, record, dryRun: args.dryRun })
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }

  if (args.dryRun) {
    out.log(
      [
        '== 되돌림 검증 (--dry-run) ==',
        `미션 id: ${result.missionId}`,
        result.rowFound ? '사용자 데이터 참조: 없음 — 지워도 안전해요.' : '미션 행이 이미 없어요. 저장소 파일만 정리할 대상이에요.',
        `지울 대상: missions 행 1건(있을 때), 저장소 파일 2개(${record.storage.png_path}, ${record.storage.webp_path})`,
        'DB·저장소에는 아무것도 쓰지 않았어요.',
      ].join('\n')
    )
    return 0
  }

  const lines = [`되돌렸어요: ${record.mission.title ?? ''} (${result.missionId})`]
  lines.push(`- 미션 행: ${result.rowDeleted ? '삭제했어요' : '이미 없었어요'}`)
  lines.push(`- 저장소 파일 2개: ${result.filesRemoved ? '삭제했어요' : '삭제하지 못했어요'}`)
  for (const warning of result.warnings) lines.push(`- 주의: ${warning}`)
  out.log(lines.join('\n'))
  return result.filesRemoved ? 0 : 1
}
