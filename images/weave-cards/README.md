# Weave 엽서 이미지

홈 섹션 carousel에 들어갈 이미지.

## 파일명 규칙

- `01.jpg`, `02.jpg`, `03.jpg`, ... (3~5장 권장)
- 또는 `.png`, `.webp` 가능. JPG 권장 (페이로드 작음).
- 비율: 3:4 또는 4:5 세로 (엽서 결). 또는 1:1 정사각.
- 해상도: 가로 1600px 이상 (retina 대응)
- 가능하면 jpg quality 85~90, 200KB~500KB 한 장

## index.html에서 어떻게 인식되나

`<img src="/images/weave-cards/01.jpg" />` 패턴으로 1번부터 순차 로드.
파일 추가/삭제 후 알려주시면 HTML 자동 update.
