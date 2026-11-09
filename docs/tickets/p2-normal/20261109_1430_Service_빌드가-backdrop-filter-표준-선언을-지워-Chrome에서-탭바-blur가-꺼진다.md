---
id: "20261109_1430"
category: Service
priority: P2
status: CLOSED
created: 2026-11-09
closed: 2026-11-09
parent: "20261109_1143"
---

# [Service] 빌드가 backdrop-filter 표준 선언을 지워 Chrome에서 탭바 blur가 꺼진다

## 핵심 요약

- 요구사항: 서비스 CSS의 `backdrop-filter`가 Chrome·Firefox에서도 적용되게 한다. 탭바 반전 85% 반투명(20261109_1325)을 staging에서 확인하다 발견했다.
- 원인(재현함): `transitions.css`가 `backdrop-filter`와 `-webkit-backdrop-filter`를 **같은 규칙에 함께** 쓰는데, 빌드(Tailwind v4가 부르는 lightningcss 1.32)가 표준 선언을 지우고 접두 선언만 남긴다. Chrome 계열은 `-webkit-backdrop-filter`를 쓰지 않아 blur가 꺼진다. 표준 선언만 쓴 규칙은 표준과 접두 선언이 둘 다 나온다(대상 브라우저에 Safari 16.4 포함).
- 구현: `jam-web/src/components/transitions.css`에서 `-webkit-backdrop-filter` 선언 5줄을 지우고 이유를 주석으로 남긴다(탭바 밝은 면·반전 면, 두 `prefers-reduced-transparency` 규칙, `.t-panel-backdrop` 규칙). 접두 선언은 빌드가 Safari용으로 붙인다.
- 관련 파일: `jam-web/src/components/transitions.css` 452~453줄(`.t-panel-backdrop` reduced-transparency), 523~524·528~529줄(`.jam-tabbar-chrome`), 554~555·560~561줄(`.jam-tabbar-chrome-inverse`).

## 재현·시험

- staging(2026-11-09, 375px Chrome 계열)에서 `.jam-tabbar-chrome`와 `.jam-tabbar-chrome-inverse`의 computed `backdrop-filter`가 `none`이고, 내려온 CSS에 `-webkit-backdrop-filter`만 있다. 같은 현상이 Tailwind `.backdrop-blur-*` 유틸리티에도 있다.
- lightningcss 1.32에 Tailwind와 같은 대상 브라우저(Safari 16.4, iOS Safari 16.4, Firefox 128, Chrome 111)를 주고 실제 `transitions.css`를 변환해, 고친 뒤 모든 `backdrop-filter` 규칙이 접두와 표준 선언을 둘 다 내는 것을 확인했다. 두 선언을 함께 쓴 규칙은 접두만 나온다.

## 완료 조건

- 배포 후 staging에서 탭바 두 레이어의 computed `backdrop-filter`가 `blur(20px) saturate(1.8)`이고, 내려온 CSS에 표준과 접두 선언이 모두 있다.
- 밝은 상태와 반전 상태 모두 탭바 뒤 글자가 blur로 뭉개져 보인다.

## 잔여

- Tailwind `.backdrop-blur-*`·`.backdrop-filter` 유틸리티는 Tailwind가 만든 규칙이라 같은 방식으로 접두 선언만 나온다. 사용처는 `src/app/spike/card-shapes/page.tsx`와 `src/components/admin/ops/OpsSettingsNav.tsx` 두 곳(실서비스 화면 아님)이라 이번 범위에서 제외한다.
- 디자인 시스템 `TabBar.jsx`의 `STATIC_CSS`는 런타임 `<style>`이라 빌드를 거치지 않아 두 선언을 모두 쓰고 있어도 문제가 없다.

---
## 완료 기록

### 구현 내용 요약

- `jam-web/src/components/transitions.css`에서 `-webkit-backdrop-filter` 선언 5줄(`.t-panel-backdrop`의 `prefers-reduced-transparency` 규칙, `.jam-tabbar-chrome`와 그 reduced-transparency 규칙, `.jam-tabbar-chrome-inverse`와 그 reduced-transparency 규칙)을 지우고 표준 `backdrop-filter`만 남겼다. 이유를 파일의 탭바 재질 주석 앞에 적었다.
- 접두 선언은 빌드가 대상 브라우저(Safari 16.4 포함)에 맞춰 붙인다. 파일 전체를 lightningcss 1.32에 Tailwind와 같은 대상으로 넣어 변환해, 모든 `backdrop-filter` 규칙에 접두와 표준 선언이 함께 나오는 것을 확인했다.
- 카리나가 직접 수정했다(파일 1개, 정리 10줄 이내, 원인이 재현돼 명백한 경우). 별도 리뷰 에이전트는 돌리지 않았다.

### 변경된 파일
```
jam-web/src/components/transitions.css
```

### 테스트 결과
- [x] lightningcss 변환 시뮬레이션: 5개 규칙 모두 접두와 표준 선언 둘 다 출력
- [x] staging 실렌더(배포 dpl_2Sk2WRkNXscmTx5unYDjHzKie1YQ, 375px, Chrome 계열): `.jam-tabbar-chrome`와 `.jam-tabbar-chrome-inverse`의 computed `backdrop-filter`가 `blur(20px) saturate(1.8)`이고, 내려온 CSS에 접두와 표준 선언이 모두 있다. 밝은 상태와 85% 반전 상태 모두 탭바 뒤 글자가 blur로 뭉개져 보인다.
- [ ] 확인하지 못한 것: Safari 실기기(접두 선언은 빌드가 계속 붙이므로 문제가 없을 것으로 보지만 눈으로 보지 못했다)

### 배포 정보
- 배포일: 2026-11-09
- 환경: staging (main 배포 아님)
- 커밋: dd8e33279

### 주요 의사결정 / 핵심 메모

- 발견 경위: 탭바 반전 85% 반투명(20261109_1325)을 staging에서 확인하다 두 레이어의 computed `backdrop-filter`가 `none`인 것을 보았다. 밝은 상태의 blur도 원래부터 Chrome 계열에서는 꺼져 있었다.
- 원인: 같은 규칙에 표준과 접두 선언을 함께 쓰면 lightningcss가 표준 선언을 지우고 접두 선언만 낸다. 접두 선언만 쓰거나 표준 선언만 쓴 규칙은 이 문제가 없다.
- 이번 범위에서 고치지 않은 것(잔여): Tailwind가 만드는 `.backdrop-blur-*` 유틸리티도 같은 방식으로 접두 선언만 나온다. 사용처는 `src/app/spike/card-shapes/page.tsx`와 `src/components/admin/ops/OpsSettingsNav.tsx`뿐이다(실서비스 화면 아님).
