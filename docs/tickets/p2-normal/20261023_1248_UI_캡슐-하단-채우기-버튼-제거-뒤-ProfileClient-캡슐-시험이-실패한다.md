---
id: "20261023_1248"
category: UI
priority: P2
status: OPEN
created: 2026-10-23
---

# [UI] 캡슐 하단 «채우기» 버튼 제거 뒤 ProfileClient 캡슐 시험이 실패한다

## 핵심 요약

- 요구사항: 커밋 `260ee2344`(캡슐 하단 채우기 버튼 제거)가 알약의 «채우기» 문구를 없앴는데, 그 문구를 단언하는 `ProfileClient.capsule.test.tsx` 한 건이 고쳐지지 않아 staging에서 실패한다. 시험의 기대를 새 알약 모양에 맞춘다.
- 구현 계획: 시험의 61행 `expect(html).toContain(d.capsule.pill.filling)`을 지금 알약이 실제로 그리는 문구나 표시로 바꾼다. 알약이 지금 무엇을 그리는지 `CapsulePill.tsx`와 `RadialCapsule.tsx`를 읽고 정한다(문구를 되살리는 것이 의도였는지는 같은 커밋 작성자의 의도를 확인한다).
- 관련 파일: `jam-web/src/app/(main)/profile/ProfileClient.capsule.test.tsx`(61행), 원인 커밋 `260ee2344`가 고친 `jam-web/src/components/capsule/CapsulePill.tsx`·`RadialCapsule.tsx`와 그 시험, 문구 상수 `d.capsule.pill.filling`(`jam-web/src/lib/i18n/ko.ts`)

## 배경 / 문제 정의

티켓 `20261022_2119`(7-7a) 1회·2회·3회 머지 시험과 게이트에서 발견했다. 이 시험은 7-7a가 건드린 파일과 무관하게 기준 커밋(`76a245d9d`, `adeb610c8`)에서도 같은 단언(61행)으로 실패한다. 실패 문구는 `내 프로필 + 서버 초기값이 있으면 알약이 보인다`다. 커밋 `260ee2344`는 `CapsulePill.test.tsx`·`CapsuleWidget.test.tsx`·`RadialCapsule.test.tsx`는 함께 고쳤지만 `ProfileClient.capsule.test.tsx`는 고치지 않았다. 이 시험 하나 때문에 GitHub `verify`의 `test` 단계가 모든 `claude/*` 브랜치에서 빨갛다(다른 기존 실패는 티켓 `20261022_2248` 소관이다).

처음에 7-7a 기록에서 이 시험이 티켓 `20261019_1317`에 기록돼 있다고 적었으나, 그 티켓은 구현 계획에서 파일 이름을 언급할 뿐 이 실패를 맡고 있지 않다. 그 기록은 바로잡았다.

## 상세 요구사항

### 서비스/코드베이스 관점

- 시험이 «알약이 보인다»는 사실을 새 모양에 맞게 단언하도록 고친다. 접근성 이름(`aria-label`, `d.capsule.aria.filling`)을 단언하는 위쪽 줄은 지금도 통과하는지 확인한다.
- 문구 상수 `d.capsule.pill.filling`이 더 이상 어디에서도 쓰이지 않으면 상수를 지울지 같은 커밋 작성자와 정한다(이 티켓 범위에서는 시험만 고친다).

## 구현 계획

한 파일, 한두 줄이다. `CapsulePill.tsx`가 그리는 문자열을 읽고 시험의 기대를 맞춘 뒤 이 시험 파일 하나를 돌린다.

## 완료 조건

- `jam-web/src/app/(main)/profile/ProfileClient.capsule.test.tsx`가 통과하고, 같은 폴더와 `components/capsule`의 시험이 계속 통과한다.
- 전체 vitest에서 이 시험이 더 이상 실패 목록에 나오지 않는다.

## 진행 기록

- 2026-10-23 13:01 다른 세션이 시험의 기대를 새 알약 모양에 맞춰 고쳤다(커밋 `668d82f7c`, 앱 코드 변경 없음, 커밋 메시지가 이 티켓 번호를 가리킨다). 이 티켓의 시험 파일 한 개를 staging에서 다시 돌려 6건이 모두 통과하는 것을 확인했다(2026-10-23 13:2x). 완료 조건은 충족한 상태이고, 닫는 것은 사용자 승인 뒤에 한다.
- 같은 시각 다른 세션이 같은 실패의 임시 티켓 `20261023_1254`를 만들었다가 작업 폴더에서 치웠고 커밋된 적은 없다. 나는 한때 이 티켓을 그 임시 티켓과 중복이라고 보고 지웠다가, 수정 커밋이 이 번호를 가리키는 것을 보고 다시 살렸다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
