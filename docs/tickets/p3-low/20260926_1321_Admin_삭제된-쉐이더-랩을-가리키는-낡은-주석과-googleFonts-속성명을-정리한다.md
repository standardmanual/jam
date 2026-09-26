---
id: "20260926_1321"
category: Admin
priority: P3
status: OPEN
created: 2026-09-26
closed:
related:
  - "20260925_1416"
---

# [Admin] 삭제된 쉐이더 랩을 가리키는 낡은 주석과 `googleFonts.ts`의 속성명을 정리한다

> 2026-09-26 티켓 20260925_1416 게이트(민지)의 범위 밖 발견물이다.

## 핵심 요약

- 요구사항: 쉐이더 랩 제거(티켓 1416) 뒤에도 에셋 제너레이터 주석 여러 곳이 삭제된 `shader-lab` 파일을 가리킨다. 이동한 `lib/admin/googleFonts.ts:48`의 `LOADED_FONT_LINK_ATTR = 'data-shader-lab-google-font'` 속성명과 `buildGoogleFontCssUrl` 주석에도 옛 이름이 남았다. 주석을 현재 상태로 고친다. 속성명은 DOM에 심는 값이라 바꾸면 이미 열린 화면의 기존 `<link>` 식별이 달라질 수 있으니 바꿀 때 영향을 확인한다.
- 관련 파일: `jam-web/src/app/admin/asset-generator/LayerSidebar.tsx:12`, `PresetPanel.tsx:6·15`, `TextLayerFields.tsx:7·10`, `assetGeneratorHelpers.ts:140·197·206·275`, `page.tsx:9`, `src/app/api/admin/asset-generator/apply/route.ts:10·23`, `presets/route.ts:19·151`, `presets/[id]/route.ts:30`, `src/lib/asset-generator/types.ts:16`, `src/app/globals.css:5`, `src/lib/admin/googleFonts.ts:48`.

## 완료 조건

- 위 주석이 삭제된 쉐이더 랩을 더 이상 가리키지 않는다. 속성명을 바꿨다면 폰트 로드가 그대로 동작한다(단위 테스트 또는 근거).


---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
| 합계 |  |  |  |  |  |

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
