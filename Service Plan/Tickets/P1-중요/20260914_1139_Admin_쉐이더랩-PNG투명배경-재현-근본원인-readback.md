---
id: 20260914_1139
category: Admin
priority: P1
status: OPEN
created: 2026-09-14
---

# [Admin] 쉐이더 랩 — PNG 투명배경 여전히 미반영 (티켓 20260914_1045 재발, 새 근본 원인 확인)

## 배경 / 문제 정의

티켓 [20260914_1045](../P1-중요/20260914_1045_Admin_쉐이더랩-PNG투명배경-미반영.md)(CLOSED,
staging 병합됨)가 `@basementstudio/shader-lab` 패키지 렌더러의 opaque 하드코딩 3곳(WebGPU
컨텍스트 `alpha:false`, `baseMesh` 알파 고정, `blend-modes.js`의 `filter` 알파 고정)을 고쳤지만,
게이트 리뷰가 WARN으로 남긴 대로 **실제 시각적 검증을 하지 못한 채 머지됐다.** 사용자가 실제로
배경 알파를 낮춰 PNG를 저장해보니 **여전히 투명하게 저장되지 않는다**고 재보고했다.

오케스트레이터가 로컬 실렌더(`DEV_PROCESS_GUARDRAILS.md` 패턴 13)로 직접 재현·조사한 결과,
20260914_1045가 고친 3곳과는 **별개의, 훨씬 근본적인 새 원인**을 찾았다. 이 원인은 patch로
쉽게 고칠 수 있는 수준이 아니라서 신중한 설계가 필요해 별도 티켓으로 분리한다.

## 사전 조사 결과 (오케스트레이터, 로컬 실렌더 직접 검증)

### 1. 20260914_1045의 패치는 정상 반영돼 있다

`node_modules`에 patch-package로 재적용된 코드를 직접 grep해 3곳 모두 정확히 반영돼 있음을
확인했다(`alpha: true`, `setClearColor(..., 0)`, `blend-modes.js`의 소스-오버 알파 공식).
패치 자체는 문제가 아니다.

### 2. 셰이더 레이어 자신의 알파 계산은 정확하다

리퀴드 메탈의 숨겨진 소스 WebGL 캔버스(`liquid-metal-pass.js`의 `this.container` 안,
`document.body`에 `position:fixed`로 붙는 hidden div)를 브라우저에서 직접
`toDataURL()`로 읽어 픽셀을 확인했다: `colorBack` 알파를 0으로 낮추면 배경 영역은 정확히
`alpha=0`, 패턴이 있는 영역은 `alpha=255`로 나온다. **셰이더 자체와 개별 pass 텍스처 레벨의
알파 계산은 완전히 정상이다.**

### 3. 새로 발견한 진짜 근본 원인 — WebGPU 캔버스의 premultiplied 프레젠테이션과 readback 불일치

메인 컴포지트 캔버스(`ShaderLabViewport`의 실제 `<canvas>`, WebGPU 컨텍스트)에서 직접
`toDataURL()`/`canvas.toBlob()`/`drawImage(mainCanvas, ...)`로 픽셀을 읽으면, 배경 알파를
0으로 낮춰도 **항상 `alpha=255`(완전 불투명)로 고정**된다 — 20260914_1045가 고친 3곳이
모두 반영된 상태에서도 그렇다.

원인으로 추정되는 구조: three.js WebGPU 백엔드는 `alpha:true`로 렌더러를 만들면 캔버스
프레젠테이션 컨텍스트를 `alphaMode: 'premultiplied'`로 구성한다
(`node_modules/three/src/renderers/webgpu/WebGPUBackend.js:281`). 이 모드에서는 캔버스에
**미리 RGB에 alpha를 곱한(premultiplied) 값**이 저장되어 있어야 브라우저가 올바르게
un-premultiply해서 readback할 수 있다. 그런데 셰이더 파이프라인(baseMesh, blend-modes,
각 pass의 `composeColorNode`)은 **straight alpha**로 RGBA를 계산해 그대로 최종 blit
단계(`PipelineManager.blitMaterial`)까지 흘려보낸다 — RGB에 alpha를 곱하는 지점이 파이프라인
어디에도 없다. 그 결과 캔버스에는 "alpha=0인데 RGB는 원래 색 그대로"인, premultiplied 규칙
기준으로는 모순된 값이 저장되고, 브라우저가 이를 readback할 때 어떻게 처리하는지가 실측
결과(화면 표시는 정상, raw readback은 alpha=255 고정)의 원인으로 추정된다.

### 4. 실험 — blit 단계에서 직접 premultiply를 시도했으나 렌더링 자체가 깨짐

`PipelineManager`의 `blitMaterial.colorNode`를 `vec4(rgb.mul(a), a)`(RGB에 alpha를 곱해
premultiply)로 바꾸는 실험을 로컬에서 시도했다. `material.transparent = true` +
`blending = THREE.NoBlending` 조합도 함께 시도했지만, **오히려 캔버스 전체가 완전히
`(0,0,0,0)`(아무것도 안 보임, raw readback 기준)으로 나오는 다른 문제가 발생**했다(다만
화면에 표시되는 이미지 자체는 여전히 정상으로 보임 — 화면 표시와 raw readback의 불일치가
이번에도 반복됨). 정확한 원인은 규명하지 못했다 — TSL 노드 그래프에서 `vec3.mul(float)`
브로드캐스팅이 기대대로 동작하지 않거나, `HalfFloatType` 렌더타겟 값의 범위/정밀도 문제,
혹은 `MeshBasicNodeMaterial`이 `transparent:true`일 때 렌더 파이프라인을 다르게 컴파일하는
것 등이 후보다. 이 실험 코드는 모두 되돌렸다(node_modules를 patch-package로 재적용해 원복,
JAM! 쪽 실험 코드도 커밋하지 않고 삭제).

### 5. 유망해 보이는 해결 경로 — canvas presentation을 우회한 raw pixel readback

`Renderer.js`(three.js 공통 렌더러, WebGPURenderer가 상속)에
`readRenderTargetPixelsAsync(renderTarget, x, y, width, height)` API가 있다
(`node_modules/three/src/renderers/common/Renderer.js:2884`). 이는 캔버스 swap chain
(premultiplied 프레젠테이션)을 완전히 우회하고, **렌더타겟(`PipelineManager`의 `rtA`/`rtB`,
`RENDER_TARGET_OPTIONS.type = THREE.HalfFloatType`)의 raw RGBA 픽셀을 직접 읽는다.** 이
경로라면 premultiplied 캔버스 readback 문제 자체를 피해갈 수 있을 것으로 보인다. 다만
구현 범위가 크다:

1. `pipeline-manager.js`에 `render()` 직후의 최종 텍스처(`lastReadTarget` 또는 그 시점의
   `readTarget`)를 외부에 노출하는 getter/메서드 추가.
2. `create-webgpu-renderer.js`의 반환 객체에 이 렌더타겟에서 `readRenderTargetPixelsAsync`를
   호출해 raw 픽셀(half-float 인코딩)을 받아오는 캡처 메서드 추가.
3. 패키지의 public 훅(`useShaderLabCanvasSource`, `index.js` 등)에서 이 캡처 메서드를
   외부(JAM! 코드)에서 호출 가능하도록 노출.
4. half-float(`Uint16Array` 형태) → 8bit RGBA 변환 로직 작성(정밀도·범위 클램프 주의).
5. 변환된 RGBA를 `ImageData`로 만들어 2D 캔버스에 `putImageData()`한 뒤 그 캔버스에서
   `toBlob()`하도록 JAM! 코드(`useShaderLabPlayback.ts`, `ShaderLabExportPanel.tsx`,
   `ShaderLabApplyTab.tsx`)의 export/적용/미리보기 스냅샷 경로를 리팩토링.

### 6. 20260914_1045의 패치는 유지한다

이번 조사에서 20260914_1045가 고친 3곳(alpha:true, baseMesh 알파=0, blend-modes 알파 공식)이
직접적인 해결책은 아니었음이 드러났지만, **렌더 파이프라인 내부(렌더타겟) 텍스처 자체가
정확한 알파를 담고 있어야 한다**는 전제 조건으로서는 여전히 필요하다고 판단된다(정확히
검증하지는 못했으나, 되돌릴 근거도 없다). 이 패치들을 제거하는 방향으로 접근하지 않는다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 위 5번 절의 `readRenderTargetPixelsAsync` 기반 경로를 실측으로 먼저 검증한다(로컬
  실렌더로 half-float→8bit 변환 후 실제로 정확한 alpha가 나오는지 픽셀 단위 확인) — 방향
  자체가 틀렸을 가능성도 배제하지 않는다.
- 검증되면 `patches/@basementstudio+shader-lab+3.0.2.patch`에 필요한 파일들을 추가/수정하고,
  JAM! 쪽 export 경로 3곳(export PNG, apply 탭 적용, apply 탭 미리보기 스냅샷)을 새 캡처
  함수를 쓰도록 리팩토링한다.
- 대안이 이 경로로도 막히면, "WebGPU 캔버스 자체의 투명 export가 이 렌더러 아키텍처로는
  기술적으로 매우 어렵다"는 결론과 근거를 사용자에게 보고하고 범위를 재협의한다 — 무리하게
  또 다른 임시방편(예: 검정/흰 배경 합성 후 사용자가 수동으로 배경 제거)으로 덮지 않는다.

## 구현 계획

1. 로컬 실렌더로 `readRenderTargetPixelsAsync` 접근을 최소 스파이크(간단한 콘솔 스크립트나
   임시 코드)로 먼저 검증 — half-float 배열을 읽어 8bit로 변환한 값이 실제 배경(alpha=0)/
   패턴(alpha=255) 영역에서 올바르게 나오는지 확인.
2. 검증되면 패키지 patch 설계를 확정하고 3~5번 절 계획대로 구현.
3. 텍스트 레이어 `textColor` 알파, 리퀴드 메탈 `colorBack` 알파 각각 0/0.5/1 조합으로 export
   PNG의 alpha 채널이 정확히 비례하는지 재측정한다.
4. `ShaderLabApplyTab.tsx`(적용 결과물)·`ShaderLabExportPanel.tsx`(PNG export) 양쪽 모두
   동일하게 정상화됐는지 확인한다.
5. 회귀 확인: 알파를 안 쓰는 나머지 27종 레이어 타입(그라디언트·플루이드 등)의 기존 export
   결과가 이번 변경으로 달라지지 않는지 대표 몇 종을 픽셀 비교로 확인한다.
6. `npx tsc --noEmit`, `npm run lint`, `npx vitest run` 재확인, patch-package 재적용성
   (postinstall) 확인.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
**가이드:** `Service Plan/Specs/UX_WRITING_GUIDELINE.md` 참조

- [ ] 용어 일관성: 고정 용어만 사용 (획득·드랍·픽업·체크인·포인트 등)
- [ ] 톤앤매너: 상황에 맞는 톤 (배지=신남, 거래=단호, 오류=전문)
- [ ] 에러 메시지: [현상] → [원인] → [해결책] 3단계 구조
- [ ] 문장 규칙: 해요체, 간결함, 마침표 위치 정확
- [ ] 표기 규칙: 날짜/시간/금액/기간 직관적 형식

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모
> 개발 과정에서 검토·결정된 사항, 선택하지 않은 대안과 그 이유.

### 잔여 이슈
-
