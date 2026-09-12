/**
 * 쉐이더 랩 — 텍스트 레이어 폰트 옵션 (티켓 20260912_2157)
 *
 * ## 왜 이렇게 우회하는가 (중요한 발견, 완료 기록의 "주요 의사결정" 참고)
 *
 * `@basementstudio/shader-lab`의 텍스트 패스(`renderer/text-pass.js`)는 `fontFamily` 파라미터
 * 값을 그대로 CSS 폰트 이름으로 쓰지 않는다. 내부적으로 `renderer/text-fonts.js`의
 * `resolveTextFontFamily(value)` → `getTextFontDefinition(value)`가 값을 **패키지에 미리
 * 박혀 있는 고정 목록**(`display-serif`/`sans`/`mono`/`bsmnt-grotesque`/`adhesion`/`blob`/
 * `bunker`/`caniche`/`carpenter`/`curia`/`ffflauta`/`numero`/`xer0`/`trovador`/`b-mecha`/
 * `impact`)에서만 찾는다 — 목록에 없는 임의의 문자열을 넣으면 조용히 `display-serif`(고정
 * Georgia 폴백)로 대체돼 우리가 원하는 폰트가 전혀 반영되지 않는다.
 *
 * 이 고정 목록 중 `cssVariable`이 지정된 항목(`sans`→`--geist-sans`, `mono`→`--geist-mono`,
 * `bsmnt-grotesque`→`--bsmnt-grotesque` 등)은 `getComputedStyle(document.documentElement)`로
 * 그 CSS 커스텀 프로퍼티 값을 읽어 실제 font-family로 쓴다. 즉 **패키지가 이미 로드하는
 * `@basementstudio/shader-lab/fonts.css`(`:root { --geist-sans: "Geist Sans"; ... }`)가
 * 정의한 변수를 우리가 이 라우트 안에서만 다른 값으로 덮어쓰면, 그 슬롯에 원하는 웹폰트를
 * 끼워 넣을 수 있다.**
 *
 * `sans`(`--geist-sans`)·`mono`(`--geist-mono`)는 이미 1차에서 ASCII 레이어의 "고딕"·
 * "고정폭" 옵션으로 노출 중이라 덮어쓰면 그 기존 기능(Geist Sans/Mono 렌더링)이 깨진다.
 * `display-serif`는 `cssVariable`이 아예 없어(하드코딩된 Georgia 폴백) 덮어쓸 방법이 없다.
 * 남은 슬롯 중 **`bsmnt-grotesque`**를 골랐다 — 1차 ASCII 옵션에서 쓰지 않는 슬롯이면서,
 * 유일하게 `sans`처럼 "range"(연속 굵기 축)를 지원해 Pretendard Variable 같은 가변 폰트와
 * 궁합이 맞는다(나머지 미사용 슬롯은 전부 고정 굵기 1개뿐이라 가변 폰트를 얹어도 굵기 조절이
 * 불가능하다).
 *
 * ## fontWeight 범위가 400~900인 이유 (원본 100~900, Pretendard 실제 축 45~920과 다름)
 *
 * `normalizeTextFontWeight(fontValue, value)`는 우리 쪽 UI 슬라이더 범위와 무관하게, 선택된
 * `fontFamily` 값이 가리키는 **패키지 내부의 고정된 굵기 범위**로 최종 값을 clamp한다.
 * `bsmnt-grotesque` 슬롯의 내부 정의는 `{ kind: "range", min: 400, max: 900, step: 1 }`로
 * 하드코딩돼 있어(패키지 비공개 모듈, `layer-registry.ts`의 `textParams.fontWeight`가 보여주는
 * 100~900은 원본이 기본으로 노출하는 `sans` 슬롯 기준값일 뿐이다), 우리가 이 필드의 UI
 * min/max를 얼마로 두든 실제로 반영되는 값은 400~900을 벗어날 수 없다. Pretendard Variable의
 * 실제 `wght` 축(45~920)보다도 좁다 —
 * 즉 이 폰트가 지원하는 가장 얇은 획(Thin~Light, 45~390)은 이 슬롯을 통해서는 애초에 표현할
 * 수 없다. UI가 실제로 반영되지 않는 값까지 슬라이더로 보여주면 사용자에게 거짓 정보를 주는
 * 셈이라, **UI 범위 자체를 400~900으로 맞췄다**(원본이나 Pretendard 실제 축을 그대로 노출하지
 * 않기로 한 판단, 완료 기록 참고).
 *
 * ## 추후 폰트 추가 시
 *
 * 위에서 아직 안 쓴 슬롯(`adhesion`/`blob`/`bunker`/`caniche`/`carpenter`/`curia`/`ffflauta`/
 * `numero`/`xer0`/`trovador`/`b-mecha`/`impact`)을 골라 그 `cssVariable`을 이 파일이 하는
 * 방식대로 덮어쓰면 된다 — 단, 전부 고정 굵기 1개짜리 슬롯이라 가변 폰트를 얹어도 굵기 슬라이더
 * 자체가 의미 없어진다(패키지가 웨이트를 무조건 그 고정값으로 스냅한다). 진짜 가변 폰트를
 * 추가하려면 `sans`/`mono`/`bsmnt-grotesque` 중 하나를 재활용해야 하는데, 이미 이 3개 슬롯이
 * 전부 쓰이고 나면(sans/mono=ASCII, bsmnt-grotesque=텍스트) 더 이상 남는 range 슬롯이 없다 —
 * 이 경우 패키지 자체의 한계이므로 별도 검토가 필요하다.
 */

/** 패키지가 하이재킹 대상으로 고른 슬롯의 CSS 커스텀 프로퍼티 이름. `layout.tsx`가 이 값을
 *  덮어쓴다. */
export const SHADER_LAB_TEXT_FONT_CSS_VARIABLE = '--bsmnt-grotesque' as const

/**
 * 텍스트 레이어가 쓰는 Pretendard **Variable** 웹폰트 CDN 스타일시트. `/admin/shader-lab`
 * 라우트에서만 `layout.tsx`가 `<link rel="stylesheet">`로 로드한다 — 사이트 전역
 * `globals.css`의 static 배포판 `@import`는 건드리지 않는다.
 *
 * 버전은 static 배포판과 같은 태그(`v1.3.9`)로 고정한다 — `@main` 등 추적 태그를 쓰면 검증
 * 시점 이후 릴리스가 슬쩍 바뀔 수 있어 금지(티켓 20260912_1532 명시, 티켓 20260913_0413에서
 * 이 파일로 이관).
 */
export const PRETENDARD_VARIABLE_CSS_URL =
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.css'

export interface ShaderLabTextFontOption {
  label: string
  /** `@basementstudio/shader-lab`의 `text-fonts.js`(비공개 모듈)가 인식하는 내부 식별자.
   *  임의 문자열이 아니라 그 모듈의 `TEXT_FONT_DEFINITIONS` 목록에 실제로 존재하는 값이어야
   *  한다 — 그래야 위 CSS 변수 하이재킹이 먹힌다. */
  value: string
  /** `value`가 가리키는 슬롯이 실제로 반영하는 굵기 범위(패키지 내부 하드코딩값, 우리 UI가
   *  이 범위를 벗어난 값을 보여주면 안 된다). */
  fontWeightRange: { min: number; max: number; default: number }
}

/** JAM! 텍스트 레이어의 폰트 선택지. 현재는 Pretendard Variable 단일 옵션(사용자 결정,
 *  구글 폰트 등 추가는 범위 밖) — 배열 구조라 항목만 추가하면 선택지가 늘어난다. */
export const SHADER_LAB_TEXT_FONT_OPTIONS: readonly ShaderLabTextFontOption[] = [
  {
    label: 'Pretendard Variable',
    value: 'bsmnt-grotesque',
    fontWeightRange: { min: 400, max: 900, default: 700 },
  },
]

export const SHADER_LAB_DEFAULT_TEXT_FONT = SHADER_LAB_TEXT_FONT_OPTIONS[0]
