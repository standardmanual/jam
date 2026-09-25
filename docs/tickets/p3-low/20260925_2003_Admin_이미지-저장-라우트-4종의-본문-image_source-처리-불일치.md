---
id: "20260925_2003"
category: Admin
priority: P3
status: IN_PROGRESS
created: 2026-09-25
closed:
related:
  - "20260925_1940"
---

# [Admin] 이미지 저장 라우트 4종이 본문의 image_source를 서로 다르게 처리한다

> 티켓 [20260925_1940](20260925_1940_Admin_커버이미지-폼-수정시-제작경로-image_source-미갱신.md)
> 게이트(민지)의 범위 밖 발견물이다.

## 핵심 요약

- 요구사항: 배지·컬렉션·미션·홈피드 저장 라우트가 클라이언트 본문에 실려 온 `image_source`를 같은
  규칙으로 다루게 한다.
- 구현 계획: 먼저 「결정 필요」의 방침을 정한 뒤 4개 라우트를 같은 방식으로 맞추고 테스트로 고정한다.
- 관련 파일: `jam-web/src/app/api/admin/missions/[id]/route.ts`(PATCH, 106행 근방
  `.update({ ...body, ...imageSourcePatch } as never)`),
  `jam-web/src/app/api/admin/today/[id]/route.ts`(PATCH, 31행 근방 같은 형태),
  `jam-web/src/app/api/admin/badges/[id]/route.ts`(PUT, 68~79행 명시 필드 병합),
  `jam-web/src/app/api/admin/itembooks/[id]/route.ts`(PUT, 32~37행 명시 필드 병합),
  `jam-web/src/lib/admin/imageSourceReset.ts`.

## 배경 / 문제 정의

### 사실 (2026-09-25 병합 후 코드를 읽어 확인한 결과)

- 미션 PATCH와 홈피드 PATCH는 `.update({ ...body, ...imageSourcePatch } as never)`로 **본문을 그대로**
  통과시킨다. 이미지가 바뀌지 않는 요청이면 `imageSourcePatch`가 비어 있어 본문에 있는 `image_source`
  값이 그대로 저장된다. 이미지가 바뀌는 요청이면 `image_source: null`이 본문 값을 덮는다.
- 배지 PUT과 컬렉션 PUT은 `update({ ... })`에 필드를 명시해서 넣고 `image_source`는
  `imageSourceReset(...)`의 결과만 넣는다. 본문의 `image_source`는 무시된다.
- 4개 테이블의 `image_source` CHECK 제약은 배지가 `admin-generator`·`agent-generator`·`jam-img`,
  미션·컬렉션·홈피드가 `admin-generator`·`agent-generator`다.
- 어드민 폼은 `image_source`를 본문에 싣지 않는다(홈피드 폼의 저장 페이로드 확인). 이 문제는 폼이 아닌
  직접 호출에서만 드러난다.

### 왜 문제인가 (판단)

어드민 전용 라우트라 외부 노출 위험은 낮다. 다만 같은 종류의 저장 라우트인데 `image_source`를 보내면
미션·홈피드에서는 임의 값(CHECK 위반이면 오류)이 들어가고 배지·컬렉션에서는 조용히 무시되어, 규칙을
찾는 사람이 4곳을 모두 읽어야 한다. 제작 경로 기록의 신뢰도도 라우트마다 달라진다.

## 결정 필요

- **A. 본문의 `image_source`를 4개 라우트 모두에서 무시한다.** 제작 경로는 적용 탭·등록 스크립트·
  이미지 변경 초기화로만 바뀐다는 규칙이 단순해진다. 미션·홈피드에서 본문의 `image_source`를 제거하는
  한 줄이 늘어난다.
- **B. 4개 라우트 모두 본문의 `image_source`를 허용하되 허용값 검증을 넣는다.** 수동으로 값을 바로잡는
  용도가 필요할 때 맞다. 검증 로직이 4곳에 생긴다.
- 카리나 추천: **A**. 현재 어드민 화면에는 값을 직접 고치는 입력이 없고, 1940에서 정한 「이미지가
  바뀌면 NULL」과 같은 방향이다.

## 결정 기록

- **2026-09-25 사용자가 방침 A(본문의 `image_source`를 4개 라우트 모두에서 무시한다)를 결정했다.**

## 구현 계획 (방침 A 확정)

접근: 미션·홈피드 PATCH가 본문을 그대로 통과시키는 자리에서 `image_source`만 걸러낸다. 배지·컬렉션
PUT은 필드를 명시해 병합하므로 이미 무시한다(코드 변경 없이 테스트로 고정). 이미지가 바뀌는 요청의
`image_source: null`(1940)과 바뀌지 않는 요청의 기존 동작은 그대로다.

가정(범위 결정, 사용자가 이의를 제기하면 조정):
- 대상은 이 티켓이 이름을 든 **수정 라우트 4종**(배지 PUT·컬렉션 PUT·미션 PATCH·홈피드 PATCH)이다.
  생성(POST) 라우트는 범위 밖이다. 다만 아현은 4개 유형의 POST가 본문의 `image_source`를 어떻게
  다루는지 **확인만 하고 결과를 보고**한다(고치지 않는다). 홈피드 POST(`api/admin/today/route.ts`)는
  본문을 그대로 insert하는 것으로 알고 있으나 코드로 확인하지 않았다.
- 적용 탭(`apply/route.ts`)과 등록 스크립트는 이 라우트들을 거치지 않으므로 영향이 없다.

파일 단위 지도(예상 3개 파일, 30줄 안팎 — 임계값 5개/100줄 미만이라 계획 반환 면제 불필요):
1. `jam-web/src/app/api/admin/missions/[id]/route.ts`(PATCH, 106행 근방): 본문에서 `image_source`를
   제거한 사본을 update에 쓴다. 예: `const { image_source: _ignored, ...safeBody } = body`를 검증
   이후·update 이전에 두고 `.update({ ...safeBody, ...imageSourcePatch } as never)`로 바꾼다.
   미사용 변수 lint 규칙에 걸리지 않는 프로젝트 관례가 있으면 그 방식을 따른다.
2. `jam-web/src/app/api/admin/today/[id]/route.ts`(PATCH, 31행 근방): 같은 방식으로 적용한다.
3. `jam-web/src/app/api/admin/__tests__/image-source-reset.test.ts`(기존 파일, 184줄): 4개 라우트
   각각에 「본문에 `image_source`를 실어도 update 페이로드에 본문 값이 들어가지 않는다」를 추가한다.
   이미지가 안 바뀌는 요청(미포함)과 바뀌는 요청(`image_source: null`이 본문 값을 대체) 두 경우를
   미션·홈피드에서, 배지·컬렉션에서는 이미지가 안 바뀌는 요청에서 고정한다.

## 완료 조건

- 결정한 방침이 완료 기록에 남아 있다.
- 4개 라우트에서 본문에 `image_source`를 실어 보냈을 때의 동작이 같고, 테스트로 고정되어 있다.
- 이미지가 바뀌는 요청과 바뀌지 않는 요청의 기존 동작(1940)이 그대로다.
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
