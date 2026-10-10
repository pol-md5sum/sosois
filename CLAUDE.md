# MOA Content Studio — 작업 안내 (Claude Code용)

뉴스·육아 정보를 인스타 카드뉴스와 숏폼(릴스·쇼츠·네이버 클립)으로 만드는 **정적 웹앱**입니다. 빌드 없이 브라우저 ES 모듈로 동작하고 GitHub Pages(https://pol-md5sum.github.io/sosois/)에 배포됩니다. UI 문구·커밋 설명은 한국어, 말투는 공적이고 전문적으로 씁니다.

## 실행·테스트
```bash
python -m http.server 8000   # http://localhost:8000  (빌드 없음)
npm test                     # Node 22+, DOM 없이 도는 단위 테스트 (scripts/selftest.mjs)
npm run news                 # data/news.json 만들기 (인터넷 필요, 커밋하지 않음)
npm i && npm run e2e:media   # 처음 한 번: playwright 설치 + 테스트 영상·사진(ffmpeg 필요)
npm run e2e                  # 브라우저 통합 테스트 (AI 응답은 모의). 이름 지정: node scripts/e2e/run.mjs care visit
```
외부 접속이 막힌 환경(Claude 클라우드 세션 등)에서는 `E2E_OFFLINE=1`, 설치된 playwright 경로는 `PLAYWRIGHT_MODULE=…/index.mjs`, 로컬 글꼴은 `E2E_PRETENDARD=…woff2`로 지정합니다. 실패하면 `scripts/e2e/out/<이름>/FAIL.png`를 확인하세요.

## 구조
| 경로 | 역할 |
|---|---|
| `index.html`, `css/app.css` | 껍데기·스타일 (해시 라우터 `#/dashboard`, `#/care`, `#/shorts/<id>` …) |
| `js/app.js` | 화면 전부(대시보드·뉴스·주제·만들기·편집기·설정·육아정보), 생성 흐름 `generateContent`/`runGenerate` |
| `js/ai.js` | 카테고리·카드 유형/레이아웃·**형식(RECIPES)**·프롬프트·스키마·정규화·템플릿·육아 정보 점검. DOM 없음(Node·Actions 공용) |
| `js/render.js` | 캔버스 카드 렌더러: 테마 `soft`(기본·해피해피) / `toon` / `magazine`, 사진 카드(`photo`), 말풍선, 글꼴 표 |
| `js/shorts.js` | 숏폼: 영상 클립형(자막·썸네일·캡컷 묶음)과 **슬라이드형**(카드뉴스→9:16 영상) |
| `js/store.js` | 설정·**계정(프로필)**·콘텐츠·숏폼 저장(localStorage), 영상·사진 저장(IndexedDB `moa` v3) |
| `js/parenting.js` | 육아정보 월령·분야·주제 라이브러리 |
| `scripts/fetch-news.mjs` | 뉴스·트렌드 수집(Google News RSS), MOA용·해피해피용 피드와 점수 |
| `scripts/selftest.mjs`, `scripts/e2e/` | 단위 테스트 / Playwright 통합 테스트 |
| `assets/moa`, `assets/happy`, `assets/fonts` | 캐릭터 이미지·내장 글꼴(`assets/fonts/LICENSES.md`) |
| `.github/workflows/pages.yml` | main에 푸시 또는 3시간마다: 뉴스 수집 → `_site` 구성 → 캐시 방지 접미사 → 배포 |

## 꼭 알아둘 것
- **계정(프로필)**: `store.js`의 `DEFAULT_PROFILES`(`moa`, `happy`)와 `PROFILE_KEYS`. `getSettings()`가 공통 설정 + 현재 계정 값을 합쳐 줍니다. 계정마다 인스타 아이디·브랜드·태그 접두어·디자인·글씨체·캐릭터 등장 여부·주제(`topics`)·AI 지침(`focus`)이 다릅니다. 콘텐츠·숏폼에는 `profileId`가 붙고 목록은 현재 계정 것만 보입니다(`mineOnly`). 기본값을 바꾸면 저장된 계정과 어긋나므로 `listProfiles()`의 한 번짜리 이전(`fontsV2`, `happyV3`)처럼 마이그레이션을 넣으세요.
- **해피해피 = 육아·아기·생활용품·생활템·아기랑 나들이**만. `ai.js`의 해피해피 카테고리(`scope: 'happy'`)와 `RECIPES`(추천템·장소·육아 정보·다녀왔어요·Q&A·주의 TOP N·체크리스트). 해피해피 화면에 MOA 표기·양 캐릭터가 나오면 안 됩니다(`tagLabel`, `renameCharacter`, `personaSystem`).
- **콘텐츠 모델**: `cards[]`(type·layout·title·body·items·specs·emoji…), `recipe`, `theme`, `format`, `caption`, `hashtags`, `sources`, `showChar`, 육아 정보는 `guide`·`checkedAt`·`review`. 카드별 사진은 IndexedDB `bgs`에 키 `"<콘텐츠ID>:<카드번호>"`로 저장되므로 **장 순서를 바꾸면 `remapBgs`로 함께 옮깁니다**. 편집기는 `persist()`가 0.3초 지연 저장이라, 화면을 다시 열기 전에는 `saveContent`로 바로 저장하세요.
- **육아 정보(의학·영양)**: 사실은 앱이 정하지 않고 AI가 웹 검색으로 **공식 출처**(정부·학회·국제기관)를 찾아 쓰게 합니다(`HEALTH_RULES`). `finalizeGuide`가 근거·확인일·면책을 캡션과 마지막 카드에 넣고, `reviewGuide`가 출처·치료/효능·단정 표현·최신성(90일)을 점검하며, 검수 체크 3개가 끝나야 "발행 준비"입니다. AI 키가 없으면 내용 없는 빈 틀만 만듭니다. 이 원칙을 약화시키는 변경은 하지 마세요.
- **카드 크기**: 4:5 1080×1350(기본), 3:4, 1:1, 숏폼용 9:16 1080×1920(슬라이드형 숏폼이 이 크기로 다시 그립니다). 숏폼은 세 플랫폼 모두 9:16 1080×1920, 가림 영역은 `PLATFORMS`. 네이버 클립 최대 길이는 공식 수치 미확인.
- **캐시 방지 배포 규칙**: 배포 때 `from './이름.js'`(작은따옴표, 파일명은 `[a-z-]`만)에 `?v=SHA`를 붙입니다. 새 모듈 이름과 import 형식을 이 규칙에 맞추세요.
- **저장 키**: `moa.settings`, `moa.keys`(API 키, 이 브라우저에만), `moa.profiles`, `moa.activeProfile`, `moa.contents`, `moa.shorts`, `moa.catOverride`, `moa.careTopics.<계정ID>`, `sessionStorage moa.draftNews`. 주소(origin)마다 따로라서 `github.io`와 `localhost` 데이터는 공유되지 않습니다(내 콘텐츠 백업은 문서만, 사진·영상은 제외).
- **API 키는 코드·커밋에 넣지 않습니다.** 브라우저에서 각 AI(Claude·GPT·Gemini)로 직접 호출합니다.
- 캡션 속 링크는 인스타그램에서 눌리지 않습니다(프로필 링크·스토리 링크 스티커 안내). 원문 기사 블록은 `withArticleLink`.
- 글꼴은 라이선스를 확인한 것만 `assets/fonts`에 넣습니다. 잘난체·어그로체는 웹 임베딩 조건 미확인이라 제외했습니다.

## 작업 방식
- 기능마다 브랜치를 만들고 PR로 main에 합칩니다(main에 직접 푸시하지 않음). 사용자가 병합하면 Pages가 배포됩니다.
- 변경 후 `npm test`와 관련 e2e 시나리오를 돌리고, 화면이 바뀌면 e2e가 저장한 이미지(`scripts/e2e/out/`)를 눈으로 확인하세요.
- 실제 AI 호출·실제 뉴스 수집·실제 크롬 MP4 저장은 자동 테스트로 검증되지 않습니다(모의 응답 사용). 배포 후 사이트에서 한 번 확인합니다.

## 다음 후보 (미착수)
연예인 육아템 전용 형식(인물 사진 사용은 별도 확인 필요) · 공식 기관 RSS 직접 수집 가능 여부 확인 · 주간 편성표·재확인 알림 · 슬라이드 숏폼 음성(TTS) · 콘텐츠 백업에 사진·영상 포함.
