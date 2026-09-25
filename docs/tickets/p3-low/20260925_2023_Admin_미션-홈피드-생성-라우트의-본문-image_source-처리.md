---
id: "20260925_2023"
category: Admin
priority: P3
status: OPEN
created: 2026-09-25
closed:
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

## 완료 조건

- 미션·홈피드 POST에 본문으로 `image_source`를 실어 보내도 insert 페이로드에 들어가지 않는다.
- 배지·컬렉션 POST가 본문의 `image_source`를 무시하는 것이 테스트로 고정되어 있다.
- 기존 생성 동작(다른 필드, `created_by`)이 그대로다.
- `scripts/verify.sh` 통과.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 변경된 파일
```
-
```

### 테스트 결과
- [ ]

### 배포 정보
- 배포일:
- 환경: production
- 커밋:

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
