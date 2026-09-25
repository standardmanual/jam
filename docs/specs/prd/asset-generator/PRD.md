---
type: prd
status: active
description: "JAM! 에셋 제너레이터를 어드민 디자인 도구로 확장해 배지·미션·컬렉션·홈피드 대표 이미지를 수동·자동(윤진) 두 경로로 만들고 적용하는 스펙 정본이다."
tags: [어드민, 배지, 마케팅]
related:
  - "20260924_2154"
  - "20260925_1404"
  - "20260925_1416"
code:
  - "jam-web/src/app/admin/asset-generator"
  - "jam-web/src/lib/asset-generator"
  - "jam-web/scripts/asset-generator"
---

# JAM! 에셋 제너레이터 — 배지 대표 이미지 제작 도구 PRD

> **상태: active.** 기획 승인(2026-09-24, 상위 티켓 [20260924_2154](../../../tickets/p2-normal/20260924_2154_Feature_배지-대표이미지-제작도구-확장-JAM-에셋-제너레이터-1단계-상위.md))
> 뒤 하위 티켓 10개를 순서대로 구현했고, 2026-09-25에 후속 범위(성공 기준 1~6 확인)까지 마쳐 상위
> 티켓을 CLOSED 처리했다. 기획 경위·결정 기록·리스크는 상위 티켓에 있고, 이 문서는
> **동작 정의와 규칙**만 담는다. 구현이 끝난 절은 §15에 표시한다. 1차 범위는 배지 프리셋 1종이고,
> 미션·컬렉션·홈피드 프리셋은 상위 티켓의 "하지 않을 것"에 남아 후속 차수 대상이다.
> 프로토타입 원본: `jam-doc/assets/prototypes/20260924_jam-asset-generator.html`.

## 1. 한 줄 정의

브랜드 글자(J·A·M)나 업로드한 그림을 랜덤 곡선을 따라 반복 복사해 리본 모양 그래픽을 만드는 에셋
제너레이터를, 어드민 "디자인" 메뉴의 정식 화면으로 옮기고 이미지·텍스트 레이어와 프리셋을 더해
**배지 대표 이미지를 사람이 직접 만들거나(수동 경로) 윤진이 자동으로 만들어 컨펌받고 등록하는(자동 경로)** 도구.

## 2. 원칙

1. **두 경로, 한 엔진.** 수동 경로(어드민 화면)와 자동 경로(에이전트 CLI)는 같은 공용 모듈로 그린다. 같은 입력과
   같은 시드면 같은 이미지가 나온다.
2. **등록 실행 주체는 메인 세션.** 윤진은 등록 묶음(컨텐츠 내용 + 이미지 + 시드)을 파일로 준비할 뿐, 배지 데이터와
   이미지를 실제로 등록하는 스크립트는 사용자 컨펌 뒤 메인 세션(카리나)이 실행한다(CLAUDE.md 6항).
3. **컬러는 UI 디자인 토큰과 별개.** 배경색·그라데이션 끝색은 컨텐츠 단위로 정하고, **그라데이션 시작색은 항상
   배경색과 같다.**
4. **`shader-lab`은 손대지 않는다.** 텍스트·이미지 레이어는 이 도구 안에 새로 구현하되 `shader-lab`과 같은 사용감을 목표로 한다.
   ⚠️ **2026-09-25부터 이 원칙은 폐기 예정이다.** `shader-lab`(배지·미션·컬렉션 대표 이미지에 정지 PNG를
   적용하던 별도 도구, 배경 제너레이터와는 무관)을 제거하기로 했다 — 별도 티켓
   [20260925_1416](../../../tickets/p2-normal/20260925_1416_Admin_어드민-쉐이더랩-트라이브컬렉션-배경일괄적용-제거.md).
   에셋 제너레이터가 그 역할을 점진적으로 흡수할지는 후속 차수 열린 질문이며, 이번엔 제거만 한다.
5. **기존 `/jam-img`(아이콘 파이프라인)와 병행한다.** 두 경로 모두 배지 대표 이미지(`badges.image_url`)에 쓸 수 있고,
   어느 경로로 만들었는지 배지에 기록해 화면에 표시한다.

## 3. 화면 구성 (어드민 → 디자인 → 에셋 제너레이터)

| 영역 | 내용 |
|---|---|
| 스테이지 | 미리보기 캔버스. 비율 1:1 · 4:5 · 9:16, 긴 변 1280px. 재생/정지 토글, 정지 시 머리 위치 슬라이더 |
| 설정 패널 | 프로토타입과 같은 접기·펼치기 섹션. 원천 그래픽(글자 J·A·M 선택 / PNG·SVG 업로드) · 스테이지(비율·배경색) · 이미지(크기·블러·회전·진행 방향 회전) · 그라데이션(방향·시작색·끝색·시작색=배경색 연결) · 이동 곡선(불규칙성·다시 뽑기·속도·복사 간격·복사 수) |
| 도구 줄 | 전체 랜덤 · PNG 저장 · 영상 저장(길이 초 입력, 어드민 화면 전용) |
| 레이어 | 리본 레이어(기본, 1개) 위에 이미지 레이어·텍스트 레이어를 추가·순서 변경·삭제 (§4) |
| 프리셋 | 현재 레이어 구성을 이름 붙여 저장 · 불러오기 · 삭제 (§5) |
| 적용 탭 | 배지 검색·필터 → 미리보기 → 적용 (§7) |

수동 경로에서는 **모든 속성을 직접 조절할 수 있고 전체 랜덤 버튼도 쓸 수 있다.** "색만 지정하고 나머지는 랜덤"
규칙은 자동 경로(§8)에만 적용된다.

## 4. 레이어

### 4.1 리본 레이어 (기본)

프로토타입의 속성을 그대로 갖는다: 원천 그래픽, 크기, 블러, 회전(진행 방향 회전 여부 포함), 그라데이션(방향·시작색·끝색),
곡선 불규칙성·시드, 속도, 복사 간격, 복사 수, 배경색. 곡선은 화면 밖으로 조금 나갔다 들어오며(길이의 15%), 급하게 꺾이는
지점 없이 흐른다.

### 4.2 이미지 레이어

| 속성 | 내용 |
|---|---|
| 원본 | 업로드한 PNG/SVG. 프리셋에 저장할 때 저장소에 함께 올린다(§5) |
| 위치·크기 | 스테이지 기준 비율(%)로 저장해 비율이 바뀌어도 상대 위치가 유지된다 |
| 회전·불투명도 | 도 단위 · 0~100% |
| 순서 | 리본 레이어 위/아래. `layers` 배열 안 위치로 표현한다(§5) — 레이어별로 따로 두는 필드는 없다 |

### 4.3 텍스트 레이어

| 속성 | 내용 |
|---|---|
| 글자 내용 | **프리셋에 저장하지 않는다** (`content`, 스타일과 분리된 필드). 수동 경로에서는 화면에서 입력하고, 자동 경로에서는 컨텐츠(배지 이름 등)에서 채운다. 여러 줄 입력을 허용한다 |
| 글꼴 | `{ family, weight }` 식별자. 구글 폰트 선택(검색 콤보박스, `shader-lab`과 같은 사용감이되 캔버스 `ctx.font`에 맞춰 이 화면 전용으로 새로 만든 컴포넌트) + 기본 시스템 글꼴(`system-ui`). 서버 렌더링(20260924_2201)이 같은 식별자로 폰트 파일을 등록한다 |
| 크기 | 스테이지 짧은 변 대비 %(`sizePct`) |
| 자간·행간 | 둘 다 글자 크기 대비 배수(`letterSpacing`·`lineHeight`) — 브라우저·서버 어느 캔버스 구현에서도 같은 결과를 내도록 `measureText` 기반으로 글자 단위 배치한다(`ctx.letterSpacing`에 기대지 않는다) |
| 정렬 | 왼쪽·가운데·오른쪽(`align`). 여러 줄일 때 짧은 줄이 정렬에 따라 다르게 놓인다 |
| 색·위치·회전·불투명도 | 색(`color`), 위치 x·y(%, 텍스트 블록 중심 기준), 회전(°), 불투명도(0~100%) |
| 순서 | 리본 레이어 위/아래. `layers` 배열 안 위치로 표현한다(§5) — 레이어별로 따로 두는 필드는 없다 |

구현: `jam-web/src/lib/asset-generator/render.ts`의 `drawTextLayer`(브라우저·서버 공용). 이미지
레이어와 텍스트 레이어는 어드민 화면에서 `overlayLayers`(하나의 순서 있는 혼합 목록)로 함께
관리한다 — 프리셋(§5)이 `layers` 배열 하나에 리본·이미지·텍스트를 순서대로 저장하기 때문이다.

## 5. 프리셋

- **저장하는 것**: 대상 컨텐츠 유형(1차는 `badge`), 이름, 스테이지 비율, 이미지 레이어 목록(원본은 저장소 경로로), 텍스트
  레이어 목록(스타일만), 레이어 순서(오버레이 레이어 배열 안 위치로 표현).
- **저장하지 않는 것**: 리본 레이어 자체(색·크기·블러·회전·곡선·랜덤 속성값과 시드 전부), 텍스트 글자 내용. 이 값들은
  생성할 때마다(수동은 화면에서, 자동은 CLI 입력으로) 정한다.
- 프리셋의 이미지 원본은 프리셋 저장 시 저장소(`asset-generator/presets/{presetId}/…`)에 올리고, 프리셋은 그 경로를 가리킨다.
  자동 경로는 어드민 화면 없이 이 경로만으로 렌더링할 수 있어야 한다.
- 사람이 어드민에서 만든다. 에이전트는 프리셋을 만들지 않고 고르기만 한다.

## 6. 컬러 규칙

| 항목 | 수동 경로 | 자동 경로 |
|---|---|---|
| 배경색 | 화면에서 선택 | 채원·윈터가 컨텐츠 단위로 제시한 값 |
| 그라데이션 시작색 | 배경색과 같음(연결 기본 켜짐, 끌 수 있음) | **항상 배경색과 같음** |
| 그라데이션 끝색 | 화면에서 선택 | 채원·윈터가 제시한 값 |

컬러 방향은 별도 표 문서로 고정하지 않는다. 윤진이 매번 쓰는 컨텐츠 기획 문서(주간 리포트 「홈피드 초안」 표, 월간 리포트
「배지·미션 제안 재료」 절)에 컨텐츠별 배경색·끝색과 선택 근거를 적고, 채원(브랜드 일관성·대비)과 윈터(트라이브·세계관 색의
의미)가 그 컨텐츠 단위로 방향을 제시하거나 검수한다.

## 7. 수동 경로

```
어드민 화면에서 조절(또는 전체 랜덤) → (선택) 프리셋 불러오기 → 텍스트 내용 입력
→ 적용 탭에서 배지 검색·필터 → 미리보기 → 적용
→ 원본 PNG 보관 + 서비스용 WebP 축소본 생성 → badges.image_url 갱신 + 제작 경로 기록
```

- 검색·필터는 기존 `/api/admin/badges/search`와 어드민 목록 테이블 공통 컴포넌트(티켓 20260924_0916)를 재사용한다.
- 적용은 공용 저장 함수 `applyGeneratedImage`의 관례(도구별 저장 폴더)를 따르되, WebP 축소본 생성과 제작 경로 기록이 더해진다(§9·§10).

## 8. 자동 경로 (윤진)

```
윤진: 프리셋 선택 + 배경색·끝색(채원·윈터 제시) + 배지 텍스트 → CLI 실행 → PNG + 시드
→ 등록 묶음 파일(배지 이름·설명·획득 조건 + 이미지 경로 + 시드) 준비 → 사용자 컨펌 요청(기획안과 이미지를 함께 보여 줌)
사용자: 컨펌
메인 세션: 등록 스크립트 실행 → 배지 데이터 + 이미지 함께 등록 → 등록 기록·되돌림 SQL 남김
```

- CLI 입력: 프리셋 ID, 배경색, 끝색, 텍스트 내용, (선택) 시드. 나머지 리본 속성은 프리셋 대상 유형의 랜덤 규칙(전체 랜덤 버튼과
  같은 범위)으로 채운다. 출력: PNG 파일 경로와 시드.
- 등록 기록·되돌림 SQL 형식은 홈피드 카드 등록 선례(티켓 20260923_2252)를 따른다.
- **CLI 실제 명령(티켓 20260924_2201, 서버 캔버스 라이브러리 `@napi-rs/canvas` 2026-09-25 사용자 승인)**:
  ```
  cd jam-web
  npx tsx scripts/asset-generator/render.mjs \
    --preset <프리셋 id> --bg "#ff1a00" --end "#ff4dff" --text "배지 이름" \
    --out /absolute/path/out.png [--seed 123]
  ```
  성공하면 표준 출력에 `{ out, seed, preset, stage: { w, h } }` JSON 한 줄을 낸다. 인자 누락·프리셋 없음·
  글꼴 다운로드 실패 등 어떤 오류든 한국어 메시지로 종료 코드 1로 끝난다(기본 글꼴로 조용히 대체하지 않는다).
  필요 환경변수(`.env.local`)는 `NEXT_PUBLIC_SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`(기존
  `jam-web/scripts/recraft/*.js`와 같은 이름).
- **리본 원천 그래픽 기본값**: CLI 인자에는 원천 그래픽(브랜드 글자/업로드 이미지) 선택지가 없다 — 어드민 기본값과
  같은 브랜드 글자 'J'로 고정한다(`jam-web/scripts/asset-generator/brandLetters.mjs`). 정지 프레임 위치(애니메이션
  진행도)도 항상 0으로 고정한다(어드민 초기 상태와 동일) — 실렌더 비교 시 어드민에서 원천 그래픽·머리 위치를 바꾸지
  않은 기본 상태로 PNG를 저장해야 CLI 결과와 같은 그림이 나온다.
- **글꼴**: 프리셋 텍스트 레이어의 글꼴 식별자(`{family, weight}`)에 해당하는 구글 폰트 TTF 파일을 내려받아
  `os.tmpdir()` 아래 캐시하고 `GlobalFonts.registerFromPath`로 등록한다(`jam-web/scripts/asset-generator/fonts.mjs`).
  브라우저 로더는 항상 굵기 400 스타일시트만 요청하는 한계가 있지만(티켓 20260925_0148), 서버는 지정 굵기 파일을
  그대로 받아 이 한계가 없다. 내려받기 실패 시 기본 글꼴로 대체하지 않고 오류로 중단한다.
- **비교 스크립트**: `jam-web/scripts/asset-generator/compare.mjs <PNG 1> <PNG 2>` — 크기 일치·픽셀 차이 비율·
  차이 최댓값을 JSON으로 낸다. 어드민 PNG와 CLI PNG의 실렌더 비교에 쓴다.
  **실측 기준(2026-09-25, 시드 12345·1:1·이미지 1+텍스트 1)**: 어드민 PNG와 CLI PNG는 픽셀 단위로 정렬된다(CLI를 1px 옮기면 평균 차이가
  2배로 커지고 이동 없을 때 최소). 평균 절대 차이 0.9/255, 차이 8 초과 픽셀 1.4%, 32 초과 0.34%, 64 초과 0.1%이며 차이는 스탬프·글자
  가장자리 안티앨리어싱에 몰려 있다. 이미지 레이어 안쪽과 단색 배경의 차이는 0이다. `compare.mjs`의 `diffRatio`는 채널 하나라도
  다른 픽셀의 비율이라 이 조합에서 0.42로 나오므로, 판정은 임계값별 비율과 평균 차이로 한다. 같은 시드로 CLI를 두 번 실행하면 PNG가
  바이트까지 같다.
- **등록 묶음과 등록 스크립트(티켓 20260924_2202)**: 형식·검증 규칙·절차의 정본은
  [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md)다. 묶음은 JSON 한 벌(`bundle.json`)과 PNG를 한 폴더에 둔다(권장
  `jam-doc/assets/badge-bundles/<묶음 ID>/`). 담는 것은 배지 필드(이름·설명·유형·등급 또는 레벨·조건 등), 이미지 경로, 시드,
  프리셋 ID, 배경색·끝색, 컬러 선택 근거 링크, 작성자, 작성 시각이다. 사람이 읽는 컨펌 자료는 별도 문서가 아니라 `--dry-run`
  출력(배지·이미지·시드·색·등록 예정 내용·되돌림 SQL 미리보기)이 맡는다.
  ```
  cd jam-web
  npx tsx scripts/asset-generator/register-badge.mjs --bundle <bundle.json 절대경로> [--dry-run] [--record-dir <폴더>]
  npx tsx scripts/asset-generator/register-badge.mjs --undo <registration-record.json 절대경로> [--dry-run]
  ```
  지원 유형은 `activity`·`item`이고(`checkin`은 POI 연결이 필요해 1차 범위 밖) 신규 배지만 등록한다. 배지 행 규칙은 어드민 배지 생성 API와
  같은 검증 함수를 재사용한다. 등록 순서는 이미지 업로드(원본 PNG + WebP) → 배지 행 insert(`image_source = 'agent-generator'`)이며
  insert가 실패하면 올라간 파일을 지운다. 성공하면 `registration-record.json`과 되돌림 SQL이 든 `registration.sql`을 남긴다(형식은
  홈피드 카드 등록 선례를 따른다). `--undo`는 사용자 데이터가 붙지 않았을 때만 파일 2개와 배지 행을 지운다. **스크립트는
  사용자 컨펌 뒤 메인 세션만 `--dry-run` 없이 실행한다.**
- **미션 등록 묶음과 등록 스크립트(티켓 20260925_1412)**: 형식·검증 규칙·절차의 정본은
  [MISSION_REGISTRATION_BUNDLE.md](MISSION_REGISTRATION_BUNDLE.md)다. 배지와 같은 흐름이되 필드는 미션 스키마(`mission_type`·
  `condition_json`·기간·보상·표시 방식·게이트·노출 모드)에 맞추고, 묶음에 «세계관 검수 기록»(`world_review`: 세계관과 닿는 내용
  여부·윈터 검수 여부·사유)을 남긴다. 권장 폴더는 `jam-doc/assets/mission-bundles/<묶음 ID>/`이다.
  ```
  cd jam-web
  npx tsx scripts/asset-generator/register-mission.mjs --bundle <bundle.json 절대경로> [--dry-run] [--record-dir <폴더>]
  npx tsx scripts/asset-generator/register-mission.mjs --undo <registration-record.json 절대경로> [--dry-run]
  ```
  어드민 미션 생성 API의 검증 함수 3종(`checkMissionCondition`·`checkMissionConditionValue`·`findGateMissionSaveError`)을 같은 순서로
  재사용한다. 저장 경로는 적용 탭과 같은 `missions/asset-generator/{id}.png|webp`이고 미션 행에는 `image_url`과
  `image_source = 'agent-generator'`가 들어간다. `--undo`는 `missions`를 참조하는 외래 키 6곳(완료·참여 이력, 랭킹 스냅샷, 포인트 원장,
  투데이 카드, 랭킹 모드)에 사용자 데이터가 없을 때만 미션 행과 파일 2개를 지운다. 배지 등록 스크립트 5개 파일은 고치지 않았다.
  **스크립트는 사용자 컨펌 뒤 메인 세션만 `--dry-run` 없이 실행한다.**
- **홈피드 카드 등록 묶음과 등록 스크립트(티켓 20260925_1413)**: 형식·검증 규칙·절차의 정본은
  [HOME_FEED_REGISTRATION_BUNDLE.md](HOME_FEED_REGISTRATION_BUNDLE.md)다. 배지·미션과 같은 흐름이되 필드는 `today_cards` 스키마(템플릿·노출
  형태·노출 조건 태그·기간·참조 필드·컨텐츠 유형)에 맞추고, 세계관 검수 기록(`world_review`)을 남긴다. 권장 폴더는
  `jam-doc/assets/home-feed-bundles/<묶음 ID>/`이다.
  ```
  cd jam-web
  npx tsx scripts/asset-generator/register-home-feed-card.mjs --bundle <bundle.json 절대경로> [--dry-run] [--record-dir <폴더>]
  npx tsx scripts/asset-generator/register-home-feed-card.mjs --undo <registration-record.json 절대경로> [--dry-run]
  ```
  어드민 `today_cards` 생성 API는 본문을 검증 없이 insert하므로 재사용할 검증 함수가 없다. 규칙은 어드민 폼·`today-sections.ts` 상수·DB CHECK에서
  가져오고 허용값 목록은 그 상수를 import한다. 저장 경로는 적용 탭과 같은 `today_cards/asset-generator/{id}.png|webp`이고 카드 행에는
  `cover_image_url`(`image_url`이 아니다)과 `image_source = 'agent-generator'`가 들어간다. 기존 주간 편성의 시드 SQL 등록 카드는 `image_source`가
  NULL이라 두 경로가 구분된다. 중복 검사는 «제목 + 시작 일시»다. `--undo`는 `today_card_events`(`today_cards`를 참조하는 유일한 외래 키, 삭제 규칙은
  `ON DELETE SET NULL`)에 노출·열람 기록이 없을 때만 카드 행과 파일 2개를 지운다. 배지·미션 등록 스크립트는 고치지 않았다.
  **스크립트는 사용자 컨펌 뒤 메인 세션만 `--dry-run` 없이 실행한다.**

## 9. 출력 규격과 최적화

| 용도 | 제작 규격 | 서비스 적용 |
|---|---|---|
| 배지 대표 이미지 | 1:1 · 4:5 · 9:16, 긴 변 1280 원본 PNG | 긴 변 **400px**(표시 규격의 2배) 이하로 줄인 WebP |
| 마케팅 소재 | 1:1 · 4:5 · 9:16, 긴 변 1280 | 서비스에 올리지 않음(PNG·MP4 다운로드) |

- **400px 산출 근거(티켓 20260924_2200 실측, 코드 기준)**: `badges.image_url`을 그리는 서비스
  컴포넌트를 전수 확인한 결과 최대 표시 크기는 `(main)/badges/[id]/BadgeHeroSection.tsx`의
  200px이다. 그 외 `BadgeGridCard`·`BadgeTrophyGridCard` 90px, `(main)/drops/BadgeDetailSheet.tsx`
  176px, `(main)/FeedSection.tsx` 112px·40px, `combine/CombineClient.tsx` 64px,
  `PoiCarouselModal.tsx` 80px, `missions/[id]/MissionDetailClient.tsx` 52px,
  `combine/RecipeRewardRow.tsx` 40px, 지도 마커(`MapView.tsx` `BADGE_MARKER_SIZE`) 24px 모두
  200px보다 작다. 200 × 2 = **400px**. 변환 헬퍼는 `jam-web/src/lib/admin/badgeImageWebp.ts`
  (`BADGE_IMAGE_WEBP_MAX_LONG_SIDE_PX`), sharp `resize({fit: 'inside'})`로 비율을 유지한다.
- 원본 PNG와 WebP 축소본을 모두 저장소에 보관한다: `badges/asset-generator/{badgeId}.png`, `badges/asset-generator/{badgeId}.webp`.
  `image_url`은 WebP를 가리킨다.
- 적용 파일 크기 상한은 기존 공용 함수와 같다(5MB, 원본 PNG 업로드 기준).

## 10. 제작 경로 표시

배지에 제작 경로 값을 기록하고 어드민 배지 목록·상세에 라벨로 보여 준다.

| 값 | 라벨 | 기록 시점 |
|---|---|---|
| `admin-generator` | 수동 제작 | 어드민 적용 탭에서 적용할 때 |
| `agent-generator` | 윤진 자동 | 등록 스크립트가 등록할 때 |
| `jam-img` | 아이콘 파이프라인 | `/jam-img`의 `register-badge-images.js`가 등록할 때(후속: 스크립트에 값 기록 추가) |
| (비움) | 미상 | 기존 배지. 소급 채우기는 열린 질문 |

**적용 탭·등록 스크립트 밖에서 이미지가 바뀌면 제작 경로는 NULL(미상)로 돌아간다.** 배지·미션·
컬렉션·홈피드의 폼 저장 라우트(`PUT /api/admin/badges/[id]`, `PATCH /api/admin/missions/[id]`,
`PUT /api/admin/itembooks/[id]`, `PATCH /api/admin/today/[id]`)는 이미지 컬럼(`image_url`·
`cover_image_url`) 값이 기존 값과 실제로 달라질 때만 `image_source`를 NULL로 갱신한다(판정:
`jam-web/src/lib/admin/imageSourceReset.ts`, null·빈 문자열·앞뒤 공백은 같은 값으로 본다). 이미지를
바꾸지 않고 다른 필드만 저장하면 값이 유지된다. `jam-img` 파이프라인 경로는 이 규칙의 대상이 아니다.

어드민 배지 목록(`/admin/badges`)의 "제작 경로" 필터로 값별로 걸러 볼 수 있고, 목록 행·상세
헤더에 라벨이 보인다(라벨 매핑 단일 출처: `jam-web/src/lib/admin/contentImageSource.ts`, 티켓
20260925_1407에서 미션까지 공용으로 일반화됐다).

## 11. 시드와 재현

리본 레이어의 랜덤 속성은 하나의 시드(마스터 시드)에서 결정적으로 뽑는다. 같은 프리셋·같은 색·같은 텍스트·같은
시드면 두 경로 모두 같은 이미지가 나온다. 시드는 등록 묶음과 등록 기록에 남긴다.

**마스터 시드 규칙(`deriveRibbonFromSeed`, `jam-web/src/lib/asset-generator/random.ts`, 티켓 20260924_2201)**:
`mulberry32(마스터 시드)`로 만든 난수원을 그대로 `randomizeRibbonConfig`에 넘겨, 리본 랜덤 속성 전부(배경색·끝색
포함)와 곡선 시드(반환값의 `seed` 필드, `buildPath`가 쓰는 값)를 한 시드에서 뽑는다 — 순수 함수라 같은 마스터
시드는 항상 같은 값을 낸다. 배경색·끝색·텍스트 내용은 이 함수의 대상이 아니다(호출자가 별도 입력으로 받는다, §8).

- **에이전트 CLI**: `--seed`가 없으면 마스터 시드를 새로 뽑아 이 함수로 리본 속성을 채우고, 있으면 그대로 쓴다.
- **어드민 화면**: "전체 무작위" 버튼은 마스터 시드를 새로 뽑아 이 함수로 채운다(원천 그래픽의 브랜드 글자 선택은
  이 함수의 대상이 아니라 별도 랜덤이다). 설정 패널의 "이동 곡선" 섹션에 현재 마스터 시드 표시 + 시드 입력·
  "시드 불러오기" 버튼이 있어, CLI와 같은 시드를 넣으면 같은 리본이 나온다. 곡선 섹션의 기존 "무작위" 버튼(곡선 시드만
  다시 뽑는다)은 이 마스터 시드와 별개로 남아 있다 — 이 버튼을 쓰면 화면에 표시된 마스터 시드와 실제 리본이
  어긋날 수 있다(마스터 시드 표시는 마지막으로 "전체 무작위"·"시드 불러오기"를 실행한 시점 기준이다).

## 12. 데이터 (`asset_presets`는 확정 — 티켓 20260924_2159, `badges.image_source`는 확정 — 티켓 20260924_2200, 실행은 사용자 승인 뒤 메인 세션)

- `asset_presets`(마이그레이션 `185_asset_presets.sql`): `id`(uuid), `name`(text), `target_type`(text, CHECK
  `badge` 하나만), `stage_ratio`(text, CHECK `1:1`·`4:5`·`9:16`), `layers`(jsonb — 오버레이 레이어(이미지·텍스트)
  목록과 순서만 담는다. 리본 레이어·텍스트 글자 내용은 담지 않는다, §5), `created_by`(uuid, FK 없음 — 운영 편의
  데이터), `created_at`·`updated_at`. RLS 활성화·정책 없음(service_role 전용, 어드민 API가 `getAdminUser()`로
  이미 어드민만 통과시킨다). 이미지 레이어의 원본 파일은 `images` 버킷의
  `asset-generator/presets/{presetId}/{layerId}.{png|svg}` 경로에 함께 올라간다(직렬화·역직렬화 순수 함수는
  `jam-web/src/lib/asset-generator/presetSerialize.ts`).
- `badges.image_source`(text NULL, 마이그레이션 `186_badges_image_source.sql`): §10의 값. CHECK 제약
  `badges_image_source_check`로 `admin-generator`·`agent-generator`·`jam-img` 3종만 허용, 기존 행은
  전부 NULL(미상) — CHECK가 NULL은 통과시키므로 별도 백필 없는 순수 확장(expand) 마이그레이션이다.
- 마이그레이션은 파일 작성까지 하위 티켓에서 하고, 실행은 사용자 승인 뒤 메인 세션이 한다.

## 13. 하지 않을 것 (1차)

- ~~미션·컬렉션·홈피드(`today_cards`) 프리셋과 적용~~ **2026-09-25 2차 착수** — 상위 티켓
  [20260925_1404](../../../tickets/p2-normal/20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)
  참고
- 배지 배경(`background_color`·`background_shader_id`·`background_image_url`·`background_video_url`) 적용
- 영상(MP4)의 서버 생성 (어드민 화면에서만 저장)
- ~~`shader-lab` 코드 수정~~ **2026-09-25 제거 결정** — 티켓
  [20260925_1416](../../../tickets/p2-normal/20260925_1416_Admin_어드민-쉐이더랩-트라이브컬렉션-배경일괄적용-제거.md)
  참고(수정이 아니라 삭제이므로 이 항목과 모순되지 않는다)
- 프리셋 없이 색만 지정하는 완전 랜덤 CLI 모드 (열린 질문)

## 14. 관련 문서

- 1차 상위 티켓: [20260924_2154](../../../tickets/p2-normal/20260924_2154_Feature_배지-대표이미지-제작도구-확장-JAM-에셋-제너레이터-1단계-상위.md)
- 2차 상위 티켓: [20260925_1404](../../../tickets/p2-normal/20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)
  (미션·컬렉션·홈피드 확장 + 윤진 신규 기획 자동 경로)
- 선행 참조: 홈피드 자동화 [20260923_2252](../../../tickets/p2-normal/20260923_2252_Feature_홈피드-배지-미션-운영-자동화-파이프라인-1단계-상위.md)
  (컨펌→등록 흐름, 등록 기록·되돌림 SQL), 어드민 목록 공통화 [20260924_0916](../../../tickets/p2-normal/20260924_0916_Admin_어드민-목록-테이블-공통화.md)
- 등록 묶음 형식·등록 스크립트: [REGISTRATION_BUNDLE.md](REGISTRATION_BUNDLE.md)(배지),
  [MISSION_REGISTRATION_BUNDLE.md](MISSION_REGISTRATION_BUNDLE.md)(미션),
  [HOME_FEED_REGISTRATION_BUNDLE.md](HOME_FEED_REGISTRATION_BUNDLE.md)(홈피드 카드)
- 어드민 PRD: [admin-ui/ADMIN_PRD.md](../admin-ui/ADMIN_PRD.md)
- 배지 아이콘 파이프라인: `.claude/skills/jam-img/SKILL.md`

## 15. 구현 상태 (2026-09-25 기준)

- [20260924_2155](../../../tickets/p2-normal/20260924_2155_Infra_에셋-제너레이터-공용-모듈-분리-곡선-스탬프-색-레이어합성.md) 완료: 그리기 로직을 `jam-web/src/lib/asset-generator/`
  (types·random·curve·render)로 분리했다. 프로토타입은 이 모듈을 번들링한
  `jam-doc/assets/prototypes/20260924_jam-asset-generator.core.js`를 그대로 불러와 쓴다(재생성:
  `node jam-web/scripts/asset-generator/build-prototype.mjs`). 서버 렌더링(캔버스 라이브러리 실제
  구현체)은 아직 없다 — render.ts는 캔버스 팩토리·이미지 로더 인터페이스만 둔다(하위 티켓 2201).
- [20260924_2156](../../../tickets/p2-normal/20260924_2156_Admin_에셋-제너레이터-어드민-디자인-화면-신설-기본기능-이식.md) 완료:
  어드민 "디자인" 묶음에 `/admin/asset-generator` 화면을 신설했다(`jam-web/src/app/admin/asset-generator/`).
  §3·§4.1의 리본 레이어 속성 전부(원천 그래픽·스테이지 비율·이미지·그라데이션·이동 곡선)를
  같은 범위·기본값으로 조절할 수 있고, 전체 무작위·재생/정지·머리 위치·PNG 저장·영상 저장을
  지원한다. 프리셋(§5)·적용 탭(§7)·이미지/텍스트 레이어(§4.2·§4.3)는 아직 없다(하위 티켓
  2159·2200).
- [20260924_2157](../../../tickets/p2-normal/20260924_2157_Admin_에셋-제너레이터-이미지-레이어-추가.md) 완료:
  §4.2 이미지 레이어(위치·크기·회전·불투명도, 리본 위 고정)를 구현했다. `render.ts`에
  `drawImageLayer`를 추가하고, 어드민 화면에 레이어 목록(추가·순서·삭제)·속성 패널을 붙였다.
  업로드 원본은 화면 메모리(blob URL)에만 두고 저장소에는 올리지 않는다(하위 티켓 2159).
  레이어 식별은 배열 인덱스가 아니라 id로 추적한다(순서 변경 후에도 선택이 어긋나지 않는다).
  PNG·영상 저장은 이미지 레이어 원본 로드를 기다린 뒤 캡처하고, 원본 다시 올리기·삭제로 안 쓰는
  캐시 항목은 함께 정리한다. 텍스트 레이어(§4.3)·프리셋(§5)·적용 탭(§7)은 아직 없다.
- [20260924_2158](../../../tickets/p2-normal/20260924_2158_Admin_에셋-제너레이터-텍스트-레이어-추가-구글폰트.md) 완료:
  §4.3 텍스트 레이어(글꼴·크기·자간·행간·정렬·색·위치·회전·불투명도, 여러 줄 허용)를 구현했다.
  `render.ts`에 `drawTextLayer`를 추가했고(자간은 `measureText` 기반 글자 단위 배치), 어드민
  화면의 이미지 레이어 목록을 `overlayLayers`(이미지·텍스트 혼합, 순서 있는 목록)로 확장해 두
  종류를 함께 관리한다(`moveImageLayer`·`removeImageLayer`는 id 기반 제네릭으로 넓혔다). 구글
  폰트 선택은 `googleFonts.ts`(20260916_2001)의 검색·로드·대기 함수를 재사용하되
  `shader-lab`과는 별도로 캔버스 `ctx.font`에 맞춘 검색 콤보박스(`TextLayerFields.tsx`)를 새로
  만들었다(`shader-lab` 파일·`googleFonts.ts`는 수정하지 않았다). PNG·영상 저장은 이미지 원본
  로드에 더해 폰트 다운로드 완료까지 기다린 뒤 캡처한다. 프리셋(§5)·적용 탭(§7)은 아직 없다.
- [20260924_2159](../../../tickets/p2-normal/20260924_2159_Admin_에셋-제너레이터-프리셋-저장-불러오기.md) 완료:
  §5 프리셋 저장·불러오기·삭제를 구현했다. 마이그레이션은 파일만 작성했다(`185_asset_presets.sql`, 실행은
  사용자 승인 뒤 메인 세션). 어드민 API(`/api/admin/asset-generator/presets`, `.../[id]`)가 목록·저장(신규/
  덮어쓰기)·상세·삭제를 맡고, 이미지 레이어 원본은 `images` 버킷에 함께 올린다(삭제 시 폴더째 정리). 화면은
  설정 패널 Accordion 맨 위 "프리셋" 섹션(`PresetPanel.tsx`)이고, 덮어쓰기·삭제는 `AlertDialog`로 확인한다.
  직렬화·역직렬화는 `presetSerialize.ts`의 순수 함수로 뺐다. 적용 탭(§7)은 아직 없다.
- [20260924_2200](../../../tickets/p2-normal/20260924_2200_Admin_에셋-제너레이터-배지-적용-제작경로-표시-출력규격-최적화.md) 완료:
  §7 적용 탭·§9 출력 규격·§10 제작 경로 표시를 구현했다. 마이그레이션은 파일만 작성했다
  (`186_badges_image_source.sql`, 실행은 사용자 승인 뒤 메인 세션). 어드민 화면은 오른쪽 패널을
  shadcn Tabs로 "제작"/"적용" 두 화면으로 나누고(`page.tsx`), 왼쪽 스테이지 캔버스는 탭과
  무관하게 공유한다(`ApplyTab.tsx`). 배지 검색·선택은 기존 `BadgeSearchSelect`를 재사용했다.
  적용 API(`/api/admin/asset-generator/apply`)는 원본 PNG를 `badges/asset-generator/{id}.png`에
  보관하고 sharp(`lib/admin/badgeImageWebp.ts`)로 긴 변 400px WebP를 만들어
  `badges/asset-generator/{id}.webp`에 저장한 뒤, `image_url`을 WebP로, `image_source`를
  `admin-generator`로 갱신한다. 라벨·필터 옵션은 `lib/admin/contentImageSource.ts`(티켓
  20260925_1407에서 `badgeImageSource.ts`를 미션까지 공용으로 일반화)가 단일 출처이고, 어드민
  배지 목록(`BadgesTable.tsx`·`BadgeCard.tsx`)·필터(`BadgesFilterBar.tsx`)·상세 헤더
  (`BadgeDetail.tsx`)·수정 폼 헤더(`BadgeForm.tsx`)가 이를 공유한다.
- [20260924_2201](../../../tickets/p2-normal/20260924_2201_Infra_에셋-제너레이터-에이전트-CLI-프리셋-컬러-텍스트-PNG-시드기록.md) 완료:
  §8 자동 경로 CLI·§11 마스터 시드 규칙을 구현했다. 서버 캔버스 라이브러리 `@napi-rs/canvas`(2026-09-25 사용자
  승인)를 `jam-web/scripts/asset-generator/serverCanvas.ts`가 `render.ts`의 CanvasFactory·ImageLoader 인터페이스로
  구현하고(경계 캐스트 2개, 브라우저 쪽과 같은 방식), `fonts.mjs`가 구글 폰트 TTF를 내려받아 캐시·등록한다.
  `random.ts`의 `deriveRibbonFromSeed`가 마스터 시드 규칙의 단일 출처이고, 어드민 "전체 무작위"·새 "시드 불러오기"
  UI(`AssetGeneratorPanel.tsx` "이동 곡선" 섹션)도 이를 함께 쓴다. CLI(`render.mjs`)는 `tsx`로 실행한다(esbuild
  사전 번들 대신 — 이유는 `render.mjs` 상단 주석). 비교 스크립트 `compare.mjs`(sharp 사용)는 카리나 실렌더에서
  어드민 PNG와 CLI PNG를 비교하는 데 쓴다. `jam-web/package.json`에 `@napi-rs/canvas`를 추가했다(사전 빌드
  바이너리, 네이티브 빌드 불필요). 격리 워크트리에는 DB가 없어 실제 프리셋 조회·어드민 PNG 비교(완료 조건의
  실렌더 비교)는 카리나가 머지 뒤에 한다.
- [20260924_2202](../../../tickets/p2-normal/20260924_2202_Infra_배지-등록묶음-포맷과-등록-스크립트.md) 구현(스크립트 작성까지, 실제
  등록은 사용자 컨펌 뒤 메인 세션): §8 등록 묶음 형식과 등록 스크립트를 만들었다. 형식 정본은 `REGISTRATION_BUNDLE.md`(JSON 한 벌,
  필드 표·예시·실행 절차·되돌림). `register-badge.mjs`(`tsx`, cwd는 `jam-web`)가 묶음 검증 → 이미지 업로드(원본 PNG + WebP) →
  배지 행 insert → 등록 기록·되돌림 SQL 생성을 맡고, `--dry-run`은 어떤 것도 쓰지 않으며, `--undo`는 파일 2개와 배지 행을 지운다.
  어드민 배지 생성 API의 검증 함수(`findRarityLevelError`·`isValidFamilyKey`·`findBadgeConditionSaveError`)를 그대로 재사용해
  규칙이 갈라지지 않게 했고, 어드민 API의 insertPayload 키 목록과 어긋나면 테스트가 실패한다. 예시 묶음은
  `jam-web/scripts/asset-generator/__fixtures__/example-bundle/`에 있다. 격리 워크트리에서는 서비스 키가 없어 단위 테스트의 스텁
  클라이언트로 순서·실패 처리를 확인했고, 실제 등록·되돌림은 머지 뒤 메인 폴더에서 시험 배지 1건으로 확인했다(2026-09-25, 아래).
  작성자·배지 이름의 줄바꿈·제어 문자는 검증에서 거절하고 SQL 기록 주석에서도 한 줄로 정리한다(게이트 보안 지적, 카리나 패치).
- **등록 스크립트 실제 실행 확인(2026-09-25, 시험 배지 1건, 실행 뒤 되돌림)**: 키가 있는 환경의 `--dry-run`은 DB 읽기 검사(이름 중복)까지 통과했다.
  실제 등록으로 `badges` 행(`image_source = 'agent-generator'`), 저장소 원본 PNG(입력 파일과 같은 바이트, 1280×1280)와 WebP(400×400)가 생기고
  공개 URL이 서빙됐으며, 어드민 배지 목록의 "윤진 자동" 칩·제작 경로 필터·상세 헤더 라벨이 보였다. `--undo`는 참조 검사(없음) 뒤 배지 행과
  파일 2개를 지웠고 배지 수·저장소가 시험 전과 같았다. 시험 배지는 유효 시작일을 2099년으로 두어 배지 엔진의 평가 대상에서 뺐다.
- [20260925_1412](../../../tickets/p2-normal/20260925_1412_Infra_미션-등록묶음-포맷과-등록스크립트.md) 구현(스크립트 작성까지, 실제
  등록은 사용자 컨펌 뒤 메인 세션): §8 미션 등록 묶음 형식과 등록 스크립트를 만들었다. 형식 정본은
  `MISSION_REGISTRATION_BUNDLE.md`이고 `register-mission.mjs`(`tsx`, cwd는 `jam-web`)가 묶음 검증 → 이미지 업로드(원본 PNG + WebP) →
  미션 행 insert → 등록 기록·되돌림 SQL 생성을 맡는다. 배지 등록 스크립트 5개 파일은 수정하지 않고 부품(인자 파싱·묶음 파일 읽기·UUID
  형식·기록 파일 쓰기·시각 표기)만 import했으며, 미션 전용 부분은 `registerMission{Bundle,Flow,Record}.mjs`에 새로 썼다. 되돌림 전
  사용자 데이터 검사 대상 6곳은 생성 타입의 외래 키에서 뽑았고 테스트가 타입과 대조한다. 예시 묶음은
  `jam-web/scripts/asset-generator/__fixtures__/example-mission-bundle/`에 있다. 실제 등록·되돌림 확인은 머지 뒤 메인 세션이 숨김
  시험 미션 1건으로 한다(미완).
- [20260925_1413](../../../tickets/p2-normal/20260925_1413_Infra_홈피드-등록묶음-포맷과-등록스크립트.md) 구현(스크립트 작성까지, 실제
  등록은 사용자 컨펌 뒤 메인 세션): §8 홈피드 카드 등록 묶음 형식과 등록 스크립트를 만들었다. 형식 정본은
  `HOME_FEED_REGISTRATION_BUNDLE.md`이고 `register-home-feed-card.mjs`(`tsx`, cwd는 `jam-web`)가 묶음 검증 → 이미지 업로드(원본 PNG + WebP) →
  `today_cards` 행 insert → 등록 기록·되돌림 SQL 생성을 맡는다. 배지·미션 등록 스크립트 9개 파일은 수정하지 않고 부품만 import했으며 홈피드 전용
  부분은 `registerHomeFeed{Bundle,Flow,Record}.mjs`에 새로 썼다. 검증 규칙의 원천은 어드민 폼·`today-sections.ts` 상수·DB CHECK이고(생성 API에는
  검증이 없다), 허용값 목록이 DB CHECK 마이그레이션과 갈라지지 않는지 테스트가 대조한다. 되돌림 전 검사 대상은 생성 타입의 외래 키(`today_card_events.card_id`
  하나)에서 뽑았고 테스트가 타입과 대조한다. 예시 묶음은 `jam-web/scripts/asset-generator/__fixtures__/example-home-feed-bundle/`에 있다. 실제 등록·되돌림
  확인은 머지 뒤 메인 세션이 비활성·2099년 시험 카드 1건으로 한다(미완).
- 그 외는 미착수. 하위 티켓 순서는 상위 티켓의 하위 티켓 표를 따른다.
- **상위 티켓 후속 범위 완료(2026-09-25, 카리나)**: 상위 티켓의 성공 기준 1~6을 staging(DB는 프로덕션
  공용)에서 실제 배지로 확인했다. 새 실렌더 대신 하위 티켓 완료 시점에 이미 수행한 실제 배지 검증을
  기준별로 대조했다 — 기준 1(프리셋 저장, 이미지+텍스트 레이어)·2 일부(프리셋 불러오기 왕복)는
  2159, 2 나머지(검색·필터·미리보기·적용)는 2200, 3(자동 경로 전체: CLI→등록 묶음→등록 스크립트)은
  2202, 4(원본 보관+WebP 축소본)는 2200, 5(제작 경로 라벨 "수동 제작"·"윤진 자동")는 2200·2202,
  6(같은 시드 재현, PNG 바이트 동일)은 2201에서 각각 실제 DB·저장소에 쓰고 되돌리는 방식으로
  확인됐다(각 티켓 완료 기록의 "카리나 로컬/실제 실행 확인" 참고). 마이그레이션 185·186은 2026-09-25
  jam-prod(`ceehnkzdbecxwzxrhhns`)에 적용된 상태를 재확인했다.
