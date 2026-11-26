/* TabTo 결제 흐름 프로토타입 — 실제 결제·서버 호출 없음. 모든 상태는 브라우저 세션에만 저장된다. */

const $ = (s) => document.querySelector(s);
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const won = (n) => fmt(n) + '원';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const addMonths = (d, m) => { const x = new Date(d); const day = x.getDate(); x.setMonth(x.getMonth() + m); if (x.getDate() < day) x.setDate(0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const ymd = (d) => { const x = new Date(d); return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, '0')}.${String(x.getDate()).padStart(2, '0')}`; };

/* ───────── 상품 (TabTo 사업계획서 v1.3, 2026.11) ─────────
   2027.1 Team 우선 출시 · Personal은 2028.1 출시. 충전 6개월은 경영관리본부 승인 전 검토안.
   차감: 공급사 모델 원가 × 1.30 · API 환율 가정 1,500원/USD. */
const PLAN_VER = 'v1.3';
const PERSONAL_LAUNCH = '2028년 1월';
const PLANS = {
  free: { id: 'free', who: 'p', name: 'Free Trial', price: 0, credits: 5000, line: '핵심 제작 경험 체험', feats: ['5,000C 지급 · 14일', '핵심 제작 기능 체험', '별도 충전 불가'], review: '5,000C · 14일은 검토안' },
  basic: { id: 'basic', who: 'p', name: 'Personal Basic', price: 29000, credits: 20000, line: '개인 창작자의 정기 제작', feats: ['매월 20,000C', '남은 크레딧은 다음 결제일에 소멸', '별도 충전 1원/C + VAT'] },
  plus: { id: 'plus', who: 'p', name: 'Personal Plus', price: 79000, credits: 70000, line: '월간 제작량 확대', feats: ['매월 70,000C', '남은 크레딧은 다음 결제일에 소멸', '별도 충전 1원/C + VAT'], hot: true },
  tpro: { id: 'tpro', who: 't', name: 'Team Pro', supply: 100000, price: 110000, credits: 0, seats: 10, line: '워크플로우 공유 · 팀 협업', feats: ['최대 10명', '공동 워크스페이스 · 제작 자산 공유', '팀 사용량 관리', 'AI 크레딧은 별도 충전'], hot: true },
  tbiz: { id: 'tbiz', who: 't', name: 'Team Business', supply: 300000, price: 330000, credits: 0, seats: 30, line: '조직 자산 · 예산 · 권한 관리', feats: ['최대 30명', '다중 프로젝트 · 고급 권한', '예산 분석', 'AI 크레딧은 별도 충전'] },
};
const PACKS = {
  t: [
    { pay: 110000, supply: 100000, credits: 100000, bonus: 0 },
    { pay: 330000, supply: 300000, credits: 306000, bonus: 2 },
    { pay: 1100000, supply: 1000000, credits: 1050000, bonus: 5 },
  ],
  p: [
    { pay: 11000, supply: 10000, credits: 10000, bonus: 0 },
    { pay: 33000, supply: 30000, credits: 30000, bonus: 0 },
    { pay: 55000, supply: 50000, credits: 50000, bonus: 0 },
  ],
};

/* ───────── 토스페이먼츠 환금성 단건 결제 한도 (배규익 매니저 메일 기준) ───────── */
const CARDS = [
  { n: '국민', per: null, mon: null, note: '일 4회', auth: () => 'ISP + SMS 인증 + 공동인증서 (3단계)' },
  { n: '하나', per: null, mon: 1000000, auth: (a) => (a < 500000 ? '하나1Q페이' : '하나1Q페이 + ARS 또는 공동인증서') },
  { n: '비씨', per: null, mon: null, auth: (a) => (a <= 500000 ? '페이북 비밀번호' : a <= 1000000 ? '페이북 비밀번호 + ARS' : '페이북 비밀번호 + 인증서 + ARS') },
  { n: '신한', per: null, mon: 50000, auth: (a) => (a > 100000 ? '신한플레이 + ARS' : '신한플레이') },
  { n: '삼성', per: null, mon: null, note: '월 50회', auth: () => '삼성앱카드 · 삼성페이 · 3단계 인증 중 선택' },
  { n: '현대', per: 110000, mon: 550000, note: '일 5회', auth: () => '앱카드 비밀번호 또는 생체인증 (필요 시 ARS)' },
  { n: '롯데', per: null, mon: 500000, auth: (a) => (a < 100000 ? '앱카드 간편비밀번호' : '앱카드 간편비밀번호 + ARS') },
  { n: 'NH농협', per: 100000, mon: 500000, note: '일 10회', auth: () => '앱카드 + ARS (일반결제 불가)' },
  { n: '우리', per: 300000, mon: 300000, auth: (a) => (a >= 200000 ? '우리페이 + ARS' : '우리페이 또는 휴대폰 본인인증') },
];
const EASY = [
  { k: 'toss', n: '토스페이', per: 300000, mon: 5000000, lim: '머니 1회 30만 · 1일 200만 · 월 500만', auth: '토스 앱에서 결제 승인' },
  { k: 'kakao', n: '카카오페이', per: null, mon: 1000000, lim: '머니 월 100만', auth: '카카오페이 비밀번호' },
  { k: 'naver', n: '네이버페이', per: 500000, mon: 2000000, lim: '머니 1회 50만 · 1일 200만', auth: '네이버페이 비밀번호' },
  { k: 'payco', n: '페이코', per: null, mon: null, lim: '별도 한도 없음', auth: '페이코 비밀번호' },
];
const BANKS = [
  { k: 'quick', n: '퀵계좌이체', per: 300000, mon: 1000000, lim: '1회 30만 · 1일 100만 · 월 200만', fee: '1.8%', auth: '등록 계좌 비밀번호' },
  { k: 'bankpay', n: '실시간 계좌이체 (뱅크페이)', per: null, mon: 10000000, lim: '1일 1계좌 최대 1,000만', fee: '1.8%', auth: '은행 인증 (공동인증서 등)' },
];

/* ───────── 상태 ───────── */
const DEF = () => ({
  persona: 't', act: 'a', plan: null, user: null, verified: false, active: false, team: null, sub: null,
  grants: [], usage: [], orders: [], used: {}, ent: null,
  charge: { pack: 0, method: 'card', issuer: '국민', easy: 'toss', bank: 'quick' },
});

/* 엔터프라이즈 계약 (현행: 견적 → 청구서·세금계산서 → 계좌이체 → 입금 확인 후 2영업일 내 크레딧 지급) */
const ENT_AMOUNTS = [
  { supply: 3000000, label: '300만 원', note: '현행 조건' },
  { supply: 5000000, label: '500만 원', note: '예시' },
  { supply: 10000000, label: '1,000만 원', note: '예시' },
];
const ENT_BONUS = 10;
let S = load();
const UI = { signupPhase: 'form', modal: null, step: 1, lastPay: null, errs: {} };

function load() {
  try { const raw = sessionStorage.getItem('tabto-proto'); if (raw) return { ...DEF(), ...JSON.parse(raw) }; } catch (e) { /* 저장소를 못 쓰면 기본값 */ }
  return DEF();
}
function save() { try { sessionStorage.setItem('tabto-proto', JSON.stringify(S)); } catch (e) { /* 무시 */ } }

const plan = () => PLANS[S.plan] || null;
const isTeam = () => S.persona === 't';
const isEnt = () => S.persona === 'e';
const balance = () => S.grants.filter((g) => g.left > 0 && new Date(g.exp) > new Date()).reduce((a, g) => a + g.left, 0);

function go(route) { if (location.hash === '#/' + route) render(); else location.hash = '#/' + route; }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); }
const memo = (html) => `<div class="memo"><b>검토 메모</b> · ${html}</div>`;

/* 구매 경로 진행 바 (가입 → 활성화 → (팀) → 결제 동의 → 카드 등록) */
function prog(at) {
  const steps = isTeam() ? ['signup', 'activate', 'team', 'checkout', 'billing'] : ['signup', 'activate', 'checkout', 'billing'];
  const i = steps.indexOf(at);
  return `<div class="prog">${steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
}

/* ───────── 1. 상품 페이지 ───────── */
const personaSeg = () => `<div class="seg"><button class="${S.persona === 't' ? 'on' : ''}" data-act="persona" data-v="t">팀</button><button class="${S.persona === 'e' ? 'on' : ''}" data-act="persona" data-v="e">엔터프라이즈</button><button class="${S.persona === 'p' ? 'on' : ''}" data-act="persona" data-v="p">개인 · 2028</button></div>`;
const SIX_MONTH_NOTE = '6개월 (경영관리본부 승인 전 검토안)';

function vPricing() {
  if (isEnt()) return vEntPricing();
  const t = isTeam();
  const ids = t ? ['tpro', 'tbiz'] : ['free', 'basic', 'plus'];
  const cards = ids.map((id) => {
    const p = PLANS[id];
    const blockFree = id === 'free' && S.act === 'b';
    const price = p.price === 0 ? '무료' : t ? `${won(p.supply)}<small>/월 · VAT 별도</small>` : `${won(p.price)}<small>/월 · VAT 포함</small>`;
    return `<div class="plan ${p.hot ? 'hot' : ''}">
      ${p.hot ? '<span class="badge b-o top">추천</span>' : ''}
      <div><div class="h3">${p.name}</div><div class="small muted">${p.line}</div></div>
      <div class="price">${price}</div>
      ${t ? `<div class="tiny dim">실제 결제액 ${won(p.price)}/월 (VAT 포함)</div>` : ''}
      <ul class="feat">${p.feats.map((f) => `<li>${f}</li>`).join('')}</ul>
      ${p.review ? `<span class="badge b-a">${p.review}</span>` : ''}
      ${blockFree ? '<div class="tiny" style="color:var(--amber)">“결제해야 활성화” 방식에서는 무료 체험을 열 수 없어요</div>' : ''}
      <button class="btn ${p.hot ? 'btn-o' : 'btn-g'} btn-block ${blockFree ? 'is-off' : ''}" data-act="pick" data-id="${id}">${p.price === 0 ? '무료로 시작하기' : '시작하기'}</button>
    </div>`;
  }).join('');

  const packRows = PACKS.t.map((k) => `<tr><td>${won(k.supply)}</td><td>${won(k.pay)}</td><td class="r">${fmt(k.credits)}C</td><td class="r">${k.bonus ? `<span class="badge b-os">+${k.bonus}%</span>` : '–'}</td></tr>`).join('');

  return `
  <section class="sec wrap">
    <div class="eyebrow">PRICING</div>
    <h1 class="h1">Tab To Create.<br>작업 규모에 맞게 고르세요.</h1>
    <p class="lead">${t ? '팀 구독료는 플랫폼 이용료예요. AI 제작에 쓰는 크레딧은 필요한 만큼 따로 충전해요.' : '매월 크레딧이 들어오는 개인 구독이에요. 모자라면 1원 = 1C로 추가 충전할 수 있어요.'}</p>
    <div class="mt24">${personaSeg()}</div>
    ${t ? '' : `<div class="panel mt24" style="border-color:var(--amber)"><div class="between" style="flex-wrap:wrap;gap:8px"><div><div class="h3">개인 플랜은 ${PERSONAL_LAUNCH} 출시 예정이에요</div><div class="small muted">2027년에는 팀 플랜만 판매해요. 아래는 출시 예정 구성이고, 가격·조건은 바뀔 수 있어요.</div></div><span class="badge b-a">2027년 판매 안 함</span></div></div>`}
    <div class="grid g3 mt32">${cards}</div>
    ${t ? `
    <div class="grid g2 mt32">
      <div class="panel">
        <div class="h3">팀 크레딧 충전</div>
        <p class="small muted" style="margin:0 0 12px">1C = 1원 (VAT 별도) · 유효기간 ${SIX_MONTH_NOTE} · 팀 구독 중에만 충전 가능</p>
        <div class="scroll-x"><table class="tbl"><thead><tr><th>구매 공급가</th><th>결제액 (VAT 포함)</th><th class="r">지급 크레딧</th><th class="r">보너스</th></tr></thead><tbody>${packRows}
        <tr><td>100만 원 초과</td><td colspan="3" class="muted">별도 견적 · 세금계산서 계약</td></tr></tbody></table></div>
      </div>
      <div class="panel" style="display:flex;flex-direction:column;gap:12px">
        <div class="h3">Enterprise</div>
        <p class="small muted" style="margin:0">전용 모델, 대규모 처리량, 맞춤 계약이 필요한 조직은 상담으로 진행해요. 견적서와 세금계산서, 계좌이체로 결제해요.</p>
        <button class="btn btn-g" data-act="go-ent" style="align-self:flex-start;margin-top:auto">엔터프라이즈 보기</button>
      </div>
    </div>` : `
    <div class="panel mt32"><div class="between" style="flex-wrap:wrap"><div><div class="h3">추가 충전</div><div class="small muted">Basic · Plus 구독 중에 1원/C + VAT로 충전 · 보너스 없음 · 유효기간 6개월 (검토 중)</div></div><span class="badge b-a">최소 금액·단위 미정</span></div></div>`}
    ${t ? '<p class="tiny dim mt16">추가 좌석과 플랜별 세부 기능 범위는 확정 전 검토사항이에요.</p>' : ''}
    <div class="mt24">${memo(t
      ? `팀 구독은 <b>빌링 MID</b>(카드 정기결제, D+4 정산), 충전은 <b>환금성 MID</b>(단건 결제, M+4 정산)로 나뉘어요. 110만 원 패키지는 카드사 9곳 중 3곳(국민·비씨·삼성)에서만 결제돼요.<br>사업계획 ${PLAN_VER}은 조직당 <b>월 충전 Pro 200만 · Business 900만 원</b>을 가정해요. 셀프 충전 상한(110만 원)을 넘으니 충전 매출 대부분은 <b>견적·세금계산서 경로</b>로 들어와요. 손익은 팀 충전 전액에 보너스 5%를 가정했어요.`
      : `사업계획 ${PLAN_VER}: 개인 플랜은 <b>${PERSONAL_LAUNCH} 출시</b>, 2027년 개인 매출 없음. Free Trial 조건과 개인 추가 충전 최소 단위는 미확정이에요.<br>토스 빌링 조건: ① 크레딧 외 기능 제공 ② 미사용 크레딧 이월 불가 ③ 연 단위 결제 금지 → <b>연간 결제 할인은 둘 수 없어요.</b>`)}</div>
  </section>`;
}

/* ───────── 2. 회원가입 ───────── */
function vSignup() {
  const e = UI.errs;
  if (UI.signupPhase === 'verify' && S.user) {
    return `<div class="stage"><div class="paper">${prog('signup')}
      <h2>메일함을 확인해 주세요</h2>
      <p class="sub"><b>${esc(S.user.email)}</b>로 인증 링크를 보냈어요. 링크를 누르면 가입이 끝나요.</p>
      <button class="btn btn-grad btn-block" data-act="verify">인증 링크 누르기 (시뮬레이션)</button>
      <button class="btn btn-block mt8" style="color:var(--ink-2);background:none" data-act="resend">인증 메일 다시 보내기</button>
    </div></div>`;
  }
  const p = plan();
  return `<div class="stage"><div class="paper">${prog('signup')}
    <h2>Create account</h2>
    <p class="sub">${p ? `<b>${p.name}</b>을(를) 시작하려면 계정이 필요해요.` : 'TabTo 계정을 만들어요.'}</p>
    <div class="field"><label>Email</label><input class="inp" id="f-email" type="email" placeholder="you@example.com" value="${esc(S.user?.email || '')}"><div class="err">${e.email || ''}</div></div>
    <div class="field"><label>Password</label><input class="inp" id="f-pw" type="password" placeholder="8자 이상"><div class="err">${e.pw || ''}</div></div>
    <div class="field"><label>Confirm password</label><input class="inp" id="f-pw2" type="password" placeholder="비밀번호 다시 입력"><div class="err">${e.pw2 || ''}</div></div>
    <div class="field"><label>Name</label><input class="inp" id="f-name" placeholder="이름"></div>
    <div class="consent">
      <label class="chk all"><input type="checkbox" id="c-all" data-act="consent-all"> 전체 동의</label>
      <label class="chk"><input type="checkbox" class="c-req" id="c-terms"><span><span class="req">[필수]</span> 이용약관 (개인·팀)</span><a href="#/terms" target="_blank">보기</a></label>
      <label class="chk"><input type="checkbox" class="c-req" id="c-priv"><span><span class="req">[필수]</span> 개인정보 수집 및 이용</span><a href="https://tabto.ai/privacy" target="_blank" rel="noopener">보기</a></label>
      <label class="chk"><input type="checkbox" class="c-req" id="c-age"><span><span class="req">[필수]</span> 만 14세 이상입니다</span></label>
      <label class="chk"><input type="checkbox" id="c-mkt"><span><span class="opt">[선택]</span> 마케팅 정보 수신</span></label>
      <div class="err">${e.consent || ''}</div>
    </div>
    <button class="btn btn-grad btn-block" data-act="signup">Create account</button>
    <p class="small muted" style="text-align:center;margin:16px 0 0">이미 계정이 있나요? <a href="#/pricing">Sign in</a></p>
    <div class="mt16">${memo('지금 가입 화면은 약관이 <b>“Terms of Service (business-only service)”</b>로 되어 있어요. 개인·팀 이용약관으로 바꿔야 해요. 폼과 이메일 인증은 기존 기능을 그대로 써요.')}</div>
  </div></div>`;
}

/* ───────── 3. 계정 활성화 ───────── */
function vActivate() {
  if (!S.user || !S.verified) { setTimeout(() => go('signup')); return ''; }
  const p = plan();
  const nextRoute = !p ? 'pricing' : p.id === 'free' ? 'credits' : isTeam() ? 'team' : 'checkout';
  if (S.act === 'a') {
    if (!S.active) S.active = true;
    if (p && p.id === 'free' && !S.sub) {
      const now = new Date();
      S.sub = { plan: 'free', start: now, next: addDays(now, 14), trial: true };
      S.grants.push({ id: 'g' + Date.now(), src: 'trial', label: '무료 체험 지급', amount: 5000, left: 5000, at: now, exp: addDays(now, 14) });
    }
    save();
    return `<div class="stage"><div class="paper">${prog('activate')}
      <span class="badge b-g" style="background:#dcfce7;color:#166534">활성화됨</span>
      <h2 class="mt16">계정이 활성화됐어요</h2>
      <p class="sub">이메일 인증만으로 바로 TabTo를 쓸 수 있어요.</p>
      <div class="kv"><span>계정</span><span>${esc(S.user.email)}</span></div>
      <div class="kv"><span>선택한 플랜</span><span>${p ? p.name : '아직 고르지 않음'}</span></div>
      ${p && p.id === 'free' ? `<div class="kv"><span>체험 크레딧</span><span>5,000C · ${ymd(addDays(new Date(), 14))}까지</span></div>` : ''}
      <button class="btn btn-grad btn-block mt24" data-go="${nextRoute}">${!p ? '플랜 고르기' : p.id === 'free' ? '크레딧 확인하기' : '다음'}</button>
      <div class="mt16">${memo('<b>지금 코드</b>: 가입 → 이메일 인증 → <b>승인 대기</b> → 관리자 승인 또는 팀 참여 코드. 셀프 결제를 하려면 이 단계를 바꿔야 해요. 무료 크레딧 악용을 막을 장치(전화번호 인증 등)는 별도 결정이 필요해요.')}</div>
    </div></div>`;
  }
  S.active = !!(S.sub && !S.sub.trial);
  save();
  const freeBlocked = p && p.id === 'free';
  return `<div class="stage"><div class="paper">${prog('activate')}
    <span class="badge b-n">결제 대기</span>
    <h2 class="mt16">결제를 마치면 바로 쓸 수 있어요</h2>
    <p class="sub">이메일 인증이 끝났어요. 플랜 결제(카드 등록)를 완료하면 계정이 자동으로 활성화돼요.</p>
    <div class="kv"><span>계정</span><span>${esc(S.user.email)}</span></div>
    <div class="kv"><span>선택한 플랜</span><span>${p ? p.name : '아직 고르지 않음'}</span></div>
    ${freeBlocked ? '<div class="err mt8" style="font-size:13px">이 방식에서는 무료 체험을 제공하지 않아요. 유료 플랜을 골라 주세요.</div>' : ''}
    <button class="btn btn-grad btn-block mt24" data-go="${!p || freeBlocked ? 'pricing' : nextRoute}">${!p || freeBlocked ? '플랜 고르기' : '결제 진행하기'}</button>
    <div class="mt16">${memo('“결제해야 활성화” 방식은 AI 비용 악용을 막기 쉽지만, 사업계획서의 Free Trial과 함께 쓸 수 없어요.')}</div>
  </div></div>`;
}

/* ───────── 4. 팀 만들기 ───────── */
function vTeam() {
  const p = plan();
  if (!isTeam()) return `<div class="stage"><div class="paper"><h2>개인 플랜은 팀을 만들지 않아요</h2><p class="sub">개인 워크스페이스가 자동으로 만들어져요.</p><button class="btn btn-grad btn-block" data-go="checkout">결제로 이동</button></div></div>`;
  if (!p) { setTimeout(() => go('pricing')); return ''; }
  const e = UI.errs;
  return `<div class="stage"><div class="paper">${prog('team')}
    <h2>팀 워크스페이스 만들기</h2>
    <p class="sub">${p.name}은(는) 최대 ${p.seats}명까지 함께 쓸 수 있어요. 팀원은 결제 후 초대해요.</p>
    <div class="field"><label>팀 이름</label><input class="inp" id="f-team" placeholder="예: 스튜디오 모션랩" value="${esc(S.team?.name || '')}"><div class="err">${e.team || ''}</div></div>
    <div class="field"><label>어떤 팀인가요?</label>
      <select class="inp" id="f-kind">
        <option>회사 · 기관</option><option>프리랜서 · 크리에이터 그룹</option><option>교육기관 · 수업</option><option>기타</option>
      </select></div>
    <div class="kv"><span>최대 인원</span><span>${p.seats}명 (나 포함)</span></div>
    <div class="kv"><span>팀원 초대</span><span>참여 코드 · 이메일 초대</span></div>
    <button class="btn btn-grad btn-block mt24" data-act="team">팀 만들고 계속</button>
    <div class="mt16">${memo('<b>지금 코드</b>: 워크스페이스는 최고관리자만 만들 수 있어요. 사용자 직접 생성과 <b>인원 제한(10명/30명)</b>은 새로 개발해야 해요. 참여 코드·팀원별 크레딧 한도는 이미 있어요.')}</div>
  </div></div>`;
}

/* ───────── 5. 요금제 확인과 결제 동의 ───────── */
function vCheckout() {
  const p = plan();
  if (!p || p.price === 0) { setTimeout(() => go('pricing')); return ''; }
  if (!S.user || !S.verified) { setTimeout(() => go('signup')); return ''; }
  if (isTeam() && !S.team) { setTimeout(() => go('team')); return ''; }
  const now = new Date();
  const day = now.getDate();
  const e = UI.errs;
  return `<div class="stage"><div class="paper wide">${prog('checkout')}
    <h2>결제 내용을 확인해 주세요</h2>
    <p class="sub">카드를 등록하면 오늘 첫 결제가 되고, 이후 매월 ${day}일에 자동으로 결제돼요.</p>
    <div class="kv"><span>상품</span><span><b>${p.name}</b>${isTeam() ? ` · ${esc(S.team.name)}` : ''}</span></div>
    <div class="kv"><span>결제 주기</span><span>월간 (매월 ${day}일)</span></div>
    ${isTeam() ? `<div class="kv"><span>공급가</span><span>${won(p.supply)}</span></div><div class="kv"><span>부가세</span><span>${won(p.price - p.supply)}</span></div>` : ''}
    <div class="kv"><span>포함 크레딧</span><span>${p.credits ? `매월 ${fmt(p.credits)}C · 다음 결제일에 소멸` : '없음 · 충전은 별도'}</span></div>
    <div class="kv"><span>첫 결제일 / 다음 결제일</span><span>${ymd(now)} / ${ymd(addMonths(now, 1))}</span></div>
    <div class="kv"><span>오늘 결제 금액</span><span class="total">${won(p.price)}</span></div>
    <div class="consent mt16">
      <label class="chk all"><input type="checkbox" id="c-all" data-act="consent-all"> 아래 내용에 모두 동의</label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 주문 내용을 확인했고, 매월 ${won(p.price)}이 등록 카드로 자동결제되는 것에 동의해요</span></label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 구독은 해지하기 전까지 매월 자동 갱신되며, 언제든 다음 결제일 전에 해지할 수 있어요</span></label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 환불 및 취소 정책</span><a href="#/refund" target="_blank">보기</a></label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 유료서비스 이용약관</span><a href="#/terms" target="_blank">보기</a></label>
      <div class="err">${e.consent || ''}</div>
    </div>
    <button class="btn btn-grad btn-block" data-act="open-billing">카드 등록하고 ${won(p.price)} 결제</button>
    <div class="mt16">${memo(`토스 심사 캡처 대상(약관·환불 규정). <b>지금 약관은 “카드 자동결제를 제공하지 않음”, “자동 갱신되지 않음”</b>으로 되어 있어서 그대로는 심사 화면과 충돌해요.${isTeam() ? '' : ' 개인은 소비자 거래라 청약철회·자동갱신 고지 문구가 필요해요 (법무 확인).'}`)}</div>
  </div></div>`;
}

/* ───────── 6. 카드 등록 (빌링 결제창, 모의) ───────── */
function mBilling() {
  const p = plan();
  const st = UI.modal.step;
  const e = UI.errs;
  let body = '';
  if (st === 1) {
    body = `<h3>카드 정보를<br>입력해 주세요</h3><p class="muted small">TabTo · ${p.name} · 매월 ${won(p.price)}</p>
      <div class="row mt16 small"><label class="row" style="gap:6px"><input type="radio" name="ctype" value="p" checked data-act="ctype"> 개인 카드</label><label class="row" style="gap:6px"><input type="radio" name="ctype" value="c" data-act="ctype"> 법인 카드</label></div>
      <div class="field mt16"><label>카드 번호</label><div class="card4">${[1, 2, 3, 4].map((i) => `<input class="inp cn" inputmode="numeric" maxlength="4" placeholder="0000" ${i === 4 ? 'id="cn4"' : ''}>`).join('')}</div></div>
      <div class="field"><label>유효기간</label><input class="inp" id="exp" placeholder="MM/YY" maxlength="5" style="max-width:140px"></div>
      <div class="field"><label id="idlab">생년월일 6자리</label><input class="inp" id="idn" inputmode="numeric" maxlength="10" placeholder="YYMMDD"></div>
      <label class="chk small"><input type="checkbox" id="pg-agree"> [필수] 결제대행 서비스 이용약관 · 정기결제 동의</label>
      <div class="err">${e.card || ''}</div>
      <button class="pg-btn mt16" data-act="bill-1">다음</button>`;
  } else if (st === 2) {
    body = `<h3>본인 정보를<br>입력해 주세요</h3><p class="muted small">카드 소유자 확인을 위해 필요해요.</p>
      <div class="field mt16"><label>이름</label><input class="inp" id="nm" value="${esc(S.user?.name || '')}"></div>
      <div class="field"><label>휴대폰 번호</label><div class="row"><input class="inp" id="ph" inputmode="numeric" placeholder="01012345678"><button class="pg-btn gray" style="width:140px;height:46px;font-size:14px" data-act="send-code">인증번호 받기</button></div></div>
      <div class="field"><label>인증번호</label><input class="inp" id="code" inputmode="numeric" maxlength="6" placeholder="6자리 (아무 숫자)"></div>
      <div class="err">${e.auth || ''}</div>
      <button class="pg-btn mt8" data-act="bill-2">카드 등록하고 결제하기</button>`;
  } else if (st === 3) {
    body = `<h3>처리 중이에요</h3><p class="muted small">카드 등록 → 빌링키 발급 → 첫 결제</p><div class="spin"></div>`;
  } else {
    body = `<h3>카드가 등록됐어요</h3><p class="muted small">첫 결제 ${won(p.price)}가 완료됐어요. 다음 결제일은 ${ymd(addMonths(new Date(), 1))}이에요.</p>
      <button class="pg-btn mt24" data-act="bill-done">확인</button>`;
  }
  return `<div class="overlay"><div class="pg"><div class="pg-h"><b>토스페이먼츠 · 정기결제</b><button class="x" data-act="close-modal" aria-label="닫기">×</button></div>
    <div class="pg-b">${body}</div><div class="pg-mock">프로토타입용 모의 결제창 · 실제 결제가 일어나지 않으며, 실제 토스 화면과 다를 수 있어요</div></div></div>`;
}

function completeSub() {
  const p = plan();
  const now = new Date();
  const next = addMonths(now, 1);
  S.sub = { plan: p.id, start: now, next, last4: UI.last4 || '1234', ctype: UI.ctype || 'p', cancel: false };
  S.active = true;
  S.grants = S.grants.filter((g) => g.src !== 'trial');
  if (p.credits) S.grants.push({ id: 'g' + Date.now(), src: 'sub', label: `${p.name} 월 지급`, amount: p.credits, left: p.credits, at: now, exp: next });
  S.orders.unshift({ at: now, kind: '구독', name: p.name, amount: p.price, method: `${UI.ctype === 'c' ? '법인' : '개인'}카드 ****${UI.last4 || '1234'} (빌링)`, mid: '빌링 MID' });
  save();
}

function vSubscribed() {
  const p = plan();
  if (!S.sub || S.sub.trial || !p) { setTimeout(() => go('pricing')); return ''; }
  return `<section class="sec narrow">
    <span class="badge b-g">결제 완료</span>
    <h1 class="h2 mt16">${p.name} 구독이 시작됐어요</h1>
    <p class="lead">${isTeam() ? '이제 팀원을 초대하고, AI 제작에 쓸 크레딧을 충전하세요.' : '이번 달 크레딧이 들어왔어요. 바로 제작을 시작할 수 있어요.'}</p>
    <div class="panel mt24">
      <div class="kv"><span>플랜</span><span>${p.name}${isTeam() ? ` · ${esc(S.team?.name || '')}` : ''}</span></div>
      <div class="kv"><span>결제 금액</span><span>${won(p.price)}</span></div>
      <div class="kv"><span>결제 카드</span><span>${S.sub.ctype === 'c' ? '법인' : '개인'}카드 ****${esc(S.sub.last4)}</span></div>
      <div class="kv"><span>다음 결제일</span><span>${ymd(S.sub.next)}</span></div>
      <div class="kv"><span>지급 크레딧</span><span>${p.credits ? `${fmt(p.credits)}C · ${ymd(S.sub.next)}에 소멸` : '없음 (충전 필요)'}</span></div>
    </div>
    <div class="row mt24" style="flex-wrap:wrap">
      ${isTeam() ? '<button class="btn btn-o" data-go="charge">크레딧 충전하기</button><button class="btn btn-g" data-go="credits">워크스페이스로</button>' : '<button class="btn btn-o" data-go="credits">제작 시작하기</button><button class="btn btn-g" data-go="charge">추가 충전</button>'}
    </div>
    <div class="mt24">${memo('빌링 MID · 신용카드 정기결제 수수료 3.4% · D+4 일 정산. 카드사별 환금성 한도는 적용되지 않아요. <b>지금 코드</b>의 카드 등록 → 빌링키 → 첫 결제 흐름을 거의 그대로 쓸 수 있어요.')}</div>
  </section>`;
}

/* ───────── 7. 크레딧 충전 (단건 결제창) ───────── */
function payCheck(amount) {
  const c = S.charge;
  let src, key, label, auth;
  if (c.method === 'card') { src = CARDS.find((x) => x.n === c.issuer); key = 'card:' + src.n; label = `${src.n}카드`; auth = src.auth(amount); }
  else if (c.method === 'easy') { src = EASY.find((x) => x.k === c.easy); key = 'easy:' + src.k; label = `${src.n} 머니`; auth = src.auth; }
  else { src = BANKS.find((x) => x.k === c.bank); key = 'bank:' + src.k; label = src.n; auth = src.auth; }
  const used = S.used[key] || 0;
  let ok = true, reason = '';
  if (src.per && amount > src.per) { ok = false; reason = `1회 한도 ${won(src.per)} 초과`; }
  else if (src.mon && used + amount > src.mon) { ok = false; reason = `누적 한도 ${won(src.mon)} 초과 (이번 달 사용 ${won(used)})`; }
  return { ok, reason, auth, label, key, used, src };
}

function vCharge() {
  if (!S.user) { setTimeout(() => go('signup')); return ''; }
  const p = plan();
  if (S.sub?.trial || p?.id === 'free') return `<section class="sec narrow"><h1 class="h2">체험 중에는 충전할 수 없어요</h1><p class="lead">Free Trial은 별도 충전을 허용하지 않아요. Basic 또는 Plus를 구독하면 충전할 수 있어요.</p><button class="btn btn-o mt24" data-go="pricing">플랜 보기</button></section>`;
  if (!S.sub) return `<section class="sec narrow"><h1 class="h2">구독 중에만 충전할 수 있어요</h1><p class="lead">${isTeam() ? '팀 플랜을 먼저 구독해 주세요.' : 'Basic 또는 Plus를 먼저 구독해 주세요.'}</p><button class="btn btn-o mt24" data-go="pricing">플랜 보기</button></section>`;

  const c = S.charge;
  const packs = PACKS[S.persona];
  if (c.pack >= packs.length) c.pack = 0;
  const k = packs[c.pack];
  const chk = payCheck(k.pay);

  const packOpts = packs.map((x, i) => `<button class="opt ${i === c.pack ? 'on' : ''}" data-act="pack" data-i="${i}">
      <span><b>${fmt(x.credits)}C</b>${x.bonus ? ` <span class="badge b-os">+${x.bonus}%</span>` : ''}<div class="s">공급가 ${won(x.supply)} + VAT</div></span><span>${won(x.pay)}</span></button>`).join('');

  const methods = [['card', '신용 · 체크카드', '수수료 3.4% · 카드사별 한도'], ['easy', '간편결제', '토스페이 · 카카오페이 · 네이버페이 · 페이코'], ['bank', '계좌이체', '퀵계좌이체 · 뱅크페이 · 수수료 1.8%']];
  const mOpts = methods.map(([v, n, s]) => `<button class="opt ${c.method === v ? 'on' : ''}" data-act="method" data-v="${v}"><span>${n}<div class="s">${s}</div></span></button>`).join('')
    + '<button class="opt off" disabled><span>가상계좌<div class="s">환금성 상품은 사용할 수 없어요</div></span></button>';

  let sub = '';
  if (c.method === 'card') sub = `<div class="chips">${CARDS.map((x) => `<button class="chip ${c.issuer === x.n ? 'on' : ''}" data-act="issuer" data-v="${x.n}">${x.n}</button>`).join('')}</div>
      <div class="tiny dim mt8">법인카드·사업비 전용 카드도 같은 한도가 적용돼요.</div>`;
  else if (c.method === 'easy') sub = `<div class="chips">${EASY.map((x) => `<button class="chip ${c.easy === x.k ? 'on' : ''}" data-act="easy" data-v="${x.k}">${x.n}</button>`).join('')}</div>
      <div class="tiny dim mt8">${chk.src.lim} · 간편결제에 등록한 카드로 결제하면 해당 카드사 한도가 똑같이 적용돼요.</div>`;
  else sub = `<div class="chips">${BANKS.map((x) => `<button class="chip ${c.bank === x.k ? 'on' : ''}" data-act="bank" data-v="${x.k}">${x.n}</button>`).join('')}</div>
      <div class="tiny dim mt8">${chk.src.lim}</div>`;

  const status = chk.ok
    ? `<div class="check-line ok">✓ <span>${chk.label}로 결제할 수 있어요 · 인증: ${esc(chk.auth)}</span></div>`
    : `<div class="check-line no">✕ <span>${chk.label}로는 결제가 거절될 수 있어요 · ${chk.reason}</span></div>`;

  const okCount = CARDS.filter((x) => (!x.per || k.pay <= x.per) && (!x.mon || (S.used['card:' + x.n] || 0) + k.pay <= x.mon)).length;
  const cardTable = CARDS.map((x) => {
    const u = S.used['card:' + x.n] || 0;
    const ok = (!x.per || k.pay <= x.per) && (!x.mon || u + k.pay <= x.mon);
    return `<tr><td>${x.n}</td><td>${x.per ? won(x.per) : '–'}</td><td>${x.mon ? won(x.mon) : '–'}${x.note ? ` · ${x.note}` : ''}</td><td class="r">${u ? won(u) : '–'}</td><td class="r">${ok ? '<span class="badge b-g">가능</span>' : '<span class="badge b-r">불가</span>'}</td></tr>`;
  }).join('');

  return `<section class="sec wrap">
    <div class="eyebrow">CREDITS</div>
    <h1 class="h2 mt8">${isTeam() ? `${esc(S.team?.name || '팀')} 크레딧 충전` : '크레딧 추가 충전'}</h1>
    <p class="lead">충전한 크레딧은 6개월 동안 쓸 수 있어요. 현재 잔액 ${fmt(balance())}C</p>
    <p class="tiny" style="color:var(--amber);margin:4px 0 0">유효기간 6개월은 경영관리본부 승인 전 검토안이에요 (사업계획 ${PLAN_VER} 1-7).</p>
    <div class="grid mt32" style="grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr));align-items:start">
      <div class="grid" style="gap:28px">
        <div><div class="small muted" style="margin-bottom:10px">1. 충전 금액</div><div class="opts">${packOpts}</div>
          ${isTeam() ? '<div class="tiny dim mt8">100만 원을 넘는 충전은 <a href="#/enterprise" data-act="go-ent">견적 문의</a>로 세금계산서 결제해요.</div>' : '<div class="tiny mt8" style="color:var(--amber)">개인 충전 금액은 예시예요. 최소 금액과 단위는 미정이에요.</div>'}</div>
        <div><div class="small muted" style="margin-bottom:10px">2. 결제 수단</div><div class="opts">${mOpts}</div></div>
        <div><div class="small muted" style="margin-bottom:10px">3. ${c.method === 'card' ? '카드사' : c.method === 'easy' ? '간편결제' : '이체 방식'}</div>${sub}<div class="mt16">${status}</div></div>
      </div>
      <div class="panel" style="position:sticky;top:84px">
        <div class="h3">결제 요약</div>
        <div class="kv"><span>지급 크레딧</span><span>${fmt(k.credits)}C${k.bonus ? ` (보너스 ${k.bonus}% 포함)` : ''}</span></div>
        <div class="kv"><span>공급가</span><span>${won(k.supply)}</span></div>
        <div class="kv"><span>부가세</span><span>${won(k.pay - k.supply)}</span></div>
        <div class="kv"><span>유효기간</span><span>${ymd(addMonths(new Date(), 6))}까지</span></div>
        <div class="kv"><span>결제 수단</span><span>${chk.label}</span></div>
        <div class="kv"><span>결제 금액</span><span class="total">${won(k.pay)}</span></div>
        <label class="row small mt16" style="align-items:flex-start;gap:8px;cursor:pointer"><input type="checkbox" id="ch-agree" style="accent-color:var(--orange);margin-top:4px"> <span class="muted">[필수] 충전 크레딧의 유효기간(6개월)과 <a href="#/refund" target="_blank">환불 정책</a>을 확인했어요</span></label>
        <div class="err" id="ch-err"></div>
        <button class="btn btn-o btn-block mt8" data-act="open-pay">${won(k.pay)} 결제하기</button>
      </div>
    </div>
    <div class="panel mt32">
      <div class="between" style="flex-wrap:wrap"><div class="h3">카드사별 한도 (${won(k.pay)} 기준)</div><span class="badge b-n">${okCount} / 9곳 가능</span></div>
      <p class="small muted" style="margin:4px 0 12px">토스페이먼츠 안내 기준 · 실제 승인 여부는 카드사 운영 기준에 따라 달라질 수 있어요. 결제를 반복하면 누적 한도가 반영돼요.</p>
      <div class="scroll-x"><table class="tbl"><thead><tr><th>카드사</th><th>건당 한도</th><th>월 누적 한도</th><th class="r">이번 달 사용</th><th class="r">결제</th></tr></thead><tbody>${cardTable}</tbody></table></div>
    </div>
    <div class="mt16">${memo(`환금성 MID · 단건 결제 · M+4 월 정산 · 정산 한도 월 5,000만 원. <b>지금 코드</b>는 크레딧 팩을 등록 카드(빌링키)로 결제해요. 토스 조건상 충전은 이 단건 결제창으로 옮겨야 하고, 토스 키도 MID별로 두 벌이 필요해요.<br>사업계획 ${PLAN_VER} 1-7: 6개월은 고객 혜택으로 제안하되 <b>경영관리·회계·법무·PG 검토 전에는 확정 정책으로 외부 공지하지 않아요.</b> 부담이 크면 “기본 3개월 + 기업 계약 6개월” 안을 비교해요.`)}</div>
  </section>`;
}

function mPay() {
  const k = PACKS[S.persona][S.charge.pack];
  const chk = payCheck(k.pay);
  const st = UI.modal.step;
  let body;
  if (st === 1) {
    body = chk.ok
      ? `<h3>${chk.label}<br>인증을 진행해요</h3><p class="muted small">${won(k.pay)} · TabTo 크레딧 ${fmt(k.credits)}C</p>
         <div class="mt16" style="background:#f9fafb;border-radius:12px;padding:14px;font-size:14px"><b>필요한 인증</b><div class="muted" style="margin-top:4px">${esc(chk.auth)}</div></div>
         <button class="pg-btn mt24" data-act="pay-auth">인증 완료 (시뮬레이션)</button>`
      : `<h3>결제가<br>거절됐어요</h3><p class="muted small">${chk.label} · ${won(k.pay)}</p>
         <div class="mt16" style="background:#fff1f2;color:#be123c;border-radius:12px;padding:14px;font-size:14px">카드사 환금성 한도: ${chk.reason}</div>
         <p class="muted small mt16">다른 결제수단을 고르거나, 금액을 줄여 주세요.</p>
         <button class="pg-btn mt8" data-act="close-modal">다른 결제수단 선택</button>`;
  } else if (st === 2) {
    body = `<h3>결제 중이에요</h3><p class="muted small">승인 요청 → 결제 승인(confirm) → 크레딧 지급</p><div class="spin"></div>`;
  }
  return `<div class="overlay"><div class="pg"><div class="pg-h"><b>토스페이먼츠 · 결제</b><button class="x" data-act="close-modal" aria-label="닫기">×</button></div>
    <div class="pg-b">${body}</div><div class="pg-mock">프로토타입용 모의 결제창 · 실제 결제가 일어나지 않아요</div></div></div>`;
}

function completePay() {
  const k = PACKS[S.persona][S.charge.pack];
  const chk = payCheck(k.pay);
  const now = new Date();
  S.used[chk.key] = (S.used[chk.key] || 0) + k.pay;
  S.grants.push({ id: 'g' + Date.now(), src: 'topup', label: '크레딧 충전', amount: k.credits, left: k.credits, at: now, exp: addMonths(now, 6) });
  S.orders.unshift({ at: now, kind: '충전', name: `크레딧 ${fmt(k.credits)}C`, amount: k.pay, method: chk.label, mid: '환금성 MID' });
  UI.lastPay = { ...k, label: chk.label, at: now };
  save();
}

function vPaid() {
  const l = UI.lastPay;
  if (!l) { setTimeout(() => go('charge')); return ''; }
  return `<section class="sec narrow">
    <span class="badge b-g">충전 완료</span>
    <h1 class="h2 mt16">${fmt(l.credits)}C가 충전됐어요</h1>
    <p class="lead">지금 잔액은 ${fmt(balance())}C예요.</p>
    <div class="panel mt24">
      <div class="kv"><span>결제 금액</span><span>${won(l.pay)}</span></div>
      <div class="kv"><span>결제 수단</span><span>${esc(l.label)}</span></div>
      <div class="kv"><span>지급 크레딧</span><span>${fmt(l.credits)}C</span></div>
      <div class="kv"><span>유효기간</span><span>${ymd(addMonths(l.at, 6))}까지</span></div>
    </div>
    <div class="row mt24" style="flex-wrap:wrap"><button class="btn btn-o" data-go="credits">크레딧 쓰러 가기</button><button class="btn btn-g" data-go="charge">더 충전하기</button></div>
    <div class="mt24">${memo('토스 충전 심사 캡처 ⑦⑧: 결제 과정과 <b>결제 후 크레딧이 쓰이는 곳</b>까지 필요해요.')}</div>
  </section>`;
}

/* ───────── 8. 크레딧 반영과 사용처 ───────── */
/* 예시 차감량 = 실측 원가(USD) × 1,500원 × 1.30 (사업계획 v1.3 가정)
   나노바나나 프로 1K $0.15 → 293C · 씨댄스 2.5 720p 5초 $1.155 → 2,252C (탭토 실측, 11/16~24) */
const TASKS = [
  { n: '이미지 생성 · 나노바나나 프로 1K · 1장', c: 293 },
  { n: '영상 생성 · 씨댄스 2.5 720p · 5초', c: 2252 },
];
function spend(cost, name) {
  if (balance() < cost) return false;
  let need = cost;
  const live = S.grants.filter((g) => g.left > 0 && new Date(g.exp) > new Date()).sort((a, b) => new Date(a.exp) - new Date(b.exp));
  const from = [];
  for (const g of live) { if (!need) break; const take = Math.min(g.left, need); g.left -= take; need -= take; from.push(`${g.src === 'topup' ? '충전' : g.src === 'contract' ? '계약' : g.src === 'trial' ? '체험' : '구독'} ${fmt(take)}C`); }
  S.usage.unshift({ at: new Date(), name, cost, from: from.join(' + ') });
  save();
  return true;
}

function vCredits() {
  if (!S.user) { setTimeout(() => go('signup')); return ''; }
  const p = plan();
  const bal = balance();
  const live = S.grants.filter((g) => new Date(g.exp) > new Date());
  const prepaid = (g) => g.src === 'topup' || g.src === 'contract';
  const subLeft = live.filter((g) => !prepaid(g)).reduce((a, g) => a + g.left, 0);
  const topLeft = live.filter(prepaid).reduce((a, g) => a + g.left, 0);
  const total = Math.max(1, subLeft + topLeft);
  const grantRows = S.grants.length ? S.grants.slice().sort((a, b) => new Date(a.exp) - new Date(b.exp)).map((g) => `<tr>
      <td>${g.src === 'topup' ? '<span class="badge b-os">충전</span>' : g.src === 'contract' ? '<span class="badge b-os">계약</span>' : g.src === 'trial' ? '<span class="badge b-a">체험</span>' : '<span class="badge b-g">구독</span>'} ${esc(g.label)}</td>
      <td>${ymd(g.at)}</td><td class="r">${fmt(g.left)} / ${fmt(g.amount)}C</td><td class="r">${ymd(g.exp)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="muted">아직 크레딧이 없어요</td></tr>';
  const useRows = S.usage.length ? S.usage.map((u) => `<tr><td>${esc(u.name)}</td><td class="r">−${fmt(u.cost)}C</td><td class="muted small">${esc(u.from)}</td></tr>`).join('') : '<tr><td colspan="3" class="muted">아직 사용 내역이 없어요</td></tr>';
  const orderRows = S.orders.length ? S.orders.map((o) => `<tr><td>${ymd(o.at)}</td><td>${esc(o.kind)} · ${esc(o.name)}</td><td>${esc(o.method)}<div class="tiny dim">${o.mid}</div></td><td class="r">${won(o.amount)}</td></tr>`).join('') : '<tr><td colspan="4" class="muted">결제 내역이 없어요</td></tr>';

  return `<section class="sec wrap">
    <div class="eyebrow">${isEnt() ? esc(S.ent?.company || 'ENTERPRISE') + ' · WORKSPACE' : isTeam() ? esc(S.team?.name || 'TEAM') + ' · WORKSPACE' : 'MY WORKSPACE'}</div>
    <h1 class="h2 mt8">크레딧</h1>
    <div class="grid g3 mt24">
      <div class="panel"><div class="small muted">사용 가능</div><div class="price mt8">${fmt(bal)}<small>C</small></div>
        <div class="meter mt16"><i style="width:${(subLeft / total) * 100}%;background:var(--green)"></i><i style="width:${(topLeft / total) * 100}%;background:var(--orange)"></i></div>
        <div class="row tiny muted mt8" style="gap:16px"><span>● <span style="color:var(--green)">구독·체험</span> ${fmt(subLeft)}C</span><span>● <span style="color:var(--orange-2)">충전·계약</span> ${fmt(topLeft)}C</span></div></div>
      ${isEnt() ? `<div class="panel"><div class="small muted">계약</div><div class="h3 mt8">Enterprise</div>
        <div class="small muted">${S.ent?.paid ? `선납 계약 · 세금계산서 ${esc(S.ent.taxEmail)}` : '계약 전'}</div></div>
      <div class="panel" style="display:flex;flex-direction:column;gap:8px"><div class="small muted">크레딧이 모자라면</div>
        <button class="btn btn-o" data-act="ent-again">추가 견적 요청</button>
        <div class="tiny dim">추가 구매도 견적 → 세금계산서 → 계좌이체로 진행해요</div></div>` : `
      <div class="panel"><div class="small muted">플랜</div><div class="h3 mt8">${p ? p.name : '없음'}</div>
        <div class="small muted">${S.sub ? (S.sub.trial ? `체험 종료 ${ymd(S.sub.next)}` : S.sub.cancel ? `${ymd(S.sub.next)}에 해지 예정` : `다음 결제 ${ymd(S.sub.next)} · ${won(p.price)}`) : '구독 없음'}</div>
        ${S.sub && !S.sub.trial ? `<button class="btn btn-g btn-sm mt16" data-act="cancel">${S.sub.cancel ? '해지 취소' : '구독 해지 예약'}</button>` : ''}</div>
      <div class="panel" style="display:flex;flex-direction:column;gap:8px"><div class="small muted">크레딧이 모자라면</div>
        <button class="btn btn-o" data-go="charge" ${S.sub?.trial ? 'disabled' : ''}>크레딧 충전</button>
        ${S.sub?.trial ? '<div class="tiny dim">체험 중에는 충전할 수 없어요</div>' : ''}</div>`}
    </div>

    <div class="panel mt24">
      <div class="h3">작업 실행해 보기</div>
      <p class="small muted" style="margin:4px 0 16px">에디터에서 생성 노드를 실행하면 예상 크레딧이 차감돼요. 만료일이 빠른 크레딧부터 써요.</p>
      <div class="row" style="flex-wrap:wrap">${TASKS.map((t, i) => `<button class="btn btn-g btn-sm" data-act="run" data-i="${i}">${t.n} · ${fmt(t.c)}C</button>`).join('')}</div>
    </div>

    <div class="grid g2 mt24" style="align-items:start">
      <div class="panel"><div class="h3">보유 크레딧</div><div class="scroll-x"><table class="tbl mt8"><thead><tr><th>종류</th><th>지급일</th><th class="r">남음 / 지급</th><th class="r">만료일</th></tr></thead><tbody>${grantRows}</tbody></table></div></div>
      <div class="panel"><div class="h3">사용 내역</div><div class="scroll-x"><table class="tbl mt8"><thead><tr><th>작업</th><th class="r">크레딧</th><th>차감된 곳</th></tr></thead><tbody>${useRows}</tbody></table></div></div>
    </div>
    <div class="panel mt24"><div class="h3">결제 내역 · 영수증</div><div class="scroll-x"><table class="tbl mt8"><thead><tr><th>날짜</th><th>내용</th><th>결제 수단</th><th class="r">금액</th></tr></thead><tbody>${orderRows}</tbody></table></div></div>
    <div class="mt16">${memo(`구독 크레딧은 다음 결제일에 소멸, 충전 크레딧은 6개월 유지. <b>지금 코드</b>는 구독 크레딧도 6개월 유지라 바꿔야 해요. 크레딧 장부·차감·사용 내역은 기존 기능을 쓰고, 차감 단가(원가 × 1.30)는 관리자 설정값으로 맞추면 돼요.<br>예시 차감량은 탭토 실측 원가 × 1,500원/USD × 1.30 (사업계획 ${PLAN_VER} 가정)이에요. <b>지금 운영 설정은 1,500원 × 1.2</b>라서 1.30으로 바꾸려면 설정 변경이 필요해요.`)}</div>
  </section>`;
}

/* ───────── 엔터프라이즈 (PG 밖 · 현행 기업용 약관) ───────── */
function entProg(at) {
  const steps = ['enterprise', 'ent-quote', 'ent-invoice'];
  const i = steps.indexOf(at);
  return `<div class="prog">${steps.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>`;
}
const entQuote = (supply) => ({ supply, vat: supply / 10, pay: supply * 1.1, credits: Math.round(supply * (1 + ENT_BONUS / 100)) });

function vEntPricing() {
  const steps = [
    ['도입 문의', '회사 정보와 예상 사용량을 남겨요'],
    ['견적 확정', '금액 · 크레딧 · 유효기간 · VAT를 견적서로 확정'],
    ['청구서 · 세금계산서', '견적 확정 후 발행'],
    ['계좌이체', '발행일로부터 30일 이내 입금'],
    ['크레딧 지급', '입금 확인 후 2영업일 이내 · 6개월 사용'],
  ];
  return `
  <section class="sec wrap">
    <div class="eyebrow">PRICING</div>
    <h1 class="h1">Scale visual production<br>without limits.</h1>
    <p class="lead">전용 모델, 대규모 처리량, 맞춤 계약이 필요한 조직을 위한 계약형 상품이에요. 카드 결제 없이 견적서와 세금계산서로 진행해요.</p>
    <div class="mt24">${personaSeg()}</div>
    <div class="grid g2 mt32" style="align-items:start">
      <div class="plan hot">
        <span class="badge b-o top">계약형</span>
        <div><div class="h3">Enterprise</div><div class="small muted">선불 크레딧 · 구독 · 전용 모델 · 기술지원</div></div>
        <div class="price">별도 견적</div>
        <div class="tiny dim">예: 300만 원 선납 시 330만 크레딧 · 6개월 (현행 계약 조건 · 신규 보너스율은 협의)</div>
        <ul class="feat">
          <li>대량 크레딧 선납 (100만 원 초과)</li>
          <li>팀 · 프로젝트 · 멤버별 크레딧 한도</li>
          <li>전용 모델 · 전용 인프라 (협의)</li>
          <li>견적서 · 세금계산서 · 계좌이체</li>
          <li>사용량 내역과 7영업일 이의제기</li>
        </ul>
        <button class="btn btn-o btn-block" data-go="enterprise">도입 문의하기</button>
      </div>
      <div class="panel">
        <div class="h3">진행 순서</div>
        ${steps.map(([a, b], i) => `<div class="kv"><span>${i + 1}. ${a}</span><span class="small">${b}</span></div>`).join('')}
        <div class="h3 mt24">셀프 충전과 비교</div>
        <div class="scroll-x"><table class="tbl mt8"><thead><tr><th></th><th>팀 셀프 충전</th><th>엔터프라이즈</th></tr></thead><tbody>
          <tr><td class="muted">금액</td><td>11만 ~ 110만 원</td><td>100만 원 초과</td></tr>
          <tr><td class="muted">결제</td><td>카드 · 간편결제 · 계좌이체 (PG)</td><td>계좌이체 (세금계산서)</td></tr>
          <tr><td class="muted">보너스</td><td>0 / 2 / 5%</td><td>협의 (현행 계약 10%)</td></tr>
          <tr><td class="muted">결제 수수료</td><td>3.4% / 1.8%</td><td>없음</td></tr>
          <tr><td class="muted">카드사 한도</td><td>적용</td><td>해당 없음</td></tr>
          <tr><td class="muted">유효기간</td><td>6개월 (검토안)</td><td>6개월 (계약으로 조정 가능)</td></tr>
        </tbody></table></div>
      </div>
    </div>
    <div class="mt24">${memo(`엔터프라이즈는 <b>토스 PG를 거치지 않아요.</b> 현행 기업용 약관(견적 → 세금계산서 → 계좌이체 선납)을 그대로 써요. 300만 원을 PG로 받으면 카드 9곳 중 3곳만 가능하고 수수료 10.2만 원(카드)이 들어서 계약 경로가 유리해요.<br>사업계획 ${PLAN_VER}: 100만 원 초과 대량 구매의 <b>최종 보너스율은 미결정</b>이고, 손익은 팀 충전 전액 <b>5%</b>로 계산했어요. 현행 계약 10%를 그대로 쓰면 2027년 이익률(2.8%)이 계획보다 낮아져요.`)}</div>
  </section>`;
}

function vEnterprise() {
  const e = S.ent || {};
  const er = UI.errs;
  return `<div class="stage"><div class="paper wide">${entProg('enterprise')}
    <h2>엔터프라이즈 도입 문의</h2>
    <p class="sub">영업일 기준 1~2일 안에 담당자가 연락드리고, 견적서를 보내드려요.</p>
    <div class="grid g2" style="gap:0 16px">
      <div class="field"><label>회사명</label><input class="inp" id="e-company" placeholder="(주)스튜디오모션" value="${esc(e.company || '')}"><div class="err">${er.company || ''}</div></div>
      <div class="field"><label>사업자등록번호</label><input class="inp" id="e-biz" inputmode="numeric" placeholder="000-00-00000" value="${esc(e.biz || '')}"><div class="err">${er.biz || ''}</div></div>
      <div class="field"><label>담당자 이름</label><input class="inp" id="e-name" placeholder="홍길동" value="${esc(e.name || '')}"><div class="err">${er.name || ''}</div></div>
      <div class="field"><label>업무 이메일</label><input class="inp" id="e-email" type="email" placeholder="name@company.com" value="${esc(e.email || '')}"><div class="err">${er.email || ''}</div></div>
      <div class="field"><label>연락처</label><input class="inp" id="e-phone" placeholder="02-000-0000" value="${esc(e.phone || '')}"></div>
      <div class="field"><label>사용 인원</label><select class="inp" id="e-seats">${['10명 이하', '11~30명', '31~100명', '100명 이상'].map((o) => `<option ${e.seats === o ? 'selected' : ''}>${o}</option>`).join('')}</select></div>
    </div>
    <div class="field"><label>예상 선납 금액 (공급가)</label>
      <div class="chips" style="margin-top:2px">${ENT_AMOUNTS.map((a, i) => `<button class="chip ${((e.amount ?? 0) === i) ? 'on' : ''}" style="background:${(e.amount ?? 0) === i ? 'var(--orange)' : '#fff'};color:${(e.amount ?? 0) === i ? '#fff' : 'var(--ink)'};border-color:var(--ink-line)" data-act="ent-amount" data-i="${i}">${a.label}</button>`).join('')}</div></div>
    <div class="field"><label>필요한 것</label><input class="inp" id="e-msg" placeholder="예: 광고 영상 제작 파이프라인, 전용 모델 검토" value="${esc(e.msg || '')}"></div>
    <div class="consent">
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 문의 처리를 위한 개인정보 수집 및 이용</span><a href="https://tabto.ai/privacy" target="_blank" rel="noopener">보기</a></label>
      <div class="err">${er.consent || ''}</div>
    </div>
    <button class="btn btn-grad btn-block" data-act="ent-submit">문의 보내기</button>
    <div class="mt16">${memo('<b>지금 사이트</b>에도 기업 서비스 문의 페이지(tabto.ai/contact)가 있어요. 이 단계는 그 페이지를 그대로 써도 돼요.')}</div>
  </div></div>`;
}

function vEntQuote() {
  const e = S.ent;
  if (!e) { setTimeout(() => go('enterprise')); return ''; }
  const q = entQuote(ENT_AMOUNTS[e.amount ?? 0].supply);
  const er = UI.errs;
  return `<div class="stage"><div class="paper wide">${entProg('ent-quote')}
    <span class="badge b-n">담당자가 보낸 견적서</span>
    <h2 class="mt16">견적서를 확인해 주세요</h2>
    <p class="sub">${esc(e.company)} · ${esc(e.name)} 님 · 견적 유효기간 ${ymd(addDays(new Date(), 14))}까지</p>
    <div class="kv"><span>상품</span><span>TabTo Enterprise 선불 크레딧</span></div>
    <div class="kv"><span>공급가</span><span>${won(q.supply)}</span></div>
    <div class="kv"><span>부가세 (10%)</span><span>${won(q.vat)}</span></div>
    <div class="kv"><span>지급 크레딧</span><span>${fmt(q.credits)}C (보너스 ${ENT_BONUS}%)</span></div>
    <div class="kv"><span>유효기간</span><span>지급일로부터 6개월</span></div>
    <div class="kv"><span>결제 방식</span><span>계좌이체 선납 (청구서 발행일로부터 30일 이내)</span></div>
    <div class="kv"><span>청구 금액 (VAT 포함)</span><span class="total">${won(q.pay)}</span></div>
    <div class="h3 mt24" style="color:var(--ink)">세금계산서 정보</div>
    <div class="grid g2" style="gap:0 16px;margin-top:8px">
      <div class="field"><label>업태 · 종목</label><input class="inp" id="q-type" placeholder="서비스 · 영상제작" value="${esc(e.bizType || '')}"><div class="err">${er.type || ''}</div></div>
      <div class="field"><label>세금계산서 수신 이메일</label><input class="inp" id="q-tax" type="email" placeholder="tax@company.com" value="${esc(e.taxEmail || e.email || '')}"><div class="err">${er.tax || ''}</div></div>
      <div class="field"><label>관리자 계정 이메일</label><input class="inp" id="q-admin" type="email" placeholder="워크스페이스 관리자" value="${esc(e.adminEmail || e.email || '')}"><div class="err">${er.admin || ''}</div></div>
      <div class="field"><label>사업장 주소</label><input class="inp" id="q-addr" placeholder="서울시 ..." value="${esc(e.addr || '')}"></div>
    </div>
    <div class="consent">
      <label class="chk all"><input type="checkbox" id="c-all" data-act="consent-all"> 아래 내용에 모두 동의</label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 기업용 서비스 이용약관</span><a href="https://tabto.ai/terms" target="_blank" rel="noopener">보기</a></label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 기업용 유료서비스 및 정산 기준</span><a href="https://tabto.ai/paid-service-terms" target="_blank" rel="noopener">보기</a></label>
      <label class="chk"><input type="checkbox" class="c-req"><span><span class="req">[필수]</span> 기업용 환불 및 취소 정책</span><a href="https://tabto.ai/refund-policy" target="_blank" rel="noopener">보기</a></label>
      <div class="err">${er.consent || ''}</div>
    </div>
    <button class="btn btn-grad btn-block" data-act="ent-confirm">견적 확정하고 청구서 받기</button>
    <div class="mt16">${memo(`${e.amount ? '500만 · 1,000만 원 견적은 300만 원 조건(+10%)을 그대로 적용한 <b>예시</b>예요. ' : ''}현행 조건 “300만 원 → 330만 C”의 <b>300만 원이 공급가인지 VAT 포함인지</b> 확인이 필요해요. 여기서는 공급가로 계산했어요. 동의 항목은 지금 tabto.ai에 있는 기업용 약관 3종이에요.`)}</div>
  </div></div>`;
}

function vEntInvoice() {
  const e = S.ent;
  if (!e || !e.quoted) { setTimeout(() => go(e ? 'ent-quote' : 'enterprise')); return ''; }
  const q = entQuote(ENT_AMOUNTS[e.amount ?? 0].supply);
  const issued = new Date(e.quoted);
  if (e.paid) {
    return `<section class="sec narrow">
      <span class="badge b-g">크레딧 지급 완료</span>
      <h1 class="h2 mt16">${fmt(q.credits)}C가 지급됐어요</h1>
      <p class="lead">${esc(e.company)} 워크스페이스가 만들어졌고, 관리자 초대 메일을 ${esc(e.adminEmail)}로 보냈어요.</p>
      <div class="panel mt24">
        <div class="kv"><span>입금액</span><span>${won(q.pay)}</span></div>
        <div class="kv"><span>지급 크레딧</span><span>${fmt(q.credits)}C</span></div>
        <div class="kv"><span>유효기간</span><span>${ymd(addMonths(new Date(e.paid), 6))}까지</span></div>
        <div class="kv"><span>세금계산서</span><span>${esc(e.taxEmail)}로 발행 완료</span></div>
      </div>
      <div class="row mt24" style="flex-wrap:wrap"><button class="btn btn-o" data-go="credits">워크스페이스로</button></div>
      <div class="mt24">${memo('<b>지금 코드</b>: 최고관리자가 워크스페이스를 만들고 크레딧을 수동 지급(admin_grant)해요. 팀원 초대는 참여 코드를 써요. 이 경로는 코드 변경이 거의 필요 없어요.')}</div>
    </section>`;
  }
  return `<div class="stage"><div class="paper wide">${entProg('ent-invoice')}
    <span class="badge b-n">청구서 발행됨</span>
    <h2 class="mt16">아래 계좌로 입금해 주세요</h2>
    <p class="sub">청구서와 전자세금계산서를 ${esc(e.taxEmail)}로 보냈어요. 입금이 확인되면 2영업일 안에 크레딧이 지급돼요.</p>
    <div class="kv"><span>청구 금액</span><span class="total">${won(q.pay)}</span></div>
    <div class="kv"><span>입금 계좌</span><span>○○은행 000-000000-00-000 · (주)자이언트스텝</span></div>
    <div class="kv"><span>입금자명</span><span>${esc(e.company)}</span></div>
    <div class="kv"><span>입금 기한</span><span>${ymd(addDays(issued, 30))} (발행일로부터 30일)</span></div>
    <div class="kv"><span>지급 예정 크레딧</span><span>${fmt(q.credits)}C · 6개월</span></div>
    <button class="btn btn-grad btn-block mt24" data-act="ent-paid">입금 확인 처리 (시뮬레이션)</button>
    <p class="small muted" style="text-align:center;margin:12px 0 0">기한 안에 입금이 없으면 견적과 청구는 효력을 잃어요.</p>
    <div class="mt16">${memo('입금 계좌는 가상의 값이에요. 송금 수수료는 고객 부담 (현행 기업용 정산 기준 제6조).')}</div>
  </div></div>`;
}

function completeEnt() {
  const e = S.ent;
  const q = entQuote(ENT_AMOUNTS[e.amount ?? 0].supply);
  const now = new Date();
  e.paid = now;
  S.user = { email: e.adminEmail || e.email, name: e.name };
  S.verified = true; S.active = true;
  S.grants.push({ id: 'g' + Date.now(), src: 'contract', label: '엔터프라이즈 계약 지급', amount: q.credits, left: q.credits, at: now, exp: addMonths(now, 6) });
  S.orders.unshift({ at: now, kind: '계약', name: `선불 크레딧 ${fmt(q.credits)}C`, amount: q.pay, method: '계좌이체 (세금계산서)', mid: 'PG 미사용' });
  save();
}

/* ───────── 약관 · 환불 초안 ───────── */
function vTerms() {
  return `<section class="sec mid legal">
    <div class="eyebrow">LEGAL · 초안</div>
    <h1 class="h2 mt8">이용약관 (개인·팀) — 바꿔야 할 곳</h1>
    <p class="lead">법무 검토 전 정리용이에요. <span class="draft">주황 표시</span>는 결정이나 확인이 필요한 부분이에요.</p>
    <h3>현행 기업용 약관과 충돌하는 문구</h3>
    <table class="cmp"><tr><th style="width:34%">현행 (기업용)</th><th>개인·팀 플랜에 필요한 내용</th></tr>
      <tr><td>“카드 자동결제를 제공하지 않습니다” · 계좌이체 선납</td><td>신용카드 정기결제(구독), 카드·간편결제·계좌이체 단건 결제(충전)</td></tr>
      <tr><td>“구독은 자동으로 갱신되지 않습니다”</td><td>해지 전까지 매월 자동 갱신, 다음 결제일 전 해지 가능</td></tr>
      <tr><td>구독 크레딧 유효기간 기본 6개월</td><td>구독 크레딧은 다음 결제일에 소멸(이월 불가), 충전 크레딧은 6개월</td></tr>
      <tr><td>사업자 대상 · 전자상거래법 소비자 규정 적용 제외</td><td>개인·프리랜서도 가입 → <span class="draft">소비자 보호 규정 적용 범위 확인</span></td></tr>
      <tr><td>가입 약관 “business-only service”</td><td>개인·팀 이용약관으로 교체</td></tr>
    </table>
    <h3>상품별 조항</h3>
    <ul>
      <li>출시 순서 (사업계획 ${PLAN_VER}): 팀 2027년 1월 · 개인 <span class="draft">${PERSONAL_LAUNCH}</span> → 1차 약관은 팀 조항 중심, 개인 조항은 출시 전 추가 가능</li>
      <li>개인 구독: Personal Basic 29,000원 / Plus 79,000원 (VAT 포함), 월 크레딧 20,000C / 70,000C</li>
      <li>팀 구독: Team Pro 100,000원 / Business 300,000원 (VAT 별도), 최대 10명 / 30명, 크레딧 미포함</li>
      <li>충전: 1C = 1원 (VAT 별도), 유효기간 <span class="draft">6개월 (경영관리본부 승인 전 검토안 · 대안: 기본 3개월 + 기업 계약 6개월)</span>, 팀 구독 중에만 충전 · 개인은 Basic·Plus 구독 중에만 충전</li>
      <li>연 단위 결제 없음 (토스 빌링 조건)</li>
      <li>무료 체험: <span class="draft">5,000C · 14일 검토 중 · 자동 유료 전환 여부 미정</span></li>
    </ul>
    <h3>결제 수단</h3>
    <ul><li>구독: 신용카드 정기결제 (토스페이먼츠 빌링)</li><li>충전: 신용·체크카드, 토스페이·카카오페이·네이버페이·페이코, 퀵계좌이체·뱅크페이 (가상계좌 불가)</li><li>카드사별 환금성 결제 한도와 추가 인증이 적용될 수 있음</li></ul>
  </section>`;
}
function vRefund() {
  return `<section class="sec mid legal">
    <div class="eyebrow">LEGAL · 초안</div>
    <h1 class="h2 mt8">환불 및 취소 정책 (개인·팀) — 결정할 것</h1>
    <p class="lead">아래 내용은 확정된 정책이 아니라 결정해야 할 항목 목록이에요.</p>
    <h3>구독 (빌링)</h3>
    <ul>
      <li>해지: 다음 결제일 전까지 언제든 해지 · 남은 기간까지 이용</li>
      <li>결제 직후 취소: <span class="draft">결제 후 며칠 이내, 크레딧 사용 전이면 전액 환불할지</span></li>
      <li>중도 해지 환불: <span class="draft">일할 계산할지, 남은 기간은 환불 없이 이용만 할지</span> (현행 기업용: 일할 환불 없음)</li>
      <li>구독 크레딧: 다음 결제일에 소멸 · 해지해도 결제 주기 끝까지 사용</li>
    </ul>
    <h3>충전 크레딧 (환금성)</h3>
    <ul>
      <li>유효기간 6개월 · 지나면 소멸</li>
      <li>미사용 충전 크레딧 환불: <span class="draft">기간 · 수수료 · 보너스 크레딧 제외 기준</span></li>
      <li>외부 AI 모델에 제출돼 비용이 발생한 크레딧은 환불 제외 (현행 기업용과 동일)</li>
      <li>시스템 오류로 잘못 차감된 크레딧은 복구 (현행 기업용과 동일)</li>
    </ul>
    <h3>참고 · 다른 서비스</h3>
    <p>힉스필드: 첫 구매 후 7일 이내 · 크레딧 미사용 시 환불, 수수료 최대 6%, 갱신 결제는 환불 불가 (공식 헬프센터 기준).</p>
  </section>`;
}

/* ───────── 라우팅 · 공통 렌더 ───────── */
const ROUTES = {
  pricing: [vPricing, 1], signup: [vSignup, 2], activate: [vActivate, 3], team: [vTeam, 4], checkout: [vCheckout, 5],
  subscribed: [vSubscribed, 6], charge: [vCharge, 7], paid: [vPaid, 7], credits: [vCredits, 8], terms: [vTerms, 0], refund: [vRefund, 0],
  enterprise: [vEnterprise, 2], 'ent-quote': [vEntQuote, 3], 'ent-invoice': [vEntInvoice, 4],
};
let lastRoute = null;
function route() { const r = location.hash.replace(/^#\//, '') || 'pricing'; return ROUTES[r] ? r : 'pricing'; }

function render() {
  const r = route();
  const [view, step] = ROUTES[r];
  UI.step = UI.modal?.type === 'billing' ? 6 : step;
  if (isEnt()) UI.step = r === 'credits' ? 5 : r === 'ent-invoice' && S.ent?.paid ? 5 : step;
  $('#app').innerHTML = view();
  $('#modal').innerHTML = UI.modal ? (UI.modal.type === 'billing' ? mBilling() : mPay()) : '';
  renderHeader();
  renderSim();
  if (r !== lastRoute) { window.scrollTo(0, 0); lastRoute = r; }
}
function renderHeader() {
  $('#hdr-r').innerHTML = S.user
    ? `<span class="muted small" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(S.user.email)}</span><button class="btn btn-w btn-sm" data-go="credits">${fmt(balance())}C</button>`
    : `<a href="#/signup" style="text-decoration:none">Sign in</a><button class="btn btn-o btn-sm" data-go="pricing">Start Now</button>`;
}
function renderSim() {
  const names = isEnt() ? ['상품', '도입 문의', '견적 확인', '청구·입금', '크레딧'] : ['상품', '가입', '활성화', '팀', '결제 동의', '카드 등록', '충전', '크레딧'];
  $('#sim').innerHTML = `<span class="tag">프로토타입 · 실제 결제 없음</span>
    <span class="lab">구매자</span><span class="sg"><button class="${S.persona === 't' ? 'on' : ''}" data-act="sim-persona" data-v="t">팀</button><button class="${S.persona === 'e' ? 'on' : ''}" data-act="sim-persona" data-v="e">엔터프라이즈</button><button class="${S.persona === 'p' ? 'on' : ''}" data-act="sim-persona" data-v="p">개인 · 2028</button></span>
    ${isEnt() ? '' : `<span class="lab">가입 후</span><span class="sg"><button class="${S.act === 'a' ? 'on' : ''}" data-act="sim-act" data-v="a">바로 활성화</button><button class="${S.act === 'b' ? 'on' : ''}" data-act="sim-act" data-v="b">결제 후 활성화</button></span>`}
    <span class="steps">${names.map((n, i) => `<button class="${UI.step === i + 1 ? 'on' : ''} ${i === 3 && S.persona === 'p' ? 'na' : ''}" data-act="jump" data-n="${i + 1}" title="${i + 1}. ${n}">${i + 1}</button>`).join('')}</span>
    <button class="reset" data-act="reset">처음부터</button>`;
}

/* 시뮬레이션 단계 바로가기: 그 단계를 볼 수 있도록 앞 단계 상태를 채운다 */
function jump(n) {
  UI.modal = null; UI.errs = {};
  if (isEnt()) {
    if (n >= 3 && !S.ent) S.ent = { company: '(주)스튜디오모션', biz: '123-45-67890', name: '홍길동', email: 'lead@studiomotion.kr', phone: '02-000-0000', amount: 0, msg: '' };
    if (n >= 4 && !S.ent.quoted) Object.assign(S.ent, { bizType: '서비스 · 영상제작', taxEmail: 'tax@studiomotion.kr', adminEmail: S.ent.email, quoted: new Date() });
    if (n <= 4 && S.ent?.paid) { S.ent.paid = null; S.grants = S.grants.filter((g) => g.src !== 'contract'); S.orders = S.orders.filter((o) => o.kind !== '계약'); }
    if (n >= 5 && !S.ent.paid) completeEnt();
    save();
    go(['pricing', 'enterprise', 'ent-quote', 'ent-invoice', 'credits'][n - 1]);
    return;
  }
  const defPlan = isTeam() ? 'tpro' : 'basic';
  if (n >= 2 && (!plan() || PLANS[S.plan].who !== S.persona || (n >= 4 && S.plan === 'free'))) S.plan = defPlan;
  if (n >= 3 && !S.user) { S.user = { email: isTeam() ? 'lead@studio.kr' : 'creator@example.com', name: '홍길동' }; }
  if (n >= 3) S.verified = true;
  if (n >= 5 && isTeam() && !S.team) S.team = { name: '스튜디오 모션랩', kind: '회사 · 기관', seats: PLANS[S.plan].seats };
  if (n >= 7 && (!S.sub || S.sub.trial)) { UI.last4 = '4321'; completeSub(); }
  save();
  if (n === 1) go('pricing');
  else if (n === 2) { UI.signupPhase = 'form'; go('signup'); }
  else if (n === 3) go('activate');
  else if (n === 4) { if (!isTeam()) toast('개인 플랜에는 팀 만들기 단계가 없어요'); else go('team'); }
  else if (n === 5) go('checkout');
  else if (n === 6) { if (S.sub && !S.sub.trial) { S.sub = null; S.grants = S.grants.filter((g) => g.src !== 'sub'); save(); } UI.modal = { type: 'billing', step: 1 }; go('checkout'); }
  else if (n === 7) go('charge');
  else go('credits');
}

/* ───────── 이벤트 ───────── */
const ACT = {
  persona(el) { if (S.persona === el.dataset.v) return; resetPurchase(el.dataset.v); render(); },
  pick(el) {
    S.plan = el.dataset.id; save();
    if (!S.user || !S.verified) { UI.signupPhase = 'form'; go('signup'); } else go('activate');
  },
  'consent-all'(el) { document.querySelectorAll('.consent input[type=checkbox]').forEach((c) => { c.checked = el.checked; }); },
  signup() {
    const email = $('#f-email').value.trim(), pw = $('#f-pw').value, pw2 = $('#f-pw2').value, name = $('#f-name').value.trim();
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = '이메일 형식을 확인해 주세요';
    if (pw.length < 8) errs.pw = '비밀번호는 8자 이상이에요';
    if (pw !== pw2) errs.pw2 = '비밀번호가 서로 달라요';
    if ([...document.querySelectorAll('.c-req')].some((c) => !c.checked)) errs.consent = '필수 항목에 모두 동의해 주세요';
    UI.errs = errs;
    if (Object.keys(errs).length) { render(); return; }
    S.user = { email, name }; S.verified = false; save();
    UI.signupPhase = 'verify'; render();
  },
  resend() { toast('인증 메일을 다시 보냈어요'); },
  verify() { S.verified = true; save(); UI.signupPhase = 'form'; go('activate'); },
  team() {
    const name = $('#f-team').value.trim();
    if (!name) { UI.errs = { team: '팀 이름을 입력해 주세요' }; render(); return; }
    UI.errs = {};
    S.team = { name, kind: $('#f-kind').value, seats: plan().seats }; save(); go('checkout');
  },
  'open-billing'() {
    if ([...document.querySelectorAll('.c-req')].some((c) => !c.checked)) { UI.errs = { consent: '필수 항목에 모두 동의해 주세요' }; render(); return; }
    UI.errs = {}; UI.modal = { type: 'billing', step: 1 }; render();
  },
  ctype(el) { UI.ctype = el.value; const lab = $('#idlab'), inp = $('#idn'); if (el.value === 'c') { lab.textContent = '사업자등록번호 10자리'; inp.placeholder = '0000000000'; } else { lab.textContent = '생년월일 6자리'; inp.placeholder = 'YYMMDD'; } },
  'bill-1'() {
    const cn = [...document.querySelectorAll('.cn')].map((i) => i.value.trim()).join('');
    const exp = $('#exp').value.trim(), idn = $('#idn').value.trim();
    const corp = document.querySelector('input[name=ctype]:checked').value === 'c';
    UI.ctype = corp ? 'c' : 'p';
    let err = '';
    if (!/^\d{16}$/.test(cn)) err = '카드 번호 16자리를 입력해 주세요';
    else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) err = '유효기간을 MM/YY 형식으로 입력해 주세요';
    else if (corp ? !/^\d{10}$/.test(idn) : !/^\d{6}$/.test(idn)) err = corp ? '사업자등록번호 10자리를 입력해 주세요' : '생년월일 6자리를 입력해 주세요';
    else if (!$('#pg-agree').checked) err = '필수 약관에 동의해 주세요';
    UI.errs = err ? { card: err } : {};
    if (err) { render(); return; }
    UI.last4 = cn.slice(-4);
    UI.modal.step = 2; render();
  },
  'send-code'() { toast('인증번호를 보냈어요 (아무 6자리나 입력)'); },
  'bill-2'() {
    const nm = $('#nm').value.trim(), ph = $('#ph').value.replace(/\D/g, ''), code = $('#code').value.trim();
    let err = '';
    if (!nm) err = '이름을 입력해 주세요';
    else if (!/^01\d{8,9}$/.test(ph)) err = '휴대폰 번호를 확인해 주세요';
    else if (!/^\d{6}$/.test(code)) err = '인증번호 6자리를 입력해 주세요';
    UI.errs = err ? { auth: err } : {};
    if (err) { render(); return; }
    UI.modal.step = 3; render();
    setTimeout(() => { if (UI.modal?.type === 'billing') { UI.modal.step = 4; render(); } }, 1300);
  },
  'bill-done'() { completeSub(); UI.modal = null; go('subscribed'); },
  'close-modal'() { UI.modal = null; UI.errs = {}; render(); },
  pack(el) { S.charge.pack = +el.dataset.i; save(); render(); },
  method(el) { S.charge.method = el.dataset.v; save(); render(); },
  issuer(el) { S.charge.issuer = el.dataset.v; save(); render(); },
  easy(el) { S.charge.easy = el.dataset.v; save(); render(); },
  bank(el) { S.charge.bank = el.dataset.v; save(); render(); },
  'open-pay'() {
    if (!$('#ch-agree').checked) { $('#ch-err').textContent = '필수 항목에 동의해 주세요'; return; }
    UI.modal = { type: 'pay', step: 1 }; render();
  },
  'pay-auth'() {
    UI.modal.step = 2; render();
    setTimeout(() => { if (UI.modal?.type === 'pay') { completePay(); UI.modal = null; go('paid'); } }, 1300);
  },
  run(el) {
    const t = TASKS[+el.dataset.i];
    if (!spend(t.c, t.n)) { toast(`크레딧이 모자라요 (필요 ${fmt(t.c)}C)`); return; }
    toast(`${fmt(t.c)}C 차감됐어요`); render();
  },
  'go-ent'(el, e) { e.preventDefault(); if (!isEnt()) resetPurchase('e'); go('pricing'); },
  'ent-amount'(el) { S.ent = { ...(S.ent || {}), ...readEntForm(), amount: +el.dataset.i }; save(); render(); },
  'ent-submit'() {
    const f = readEntForm();
    const errs = {};
    if (!f.company) errs.company = '회사명을 입력해 주세요';
    if (!/^\d{3}-?\d{2}-?\d{5}$/.test(f.biz)) errs.biz = '사업자등록번호 10자리를 확인해 주세요';
    if (!f.name) errs.name = '담당자 이름을 입력해 주세요';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = '이메일 형식을 확인해 주세요';
    if ([...document.querySelectorAll('.c-req')].some((c) => !c.checked)) errs.consent = '필수 항목에 동의해 주세요';
    UI.errs = errs;
    S.ent = { ...(S.ent || {}), ...f, amount: S.ent?.amount ?? 0 }; save();
    if (Object.keys(errs).length) { render(); return; }
    toast('문의가 접수됐어요 · 담당자가 견적서를 보내드려요');
    go('ent-quote');
  },
  'ent-confirm'() {
    const type = $('#q-type').value.trim(), tax = $('#q-tax').value.trim(), admin = $('#q-admin').value.trim(), addr = $('#q-addr').value.trim();
    const errs = {};
    if (!type) errs.type = '업태 · 종목을 입력해 주세요';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tax)) errs.tax = '이메일 형식을 확인해 주세요';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(admin)) errs.admin = '이메일 형식을 확인해 주세요';
    if ([...document.querySelectorAll('.c-req')].some((c) => !c.checked)) errs.consent = '필수 항목에 모두 동의해 주세요';
    UI.errs = errs;
    Object.assign(S.ent, { bizType: type, taxEmail: tax, adminEmail: admin, addr }); save();
    if (Object.keys(errs).length) { render(); return; }
    S.ent.quoted = new Date(); save(); go('ent-invoice');
  },
  'ent-paid'() { completeEnt(); render(); },
  'ent-again'() { S.ent = { ...S.ent, quoted: null, paid: null }; save(); go('enterprise'); },
  cancel() { S.sub.cancel = !S.sub.cancel; save(); toast(S.sub.cancel ? '다음 결제일에 해지돼요' : '해지 예약을 취소했어요'); render(); },
  'sim-persona'(el) { if (S.persona === el.dataset.v) return; resetPurchase(el.dataset.v); go('pricing'); },
  'sim-act'(el) { S.act = el.dataset.v; save(); render(); },
  jump(el) { jump(+el.dataset.n); },
  reset() { const keep = { persona: S.persona, act: S.act }; S = { ...DEF(), ...keep }; save(); UI.modal = null; UI.errs = {}; UI.signupPhase = 'form'; UI.lastPay = null; go('pricing'); },
};
function readEntForm() {
  const v = (id) => ($(id) ? $(id).value.trim() : '');
  return { company: v('#e-company'), biz: v('#e-biz'), name: v('#e-name'), email: v('#e-email'), phone: v('#e-phone'), seats: v('#e-seats'), msg: v('#e-msg') };
}
function resetPurchase(persona) {
  const keep = { persona, act: S.act, user: S.user, verified: S.verified };
  S = { ...DEF(), ...keep }; save(); UI.modal = null; UI.errs = {};
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g && !g.disabled) { e.preventDefault(); UI.errs = {}; go(g.dataset.go); return; }
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) {
    if (a.tagName === 'INPUT' && a.type !== 'checkbox' && a.type !== 'radio') return;
    ACT[a.dataset.act](a, e);
  }
});
document.addEventListener('input', (e) => {
  if (e.target.classList.contains('cn') && e.target.value.length === 4) { const n = e.target.nextElementSibling; if (n) n.focus(); }
  if (e.target.id === 'exp') { const v = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = v.length > 2 ? v.slice(0, 2) + '/' + v.slice(2) : v; }
});
window.addEventListener('hashchange', () => { UI.errs = {}; if (route() !== 'checkout') UI.modal = null; render(); });
render();
