#!/usr/bin/env node
/**
 * 홈피드 카드 색 대비 계산 CLI (티켓 20260926_1544)
 *
 * 배경색·끝색 위의 흰 글자 대비 비율과 큰 글자(3:1)·일반 글자(4.5:1) 통과 여부를 한 줄 JSON으로 찍는다.
 * 계산은 `contrastMath.mjs`에 있다. 이 스크립트는 의존성이 없어 `node`로 바로 실행한다(tsx·환경변수·DB 불필요).
 *
 * ```
 * cd jam-web
 * node scripts/asset-generator/contrast.mjs --bg "#8a5a2e" --end "#3d2812"
 * → {"bg":{"color":"#8a5a2e","ratio":5.86,"large":true,"normal":true},"end":{"color":"#3d2812","ratio":13.9,"large":true,"normal":true},"pass":{"large":true,"normal":true}}
 * ```
 * `pass`는 두 색이 모두 통과해야 true다. 계산 결과가 기준 미달이어도 종료 코드는 0이다(판정은 출력을 읽는
 * 쪽이 한다). 인자 누락·색 형식 오류는 한국어 메시지를 stderr에 찍고 종료 코드 1로 끝난다.
 */
import { judgeWhiteText, parseContrastArgs } from './contrastMath.mjs'

try {
  const { bg, end } = parseContrastArgs(process.argv.slice(2))
  const bgResult = judgeWhiteText(bg)
  const endResult = judgeWhiteText(end)
  console.log(
    JSON.stringify({
      bg: bgResult,
      end: endResult,
      pass: { large: bgResult.large && endResult.large, normal: bgResult.normal && endResult.normal },
    })
  )
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e))
  process.exit(1)
}
