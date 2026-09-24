/**
 * JAM! 에셋 제너레이터 — 브랜드 글자(J·A·M) SVG 원천 (티켓 20260924_2201)
 *
 * 원본: jam-web/src/app/admin/asset-generator/AssetGeneratorViewport.tsx의 BRAND_LETTERS·
 * brandLetterSvgMarkup(110~131줄). 그 파일은 리액트 컴포넌트·브라우저 전용 훅(useEffect 등)을
 * 함께 담고 있어 서버 CLI(render.mjs)가 통째로 import하기 부적절해 여기 따로 둔다(수정 금지
 * 대상 모방 아님, 중복 작성 —
 * `src/app/admin/asset-generator/assetGeneratorHelpers.ts`의 generateLayerId 주석과 같은 사유).
 * 값이 바뀌면 두 파일을 함께 고친다.
 *
 * CLI 원천 그래픽 기본값(PRD §8): 이 티켓의 CLI 인자에는 원천 그래픽 선택지가 없다 — 어드민
 * 화면 기본값(INITIAL_RIBBON_LAYER.source, assetGeneratorHelpers.ts)과 같은 letter 'J'를
 * 고정으로 쓴다(render.mjs). 실렌더 비교 시 어드민에서 원천 그래픽을 바꾸지 않은 기본 상태와
 * 비교해야 같은 결과가 나온다.
 */
const BRAND_LETTERS = {
  J: {
    w: 136,
    h: 205,
    d: 'M135.948 3.43323e-05L0 0V57.7583L59.9254 57.6304V97.4358C59.9254 107.218 51.9984 115.146 42.2176 115.146H0V204.628H59.9126C101.9 204.628 135.948 170.589 135.948 128.585V3.43323e-05Z',
  },
  A: {
    w: 177,
    h: 205,
    d: 'M94.6635 152.087L101.67 204.628H176.311L143.504 0H32.8075L0 204.628H74.6415L81.6479 152.087H94.6763H94.6635ZM88.1557 98.9574C68.7602 98.9574 53.0468 89.7381 53.0468 78.3578C53.0468 66.9775 68.773 57.7582 88.1557 57.7582C107.551 57.7582 123.265 66.9775 123.265 78.3578C123.265 89.7381 107.538 98.9574 88.1557 98.9574Z',
  },
  M: {
    w: 256,
    h: 205,
    d: 'M191.552 0C156.289 0 127.701 17.4924 127.701 52.7713C127.701 17.5052 99.1129 0 63.8506 0C28.5883 0 0 28.5914 0 63.8575V204.628H76.4826V99.2899H89.4726V204.628H165.955V99.2899H178.945V204.628H255.428V63.8575C255.428 28.5914 226.839 0 191.577 0H191.552Z',
  },
}

/** letter('J'|'A'|'M')의 SVG 마크업을 만든다. */
export function brandLetterSvgMarkup(key) {
  const letter = BRAND_LETTERS[key]
  if (!letter) throw new Error(`알 수 없는 브랜드 글자입니다: ${key}`)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${letter.w}" height="${letter.h}" viewBox="0 0 ${letter.w} ${letter.h}"><path d="${letter.d}" fill="#000"/></svg>`
}
