---
id: "20260926_1208"
category: Infra
priority: P2
status: OPEN
created: 2026-09-26
closed:
parent: "20260926_1202"
specs:
  - docs/specs/prd/asset-generator/PRD.md
  - docs/specs/prd/asset-generator/HOME_FEED_REGISTRATION_BUNDLE.md
---

# [Infra] render.mjs가 프리셋의 텍스트 레이어 2개에 제목과 짧은 설명을 각각 채운다

> 상위 티켓 [20260926_1202](20260926_1202_Feature_예약실행에서-윤진-이미지-생성-상위.md). 선행: 20260926_1204(같은 파일 `render.mjs`를 고친다).

## 핵심 요약

- 요구사항: 홈피드 프리셋(`홈피드`, id `51aa4673-f723-4929-ac20-a302202b7aa7`)의 텍스트 레이어 `피드 제목`에 카드 제목을, `간단한 설명`에 짧은 요약을 넣을 수 있어야 한다. 지금은 CLI 인자가 `--text` 하나뿐이라 두 레이어에 같은 문구가 들어간다.
- 구현 계획: `--subtext` 인자를 추가한다. 프리셋의 텍스트 레이어를 배열 순서로 보아 첫 번째 ← `--text`(제목), 두 번째 ← `--subtext`(설명)로 채운다. 텍스트 레이어가 1개인 프리셋(배지·미션)은 지금처럼 `--text`만 쓴다. 등록 묶음에는 선택 필드 `image.subtext`를 추가해 재현 정보를 남긴다.
- 관련 파일: `jam-web/scripts/asset-generator/renderArgs.mjs`(`REQUIRED_FLAGS`·`parseRenderArgs`), `render.mjs`(텍스트 채우기 99~102행 `layer.type === 'text' ? { ...layer, content: args.text }`), `registerHomeFeedBundle.mjs`(`IMAGE_OPTIONAL_FIELDS` 58행, 357행 검증), `registerBundle.mjs`·`registerMissionBundle.mjs`(같은 필드 목록이 있으면 함께 확인), PRD `docs/specs/prd/asset-generator/PRD.md` §8·`HOME_FEED_REGISTRATION_BUNDLE.md` §3.4, 테스트 `__tests__/`

## 배경 / 문제 정의

사용자 지시(2026-09-26): 에셋 제너레이터의 프리셋 `홈피드`에서 텍스트 레이어 「피드 제목」에 제목을, 「간단한 설명」에 짧은 요약을 작성한다. DB 조회로 확인한 실제 프리셋은 텍스트 레이어가 2개이고(세로 31%·글자 크기 10% / 세로 41%·크기 5%, 둘 다 Noto Sans KR 600, 흰색, 가운데 정렬) 프리셋 JSON에는 레이어 이름 필드가 없다(`TextLayerConfig`에 `name`이 없음). 이름은 어드민 화면·사용자 표현일 뿐이라 CLI가 구분할 방법은 배열 순서뿐이다.

## 상세 요구사항

### 서비스/코드베이스 관점
- 순서 규칙: 프리셋 `layers` 배열에서 `type: 'text'`인 것만 뽑은 순서로, 1번째 = 제목(`--text`), 2번째 = 설명(`--subtext`). 이 규칙을 `render.mjs` 상단 주석·PRD §8·`jam-marketer.md` ⑧에 적는다. 프리셋을 어드민에서 다시 저장해 레이어 순서를 바꾸면 값이 뒤바뀌므로, **홈피드 프리셋의 텍스트 레이어 순서는 「제목 → 설명」으로 유지한다**를 PRD에 명시한다.
- 오류 처리(조용히 같은 문구로 채우지 않는다):
  - 텍스트 레이어 2개 이상인 프리셋인데 `--subtext`가 없으면: 종료 코드 1, 「이 프리셋은 텍스트 레이어가 N개예요. --subtext로 두 번째 문구도 넣어 주세요」.
  - 텍스트 레이어가 1개인데 `--subtext`가 있으면: 종료 코드 1(값이 버려지는 것을 막는다).
  - 텍스트 레이어가 3개 이상이면: 종료 코드 1(지원 범위 밖, 프리셋 확인 요청).
  - 텍스트 레이어가 없는 프리셋에 `--text`가 들어오는 경우는 지금 동작(값 무시)을 유지한다.
- `--subtext`도 `--text`처럼 리터럴 `\n`을 개행으로 바꾼다.
- 출력 JSON에 `text`·`subtext`를 넣지 않는다(기존 출력 형식 유지). 재현 정보는 등록 묶음의 `image.text`·`image.subtext`가 맡는다.
- 등록 묶음(홈피드 카드): `image.subtext`(선택, 문자열, 줄바꿈 허용 여부는 `image.text`와 같게)를 추가하고 검증한다. 배지·미션 묶음은 텍스트 레이어가 1개이므로 이 필드를 추가하지 않는다.
- 글자 수 가이드(1:1, 1080 기준 추정, 실측으로 확정): 제목 글자 크기 10% ≈ 108px이라 한 줄 약 9자, 설명 5% ≈ 54px이라 한 줄 약 18자. 넘치면 `\n`으로 줄을 나눈다. 실제 홈피드 프리셋으로 짧은 제목·긴 제목·2줄 설명을 렌더해 잘림·겹침을 확인하고 한도를 PRD에 적는다. 제목이 2줄이 되면 세로 41%의 설명과 겹칠 수 있으므로 겹침 한도를 실측한다.

## 구현 계획

1. `renderArgs.mjs`: `--subtext` 선택 인자 추가(`text`와 같은 개행 처리), 반환 객체에 `subtext` 포함.
2. `render.mjs`: 텍스트 레이어 채우기를 순서 규칙으로 교체하고 위 오류 처리 구현. 채우기 로직은 `fillTextLayers(layers, { text, subtext })` 순수 함수로 분리해 테스트한다.
3. 홈피드 등록 묶음 필드 `image.subtext` 추가·검증·테스트, `HOME_FEED_REGISTRATION_BUNDLE.md` §3.4 갱신.
4. 실제 `홈피드` 프리셋으로 렌더 실측(제목 짧음·김, 설명 1줄·2줄) 후 글자 수 가이드를 PRD에 기록.
5. `docs/specs/prd/asset-generator/PRD.md` §8 CLI 사용법에 `--subtext` 추가.

## 완료 조건

- `--text "제목" --subtext "짧은 설명"`으로 `홈피드` 프리셋을 렌더하면 큰 글씨 위치(세로 31%)에 제목, 작은 글씨 위치(세로 41%)에 설명이 들어간다(결과 PNG를 열어 확인, 스크린샷 또는 파일 경로를 완료 기록에 남긴다).
- 텍스트 레이어 2개인 프리셋에 `--subtext`가 없으면 실패하고, 1개인 프리셋에 `--subtext`가 있으면 실패한다(자동 테스트). 배지·미션 프리셋(레이어 1개)의 기존 호출은 그대로 동작한다(회귀 테스트).
- 홈피드 묶음의 `image.subtext`가 있으면 검증을 통과하고 없으면 그것도 통과한다. 문자열이 아니면 거절한다(자동 테스트).
- 제목·설명 글자 수 가이드가 실측 결과와 함께 PRD에 적혀 있다.
- `scripts/verify.sh`가 통과한다.

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
- 사용자 노출 텍스트 없음 (내부 스크립트)

### 배포 정보
- 배포일: 
- 환경: 
- 커밋: 

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
