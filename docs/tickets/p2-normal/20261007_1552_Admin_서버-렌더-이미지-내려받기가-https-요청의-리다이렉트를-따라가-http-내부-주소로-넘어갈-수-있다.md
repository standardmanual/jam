---
id: "20261007_1552"
category: Admin
priority: P2
status: OPEN
created: 2026-10-07
closed:
parent: "20261006_1806"
---

# [Admin] 서버 렌더 이미지 내려받기가 https 요청의 리다이렉트를 따라가 http·내부 주소로 넘어갈 수 있다

> 상위: 20261006_1806 ⑥-B(20261007_1601)의 게이트 주의(보안) 발견물. 이번 정책(https만·시간·크기 상한) 범위 밖이라 분리했다.

## 핵심 요약

- 요구사항: `jam-web/scripts/asset-generator/loadLayerImage.mjs`의 `downloadImage`(84줄 근처)가 리다이렉트를 따라갈 때도 https만 허용하고 내부 주소(사설 IP·링크 로컬)로 넘어가지 않게 한다.
- 문제: `fetch`의 기본 동작은 리다이렉트를 따라간다. https 주소로 요청해도 응답이 http나 내부 주소로 리다이렉트하면 ⑥-B의 「https만」 검사를 우회한다. 시간(15초)·크기(5MB) 상한은 리다이렉트 이후에도 적용되므로 피해 범위는 제한된다.
- 구현 계획: `redirect: 'manual'`로 받아 최대 횟수(예: 3회) 안에서 각 단계의 주소를 같은 규칙(https만, 사설 IP·링크 로컬 거부)으로 검사하거나, 리다이렉트를 허용하지 않고 오류로 멈춘다(정책은 착수 때 사용자에게 묻는다. 서비스 저장소 주소가 리다이렉트하는 일이 없는지 확인한다). 테스트는 `loadLayerImage.test.ts`의 `fetchImpl` 스텁에 리다이렉트 응답을 더한다.
- 관련 파일: `jam-web/scripts/asset-generator/loadLayerImage.mjs`, `jam-web/scripts/asset-generator/__tests__/loadLayerImage.test.ts`, `docs/service/prd/asset-generator/PRD.md` §8(URL 보호 규칙).

## 완료 조건

- [ ] https 주소가 http나 내부 주소로 리다이렉트하면 오류로 멈춘다(테스트).
- [ ] 정상 https 이미지와 로컬 파일 경로는 기존대로 동작한다.
- [ ] `scripts/verify.sh`가 통과한다.

---
## 완료 기록 *(작업 완료 후 작성)*

### 구현 내용 요약

### 주요 의사결정 / 핵심 메모

### 잔여 이슈
-
