/**
 * JAM! 에셋 제너레이터 — 기존 미션 대표 이미지 일괄 생성·적용 흐름 (티켓 20260926_2346, PRD asset-generator §8)
 *
 * 계획 파일(제목별 조건 문구·배경색·끝색)을 읽어 등록된 미션마다 「미션」 프리셋 이미지를 만들고(미리보기),
 * 검토한 이미지를 그대로 저장소·`missions`에 적용하고(적용), 적용 전 상태로 되돌린다(롤백).
 * Supabase 클라이언트·렌더러·변환기·시각·시드를 인자로 받아 스텁으로 순서와 실패 처리를 시험한다
 * (`__tests__/applyMissionImagesFlow.test.ts`). 실제 연결은 `apply-mission-images.mjs` 하나뿐이다.
 * (이 파일은 JSDoc 타입 주석을 쓰지 않는다 — TS 테스트가 .mjs를 import할 때 추론이 좁아져 호출이 막히는 것을 피한다.)
 *
 * ## 세 모드
 * - 미리보기(기본, `--preview`): 검증 → 미션마다 PNG 렌더 → `<out-dir>`에 PNG·`resolved.json`·`contact-sheet.png` 저장.
 *   DB·저장소에는 아무것도 쓰지 않는다(읽기만 한다).
 * - 적용(`--apply`): `<out-dir>`의 미리보기 결과를 그대로 적용한다(다시 렌더하지 않는다). 쓰기 전에 모든 PNG·미션 존재를
 *   확인하고 WebP 변환까지 끝낸다. 미션마다 (1) 기존 저장소 파일 백업 (2) 원본 PNG 업로드 (3) WebP 업로드 (4) `missions` 갱신.
 *   한 건이라도 실패하면 즉시 멈춘다. 진행 상황은 `applied.json`에 남는다.
 * - 롤백(`--rollback <applied.json>`): 미션마다 이전 `image_url`·`image_source`(null 포함)를 되돌리고 백업 파일을 다시 올린다.
 *
 * ## 시드·텍스트
 * 미션마다 시드를 따로 뽑는다(같은 제목이어도 이미지는 다르다). 조건 문구는 프리셋 텍스트 1번째(`text`), 미션 이름은
 * 2번째(`subtext`)에 들어가고 3번째(MISSION)는 프리셋에 저장된 글자 그대로다(`fillTextLayers.mjs`).
 */
import fs from 'node:fs'
import path from 'node:path'

import { MAX_APPLY_IMAGE_BYTES } from '../../src/lib/admin/applyGeneratedImageConstants'
import { contrastRatio, NORMAL_TEXT_MIN_RATIO, parseHexColor } from './contrastMath.mjs'
import { toKstIsoString } from './makeHomeFeedCardArgs.mjs'
import { AGENT_IMAGE_SOURCE, UUID_PATTERN } from './registerMissionBundle.mjs'
import { STORAGE_BUCKET, missionStoragePathsFor } from './registerMissionFlow.mjs'

export const RESOLVED_FILE_NAME = 'resolved.json'
export const APPLIED_FILE_NAME = 'applied.json'
export const CONTACT_SHEET_FILE_NAME = 'contact-sheet.png'
export const BACKUP_DIR_NAME = 'backup'

export const APPLY_MISSION_IMAGES_USAGE =
  '사용법: --plan <계획.json 절대경로> --out-dir <폴더 절대경로> [--preview]  |  --out-dir <폴더 절대경로> --apply  |  --rollback <applied.json 절대경로>'

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const errorMessage = (e) => (e instanceof Error ? e.message : String(e))
const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * CLI 인자를 파싱한다. 반환: `{ mode: 'preview' | 'apply' | 'rollback', plan, outDir, rollbackFile }`.
 * 경로는 모두 절대 경로여야 한다. 모드는 하나만 고를 수 있고, 아무것도 없으면 미리보기다.
 */
export function parseApplyMissionImagesArgs(argv) {
  const values = {}
  const modes = []

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) throw new Error(`인자 형식이 올바르지 않아요: ${token}\n${APPLY_MISSION_IMAGES_USAGE}`)
    const key = token.slice(2)
    if (key === 'preview' || key === 'apply') {
      modes.push(key)
      continue
    }
    if (key !== 'plan' && key !== 'out-dir' && key !== 'rollback') {
      throw new Error(`알 수 없는 인자예요: --${key}\n${APPLY_MISSION_IMAGES_USAGE}`)
    }
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) throw new Error(`--${key} 값이 필요해요.`)
    values[key] = next
    i++
  }

  if (values.rollback !== undefined) modes.push('rollback')
  if (modes.length > 1) throw new Error('--preview, --apply, --rollback은 하나만 고를 수 있어요.')
  const mode = modes[0] ?? 'preview'

  for (const key of ['plan', 'out-dir', 'rollback']) {
    if (values[key] !== undefined && !path.isAbsolute(values[key])) throw new Error(`--${key}는 절대 경로여야 해요.`)
  }
  if (mode === 'preview' && (values.plan === undefined || values['out-dir'] === undefined)) {
    throw new Error(`미리보기에는 --plan과 --out-dir이 필요해요.\n${APPLY_MISSION_IMAGES_USAGE}`)
  }
  if (mode === 'apply' && values['out-dir'] === undefined) {
    throw new Error(`--apply에는 --out-dir이 필요해요.\n${APPLY_MISSION_IMAGES_USAGE}`)
  }
  if (mode === 'apply' && values.plan !== undefined) {
    throw new Error('--apply는 미리보기 결과(resolved.json)를 그대로 적용해서 --plan을 받지 않아요.')
  }
  if (mode === 'rollback' && (values.plan !== undefined || values['out-dir'] !== undefined)) {
    throw new Error('--rollback은 <applied.json> 경로만 받아요.')
  }

  return { mode, plan: values.plan, outDir: values['out-dir'], rollbackFile: values.rollback }
}

/**
 * 계획 파일 내용을 검증한다(DB·프리셋 없이 볼 수 있는 부분). 반환: `{ errors: string[], plan }` — 오류가 있으면 plan은 null.
 * 검사: 프리셋 id 형식, 항목별 제목·조건 문구 비어 있지 않음, 색 `#RRGGBB`, `expectCount` 양의 정수, 제목 중복 없음.
 */
export function validatePlan(raw) {
  const errors = []
  if (!isPlainObject(raw)) return { errors: ['계획 파일의 최상위는 객체여야 해요.'], plan: null }

  if (typeof raw.preset !== 'string' || !UUID_PATTERN.test(raw.preset)) {
    errors.push(`preset은 프리셋 id(UUID)여야 해요(받은 값: ${JSON.stringify(raw.preset)}).`)
  }
  if (!Array.isArray(raw.items) || raw.items.length === 0) {
    errors.push('items는 비어 있지 않은 배열이어야 해요.')
    return { errors, plan: null }
  }

  const seenTitles = new Set()
  raw.items.forEach((item, index) => {
    const label = `items[${index}]${isPlainObject(item) && typeof item.title === 'string' ? `(${item.title})` : ''}`
    if (!isPlainObject(item)) {
      errors.push(`${label}는 객체여야 해요.`)
      return
    }
    if (!isNonEmptyString(item.title)) errors.push(`${label}: title이 비어 있어요.`)
    else if (seenTitles.has(item.title)) errors.push(`${label}: 같은 제목이 계획에 두 번 있어요. 제목당 항목 하나만 두어요.`)
    else seenTitles.add(item.title)
    if (!isNonEmptyString(item.condition)) errors.push(`${label}: condition(조건 문구)이 비어 있어요.`)
    for (const key of ['bg', 'end']) {
      if (typeof item[key] !== 'string' || !HEX_COLOR_PATTERN.test(item[key])) {
        errors.push(`${label}: ${key}는 #RRGGBB 형식이어야 해요(받은 값: ${JSON.stringify(item[key])}).`)
      }
    }
    if (!Number.isInteger(item.expectCount) || item.expectCount < 1) {
      errors.push(`${label}: expectCount는 1 이상의 정수여야 해요(받은 값: ${JSON.stringify(item.expectCount)}).`)
    }
  })

  if (errors.length > 0) return { errors, plan: null }
  return {
    errors,
    plan: {
      preset: raw.preset,
      items: raw.items.map((item) => ({
        title: item.title,
        condition: item.condition,
        bg: item.bg,
        end: item.end,
        expectCount: item.expectCount,
      })),
    },
  }
}

/**
 * 프리셋 텍스트 레이어 색과 배경색·끝색의 대비가 4.5:1 이상인지 본다. 반환: 오류 문자열 배열.
 * 텍스트 레이어가 2개 미만이면 조건 문구·미션 이름을 넣을 곳이 없어 오류다.
 */
export function checkPlanContrast(presetLayers, items) {
  const errors = []
  const textLayers = presetLayers.filter((layer) => layer.type === 'text')
  if (textLayers.length < 2) {
    return [`프리셋의 텍스트 레이어가 ${textLayers.length}개예요. 조건 문구·미션 이름을 넣으려면 2개 이상이어야 해요.`]
  }
  const textColors = [...new Set(textLayers.map((layer) => layer.color))]
  for (const color of textColors) {
    try {
      parseHexColor(color)
    } catch (e) {
      errors.push(`프리셋 텍스트 색을 읽지 못했어요: ${errorMessage(e)}`)
    }
  }
  if (errors.length > 0) return errors

  for (const item of items) {
    for (const [name, background] of [['bg', item.bg], ['end', item.end]]) {
      for (const color of textColors) {
        const ratio = contrastRatio(color, background)
        if (ratio < NORMAL_TEXT_MIN_RATIO) {
          errors.push(`${item.title}: ${name} ${background}와 프리셋 텍스트 색 ${color}의 대비가 ${ratio.toFixed(2)}:1이라 ${NORMAL_TEXT_MIN_RATIO}:1 미만이에요.`)
        }
      }
    }
  }
  return errors
}

/** 등록된 미션을 전부 읽는다(읽기 전용). 순서는 제목·id 순으로 고정한다. */
async function fetchAllMissions(supabase) {
  const { data, error } = await supabase.from('missions').select('id, title, image_url, image_source')
  if (error) throw new Error(`미션 목록을 읽지 못했어요: ${error.message}`)
  return [...(data ?? [])].sort((a, b) => (a.title === b.title ? String(a.id).localeCompare(String(b.id)) : String(a.title).localeCompare(String(b.title), 'ko')))
}

/**
 * 계획 항목과 DB 미션을 제목으로 맞춘다. 제목별 미션 수가 `expectCount`와 다르면 오류(전체 중단 사유).
 * 계획에 없는 제목의 미션은 warnings로만 알린다. 반환: `{ errors, warnings, targets: [{ mission, item }] }` — 계획 순서대로.
 */
export function matchMissionsToPlan(items, missions) {
  const errors = []
  const warnings = []
  const targets = []
  const planned = new Set(items.map((item) => item.title))

  for (const item of items) {
    const found = missions.filter((mission) => mission.title === item.title)
    if (found.length !== item.expectCount) {
      errors.push(`${item.title}: DB의 미션이 ${found.length}건이에요(계획의 expectCount: ${item.expectCount}).`)
    }
    for (const mission of found) targets.push({ mission, item })
  }
  for (const mission of missions) {
    if (!planned.has(mission.title)) warnings.push(`계획에 없는 미션이에요(적용하지 않아요): ${mission.title} (${mission.id})`)
  }
  return { errors, warnings, targets }
}

function readJsonFile(filePath, label) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${label} 파일을 찾을 수 없어요: ${filePath}`)
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (e) {
    throw new Error(`${label} 파일을 JSON으로 읽지 못했어요: ${errorMessage(e)}`)
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * 미리보기. 종료 코드를 돌려준다(0 성공, 1 실패). DB·저장소에는 쓰지 않는다.
 *
 * 인자: `args`(`parseApplyMissionImagesArgs` 결과), `supabase`(읽기만 함), `out`(`{ log, error }`), `deps`:
 * - `loadPreset(presetId)`: `{ layers }`를 돌려주는 프리셋 조회(텍스트 색 대비 검사용)
 * - `renderPng({ preset, bg, end, text, subtext, seed })`: `renderCardPng`과 같은 계약(`{ buffer, seed, stage }`)
 * - `randomSeed()`: 미션마다 시드를 뽑는다(`generateRandomSeed`)
 * - `detectTextOverflow({ presetId, text, subtext })`(선택): 텍스트가 오른쪽 여백을 넘으면 true
 * - `makeContactSheet(images: [{ index, buffer }])`(선택): 모아보기 PNG 버퍼
 * - `now()`: 밀리초 시각
 */
export async function runPreview({ args, supabase, out, deps }) {
  const { outDir } = args
  try {
    if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없어서 미션 목록을 읽을 수 없어요.')
    if (fs.existsSync(path.join(outDir, APPLIED_FILE_NAME))) {
      throw new Error(`이미 적용한 폴더예요(${APPLIED_FILE_NAME}이 있어요): ${outDir}. 새 폴더를 지정해 주세요.`)
    }

    const { errors, plan } = validatePlan(readJsonFile(args.plan, '계획'))
    if (!plan) return reportPlanErrors(out, errors)

    const preset = await deps.loadPreset(plan.preset)
    const contrastErrors = checkPlanContrast(preset.layers, plan.items)

    const missions = await fetchAllMissions(supabase)
    const matched = matchMissionsToPlan(plan.items, missions)

    const allErrors = [...contrastErrors, ...matched.errors]
    if (allErrors.length > 0) return reportPlanErrors(out, allErrors)

    out.log(`검증 통과: 제목 ${plan.items.length}종, 미션 ${matched.targets.length}건. 이미지를 만들어요.`)

    fs.mkdirSync(outDir, { recursive: true })
    const items = []
    const images = []
    const overflowWarnings = []
    for (const [position, { mission, item }] of matched.targets.entries()) {
      const seed = deps.randomSeed()
      const rendered = await deps.renderPng({ preset: plan.preset, bg: item.bg, end: item.end, text: item.condition, subtext: item.title, seed })
      const file = `${mission.id}.png`
      fs.writeFileSync(path.join(outDir, file), rendered.buffer)

      const textOverflow = deps.detectTextOverflow
        ? await deps.detectTextOverflow({ presetId: plan.preset, text: item.condition, subtext: item.title })
        : false
      if (textOverflow) overflowWarnings.push(`문구가 오른쪽 여백(가로 3%)을 넘어요: ${item.title} / ${item.condition} (${mission.id})`)

      items.push({
        index: position + 1,
        id: mission.id,
        title: item.title,
        condition: item.condition,
        bg: item.bg,
        end: item.end,
        seed: rendered.seed,
        file,
        bytes: rendered.buffer.length,
        stage: rendered.stage,
        textOverflow,
      })
      images.push({ index: position + 1, buffer: rendered.buffer })
    }

    if (deps.makeContactSheet) {
      fs.writeFileSync(path.join(outDir, CONTACT_SHEET_FILE_NAME), await deps.makeContactSheet(images))
    }
    writeJsonFile(path.join(outDir, RESOLVED_FILE_NAME), {
      version: 1,
      createdAt: toKstIsoString(deps.now()),
      plan: args.plan,
      preset: plan.preset,
      items,
    })

    const lines = [
      `미리보기를 만들었어요: 이미지 ${items.length}장`,
      `- 폴더: ${outDir}`,
      `- 모아보기: ${path.join(outDir, CONTACT_SHEET_FILE_NAME)}`,
      `- 미션별 값: ${path.join(outDir, RESOLVED_FILE_NAME)}`,
      'DB·저장소에는 아무것도 쓰지 않았어요.',
    ]
    for (const warning of [...matched.warnings, ...overflowWarnings]) lines.push(`- 알아둘 점: ${warning}`)
    out.log(lines.join('\n'))
    return 0
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }
}

function reportPlanErrors(out, errors) {
  out.error(['이미지를 만들지 않았어요. 고쳐야 할 점:', ...errors.map((reason) => `- ${reason}`)].join('\n'))
  return 1
}

/** `resolved.json`이 적용해도 되는 형태인지 본다. 문제가 있으면 사유 배열, 없으면 빈 배열. */
function findResolvedErrors(resolved) {
  if (!isPlainObject(resolved) || !Array.isArray(resolved.items) || resolved.items.length === 0) {
    return [`${RESOLVED_FILE_NAME}의 items가 비어 있거나 형식이 달라요.`]
  }
  const errors = []
  const seen = new Set()
  for (const item of resolved.items) {
    if (!isPlainObject(item) || typeof item.id !== 'string' || !UUID_PATTERN.test(item.id)) {
      errors.push(`${RESOLVED_FILE_NAME}에 미션 id(UUID)가 없는 항목이 있어요.`)
      continue
    }
    // 폴더 밖 파일을 읽지 않도록 파일 이름을 규칙 그대로만 허용한다.
    if (item.file !== `${item.id}.png`) errors.push(`${item.id}: 이미지 파일 이름이 규칙(${item.id}.png)과 달라요(받은 값: ${JSON.stringify(item.file)}).`)
    if (seen.has(item.id)) errors.push(`${item.id}: 같은 미션이 두 번 있어요.`)
    seen.add(item.id)
  }
  return errors
}

async function downloadIfExists(storage, filePath, label) {
  let result
  try {
    result = await storage.download(filePath)
  } catch (e) {
    throw new Error(`${label} 백업을 내려받지 못했어요(${filePath}): ${errorMessage(e)}`)
  }
  if (result?.error) {
    // 파일이 없는 것은 정상이다(그 경로에는 지울·되돌릴 내용이 없다). 그 밖의 오류는 백업 없이 덮어쓰지 않도록 멈춘다.
    if (/not\s*found|404/i.test(String(result.error.message ?? ''))) return null
    throw new Error(`${label} 백업을 내려받지 못했어요(${filePath}): ${result.error.message}`)
  }
  if (!result?.data) return null
  return Buffer.from(await result.data.arrayBuffer())
}

async function uploadFile(storage, filePath, buffer, contentType, label) {
  let result
  try {
    result = await storage.upload(filePath, buffer, { contentType, upsert: true })
  } catch (e) {
    throw new Error(`${label} 업로드에 실패했어요: ${errorMessage(e)}`)
  }
  if (result?.error) throw new Error(`${label} 업로드에 실패했어요: ${result.error.message}`)
}

/**
 * 적용. 종료 코드를 돌려준다(0 성공, 1 실패). 인자: `args`, `supabase`(서비스 키 클라이언트), `out`, `deps`:
 * `convertToWebp`(`convertBadgeImageToWebp`)·`now()`.
 * 쓰기 전에 PNG 존재·5MB 이하·미션 존재·WebP 변환을 전부 확인한다. 한 건이라도 실패하면 그 자리에서 멈춘다.
 */
export async function runApply({ args, supabase, out, deps }) {
  const { outDir } = args
  const appliedFile = path.join(outDir, APPLIED_FILE_NAME)
  let entries = []

  try {
    if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없어서 적용할 수 없어요.')
    if (fs.existsSync(appliedFile)) {
      throw new Error(`이미 적용 기록이 있어요(${APPLIED_FILE_NAME}). 되돌리려면 --rollback ${appliedFile}, 다시 적용하려면 새 폴더에서 미리보기부터 해 주세요.`)
    }
    const resolved = readJsonFile(path.join(outDir, RESOLVED_FILE_NAME), '미리보기 결과')
    const resolvedErrors = findResolvedErrors(resolved)
    if (resolvedErrors.length > 0) return reportApplyErrors(out, resolvedErrors)

    // 쓰기 전 확인: PNG 존재·크기, 미션 존재, WebP 변환.
    const errors = []
    const prepared = []
    for (const item of resolved.items) {
      const pngFile = path.join(outDir, item.file)
      if (!fs.existsSync(pngFile) || !fs.statSync(pngFile).isFile()) {
        errors.push(`${item.id}: 이미지 파일이 없어요(${pngFile}). 미리보기를 다시 만들어 주세요.`)
        continue
      }
      const png = fs.readFileSync(pngFile)
      if (png.length > MAX_APPLY_IMAGE_BYTES) {
        errors.push(`${item.id}: 이미지가 너무 커요(${(png.length / 1024 / 1024).toFixed(1)}MB). 5MB 이하만 적용할 수 있어요.`)
        continue
      }
      try {
        prepared.push({ item, png, webp: await deps.convertToWebp(png) })
      } catch (e) {
        errors.push(`${item.id}: 이미지를 WebP로 변환하지 못했어요: ${errorMessage(e)}`)
      }
    }

    const { data: rows, error: readError } = await supabase
      .from('missions')
      .select('id, title, image_url, image_source')
      .in('id', resolved.items.map((item) => item.id))
    if (readError) throw new Error(`미션을 읽지 못했어요: ${readError.message}`)
    const missionById = new Map((rows ?? []).map((row) => [row.id, row]))
    for (const item of resolved.items) {
      const mission = missionById.get(item.id)
      if (!mission) errors.push(`${item.id}: 미션이 DB에 없어요(${item.title}).`)
      else if (mission.title !== item.title) errors.push(`${item.id}: 미리보기 이후 미션 제목이 바뀌었어요(${item.title} → ${mission.title}). 미리보기를 다시 만들어 주세요.`)
    }
    if (errors.length > 0) return reportApplyErrors(out, errors)

    // 시작 전에 이전 값을 기록한다. 이 파일 하나로 롤백한다.
    entries = prepared.map(({ item }) => {
      const mission = missionById.get(item.id)
      return {
        id: item.id,
        title: item.title,
        previous: { image_url: mission.image_url ?? null, image_source: mission.image_source ?? null },
        backup: { png: null, webp: null },
        status: 'pending',
      }
    })
    const save = () => writeJsonFile(appliedFile, { version: 1, startedAt: toKstIsoString(deps.now()), outDir, entries })
    save()

    const storage = supabase.storage.from(STORAGE_BUCKET)
    let doneCount = 0
    for (const [position, { item, png, webp }] of prepared.entries()) {
      const entry = entries[position]
      const { pngPath, webpPath } = missionStoragePathsFor(item.id)
      try {
        // (1) 기존 이미지가 있으면 저장소의 기존 PNG·WebP를 백업 폴더로 내려받는다.
        if (entry.previous.image_url) {
          for (const [kind, storagePath] of [['png', pngPath], ['webp', webpPath]]) {
            const existing = await downloadIfExists(storage, storagePath, kind === 'png' ? '원본 이미지' : 'WebP 이미지')
            if (existing) {
              const relative = `${BACKUP_DIR_NAME}/${item.id}.${kind}`
              fs.mkdirSync(path.join(outDir, BACKUP_DIR_NAME), { recursive: true })
              fs.writeFileSync(path.join(outDir, relative), existing)
              entry.backup[kind] = relative
            }
          }
        }
        entry.status = 'backed-up'
        save()

        // (2)(3) 원본 PNG → WebP 업로드(적용 API와 같은 upsert).
        await uploadFile(storage, pngPath, png, 'image/png', '원본 이미지')
        await uploadFile(storage, webpPath, webp, 'image/webp', 'WebP 이미지')
        entry.status = 'uploaded'
        save()

        // (4) 미션 행 갱신. 적용 API와 같은 캐시 무효화 쿼리를 붙인다.
        const imageUrl = `${storage.getPublicUrl(webpPath).data.publicUrl}?v=${deps.now()}`
        const { error: updateError } = await supabase.from('missions').update({ image_url: imageUrl, image_source: AGENT_IMAGE_SOURCE }).eq('id', item.id)
        if (updateError) throw new Error(`이미지는 올라갔지만 미션 갱신에 실패했어요: ${updateError.message}`)
        entry.status = 'applied'
        save()
        doneCount++
      } catch (e) {
        try {
          save()
        } catch {
          // 기록 파일을 못 써도 원래 오류 보고를 우선한다.
        }
        out.error(
          [
            `적용을 멈췄어요(${doneCount}/${prepared.length}건 완료): ${item.title} (${item.id})`,
            `- 사유: ${errorMessage(e)}`,
            `- 진행 기록: ${appliedFile}`,
            `- 되돌리기: --rollback ${appliedFile}`,
          ].join('\n')
        )
        return 1
      }
    }

    out.log([`적용했어요: 미션 ${doneCount}건`, `- 적용 기록: ${appliedFile}`, `- 되돌리기: --rollback ${appliedFile}`].join('\n'))
    return 0
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }
}

function reportApplyErrors(out, errors) {
  out.error(['적용하지 않았어요(아무것도 쓰지 않았어요). 고쳐야 할 점:', ...errors.map((reason) => `- ${reason}`)].join('\n'))
  return 1
}

/**
 * 롤백. 종료 코드를 돌려준다(0 성공, 1 하나라도 실패). 인자: `args`(`rollbackFile`), `supabase`, `out`.
 * 적용을 시작하지 않은 미션(status `pending`)은 건드리지 않는다. 미션 하나가 실패해도 나머지는 계속 되돌리고 마지막에 실패 목록을 낸다.
 */
export async function runRollback({ args, supabase, out }) {
  const appliedFile = args.rollbackFile
  try {
    if (!supabase) throw new Error('NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY가 .env.local에 없어서 되돌릴 수 없어요.')
    const record = readJsonFile(appliedFile, '적용 기록')
    if (!isPlainObject(record) || !Array.isArray(record.entries)) throw new Error('적용 기록의 entries 형식이 달라요.')
    const baseDir = path.dirname(appliedFile)
    const storage = supabase.storage.from(STORAGE_BUCKET)

    const failures = []
    let restored = 0
    for (const entry of record.entries) {
      if (!isPlainObject(entry) || typeof entry.id !== 'string' || !UUID_PATTERN.test(entry.id)) {
        failures.push('미션 id가 없는 기록 항목이 있어요.')
        continue
      }
      if (entry.status === 'pending') continue
      try {
        const { pngPath, webpPath } = missionStoragePathsFor(entry.id)
        for (const [kind, storagePath, contentType] of [['png', pngPath, 'image/png'], ['webp', webpPath, 'image/webp']]) {
          const relative = entry.backup?.[kind]
          if (!relative) continue
          // 기록이 바뀌었어도 백업 폴더 밖 파일을 읽지 않도록 이름을 규칙 그대로만 허용한다.
          if (relative !== `${BACKUP_DIR_NAME}/${entry.id}.${kind}`) throw new Error(`백업 경로가 규칙과 달라요: ${relative}`)
          await uploadFile(storage, storagePath, fs.readFileSync(path.join(baseDir, relative)), contentType, kind === 'png' ? '원본 이미지 복구' : 'WebP 이미지 복구')
        }
        const previous = entry.previous ?? {}
        const { error } = await supabase
          .from('missions')
          .update({ image_url: previous.image_url ?? null, image_source: previous.image_source ?? null })
          .eq('id', entry.id)
        if (error) throw new Error(`미션 갱신에 실패했어요: ${error.message}`)
        restored++
      } catch (e) {
        failures.push(`${entry.title ?? ''} (${entry.id}): ${errorMessage(e)}`)
      }
    }

    if (failures.length > 0) {
      out.error([`되돌리지 못한 미션이 있어요(되돌림 ${restored}건):`, ...failures.map((reason) => `- ${reason}`)].join('\n'))
      return 1
    }
    out.log(
      [
        `되돌렸어요: 미션 ${restored}건`,
        '- image_url·image_source를 적용 전 값으로 되돌렸고, 백업해 둔 기존 저장소 파일은 다시 올렸어요.',
        '- 백업이 없던 경로에 새로 올린 파일은 지우지 않고 그대로 뒀어요(미션에서 더 이상 가리키지 않아요).',
      ].join('\n')
    )
    return 0
  } catch (e) {
    out.error(errorMessage(e))
    return 1
  }
}
