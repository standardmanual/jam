#!/usr/bin/env node
/**
 * 배지 이미지 하단 세이프존에 브랜드 로고 합성 (후처리 단계)
 *
 * 스타일그룹_정의서.md의 "브랜드 로고 세이프존" 규칙 적용:
 * 로고는 AI가 그리지 않고 고정 이미지를 하단 중앙에 합성한다 — 동일 배치를 보장하기 위함.
 *
 * 실행: node scripts/recraft/compose-logo.js <배지 이미지 경로> <로고 경로> <출력 경로> [로고폭비율=0.224] [하단여백비율=0.05]
 *
 * 기본값 0.224 / 0.05는 2026-08-21 1차 검증 배치(01-01) 육안 확인 후 확정한 값
 * (최초 시안 0.32/0.15 대비 크기 70%). 하단여백비율은 "로고를 담는 띠의 높이"가 아니라
 * "캔버스 맨 아래 가장자리부터 로고 밑변까지의 여백"이다 — 로고 높이가 이 값보다 커도
 * 캔버스 밖으로 잘리지 않는다.
 */
const sharp = require('sharp')

async function main() {
  const [badgePath, logoPath, outPath, logoWidthRatioArg, bottomMarginRatioArg] = process.argv.slice(2)
  if (!badgePath || !logoPath || !outPath) {
    console.error('사용법: node compose-logo.js <배지 이미지> <로고> <출력경로> [로고폭비율] [하단여백비율]')
    process.exit(1)
  }
  const logoWidthRatio = Number(logoWidthRatioArg) || 0.224
  const bottomMarginRatio = Number(bottomMarginRatioArg) || 0.05

  const badge = sharp(badgePath)
  const { width, height } = await badge.metadata()

  const logoWidth = Math.round(width * logoWidthRatio)
  const logoBuf = await sharp(logoPath).resize({ width: logoWidth }).toBuffer()
  const logoMeta = await sharp(logoBuf).metadata()

  const bottomMargin = Math.round(height * bottomMarginRatio)
  const left = Math.round((width - logoMeta.width) / 2)
  const top = height - bottomMargin - logoMeta.height

  await badge.composite([{ input: logoBuf, left, top }]).png().toFile(outPath)
  console.log(`합성 완료: ${outPath} (로고 ${logoMeta.width}x${logoMeta.height} @ ${left},${top})`)
}

main()
