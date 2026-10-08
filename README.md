# MOA Content Studio

> 요즘 뭐가 뜨는지, 모아가 알려줄게. 🐑

뉴스·트렌드를 모아 AI가 분석하고, 인스타그램용 **1080×1080 7장 카드뉴스**와 캡션·해시태그를 만들어 주는 웹앱입니다.

사이트: https://pol-md5sum.github.io/sosois/

## 주요 기능

| 기능 | 설명 |
|---|---|
| 오늘의 뉴스 | Google 뉴스 RSS(9개 카테고리)를 3시간마다 수집 → 같은 사건끼리 묶고 MOA 적합도로 정렬 |
| 트렌드 | Google 트렌드 한국 실시간 검색어 + 관련 기사 |
| AI 원고 | GPT / Gemini / Claude 중 선택, 7장 구조(HOOK·WHAT·WHY·SO WHAT·MOA'S PICK·LIFE/CHECK·CTA), 웹 검색 사실 확인 옵션 |
| 모델 비교 | 같은 뉴스를 여러 모델로 동시에 만들고 6개 기준으로 채점·추천 |
| 자동 디자인 | 문구에 따라 큰 제목 / 설명 / 리스트 / 큰 숫자 / 좌우 비교 / 키워드 / CTA 레이아웃 자동 선택 |
| 모아 캐릭터 | 카드 유형에 맞춰 포즈 자동 선택(14종), 말풍선, 텍스트와 겹치지 않게 배치 |
| 편집기 | 7장 목록 / 미리보기 / 편집 패널 (문구·포즈·위치·크기·글자 크기·색상) |
| 내보내기 | 카드별 PNG, 7장 ZIP(캡션 포함), 원클릭 “오늘의 콘텐츠” 3건 ZIP |
| 내 콘텐츠 | 초안·제작 완료·게시 예정·게시 완료 관리, 검색·필터, 백업/가져오기 |

## 구조

```
index.html, css/, js/          정적 웹앱 (빌드 없음)
  js/ai.js                     프롬프트·스키마·GPT/Gemini/Claude 호출 (브라우저·Node 공용)
  js/render.js                 1080×1080 캔버스 렌더러
  js/store.js                  설정·API 키·콘텐츠 저장 (브라우저)
  js/app.js                    화면
scripts/fetch-news.mjs         뉴스·트렌드 수집 → data/news.json (GitHub Actions)
.github/workflows/pages.yml    push·3시간마다 수집 후 GitHub Pages 배포
assets/moa/                    모아 캐릭터 (배경 제거본 moa.png, 원본)
```

## 설정

1. **AI API 키**: 사이트의 ⚙️ 설정에서 입력합니다. 키는 그 브라우저에만 저장되고 각 AI 회사로 직접 전송됩니다.
2. **(선택) AI 뉴스 선별**: 저장소 Settings → Secrets and variables → Actions에 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` 중 하나를 추가하면 수집 시 AI가 MOA 적합도와 요약을 다시 매깁니다.
3. **포즈 이미지**: 설정에서 포즈별 투명 PNG를 올리면 기본 이미지 대신 사용됩니다.

## 로컬 실행

```bash
npm run news     # data/news.json 생성 (인터넷 필요)
python3 -m http.server 8000
npm test         # 네트워크 없이 파서·점수·정규화 점검
```
