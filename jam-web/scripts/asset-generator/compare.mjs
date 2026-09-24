#!/usr/bin/env node
/**
 * JAM! 에셋 제너레이터 — PNG 비교 (티켓 20260924_2201)
 *
 * PNG 두 장을 받아 크기 일치·픽셀 차이 비율·차이 최댓값을 JSON으로 낸다. 카리나가 머지 뒤
 * 실렌더에서 어드민 PNG와 CLI PNG를 비교하는 데 쓴다(완료 조건: "곡선·스탬프 위치·텍스트
 * 위치가 같다, 블러·리샘플링 미세 차이만 허용").
 *
 * 실행: node jam-web/scripts/asset-generator/compare.mjs <PNG 1 절대경로> <PNG 2 절대경로>
 */
import sharp from 'sharp'

/**
 * 두 PNG를 비교한다. 크기가 다르면 픽셀 비교 없이 `sameSize: false`만 돌려준다.
 * `diffRatio`: 네 채널(R·G·B·A) 중 하나라도 다른 픽셀의 비율(0~1). `maxDiff`: 전체에서 가장 큰
 * 단일 채널 차이값(0~255).
 */
export async function comparePngs(pathA, pathB) {
  const [a, b] = await Promise.all([
    sharp(pathA).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(pathB).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ])

  const sameSize = a.info.width === b.info.width && a.info.height === b.info.height
  const result = {
    sameSize,
    width: { a: a.info.width, b: b.info.width },
    height: { a: a.info.height, b: b.info.height },
    diffRatio: null,
    maxDiff: null,
  }
  if (!sameSize) return result

  const dataA = a.data
  const dataB = b.data
  const pixelCount = dataA.length / 4
  let diffPixels = 0
  let maxDiff = 0
  for (let p = 0; p < pixelCount; p++) {
    const offset = p * 4
    let pixelMaxDiff = 0
    for (let c = 0; c < 4; c++) {
      const diff = Math.abs(dataA[offset + c] - dataB[offset + c])
      if (diff > pixelMaxDiff) pixelMaxDiff = diff
    }
    if (pixelMaxDiff > 0) diffPixels++
    if (pixelMaxDiff > maxDiff) maxDiff = pixelMaxDiff
  }

  result.diffRatio = diffPixels / pixelCount
  result.maxDiff = maxDiff
  return result
}

async function main() {
  const [pathA, pathB] = process.argv.slice(2)
  if (!pathA || !pathB) {
    console.error('사용법: node compare.mjs <PNG 1 절대경로> <PNG 2 절대경로>')
    process.exit(1)
  }
  const result = await comparePngs(pathA, pathB)
  console.log(JSON.stringify(result, null, 2))
}

// 직접 실행될 때만 main()을 돈다(테스트에서는 comparePngs만 가져다 쓴다).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : String(e))
    process.exit(1)
  })
}
