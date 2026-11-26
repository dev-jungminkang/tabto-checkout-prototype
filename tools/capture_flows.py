"""TabTo 결제 프로토타입 전 경로 캡처 (v1.3).
usage: python capture_flows.py <repo_dir> <base_url>
- captures/      : 1440px 전체 페이지(모달은 1440x900 화면), 모바일 375px
- captures-2x/   : 같은 화면 2배, fold/ 첫 화면, crop/ 잘라낸 영역
"""
import json, os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pylib'))
from playwright.sync_api import sync_playwright

REPO, BASE = sys.argv[1], sys.argv[2].rstrip('/')
HIDE = '#sim{display:none!important}.toast{display:none!important}'


def save(path, data):
    """파일이 잠시 잠겨 있을 수 있어서(뷰어·백신) 몇 번 다시 시도한다."""
    for i in range(8):
        try:
            with open(os.path.normpath(path), 'wb') as f:
                f.write(data)
            return
        except OSError:
            time.sleep(0.5 * (i + 1))
    raise OSError('저장 실패: ' + path)


class Run:
    def __init__(self, page, scale, mobile=False):
        self.p, self.scale, self.mobile = page, scale, mobile
        self.out = os.path.join(REPO, 'captures' if scale == 1 else 'captures-2x')
        self.log, self.errors = [], []
        page.on('console', lambda m: m.type == 'error' and self.errors.append(m.text))
        os.makedirs(self.out, exist_ok=True)
        if scale == 2:
            os.makedirs(os.path.join(self.out, 'fold'), exist_ok=True)
            os.makedirs(os.path.join(self.out, 'crop'), exist_ok=True)

    def ev(self, js):
        r = self.p.evaluate(js)
        self.p.wait_for_timeout(250)
        return r

    def click(self, sel):
        self.p.click(sel)
        self.p.wait_for_timeout(250)

    def fill(self, sel, v):
        self.p.fill(sel, v)

    def fresh(self, persona, act='a'):
        self.p.goto(BASE + '/#/pricing')
        self.p.add_style_tag(content=HIDE)
        self.ev(f"""(() => {{ sessionStorage.clear(); S = {{ ...DEF(), persona: '{persona}', act: '{act}' }}; save();
            UI.modal = null; UI.errs = {{}}; UI.signupPhase = 'form'; UI.lastPay = null; location.hash = '#/pricing'; render(); }})()""")

    def go(self, r):
        self.ev(f"go('{r}')")

    def shot(self, name, desc, full=True):
        if full:
            self.p.evaluate('window.scrollTo(0, 0)')
        self.p.wait_for_timeout(250)
        save(os.path.join(self.out, name), self.p.screenshot(full_page=full))
        if self.scale == 2:
            save(os.path.join(self.out, 'fold', name), self.p.screenshot(full_page=False))
        self.log.append({'file': name, 'desc': desc, 'url': '#/' + self.p.evaluate('route()')})

    def crop(self, name, sel):
        if self.scale == 2:
            self.p.evaluate('window.scrollTo(0, 0)')
            self.p.add_style_tag(content='.hdr{position:static!important}')
            save(os.path.join(self.out, 'crop', name), self.p.locator(sel).first.screenshot())
            self.p.add_style_tag(content='.hdr{position:sticky!important}')

    def signup(self, email):
        self.click('[data-act="signup"]')
        return email

    def fill_signup(self, email='creator@example.com', name='홍길동'):
        self.fill('#f-email', email); self.fill('#f-pw', 'tabto1234'); self.fill('#f-pw2', 'tabto1234'); self.fill('#f-name', name)
        self.click('#c-all')

    def billing(self, corp=False, shoot=None):
        """결제 동의 화면에서 카드 등록 완료까지. shoot: {'1':(name,desc),...}"""
        shoot = shoot or {}
        if corp:
            self.click('input[name=ctype][value=c]')
        for el in self.p.query_selector_all('.cn'):
            el.fill('4321')
        self.fill('#exp', '12/29'); self.fill('#idn', '1234567890' if corp else '900101')
        self.click('#pg-agree')
        if '1' in shoot: self.shot(*shoot['1'], full=False)
        self.click('[data-act="bill-1"]')
        if '2' in shoot:
            self.fill('#ph', '01012345678'); self.fill('#code', '123456')
            self.shot(*shoot['2'], full=False)
        else:
            self.fill('#ph', '01012345678'); self.fill('#code', '123456')
        self.click('[data-act="bill-2"]')
        if '3' in shoot: self.shot(*shoot['3'], full=False)
        self.p.wait_for_timeout(1600)
        if '4' in shoot: self.shot(*shoot['4'], full=False)
        self.click('[data-act="bill-done"]')


def desktop(r):
    p = r.p
    # ── A. 팀 구독 → 팀 충전 (2027년 1월 출시) ──
    r.fresh('t')
    r.shot('29-t-pricing.png', '팀 · 상품 페이지 (기본 탭 · Team Pro / Business · 충전팩 표 · 6개월 검토안 · Enterprise)')
    r.click('[data-act="pick"][data-id="tpro"]')
    r.fill_signup('lead@studio.kr'); r.click('[data-act="signup"]'); r.click('[data-act="verify"]')
    r.shot('30-t-activate.png', '팀 · 계정 활성화')
    r.click('[data-go="team"]')
    r.click('[data-act="team"]')
    r.shot('31-t-team-error.png', '팀 · 팀 이름 누락 오류')
    r.ev('UI.errs = {}; render()')
    r.fill('#f-team', '스튜디오 모션랩')
    r.shot('32-t-team.png', '팀 · 팀 워크스페이스 만들기 (최대 10명)')
    r.click('[data-act="team"]')
    r.shot('33-t-checkout.png', '팀 · 결제 확인 (공급가 100,000 + VAT 10,000 · 크레딧 없음)')
    r.click('#c-all'); r.click('[data-act="open-billing"]')
    r.billing(corp=True, shoot={'1': ('34-t-billing-corp.png', '팀 · 모의 정기결제창 법인카드 (사업자등록번호)')})
    r.shot('35-t-subscribed.png', '팀 · 구독 시작 (크레딧 없음 → 충전 유도)')
    r.go('charge')
    r.click('[data-act="pack"][data-i="2"]'); r.click('[data-act="issuer"][data-v="현대"]')
    r.shot('36-t-charge-110-hyundai.png', '팀 · 110만 원 팩 + 현대카드 → 한도 초과 경고 (9곳 중 3곳 가능 · 6개월 검토안 표시)')
    r.crop('t-charge-main.png', 'main section > .grid.mt32')
    r.crop('t-limit-table.png', 'main section > .panel.mt32')
    r.click('#ch-agree'); r.click('[data-act="open-pay"]')
    r.shot('37-t-pay-declined.png', '팀 · 모의 결제창 결제 거절 (카드사 환금성 한도)', full=False)
    r.click('[data-act="close-modal"]')
    r.click('[data-act="method"][data-v="bank"]'); r.click('[data-act="bank"][data-v="bankpay"]')
    r.shot('38-t-charge-bankpay.png', '팀 · 뱅크페이로 변경 → 결제 가능')
    r.click('#ch-agree'); r.click('[data-act="open-pay"]'); r.click('[data-act="pay-auth"]')
    p.wait_for_timeout(1700)
    r.shot('39-t-paid.png', '팀 · 1,050,000C 충전 완료')
    r.go('credits')
    r.click('[data-act="run"][data-i="1"]')
    r.shot('40-t-credits.png', '팀 · 크레딧 화면 (충전분 원장 · 실측 기준 차감 예시 · 구독·충전 결제 내역)')

    # ── B. 엔터프라이즈 (계약형 · PG 미사용) ──
    r.fresh('e')
    r.shot('41-e-pricing.png', '엔터프라이즈 · 상품 페이지 (보너스 협의 · 현행 계약 10%)')
    r.go('enterprise')
    r.shot('42-e-inquiry.png', '엔터프라이즈 · 도입 문의 폼')
    r.click('[data-act="ent-submit"]')
    r.shot('43-e-inquiry-error.png', '엔터프라이즈 · 문의 폼 입력 오류')
    r.fill('#e-company', '(주)스튜디오모션'); r.fill('#e-biz', '123-45-67890'); r.fill('#e-name', '홍길동')
    r.fill('#e-email', 'lead@studiomotion.kr'); r.fill('#e-phone', '02-000-0000'); r.fill('#e-msg', '광고 영상 제작 파이프라인')
    r.click('.consent .c-req'); r.click('[data-act="ent-submit"]')
    r.fill('#q-type', '서비스 · 영상제작'); r.fill('#q-addr', '서울시 강남구')
    r.shot('44-e-quote.png', '엔터프라이즈 · 견적 확인과 세금계산서 정보')
    r.click('#c-all'); r.click('[data-act="ent-confirm"]')
    r.shot('45-e-invoice.png', '엔터프라이즈 · 청구서와 계좌이체 안내')
    r.click('[data-act="ent-paid"]')
    r.shot('46-e-paid.png', '엔터프라이즈 · 입금 확인 후 계약 크레딧 지급')
    r.go('credits')
    r.shot('47-e-credits.png', '엔터프라이즈 · 크레딧 화면 (계약 크레딧 6개월)')

    # ── C. 개인 구독 → 추가 충전 (2028년 1월 출시 예정) ──
    r.fresh('p')
    r.shot('01-p-pricing.png', '개인 · 상품 페이지 (2028년 1월 출시 예정 안내 · Free Trial / Basic / Plus)')
    r.click('[data-act="pick"][data-id="basic"]')
    r.shot('02-p-signup.png', '개인 · 회원가입 폼 (약관 동의 포함)')
    r.click('[data-act="signup"]')
    r.shot('03-p-signup-error.png', '개인 · 회원가입 입력 오류 표시')
    r.fill_signup(); r.click('[data-act="signup"]')
    r.shot('04-p-verify.png', '개인 · 이메일 인증 안내')
    r.click('[data-act="verify"]')
    r.shot('05-p-activate.png', '개인 · 계정 활성화 (바로 활성화 방식)')
    r.click('[data-go="checkout"]')
    r.shot('06-p-checkout.png', '개인 · 결제 내용 확인과 자동결제 동의')
    r.click('[data-act="open-billing"]')
    r.shot('07-p-checkout-error.png', '개인 · 필수 동의 누락 오류')
    r.click('#c-all'); r.click('[data-act="open-billing"]')
    r.shot('08-p-billing-1.png', '개인 · 모의 토스 정기결제창 ① 카드 정보', full=False)
    r.click('[data-act="bill-1"]')
    r.shot('09-p-billing-1-error.png', '개인 · 카드 정보 입력 오류', full=False)
    r.billing(shoot={'2': ('10-p-billing-2.png', '개인 · 모의 결제창 ② 본인 확인'),
                     '3': ('11-p-billing-3.png', '개인 · 모의 결제창 ③ 빌링키 발급·첫 결제 처리 중'),
                     '4': ('12-p-billing-4.png', '개인 · 모의 결제창 ④ 카드 등록·첫 결제 완료')})
    r.shot('13-p-subscribed.png', '개인 · 구독 시작 완료 (20,000C 지급)')
    r.go('charge')
    r.shot('14-p-charge-card.png', '개인 · 추가 충전 (카드 · 카드사별 한도표 · 6개월 검토안 표시)')
    r.crop('p-charge-main.png', 'main section > .grid.mt32')
    r.click('[data-act="method"][data-v="easy"]')
    r.shot('15-p-charge-easy.png', '개인 · 추가 충전 (간편결제)')
    r.click('[data-act="method"][data-v="bank"]')
    r.shot('16-p-charge-bank.png', '개인 · 추가 충전 (계좌이체)')
    r.click('[data-act="method"][data-v="card"]'); r.click('[data-act="open-pay"]')
    r.shot('17-p-charge-agree-error.png', '개인 · 충전 필수 동의 누락')
    r.click('#ch-agree'); r.click('[data-act="open-pay"]')
    r.shot('18-p-pay-1.png', '개인 · 모의 토스 단건 결제창 (카드사 인증 안내)', full=False)
    r.click('[data-act="pay-auth"]')
    r.shot('19-p-pay-2.png', '개인 · 단건 결제 승인 중', full=False)
    p.wait_for_timeout(1700)
    r.shot('20-p-paid.png', '개인 · 충전 완료 (6개월 유효)')
    r.go('credits')
    r.shot('21-p-credits.png', '개인 · 크레딧 화면 (구독분·충전분 원장, 결제 내역)')
    r.click('[data-act="run"][data-i="0"]'); r.click('[data-act="run"][data-i="1"]')
    r.shot('22-p-credits-used.png', '개인 · 작업 실행 후 차감 (실측 원가 × 1,500원 × 1.30 · 만료 임박분부터)')
    r.click('[data-act="cancel"]')
    r.shot('23-p-credits-cancel.png', '개인 · 구독 해지 예약')

    # ── D. 개인 Free Trial · 결제 후 활성화 (2028년 검토) ──
    r.fresh('p')
    r.click('[data-act="pick"][data-id="free"]')
    r.fill_signup(); r.click('[data-act="signup"]'); r.click('[data-act="verify"]')
    r.shot('24-f-activate.png', 'Free Trial · 이메일 인증 후 바로 활성화 + 5,000C 지급')
    r.go('credits')
    r.shot('25-f-credits.png', 'Free Trial · 크레딧 화면 (체험 14일, 충전 버튼 잠김)')
    r.go('charge')
    r.shot('26-f-charge-blocked.png', 'Free Trial · 체험 중 충전 불가 안내')
    r.fresh('p', 'b')
    r.shot('27-b-pricing.png', '결제 후 활성화 방식 · 무료 체험 버튼 잠김')
    r.click('[data-act="pick"][data-id="basic"]')
    r.fill_signup(); r.click('[data-act="signup"]'); r.click('[data-act="verify"]')
    r.shot('28-b-activate.png', '결제 후 활성화 방식 · 결제 대기 상태')

    # ── E. 약관 초안 ──
    r.go('terms')
    r.shot('48-legal-terms.png', '이용약관 (개인·팀) 초안 (출시 순서 · 6개월 검토안 반영)')
    r.go('refund')
    r.shot('49-legal-refund.png', '환불 및 취소 정책 (개인·팀) 초안')


def mobile(r):
    r.fresh('t')
    r.shot('50-m-pricing.png', '모바일 · 팀 상품 페이지')
    r.ev("""(() => { S.plan='tpro'; S.user={email:'lead@studio.kr',name:'홍길동'}; S.verified=true; S.active=true;
        S.team={name:'스튜디오 모션랩',kind:'회사 · 기관',seats:10}; save(); go('checkout'); })()""")
    r.shot('51-m-checkout.png', '모바일 · 팀 결제 확인')
    r.ev("""(() => { UI.last4='4321'; completeSub(); go('charge'); })()""")
    r.shot('52-m-charge.png', '모바일 · 팀 크레딧 충전')


with sync_playwright() as pw:
    browser = pw.chromium.launch(channel='chrome')
    logs = {}
    for scale in (1, 2):
        ctx = browser.new_context(viewport={'width': 1440, 'height': 900}, device_scale_factor=scale, locale='ko-KR')
        r = Run(ctx.new_page(), scale)
        desktop(r)
        ctx.close()
        mctx = browser.new_context(viewport={'width': 375, 'height': 812}, device_scale_factor=scale, is_mobile=True, has_touch=True, locale='ko-KR')
        m = Run(mctx.new_page(), scale, mobile=True)
        mobile(m)
        mctx.close()
        log = sorted(r.log + m.log, key=lambda x: x['file'])
        errs = sorted(set(r.errors + m.errors))
        logs[scale] = (log, errs)
        print(f'scale {scale}: {len(log)} shots, errors: {errs}')
    browser.close()
    for scale, folder in ((1, 'captures'), (2, 'captures-2x')):
        with open(os.path.join(REPO, folder, 'captures.json'), 'w', encoding='utf-8') as f:
            json.dump({'version': 'v1.3', 'captured': time.strftime('%Y-%m-%d %H:%M'), 'log': logs[scale][0], 'errors': logs[scale][1]},
                      f, ensure_ascii=False, indent=2)
