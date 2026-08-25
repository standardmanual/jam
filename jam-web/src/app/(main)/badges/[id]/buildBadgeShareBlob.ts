/**
 * 배지 공유용 1080×1920 투명 PNG Blob 생성 (20260821_004).
 *
 * 피그마 템플릿(활동/체크인 공용 노드 `1:55`, 아이템 전용 노드 `1:60`)을 Canvas 2D API로 직접
 * 합성한다. 이 프로젝트에는 DOM 래스터라이즈 라이브러리(html2canvas 등)가 없고, 어드민의
 * `bakePreviewToBlob.ts` 기존 패턴은 "이미 렌더링된 단일 canvas/img 노드를 그대로 캡처"하는
 * 방식이라 배지 이미지 + 텍스트 3세트 + 로고를 합성해야 하는 이 화면에는 맞지 않는다 — 대신
 * 오프스크린 `<canvas>` 하나에 drawImage/fillText로 직접 그린 뒤, 같은 `canvasToBlob()` 유틸로
 * PNG를 뽑는다(패턴 확장. 완료 기록의 "주요 의사결정" 참고).
 *
 * 좌표는 Figma MCP(`get_metadata`/`get_design_context`, 파일 `UXcBEgFagmO5ARwH5F0mMW`)로 노드
 * `1:55`(share01, 활동/체크인 공용)·`1:60`(share02, 아이템 전용)의 절대 좌표를 직접 조회해 그대로
 * 옮겼다(2026-08-21 재작업 — 이전 버전은 Figma MCP 접근 없이 재설계한 근사값이었음):
 *   - share01: 배지 483×483 @ y=477, 이후 63px 간격 flex-column으로 거리/페이스/시간
 *     텍스트 블록(각 높이 85.5636) + 로고. 각 블록 안에서 값(51px)이 위, 라벨(20px)이 값 시작
 *     지점에서 61.56px 아래.
 *   - share02: 배지 @ y=651, 63px 간격 뒤 로고(텍스트 없음).
 *   - 로고 174.2336×72, 가로 중앙 정렬(피그마 x=453.38 ≈ (1080-174.2336)/2).
 */
import { loadImageFromUrl } from '@/app/spike/background-generator/loadImage'
import { canvasToBlob } from '@/app/admin/badges/bakePreviewToBlob'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const BADGE_BOX = 483
/** Figma 노드 1:55(텍스트 있음)의 배지 y, 1:60(텍스트 없음)의 배지 y — 서로 다르다(피그마 그대로) */
const BADGE_Y_WITH_STATS = 477
const BADGE_Y_NO_STATS = 651
/** share 프레임의 flex-column gap (badge→distance→pace→time→logo 사이 전부 동일) */
const BLOCK_GAP = 63
/** distance/pace/time 각 프레임의 높이(Figma frame height) */
const ROW_BLOCK_HEIGHT = 85.5636
/** 라벨 텍스트 시작 y가 값 텍스트 시작 y보다 아래로 내려간 오프셋(Figma "mt-61.56") */
const LABEL_OFFSET_Y = 61.56
const LOGO_WIDTH = 174.2336
const LOGO_HEIGHT = 72
const VALUE_FONT_SIZE = 50.858
const LABEL_FONT_SIZE = 19.824
const FONT_FAMILY = "'Inter', 'Arial', sans-serif"

export interface BadgeShareStats {
  /** user_activity_badges/user_checkin_badge_earns의 triggered_by_distance_km — DB에 이미 저장돼 재조회 불필요 */
  distanceKm: number
  /** 스트라바 moving_time으로 계산. 트리거 활동을 특정할 수 없으면 null */
  paceSecPerKm: number | null
  /** 스트라바 elapsed_time. 트리거 활동을 특정할 수 없으면 null */
  elapsedTimeSec: number | null
}

export interface BadgeShareTemplateData {
  badgeImageUrl: string
  /** item 타입은 null — 텍스트 없이 배지 이미지 + 로고만 그린다 */
  stats: BadgeShareStats | null
}

function formatDistance(km: number): string {
  return `${km.toFixed(2)}km`
}

// PRD 예시 "12:00 /km" — /km 앞 공백 포함
function formatPace(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '-'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')} /km`
}

// PRD 예시 "12h 59m 59s" — 1시간 미만이면 h 단위는 생략(자연스러운 표기, UX Writing 가이드 3장
// "사용자가 바로 체감하는 단위로 표기" 원칙에 따름)
function formatElapsed(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return '-'
  const total = Math.floor(sec)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// canvas 렌더링 시점에 웹폰트가 아직 로드되지 않아 기본 폰트로 그려지는 문제 방지
async function waitForFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await Promise.all([
      document.fonts.load(`700 ${Math.ceil(VALUE_FONT_SIZE)}px ${FONT_FAMILY}`),
      document.fonts.load(`700 ${Math.ceil(LABEL_FONT_SIZE)}px ${FONT_FAMILY}`),
    ])
    await document.fonts.ready
  } catch {
    // 폰트 로딩에 실패해도 폴백 폰트(Arial Bold)로 계속 진행한다
  }
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  boxX: number,
  boxY: number,
  boxSize: number
): void {
  const ratio = Math.min(boxSize / img.naturalWidth, boxSize / img.naturalHeight)
  const w = img.naturalWidth * ratio
  const h = img.naturalHeight * ratio
  const x = boxX + (boxSize - w) / 2
  const y = boxY + (boxSize - h) / 2
  ctx.drawImage(img, x, y, w, h)
}

export async function buildBadgeShareBlob(data: BadgeShareTemplateData): Promise<Blob> {
  await waitForFonts()

  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_WIDTH
  canvas.height = CANVAS_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('공유 이미지를 그릴 캔버스를 만들지 못했어요.')

  const [badgeImg, logoImg] = await Promise.all([
    loadImageFromUrl(data.badgeImageUrl, { crossOrigin: 'anonymous' }),
    loadImageFromUrl('/jam-logo-white.png'),
  ])

  const badgeBoxX = (CANVAS_WIDTH - BADGE_BOX) / 2
  const badgeY = data.stats ? BADGE_Y_WITH_STATS : BADGE_Y_NO_STATS
  drawContain(ctx, badgeImg, badgeBoxX, badgeY, BADGE_BOX)

  let contentBottomY = badgeY + BADGE_BOX

  if (data.stats) {
    ctx.fillStyle = '#FFFFFF'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    const rows: [string, string][] = [
      ['DISTANCE', formatDistance(data.stats.distanceKm)],
      ['PACE', formatPace(data.stats.paceSecPerKm)],
      ['TIME', formatElapsed(data.stats.elapsedTimeSec)],
    ]

    // Figma: 값이 위, 라벨이 값 시작점에서 LABEL_OFFSET_Y만큼 아래 — 블록마다 BLOCK_GAP 간격
    let blockY = contentBottomY + BLOCK_GAP
    for (const [label, value] of rows) {
      ctx.font = `700 ${VALUE_FONT_SIZE}px ${FONT_FAMILY}`
      ctx.fillText(value, CANVAS_WIDTH / 2, blockY)
      ctx.font = `700 ${LABEL_FONT_SIZE}px ${FONT_FAMILY}`
      ctx.fillText(label, CANVAS_WIDTH / 2, blockY + LABEL_OFFSET_Y)
      blockY += ROW_BLOCK_HEIGHT + BLOCK_GAP
    }
    contentBottomY = blockY - BLOCK_GAP
  }

  const logoX = (CANVAS_WIDTH - LOGO_WIDTH) / 2
  const logoY = contentBottomY + BLOCK_GAP
  ctx.drawImage(logoImg, logoX, logoY, LOGO_WIDTH, LOGO_HEIGHT)

  return canvasToBlob(canvas)
}
