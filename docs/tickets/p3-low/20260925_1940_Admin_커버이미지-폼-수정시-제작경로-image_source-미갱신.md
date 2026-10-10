---
id: "20260925_1940"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
parent: "20260925_1404"
related:
  - "20260925_1411"
---

# [Admin] 커버 이미지를 폼으로 바꿔도 제작 경로(image_source)가 갱신되지 않는다

> 상위 티켓 [20260925_1404](../p2-normal/20260925_1404_Feature_에셋제너레이터-2차-미션컬렉션홈피드확장-윤진신규기획-상위.md)
> 관련 티켓 [20260925_1411](../p2-normal/20260925_1411_Admin_에셋제너레이터-홈피드-적용탭-제작경로표시.md)의
> 게이트(민지) 범위 밖 발견물이다. **결정이 필요한 티켓**이라 「결정 필요」 절을 먼저 확인한다.

## 핵심 요약

- 요구사항: 「제작 경로」 라벨이 실제 이미지 출처와 어긋나지 않게 하려면, 에셋 제너레이터 적용 탭
  밖에서 이미지 컬럼이 바뀔 때 `image_source`를 어떻게 다룰지 정하고 반영한다.
- 구현 계획: 사용자가 아래 「결정 필요」의 방침을 정한 뒤, 방침에 따라 저장 경로(폼·PATCH 라우트)를
  고친다. 결정 전에는 코드를 고치지 않는다.
- 관련 파일: `jam-web/src/app/admin/today/TodayCardForm.tsx`(커버 이미지 입력 462행 근방, 제작
  경로 라벨 475행 근방, 저장 페이로드 236행 근방), `jam-web/src/app/api/admin/today/[id]/route.ts`
  (PATCH), `jam-web/src/app/api/admin/asset-generator/apply/route.ts`(189행, `image_source` 쓰기),
  `jam-web/src/lib/admin/contentImageSource.ts`(라벨·값 어휘).

## 배경 / 문제 정의

### 사실 (2026-09-25 코드를 읽어 확인한 결과)

- 테스트와 타입 파일을 제외한 `jam-web/src` 전체에서 `image_source`를 **쓰는** 코드는
  `api/admin/asset-generator/apply/route.ts` 한 곳뿐이다(`image_source: 'admin-generator'`).
- 홈피드 수정 화면의 커버 이미지 입력은 업로드 필드가 아니라 **텍스트 입력**이고(자유 입력), 저장
  페이로드를 만드는 `buildTodayCardSavePayload` 인자에 `image_source`가 없다.
- `PATCH /api/admin/today/[id]`는 받은 본문을 그대로 `today_cards`에 update한다. 본문에
  `image_source`가 없으면 그 컬럼은 건드리지 않는다.
- 수정 화면은 `card.image_source`를 그대로 읽어 「제작 경로 · {라벨}」로 보여준다.
- 마이그레이션 190 실행 직후 `today_cards.image_source`는 전부 NULL이다(non_null_rows=0).

### 추론 (코드 읽기로 도출했고 실제로 재현하지는 않았다)

- 적용 탭으로 카드 이미지를 반영하면 `image_source='admin-generator'`(라벨 「수동 제작」)가 된다.
  그 뒤 운영자가 수정 화면에서 커버 이미지 URL을 다른 이미지로 바꿔 저장하면 `image_source`는 그대로
  남아, 라벨이 실제와 다른 출처를 가리킨다.
- 같은 구조가 배지·미션·컬렉션에도 있을 수 있다. 이 세 유형의 저장 경로가 이미지 교체 때
  `image_source`를 건드리는지는 **`image_source`를 쓰는 코드가 한 곳뿐이라는 위 사실로 미루어
  건드리지 않는다고 추정하지만**, 각 폼·API를 열어 확인하지는 않았다.

## 결정 필요

이미지 컬럼이 적용 탭 밖에서 바뀔 때 `image_source`를 어떻게 할지 정해야 한다. 아래는 후보이며
추천은 판단이다.

- **A. NULL로 되돌린다**(라벨 「미상」). 저장 경로(PATCH 등)에서 이미지 컬럼 값이 바뀌었으면
  `image_source`를 NULL로 갱신한다. 마이그레이션이 필요 없고 라벨이 거짓이 되지 않는다. 다만
  「수동 교체」와 「원래 모름」이 같은 「미상」으로 합쳐진다.
- **B. 라벨을 유지하고 정의를 문서화한다.** `image_source`를 「마지막으로 적용 탭·등록 스크립트가
  기록한 경로」로 정의하고 PRD에 적는다. 코드 변경은 없으나 라벨이 현재 이미지와 다를 수 있다.
- **C. 새 값(예: `manual`)을 추가한다.** 「수동 교체」를 구분하지만 배지·미션·컬렉션·홈피드 4개
  테이블의 CHECK 제약 마이그레이션이 필요하다(공용 DB라 즉시 프로덕션에 반영된다).
- 카리나 추천: **A**. 근거는 가장 작은 변경이고 마이그레이션이 필요 없으며 라벨이 거짓이 되지
  않는다는 것이다. 다만 「수동 교체」 구분이 운영에 필요하다면 C가 맞다.

## 결정 기록

- **2026-09-25 사용자가 방침 A(NULL로 되돌린다)를 결정했다.**
- 4개 유형의 이미지 저장 경로 확인 결과(카리나, 코드 읽기):

| 유형 | 저장 라우트 | 이미지 컬럼 처리 방식 | 현재 `image_source` 처리 |
|---|---|---|---|
| 배지 | `api/admin/badges/[id]/route.ts` PUT | 기존 행을 먼저 조회해 `body.image_url ?? existing.image_url`로 병합(76행) | 건드리지 않음 |
| 미션 | `api/admin/missions/[id]/route.ts` PATCH | `.update(body as never)` 본문 통과(86행). 기존 행은 검증 필요할 때만 조회 | 건드리지 않음 |
| 컬렉션 | `api/admin/itembooks/[id]/route.ts` PUT | 기존 행 조회 후 `body.image_url ?? existing.image_url` 병합(34행) | 건드리지 않음 |
| 홈피드 | `api/admin/today/[id]/route.ts` PATCH | `.update(body as never)` 본문 통과(15행) | 건드리지 않음 |

## 구현 계획 (방침 A 확정)

접근: 이미지 컬럼 값이 **실제로 바뀔 때만** `image_source`를 NULL로 갱신한다. 값이 같거나 본문에
이미지 컬럼이 없으면 `image_source`를 건드리지 않는다(폼이 매번 전체 필드를 보내므로 동일 값
비교가 필요하다).

가정(범위 결정, 사용자가 이의를 제기하면 조정):
- 대상은 위 표의 **4개 폼 저장 라우트**다. 이미지 컬럼을 직접 갱신하는 제작 파이프라인
  (`api/admin/activity-badge-image/generate/route.ts` 등 `jam-img` 경로)은 제외한다. 그 경로의
  제작 경로 기록은 티켓 20260925_0352가 다룬다.
- 에셋 제너레이터 적용 탭(`apply/route.ts`)과 등록 스크립트는 이 라우트들을 거치지 않으므로 영향이
  없다.
- 본문에 클라이언트가 `image_source`를 직접 실어 보내는 경우는 이번 범위 밖이다(기존 동작 유지).

파일 단위 지도(예상 10~11개 파일, 임계값 5개/100줄 초과 확실 → `planOnlyWaiver` 부여):
1. 신규 `jam-web/src/lib/admin/imageSourceReset.ts`: 순수 함수 하나. 기존 값과 다음 값을
   받아 이미지가 바뀌었으면 `{ image_source: null }`, 아니면 `{}`를 돌려준다. 다음 값이
   `undefined`면 미변경, `null`·빈 문자열은 같은 값(NULL)으로 정규화해 비교한다.
2. 신규 `jam-web/src/lib/admin/__tests__/imageSourceReset.test.ts`: 미변경·변경·undefined·
   null↔빈 문자열 정규화·공백 케이스.
3. `api/admin/itembooks/[id]/route.ts` PUT(31행 `.update({` 객체): `...imageSourceReset(existing.image_url, body.image_url)` 추가.
4. `api/admin/badges/[id]/route.ts` PUT(67행 `.update({` 객체): 같은 방식으로 추가(76행 근방).
5. `api/admin/missions/[id]/route.ts` PATCH(86행): `body.image_url !== undefined`일 때만 기존
   `image_url`을 조회해 `.update({ ...body, ...imageSourceReset(...) } as never)`로 바꾼다.
6. `api/admin/today/[id]/route.ts` PATCH(15행): `body.cover_image_url !== undefined`일 때만 기존
   `cover_image_url`을 조회해 같은 방식으로 병합한다.
7. 위 4개 라우트의 테스트(기존 테스트 파일이 있으면 거기에 추가, 없으면 신규): 이미지 변경 시
   update 페이로드에 `image_source: null`이 포함되고, 다른 필드만 바꿀 때는 포함되지 않음을
   고정한다. 저장 라우트가 `bulk`류 라우트에서 이미지 컬럼을 바꾸는지도 확인해 결과를 보고한다.
8. `docs/service/prd/asset-generator/PRD.md` §10(제작 경로) 정의에 「적용 탭·등록 스크립트 밖에서
   이미지가 바뀌면 제작 경로는 NULL(미상)로 돌아간다」를 반영한다.

## 완료 조건

### 결정 단계 (담당: 카리나, 시점: 이 티켓 착수 직후) — 완료(위 「결정 기록」)
- 배지·미션·컬렉션·홈피드 4개 유형의 이미지 저장 경로(폼·API)가 이미지 교체 때 `image_source`를
  어떻게 다루는지 확인한 결과와 방침 A/B/C 중 사용자 결정이 완료 기록에 남아 있다.

### 구현 범위 (게이트 판정 대상, 방침 A를 고른 경우의 예)
- 적용 탭으로 `image_source='admin-generator'`가 된 카드에서 커버 이미지 URL을 바꿔 저장하면
  수정 화면의 제작 경로가 「미상」으로 표시된다. 재현 경로: 로컬 개발서버에서 적용 탭 반영 →
  수정 화면에서 URL 변경 저장 → 수정 화면 재진입.
- 이미지를 바꾸지 않고 다른 필드만 저장하면 `image_source`가 유지된다.
- 위 두 동작이 테스트로 고정되어 있다.
- `scripts/verify.sh` 통과.

방침 B를 고르면 구현 범위 대신 PRD에 정의가 문서화되어 있으면 된다. 방침 C를 고르면 마이그레이션
실행 승인 절차(채팅 승인)가 별도로 필요하다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 방침 A(NULL로 되돌린다)를 적용했다. 이미지 컬럼 값이 기존 값과 **실제로 달라질 때만** `image_source`를
  NULL(미상)로 갱신한다. 판정은 순수 함수 `imageSourceReset(기존값, 다음값)`이다. 다음 값이
  `undefined`면 미변경이고, `null`·빈 문자열·공백뿐인 문자열은 같은 값(NULL)으로 정규화하며, 앞뒤
  공백은 무시한다.
- 배지 PUT·컬렉션 PUT은 이미 기존 행을 조회하므로 update 객체에 `...imageSourceReset(...)`만
  추가했다. 미션 PATCH·홈피드 PATCH는 본문에 이미지 필드가 있을 때만 기존 행을 조회해
  `.update({ ...body, ...patch })`로 저장한다(이미지 필드가 없는 요청은 추가 조회 없이 기존 동작).
- `docs/service/prd/asset-generator/PRD.md` §10에 「적용 탭·등록 스크립트 밖에서 이미지가 바뀌면 제작
  경로는 NULL(미상)로 돌아간다」를 반영했다.
- 4개 유형의 bulk 라우트(badges·missions·itembooks·today)는 이미지 컬럼을 바꾸지 않음을 확인했다.
  `apply-background`는 `background_*` 컬럼만, `activity-badge-image/generate`는 `jam-img` 경로라 범위
  밖이다(티켓 20260925_0352가 다룬다).

### 변경된 파일
```
신규: jam-web/src/lib/admin/imageSourceReset.ts,
     jam-web/src/lib/admin/__tests__/imageSourceReset.test.ts,
     jam-web/src/app/api/admin/__tests__/image-source-reset.test.ts
수정: jam-web/src/app/api/admin/{badges,itembooks,missions,today}/[id]/route.ts,
     docs/service/prd/asset-generator/PRD.md
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과. CI(`verify`) 성공:
  https://github.com/standardmanual/jam/actions/runs/36126414054
- [x] 신규 테스트: 판정 함수 단위 6건, 4개 라우트 14건(이미지 변경 시 update 페이로드에
  `image_source: null` 포함, 다른 필드만 바꾸면 미포함, 미션·홈피드는 이미지 없는 요청에서 기존 행
  미조회와 행 없음 404). 병합 후 `src/lib/admin`·`src/app/api/admin` 66개 파일 808건 통과.
- [x] 게이트(민지) PASS.
- [x] **로컬 실렌더(방침 A 승인, 임시 카드 1장)**: 비활성·2099년 날짜의 임시 홈피드 카드를 어드민 API로
  만들고 그 카드만 `image_source='admin-generator'`로 설정한 뒤 실제 수정 화면에서 확인했다.
  1) 저장 전 수정 화면 라벨 「제작 경로 · 수동 제작」
  2) 제목·노출 태그만 바꿔 저장 → 이미지 그대로, `image_source='admin-generator'` 유지
  3) 커버 이미지 URL을 바꿔 저장 → DB의 `image_source`가 NULL
  4) 수정 화면 재진입 → 「제작 경로 · 미상」
  확인 후 임시 카드를 삭제했고, 임시 카드 0건·`image_source` 값이 있는 카드 0건을 조회로 확인했다.
  적용 탭 자체는 스토리지 파일을 올리므로 쓰지 않고, 같은 상태를 임시 카드 한 장에 SQL로 만들었다.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-25)
- 환경: staging
- 커밋: 병합 커밋 2c04f816 (구현 316a50f1)
- DB 마이그레이션: 없음.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 | 116,681 | 52,878 / 3,408 | 10분 13초 | 50 |
| 합계 | 아현·민지 | 116,681 | 52,878 / 3,408 | 10분 13초 | 50 |

### 주요 의사결정 / 핵심 메모
- 사용자가 방침 A를 결정했다(2026-09-25). 이유는 마이그레이션이 필요 없고 라벨이 거짓이 되지
  않는다는 것이다. 「수동 교체」와 「원래 모름」이 「미상」으로 합쳐지는 것을 감수했다. 구분이
  필요해지면 방침 C(`manual` 값 신설)로 확장한다.
- 계획 반환 면제를 처음부터 부여했다(카리나가 4개 저장 라우트를 직접 읽고 파일 단위 지도 작성).
  예상 10~11개 파일이었으나 실제 변경은 8개다(라우트 테스트를 한 파일로 합침).
- 아현의 브랜치명은 한글 슬러그가 셸 검사에 막혀 ASCII 슬러그(`image-source-reset`)로 만들었다.

### 잔여 이슈
- [참고] 미션·홈피드 PATCH는 클라이언트가 본문에 실어 보낸 `image_source`를 이미지가 안 바뀐 요청에서는
  그대로 저장하고, 배지·컬렉션 PUT은 무시한다. 4개 라우트의 동작이 갈리고 CHECK 제약에 어긋나는 값을
  보낼 수도 있다(민지 사이드 발견).
  → 티켓 [20260925_2003](20260925_2003_Admin_이미지-저장-라우트-4종의-본문-image_source-처리-불일치.md)으로 분리했다.
