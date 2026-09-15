---
id: 20260915_1520
category: Admin
priority: P2
status: CLOSED
created: 2026-09-15
closed: 2026-09-15
---

# [Admin] 쉐이더 랩 — PNG 자동 축소가 실제로 동작하지 않던 문제(WebGPU 캔버스 drawImage)

## 배경 / 문제 정의

티켓 [20260915_1510](20260915_1510_Admin_쉐이더랩적용시PNG자동용량축소.md)에서 배지/미션/
컬렉션 적용 시 PNG를 자동으로 목표 용량(허용치의 70%)까지 줄이는 기능을 추가해 스테이징에
배포했으나, 실제 적용 시도(9.2MB 이미지)에서 여전히 "이미지가 너무 커요(9.2MB)" 에러가
그대로 나온다는 보고가 들어왔다 — 즉 축소가 전혀 일어나지 않았다.

## 사전 조사 결과 (실렌더로 원인 재현)

`compressCanvasPngToTarget()`의 축소 루프가 `ctx.drawImage(sourceCanvas, 0, 0, width,
height)`로 쉐이더 랩의 **WebGPU 캔버스 자체**를 직접 2D 캔버스에 그려 넣고 있었다. 로컬
실렌더로 재현한 결과, 이 특정 조합(`drawImage`의 소스가 WebGPU 컨텍스트를 가진 `<canvas>`)은
**예외 없이 조용히 빈 화면(완전 투명, RGBA 전부 0)을 그린다**는 걸 확인했다 — 일반 PNG
다운로드가 쓰는 `canvas.toBlob()`(캔버스에 직접 호출)은 이 문제와 무관하게 항상 정상
동작하지만, `drawImage`로 다른 캔버스에 옮겨 그리는 건 별개의 경로였다.

축소 루프의 첫 시도에서 캔버스가 빈 화면이 되면, 그 결과 PNG는 원본보다 커지거나(빈
캔버스라도 그리기 실패 직전 상태에 따라) 최소한 의도한 대로 원본 내용을 담은 채 줄어들지는
않는다 — 관찰된 증상(원본 크기 그대로 에러)과 일치한다.

이 프로젝트가 이미 겪었던 것과 같은 종류의 함정이다 — `liquid-metal-pass.js`가 WebGL
캔버스를 매 프레임 2D 캔버스로 미러링하는 것도, WebGPU 파이프라인이 다른 종류의 캔버스
컨텍스트를 직접 읽어오지 못해서 생긴 우회책이었다(코드 주석에 이미 명시돼 있었다).

## 상세 요구사항

### 서비스/코드베이스 관점

- 축소 루프가 WebGPU 캔버스를 직접 `drawImage` 소스로 쓰지 않도록 한다.
- `canvas.toBlob()`으로 얻은 PNG blob을 `<img>` 엘리먼트로 디코딩한 뒤, 그 디코딩된 이미지를
  축소 소스로 쓴다(이후 단계는 모두 순수 2D 캔버스 간 `drawImage`라 문제없다).

## 구현 계획

1. `ShaderLabApplyTab.tsx`에 `loadImageFromBlob(blob)` 헬퍼 추가 — PNG blob을 Object URL로
   변환해 `<img>`로 로드.
2. `compressCanvasPngToTarget()`가 원본 캔버스의 PNG blob을 먼저 얻은 뒤, 그 blob을
   `loadImageFromBlob()`로 디코딩하고, 이후 축소 루프의 `drawImage` 소스를 그 `<img>`로
   교체(기존 `sourceCanvas` 대신).
3. 로컬 esbuild+실제 WebGPU 브라우저 실렌더로: 수정 전(WebGPU 캔버스 직접 drawImage)과
   수정 후(디코딩된 `<img>` 경유) 양쪽을 비교해, 수정 후에는 축소된 캔버스 중심 픽셀이
   실제 콘텐츠 색상을 담고 있는지(빈 화면이 아닌지) 확인.
4. `npx tsc --noEmit`, 변경 파일 `eslint`.

---
## 완료 기록

### 구현 내용 요약

구현 계획대로 진행했다. `compressCanvasPngToTarget()`의 흐름이 다음과 같이 바뀌었다:
1. 원본 캔버스 → `canvas.toBlob()` → PNG blob (기존과 동일, 항상 정상 동작)
2. 그 blob → `loadImageFromBlob()` → 디코딩된 `<img>` (신규)
3. 축소 루프의 `drawImage` 소스를 원본 캔버스가 아니라 이 `<img>`로 사용 (변경)

### 변경된 파일
```
jam-web/src/app/admin/shader-lab/ShaderLabApplyTab.tsx
  (loadImageFromBlob 헬퍼 추가, compressCanvasPngToTarget이 캔버스 대신 디코딩된 이미지를
   축소 소스로 사용하도록 수정)
```

### 테스트 결과
- [x] 로컬 esbuild+실제 WebGPU 브라우저 실렌더 — 수정 전 재현: `drawImage(webgpuCanvas,...)`
      직접 호출 시 중심 픽셀 `[0,0,0,0]`(완전 빈 화면), 결과 blob 4.7KB(원본 콘텐츠 없이
      거의 빈 PNG). 수정 후: 원본 588KB → 목표(원본의 30%, 176KB)까지 6회 반복 후 140KB로
      수렴, 축소된 캔버스 중심 픽셀이 `[243,243,243,255]`(실제 그라디언트 색상)로 정상
      콘텐츠 확인
- [x] `npx tsc --noEmit` — 오류 없음
- [x] 변경 파일 `npx eslint` — 오류·경고 없음

### UX Writing 검증 *(사용자 노출 텍스트가 있을 경우 필수)*
- 사용자 노출 텍스트 변경 없음(내부 로직 수정만) — 해당 없음

### 배포 정보
- 배포일: 2026-09-15 (staging 직접 commit·push, 오케스트레이터 — 경미 수정 절차)
- 환경: staging (`stage.j-a-m.app`) — 프로덕션(main) 승격은 `/jam-ship`으로 별도 진행(사용자
  승인 필요). 어드민 화면은 스테이징 자체 검증이 불가하므로 배포 후 프로덕션에서 최종 확인
  권장
- 커밋: (push 직후 기록)

### 주요 의사결정 / 핵심 메모

- **소스 전환(`<img>` 경유) 지점을 최소한으로 좁혔다** — 원본 첫 `canvas.toBlob()` 호출은
  이미 정상 동작이 증명된 경로(일반 PNG 다운로드와 동일)라 그대로 뒀고, 오직 "축소 루프
  안에서 그리기 소스로 쓰는 대상"만 캔버스에서 디코딩된 이미지로 바꿨다. 이후 반복
  축소(2회차 이상)에서도 계속 같은 `<img>`를 소스로 재사용해(매번 원본 화질에서
  다시 스케일링) 축소를 거듭할수록 화질이 누적으로 나빠지는 것도 막았다.

### 잔여 이슈
- 스테이징 실제 어드민 화면에서 9.2MB급 실제 배지 이미지로 재확인 필요(사용자가 신고한
  원본 사례). 배포 후 프로덕션에서 확인.
