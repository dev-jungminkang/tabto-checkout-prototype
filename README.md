# TabTo 결제·상품 프로토타입

tabto.ai에 붙일 결제·상품 페이지 흐름을 확인하는 클릭 프로토타입이에요. 빌드 없는 정적 페이지(HTML · CSS · JS)이고, 결제창은 모두 모의 화면이라 실제 결제는 일어나지 않아요.

- 배포 주소: https://tabto-checkout-prototype.vercel.app (검색 노출 차단)
- 다루는 경로: 개인 구독 · 개인 충전 · 팀 구독 · 팀 충전 · 엔터프라이즈 계약
- 기준: 토스페이먼츠 빌링·환금성 MID 조건(11/17~11/26 메일), 사업계획 v1.3
  - 2027년 1월 팀 우선 출시, 개인은 2028년 1월 출시 → 상품 페이지 기본 탭은 팀, 개인 탭은 "2028 출시 예정"으로 표시
  - 충전 유효기간 6개월은 경영관리본부 승인 전 검토안
  - 차감 예시는 실측 원가 × 1,500원/USD × 1.30
- `captures/`, `captures-2x/` 캡처 52장은 2026.11.26 v1.3 화면 기준이에요 (플로우 정리: `captures/FLOWS.md`)

## 로컬에서 보기

```bash
python3 -m http.server 5178
```

브라우저에서 http://localhost:5178/#/pricing 을 열어요. 하단 노란 바에서 구매자(개인/팀/엔터프라이즈), 가입 후 활성화 방식, 단계 바로가기를 바꿀 수 있어요.

## 배포

```bash
npx vercel deploy --prod --yes
```

`captures`, `captures-2x`, `tools` 폴더는 `.vercelignore`로 배포에서 빠져요.

## 캡처 다시 찍기

로컬 서버를 띄운 뒤 Playwright(Python)와 설치된 Chrome으로 52장을 1배·2배로 찍어요.

```bash
pip install playwright
python tools/capture_flows.py . http://127.0.0.1:5178
```

## 파일

| 경로 | 내용 |
|---|---|
| `index.html` · `styles.css` · `app.js` | 프로토타입 본체 (해시 라우터, 상태는 sessionStorage) |
| `captures/` | 전 경로 화면 캡처 52장 (1440px) · `FLOWS.md` 플로우 정리 |
| `captures-2x/` | 슬라이드용 2배 캡처 · `fold/` 첫 화면 · `crop/` 잘라낸 영역 |

## 관련 자료

- 슬라이드 초안: Figma 「TabTo 결제·상품 플로우 (초안)」
- 고객 여정 지도 v2: Figma 디자인 파일의 `Customer Journeymap v2` 프레임 5장
