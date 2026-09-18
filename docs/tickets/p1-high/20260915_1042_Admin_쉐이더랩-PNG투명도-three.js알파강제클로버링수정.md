---
id: 20260915_1042
category: Admin
priority: P1
status: CLOSED
created: 2026-09-15
closed: 2026-09-15
---

# [Admin] 쉐이더 랩 — three.js 알파 강제 클로버링으로 PNG 투명도가 여전히 반영되지 않음

## 배경 / 문제 정의

티켓 [20260914_1045](20260914_1045_Admin_쉐이더랩-PNG투명배경-미반영.md)에서
`create-webgpu-renderer.js`·`pipeline-manager.js`(`baseMesh`)·`blend-modes.js`(`filter`
합성 알파식) 세 곳을 고쳐 CLOSED 처리했으나, 실제 사용자 테스트(스테이징, 이미지 레이어 1개
+ "비율 유지"/"캔버스 채우기" 양쪽 모두)에서 증상이 그대로 재현됐다. 투명해야 할 영역이
회색으로 보이고, PNG로 다운로드한 파일을 포토샵에서 열면 알파 채널 자체가 없다(완전
불투명으로 저장됨). 레이어 투명도 슬라이더를 조절하면 회색 영역을 포함한 이미지 전체가
균일하게 흐려져, 알파가 레이어 전체에서 위치와 무관하게 동일한 값(투명도 슬라이더값)으로만
결정되고 있음을 시사했다.

목표는 두 가지다.
1. PNG 저장(다운로드) 시 레이어·이미지의 실제 투명도 값이 그대로 반영된다.
2. 업로드한 PNG 원본의 알파(투명 영역)가 캔버스 미리보기에 그대로 반영된다.

## 사전 조사 결과 (오케스트레이터 직접 조사 + 로컬 실렌더 검증)

### 원인 — 20260914_1045가 놓친 네 번째 지점

20260914_1045의 세 수정은 모두 유효했지만, 그보다 한 단계 더 깊은 곳에 네 번째 하드코딩이
남아 있었다. **`three.js` 자체(`node_modules/three/src/materials/nodes/NodeMaterial.js:938`,
JAM! 코드도 `@basementstudio/shader-lab` 패치 대상도 아닌 순수 three.js 라이브러리 내부)**:

```js
// OPAQUE
if (builder.isOpaque()) {
    diffuseColor.a.assign(1.0);
}
```

`isOpaque()`는 `material.transparent === false && material.blending === NormalBlending &&
material.alphaToCoverage === false`일 때 참이다. `@basementstudio/shader-lab`이 쓰는 모든
`MeshBasicNodeMaterial`(레이어별 `PassNode.material`, `PipelineManager`의 `baseMaterial`·
`blitMaterial`, `swapEffectNodeAsync`의 `nextMaterial`)이 `transparent`를 명시적으로 설정하지
않아 기본값 `false`를 쓴다 — 즉 전부 `isOpaque()`가 참이 되어, **셰이더(`colorNode`)가 아무리
정확하게 알파를 계산해도 three.js가 픽셀 셰이더 마지막 단계에서 알파를 무조건 1.0으로
덮어쓴다.** 20260914_1045가 고친 세 지점은 "알파를 올바르게 계산하는" 단계였는데, 그 계산
결과가 GPU에 도달하기 직전 이 지점에서 매번 폐기되고 있었다.

이게 왜 "레이어 투명도 슬라이더가 전체에 균일하게 적용되는 것처럼 보이는가"도 설명한다 —
슬라이더(`opacity`)는 `buildBlendNode()`의 `blendFactor = opacity × blendAlpha` 계산에
들어가 RGB `mix()` 결과에 실제로 영향을 주지만(이건 정상 반영됨), 그렇게 계산된 진짜 알파값은
저 최종 지점에서 항상 1로 버려진다. 그래서 사용자 눈에는 "밝기(RGB)는 슬라이더에 반응하는데
투명도(알파)는 반응하지 않고 항상 불투명"으로 보인 것이다.

### 로컬 실렌더 검증 (esbuild + 실제 WebGPU 지원 브라우저)

`@basementstudio/shader-lab`의 `ShaderLabCanvasSource`를 직접 사용하는 최소 harness를
esbuild로 번들링해, 왼쪽 절반 불투명 빨강(255,0,0,255) · 오른쪽 절반 완전 투명 + 회색
매트컬러(RGB 128,128,128 / alpha 0)로 구성한 200×200 테스트 PNG를 이미지 레이어 1개로 올려
`canvas.toDataURL()` 결과를 픽셀 단위로 디코딩해 확인했다.

| | 수정 전 | 수정 후 |
|---|---|---|
| 왼쪽(불투명 빨강) | `[255,0,0,255]` | `[255,0,0,255]` (변화 없음, 정상) |
| 오른쪽(투명 영역) | `[50,50,50,255]` (완전 불투명, 회색) | `[0,0,0,0]` (완전 투명) |

스크린샷으로 페이지 배경색(진한 핑크)이 오른쪽 영역에 실제로 비쳐 보이는 것까지 화면
합성 레벨에서 확인했다(단순 픽셀 디코딩이 아니라 브라우저의 실제 캔버스 합성 결과).

## 상세 요구사항

### 서비스/코드베이스 관점

- `@basementstudio/shader-lab` 패키지가 쓰는 모든 `MeshBasicNodeMaterial` 인스턴스에서
  `isOpaque()` 조건을 깨서 three.js의 알파 강제 클로버링을 피한다.
- `material.transparent = true`로 바꾸는 방법은 **채택하지 않는다** — GPU 블렌드 모드가
  REPLACE(덮어쓰기)에서 OVER(블렌딩)로 바뀌어, 각 렌더 패스가 화면 전체를 매번 덮어쓰는
  방식에 의존하는 기존 RGB 합성(`buildBlendNode()`의 `mix()` 계산)이 이중으로 블렌딩되며
  깨질 위험이 있다.
- 대신 `material.alphaToCoverage = true`만 추가한다 — `isOpaque()` 판정 조건 중
  `alphaToCoverage === false`만 깨뜨려 클로버링을 피하면서, 블렌드 모드(REPLACE)는 그대로
  유지한다. 이 렌더러는 `antialias: false`로 생성되므로 `alphaToCoverage`가 원래 의도한
  MSAA 커버리지 마스크 기능 자체는 발동하지 않는다(부작용 없음, 로컬 검증으로 회귀 없음
  확인).

## 구현 계획

1. `jam-web/node_modules/@basementstudio/shader-lab/dist/src/renderer/pass-node.js` —
   생성자의 `this.material = new THREE.MeshBasicNodeMaterial()` 직후, 그리고
   `swapEffectNodeAsync()`의 `const nextMaterial = new THREE.MeshBasicNodeMaterial()` 직후에
   각각 `.alphaToCoverage = true` 추가.
2. `jam-web/node_modules/@basementstudio/shader-lab/dist/src/renderer/pipeline-manager.js` —
   생성자의 `const baseMaterial = new THREE.MeshBasicNodeMaterial()` 직후, 그리고
   `this.blitMaterial = new THREE.MeshBasicNodeMaterial()` 직후에 각각
   `.alphaToCoverage = true` 추가.
3. `npx patch-package @basementstudio/shader-lab`으로
   `jam-web/patches/@basementstudio+shader-lab+3.0.2.patch` 재생성(기존 세 파일 patch에
   위 변경분 병합).
4. `npm install` 재실행으로 patch 재적용성 확인.
5. `npx tsc --noEmit`, `npm run lint` 확인 (JAM! 자체 소스는 변경하지 않으므로 회귀 위험은
   patch 재적용 성공 여부가 핵심).

---
## 완료 기록

### 구현 내용 요약

구현 계획대로 `pass-node.js`(`PassNode` 생성자·`swapEffectNodeAsync`) 2곳, `pipeline-manager.js`
(`baseMaterial`·`blitMaterial`) 2곳, 총 4개 `MeshBasicNodeMaterial` 인스턴스에
`alphaToCoverage = true`를 추가했다. `node_modules`에 먼저 적용해 esbuild+실제 WebGPU
브라우저 렌더로 알파 채널이 정확히 전파됨을 확인한 뒤, `npx patch-package
@basementstudio/shader-lab`로 patch 파일에 반영했다.

`compositeMode === "mask"` 분기(20260914_1045가 의도적으로 남겨둔 `float(1)` 하드코딩)는
이번 수정과 무관하게 그대로 뒀다 — `isOpaque()` 클로버링은 그 분기가 `float(1)`을 반환하든
실제 알파를 반환하든 어차피 최종 단계에서 1로 덮어쓰던 문제였으므로, 이번 수정으로 마스크
분기의 알파도 이제 (그 분기가 반환하는 값 그대로) 최종 캔버스까지 전파된다 — 다만 그 분기가
여전히 `float(1)`을 반환하므로 마스크 레이어 자체의 동작은 이번 티켓 범위에서 달라지지 않는다.

### 변경된 파일
```
jam-web/patches/@basementstudio+shader-lab+3.0.2.patch
  (pass-node.js·pipeline-manager.js에 alphaToCoverage=true 4곳 추가,
   기존 create-webgpu-renderer.js·pipeline-manager.js(baseMesh)·blend-modes.js·
   liquid-metal-pass.js·text-pass.js·types.d.ts patch는 그대로 유지)
```

### 테스트 결과
- [x] 로컬 esbuild+실제 WebGPU 브라우저 실렌더 — 왼쪽(불투명) `[255,0,0,255]` 유지,
      오른쪽(투명) `[50,50,50,255]` → `[0,0,0,0]`로 정상화, 화면 합성(페이지 배경 비침)까지
      확인
- [x] `npx tsc --noEmit` — 오류 없음(`.next/dev/types` 캐시 삭제 후 재확인, 삭제 전 나온
      `deactivation-impact/route.ts` 오류는 실존하지 않는 파일을 가리키는 캐시 잔재로
      이번 변경과 무관)
- [x] `npm run lint`(전체) — 0 errors / 14 warnings(전부 이번 변경과 무관한 기존
      design-system·scripts 경고, 20260914_1045 완료 기록과 동일한 목록)
- [x] patch-package 재적용성 — `node_modules/@basementstudio/shader-lab` 삭제 후
      `npm install` 재실행, patch 오류 없이 재적용되고 4곳 수정 모두 유지됨을 확인
- [ ] 스테이징 실제 어드민 화면(로그인 필요, 스테이징 자체 검증 불가 — 배포 후 프로덕션에서
      최종 확인 필요) 이미지 레이어 업로드 → 미리보기 투명도 확인 → PNG 다운로드 → 알파
      채널 확인

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 변경 없음(내부 렌더링 파이프라인 수정만) — 해당 없음

### 배포 정보
- 배포일: 2026-09-15 (staging 직접 commit·push, 오케스트레이터 — 경미 수정 절차)
- 환경: staging (`stage.j-a-m.app`) — 프로덕션(main) 승격은 이 티켓 범위 밖, `/jam-ship`
  진행 시 사용자 승인 필요. 어드민 화면은 스테이징 자체 검증이 불가하므로, 실제 시각적
  확인(이미지 레이어 업로드 → 미리보기·PNG 다운로드 투명도)은 배포 후 프로덕션에서 진행
  권장
- 커밋: `e437a565` (staging 직접 commit)

### 주요 의사결정 / 핵심 메모

- **`transparent: true` 대신 `alphaToCoverage: true`를 택한 이유**: `isOpaque()` 판정은
  `transparent === false && blending === NormalBlending && alphaToCoverage === false` 세
  조건의 AND다. 아무 조건이나 하나만 깨도 클로버링을 피할 수 있는데, `transparent`를 바꾸면
  three.js가 실제 GPU 블렌드 방정식을 REPLACE→OVER로 바꿔버려 기존 RGB 합성 로직(각 패스가
  이전 패스 텍스처를 직접 읽어 `mix()`로 계산한 뒤 전체 화면에 덮어쓰는 방식)과 충돌할 수
  있다. `alphaToCoverage`는 원래 MSAA 커버리지 계산용 플래그라 `isOpaque()` 판정에만
  영향을 주고 블렌드 방정식 자체는 바꾸지 않아 더 안전한 선택이었다.
- **20260914_1045가 왜 이 지점을 못 찾았는지**: 그 티켓의 잔여 이슈에 "esbuild+playwright
  실측이 이 워크트리/에이전트 환경에서 완전히 실패"했다고 남아 있다 — 코드 추적(정적 분석)만
  으로 세 지점을 고치고 CLOSED 처리했는데, 그 세 지점 수정 자체는 전부 올바르고 필요했지만
  `three.js` 라이브러리 내부(패키지 코드가 아닌 의존성의 의존성)의 네 번째 지점은 실제 GPU
  렌더 결과를 픽셀로 찍어보지 않고는 발견할 수 없는 종류였다. 이번 티켓은 (다른 세션에서이긴
  하나) 실제 WebGPU 렌더가 되는 환경을 확보해 실측으로 검증했다.

### 잔여 이슈
- 스테이징 실제 어드민 화면에서 사람이 직접 눈으로 최종 확인 필요 (이미지 레이어 업로드 →
  미리보기 투명도 → PNG 다운로드 → 알파 채널). 어드민은 스테이징 자체 검증이 불가하므로
  배포 후 프로덕션(`jam-stage.vercel.app`/`stage.j-a-m.app`)에서 확인.
