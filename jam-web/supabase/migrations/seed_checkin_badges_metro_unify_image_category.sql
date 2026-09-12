-- 전국 지하철/기차역 체크인 배지 정리: 카테고리 통일 + 이미지 경로 통일
--
-- 배경: 지하철/기차역 체크인 배지가 총 942건 존재했는데
--   - 924건: category=NULL, image_url='/badges/poi/metro/{id}.png' (로컬 정적 경로)
--   - 18건 : category='train_subway', image_url이 로컬 경로(3건) 또는
--            Supabase Storage 공개 URL(15건)로 혼재
-- 두 그룹 다 같은 "Jam METRO" 템플릿 이미지라 실제 아트웍 차이는 없음(육안 대조 확인).
-- 카테고리와 이미지 경로 형식만 갈라져 있던 상태를 정리한다.
--
-- 사전 조치: Storage URL만 갖고 로컬 파일이 없던 정동진역(a74a2793-...)은
-- Storage에서 다운로드해 jam-web/public/badges/poi/metro/에 추가했다(같은 커밋 포함).
-- 나머지 14건은 이미 로컬 파일이 존재함을 확인.

-- 1) category 통일: metro 이미지 경로를 쓰는 체크인 배지 전부 'train_subway'로
update badges
set category = 'train_subway'
where type = 'checkin'
  and image_url like '%/poi/metro/%'
  and category is null
  and deleted_at is null;

-- 2) image_url 통일: train_subway 카테고리 전부 로컬 정적 경로로
update badges
set image_url = '/badges/poi/metro/' || id || '.png'
where type = 'checkin'
  and category = 'train_subway'
  and image_url not like '/badges/poi/metro/%'
  and deleted_at is null;

-- 실행 후 검증: type='checkin' and category='train_subway' 전부 942건,
-- image_url 전부 '/badges/poi/metro/%' 패턴, valid_from='2026-09-24' 확인.
