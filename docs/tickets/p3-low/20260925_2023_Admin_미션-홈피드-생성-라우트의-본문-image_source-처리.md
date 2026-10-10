---
id: "20260925_2023"
category: Admin
priority: P3
status: CLOSED
created: 2026-09-25
closed: 2026-09-25
related:
  - "20260925_2003"
---

# [Admin] 미션·홈피드 생성(POST) 라우트가 본문의 image_source를 그대로 저장한다

> 티켓 [20260925_2003](20260925_2003_Admin_이미지-저장-라우트-4종의-본문-image_source-처리-불일치.md)
> 게이트(민지)의 범위 밖 발견물이다. 2003은 수정(PUT·PATCH) 라우트 4종만 다뤘다.

## 핵심 요약

- 요구사항: 미션·홈피드 생성 라우트도 수정 라우트(2003)와 같이 본문의 `image_source`를 무시한다.
- 구현 계획: 두 라우트에서 본문의 `image_source`를 지운 사본으로 insert하고 테스트로 고정한다.
- 관련 파일: `jam-web/src/app/api/admin/missions/route.ts`(POST, 59행 `.insert(body)`),
  `jam-web/src/app/api/admin/today/route.ts`(POST, 27행 `{ ...body, created_by }`, 30행 insert),
  `jam-web/src/app/api/admin/__tests__/image-source-reset.test.ts`.

## 배경 / 문제 정의

### 사실 (2026-09-25 병합 후 코드를 읽어 확인한 결과)

- 미션 POST는 `.insert(body)`로 **본문 전체**를 넣는다. 홈피드 POST는 `{ ...body, created_by }`를
  insert한다. 둘 다 본문에 `image_source`가 있으면 그 값이 저장된다.
- 배지 POST(`badges/route.ts`, `insertPayload` 92행)와 컬렉션 POST(`itembooks/route.ts`,
  `insertPayload` 27행)는 필드를 명시해 만들고, 두 파일 모두 `image_source`를 다루지 않으므로 본문
  값은 무시된다.
- 어드민 폼은 `image_source`를 본문에 싣지 않는다. 그래서 이 문제는 폼이 아닌 직접 호출에서만
  드러난다.
- 2003에서 수정 라우트 4종은 본문의 `image_source`를 모두 무시하도록 통일했다(방침 A).

### 왜 문제인가 (판단)

2003으로 「제작 경로는 적용 탭·등록 스크립트·이미지 변경 초기화로만 바뀐다」는 규칙이 수정 라우트에서
성립하지만, 생성 라우트 두 곳이 열려 있어 규칙에 구멍이 남는다. CHECK 제약에 어긋나는 값은 DB가
거부하지만, 허용값(`admin-generator`·`agent-generator`)은 그대로 들어간다.

## 결정 필요

- **A. 두 라우트에서 본문의 `image_source`를 무시한다**(2003과 같은 방침). 추천이다. 규칙이 수정과
  생성에서 같아지고 변경이 작다. 생성 시점의 이미지 제작 경로는 NULL(미상)로 시작하고, 적용 탭이나
  등록 스크립트가 이후에 값을 채운다.
- **B. 생성 때만 허용값 검증을 거쳐 본문 값을 받는다.** 어드민에서 만든 새 카드에 처음부터 경로를
  적어야 할 때만 맞다. 현재 그런 화면은 없다.

## 결정 기록

- **2026-09-25 사용자가 방침 A(두 라우트에서 본문의 `image_source`를 무시한다)를 결정했다.** 2003과 같은 방침이다.

## 구현 계획 (방침 A 확정)

접근: 미션 POST와 홈피드 POST가 본문을 그대로 insert하는 자리에서 `image_source`만 걸러낸다. 생성 시점의 제작 경로는 NULL(미상)로
시작하고, 적용 탭·등록 스크립트가 이후에 값을 채운다. 이미지 컬럼(`image_url`·`cover_image_url`)은 본문 값을 그대로 받는다(기존 동작).

파일 단위 지도(예상 3개 파일, 40줄 안팎 — 임계값 5개/100줄 미만이라 계획 반환 면제 불필요):
1. `jam-web/src/app/api/admin/missions/route.ts`(POST, 59행 근방 `.insert(body)`): 검증(`checkMissionCondition` 등)은 기존 `body`로 그대로 하고,
   insert에는 `image_source`를 지운 사본을 쓴다(2003이 `missions/[id]/route.ts`에서 쓴 방식과 같게, 미사용 변수 lint를 피하려고 구조분해 대신 `delete`).
2. `jam-web/src/app/api/admin/today/route.ts`(POST, 27행 `{ ...body, created_by }`): 본문 사본에서 `image_source`를 지운 뒤 `created_by`를 붙인다.
3. `jam-web/src/app/api/admin/__tests__/image-source-reset.test.ts`(기존 파일): 생성 라우트 테스트를 추가한다 — 미션·홈피드 POST에 `image_source`를
   실어 보내도 insert 페이로드에 들어가지 않고, 다른 필드와 `created_by`는 그대로임을 고정한다. 배지·컬렉션 POST(필드를 명시해 만드는 라우트)가
   본문의 `image_source`를 무시하는 것도 고정한다. 라우트 테스트 구성이 너무 무거워 어렵다면 그 사유와 함께 가능한 범위(예: 컬렉션)만 하고 보고한다.


## 완료 조건

- 미션·홈피드 POST에 본문으로 `image_source`를 실어 보내도 insert 페이로드에 들어가지 않는다.
- 배지·컬렉션 POST가 본문의 `image_source`를 무시하는 것이 테스트로 고정되어 있다.
- 기존 생성 동작(다른 필드, `created_by`)이 그대로다.
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약
- 사용자가 방침 A를 결정했다(2026-09-25): 미션·홈피드 생성(POST) 라우트도 본문의 `image_source`를 무시한다. 2003의 수정 라우트와 같은 방식이다.
- 미션 POST는 검증 3종(`checkMissionCondition`·`checkMissionConditionValue`·`findGateMissionSaveError`)을 원래 `body`로 먼저 돌리고, insert에만 `image_source`를 `delete`한 사본을 쓴다.
  홈피드 POST는 사본에 `created_by`를 붙인다. 이미지 컬럼과 다른 필드는 기존 동작 그대로다. 이제 배지·컬렉션·미션·홈피드의 생성·수정 라우트 **8종 모두**가 본문의 `image_source`를 무시하고,
  생성 시점의 제작 경로는 NULL(미상)로 시작한다.
- 배지·컬렉션 POST는 필드를 명시해 만드는 라우트라 코드 변경 없이 이미 무시했고 테스트로 고정했다.
- 게이트가 지적한 문서 반영을 카리나가 직접 패치했다: PRD §10의 「생성(POST) 라우트는 배지·컬렉션만 무시하고 미션·홈피드는 본문을 그대로 저장한다(정리 대기, 티켓 2023)」와 §15의 「수정 라우트 4종」 문장을
  「생성·수정 라우트 8종」으로 정정했다.

### 변경된 파일
```
수정: jam-web/src/app/api/admin/missions/route.ts, jam-web/src/app/api/admin/today/route.ts,
     jam-web/src/app/api/admin/__tests__/image-source-reset.test.ts, docs/service/prd/asset-generator/PRD.md(§10·§15)
```

### 테스트 결과
- [x] `scripts/verify.sh` 전항목 통과. CI(`verify`) 성공: https://github.com/standardmanual/jam/actions/runs/36144089037 (구현 커밋), PRD 정정 커밋도 success.
- [x] `image-source-reset.test.ts`에 생성 라우트 5건 추가(배지·컬렉션은 insert 페이로드에 `image_source` 없음, 미션 2건·홈피드 1건은 `toEqual`로 다른 필드와 `created_by` 고정). 파일 27건 통과.
  병합 후 `src/lib/admin`·`src/app/api/admin` 66개 파일 823건 통과. 수정 전 코드에서 실패하는지의 역검증은 실행하지 못했다(아현 보고, `toEqual` 구조상 실패하는 것이 맞다는 판단).
- [x] 게이트(민지): 1차 **FAIL**(점검 11 문서 반영), 카리나 패치 뒤 재판정 **PASS**.
- 실렌더는 생략했다(사용자 승인, 2026-09-25). 폼이 보내지 않는 값을 직접 호출로 보내는 경우의 동작이라 화면으로 재현되지 않고 라우트 테스트로 고정되어 있다.

### 배포 정보
- 배포일: (main 배포 전, staging 반영은 2026-09-25)
- 환경: staging
- 커밋: 병합 커밋 19d72b75 (구현 b1869928, PRD 정정 73272911)
- DB 마이그레이션: 없음.

### 실행 지표

| 실행 | 에이전트 | 전체 토큰 | 출력 토큰(아현 / 게이트) | 소요 | 도구 호출 |
|---|---|---|---|---|---|
| 1차 | 아현·민지 | 86,055 | 18,014 / 18,148 | 8분 50초 | 37 |
| 재판정(카리나 문서 패치 뒤) | 민지 | 28,951 | 0 / 3,202 | 38초 | 5 |
| 합계 | 아현·민지 | 115,006 | 18,014 / 21,350 | 9분 28초 | 42 |

### 주요 의사결정 / 핵심 메모
- **재작업 1회의 원인은 카리나의 누락이다.** PRD §10에 「정리 대기, 티켓 20260925_2023」이라고 예고 문장을 써 두었는데, 그 정리 티켓의 구현 계획에 「관련 문서」로 넣지 않아 아현이 문서를 고치지 않았다.
  앞으로 후속 티켓의 계획을 쓸 때는 문서에 남긴 예고 문장을 그 티켓의 관련 문서로 함께 적는다.
- 병합 전 오염 검사가 「실패」로 나왔으나 원인은 `staging`이 브랜치 분기점보다 앞선 것(카리나가 push한 2105 계획 문서 1건)이었다. 브랜치 고유 커밋은 2건뿐이고 겹치는 파일이 없어 일반 3-way 병합으로 처리했다(1409 선례와 같음).
- 계획 반환 면제는 필요하지 않았다(3개 파일, 77줄).

### 잔여 이슈
- [참고] 미션·홈피드 POST는 `image_source` 외의 본문을 화이트리스트 없이 그대로 insert한다(민지 사이드 발견, 이번 범위 밖의 기존 동작). 새 티켓은 만들지 않았다. 필요해지면 필드 검증 강화로 별도 다룬다.
