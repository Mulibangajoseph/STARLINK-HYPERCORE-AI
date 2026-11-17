// Staff portal. All security is enforced by firestore.rules and storage.rules; this file is only the interface.
import { Auth, Admin } from './auth-firebase.js';
import { STATUS_LABEL, ageOn, maskNin, isOverdue } from './loan-calc.js';

const $ = id => document.getElementById(id);
const fmt = n => 'UGX ' + Math.round(n).toLocaleString('en-UG');
const when = ms => ms ? new Date(ms).toLocaleString('en-UG', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(label, cls, fn) { const b = el('button', 'btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); return b; }
function kv(label, value) { const d = el('div', 'kv'); d.appendChild(el('small', '', label)); d.appendChild(el('b', '', value == null || value === '' ? '-' : value)); return d; }
function field(label, input) { const w = el('div'); const l = el('label', '', label); l.appendChild(input); w.appendChild(l); return w; }
let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('on'), 3500); }

let role = null, apps = [], filter = 'all', openId = null, urls = [], hideTimer = null, idleTimer = null;
const TABS = ['all', 'submitted', 'under_review', 'approved', 'active', 'completed', 'rejected', 'defaulted'];

// ---- Idle sign-out: staff are logged out after 15 minutes without activity ----
function idle() { clearTimeout(idleTimer); if (Auth.user()) idleTimer = setTimeout(() => { Auth.logOut(); toast('Logged out after 15 minutes of inactivity.'); }, 15 * 60 * 1000); }
['pointerdown', 'keydown', 'scroll'].forEach(ev => addEventListener(ev, idle, { passive: true }));

function clearImages() {
  clearTimeout(hideTimer); urls.forEach(u => URL.revokeObjectURL(u)); urls = [];
  const box = $('ids-box'); if (box) box.textContent = '';
}

// ---- Views ----
function show(which) { ['login', 'denied', 'app'].forEach(k => { $(k).hidden = k !== which; }); $('out').hidden = which === 'login'; }

async function onAuth() {
  const u = Auth.user(); idle();
  if (!u) { role = null; apps = []; openId = null; clearImages(); $('detail').hidden = true; $('who').textContent = ''; show('login'); return; }
  $('who').textContent = u.email;
  if (Auth.mode !== 'firebase') return denied('Firebase is not configured, so the staff portal is switched off.', false);
  if (!u.verified) return denied('Your email is not verified yet. Verify it, then log in again.', true);
  role = await Admin.role();
  if (!role) return denied('This account is not set up as staff.', false);
  $('who').textContent = u.email + ' (' + role + ')';
  show('app'); buildTabs(); await reload();
}
function denied(msg, canResend) {
  const box = $('denied'); box.textContent = '';
  box.appendChild(el('h2', '', 'No staff access')); box.appendChild(el('p', '', msg));
  if (canResend) box.appendChild(btn('Send verification email', 'gold', () => Auth.resend().then(() => toast('Verification email sent.')).catch(x => toast(x.message))));
  show('denied');
}

function buildTabs() {
  const t = $('tabs'); t.textContent = '';
  TABS.forEach(k => {
    const n = k === 'all' ? apps.length : apps.filter(a => a.status === k).length;
    const b = el('button', filter === k ? 'on' : '', (k === 'all' ? 'All' : STATUS_LABEL[k]) + ' (' + n + ')');
    b.type = 'button'; b.addEventListener('click', () => { filter = k; showList(); }); t.appendChild(b);
  });
  if (role === 'manager') {
    const b = el('button', filter === 'audit' ? 'on' : '', 'Audit log'); b.type = 'button';
    b.addEventListener('click', () => { filter = 'audit'; showAudit(); }); t.appendChild(b);
  }
}

async function reload() {
  try { apps = await Admin.list(); } catch (x) { toast('Could not load applications.'); apps = []; }
  if (filter === 'audit') showAudit(); else showList();
  if (openId && apps.some(a => a.id === openId)) renderDetail(openId);
}

function showList() {
  $('auditp').hidden = true; $('listp').hidden = false; buildTabs();
  const rows = $('rows'); rows.textContent = '';
  const list = apps.filter(a => filter === 'all' || a.status === filter);
  $('empty').hidden = list.length > 0;
  list.forEach(a => {
    const tr = el('tr', 'row'); tr.tabIndex = 0;
    tr.appendChild(el('td', '', a.fullName));
    tr.appendChild(el('td', '', fmt(a.amount) + ' / ' + a.months + ' mo'));
    tr.appendChild(el('td', '', a.phone));
    tr.appendChild(el('td', '', when(a.createdAt)));
    const s = el('td'); s.appendChild(el('span', 'st ' + a.status, STATUS_LABEL[a.status] || a.status)); tr.appendChild(s);
    const go = () => { openId = a.id; renderDetail(a.id); $('detail').scrollIntoView({ behavior: 'smooth' }); };
    tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    rows.appendChild(tr);
  });
}

async function showAudit() {
  $('listp').hidden = true; $('detail').hidden = true; $('auditp').hidden = false; buildTabs();
  const body = $('arows'); body.textContent = '';
  try {
    (await Admin.audit()).forEach(r => {
      const tr = el('tr');
      [when(r.at), r.actorEmail, r.action, r.targetId, r.detail].forEach(v => tr.appendChild(el('td', '', v)));
      body.appendChild(tr);
    });
  } catch (x) { toast('Could not load the audit log.'); }
}

// ---- Application detail ----
async function act(fn, okMsg) {
  try { await fn(); toast(okMsg); await reload(); } catch (x) { toast(x.message || 'Action failed.'); }
}

async function renderDetail(id) {
  const a = apps.find(x => x.id === id), d = $('detail'), me = Auth.user();
  if (!a) return; clearImages(); d.hidden = false; d.textContent = '';
  const mine = me && a.uid === me.uid;

  const head = el('div'); head.style.cssText = 'display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap';
  const t = el('div'); t.appendChild(el('h2', '', a.fullName)); t.appendChild(el('span', 'st ' + a.status, STATUS_LABEL[a.status] || a.status));
  head.appendChild(t); head.appendChild(btn('Close', 'ghost', () => { openId = null; clearImages(); d.hidden = true; }));
  d.appendChild(head);

  const g = el('div', 'grid'); g.style.marginTop = '14px';
  const ninBox = el('div', 'kv'); ninBox.appendChild(el('small', '', 'National ID number (NIN)'));
  const ninVal = el('b', '', maskNin(a.ninLast4)); ninBox.appendChild(ninVal);
  const rv = btn('Reveal (logged)', 'ghost', async () => {
    rv.disabled = true;
    try { ninVal.textContent = await Admin.revealNin(id); rv.remove(); setTimeout(() => { ninVal.textContent = maskNin(a.ninLast4); }, 30000); }
    catch (x) { toast(x.message || 'Could not reveal.'); rv.disabled = false; }
  });
  rv.style.marginTop = '6px'; ninBox.appendChild(rv);
  const age = ageOn(a.dob);
  [kv('Full legal names', a.fullName), kv('Date of birth', a.dob + (age >= 0 ? ' (age ' + age + ')' : '')), kv('Phone', a.phone), ninBox,
   kv('Employment', a.employment && a.employment.status), kv('Employer / business', a.employment && a.employment.employer), kv('Job / work', a.employment && a.employment.title),
   kv('Monthly income', a.employment && fmt(a.employment.monthlyIncome)), kv('Requested', fmt(a.amount) + ' over ' + a.months + ' months'),
   kv('Purpose', a.purpose), kv('Applied', when(a.createdAt)),
   kv('Consent to ID collection', a.consent ? 'Given ' + when(a.consent.at) + ' (version ' + a.consent.version + ')' : 'Missing')
  ].forEach(x => g.appendChild(x));
  if (a.reviewedByEmail) g.appendChild(kv('Last action by', a.reviewedByEmail + ' on ' + when(a.reviewedAt)));
  if (a.rejectionReason) g.appendChild(kv('Rejection reason', a.rejectionReason));
  if (a.decisionNote) g.appendChild(kv('Decision note', a.decisionNote));
  if (a.approved) g.appendChild(kv('Approved terms', fmt(a.approved.amount) + ' over ' + a.approved.months + ' months at ' + a.approved.ratePct + '%/month, total ' + fmt(a.approved.total)));
  d.appendChild(g);

  // ID images: opened on request, shown in memory only, hidden again after 90 seconds.
  const idp = el('div'); idp.style.marginTop = '18px'; idp.appendChild(el('h3', '', 'National ID images'));
  const bar = el('div'); bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const box = el('div', 'ids'); box.id = 'ids-box';
  const open = side => async () => {
    try {
      const blob = await Admin.idImage(id, side), url = URL.createObjectURL(blob); urls.push(url);
      const f = el('figure'); f.style.margin = 0; const im = el('img'); im.src = url; im.alt = 'National ID ' + side;
      f.appendChild(im); f.appendChild(el('figcaption', 'note', side + ' side')); box.appendChild(f);
      clearTimeout(hideTimer); hideTimer = setTimeout(() => { clearImages(); toast('ID images hidden for security.'); }, 90000);
    } catch (x) { toast('Could not open the image. If this is the first setup, check the storage CORS step in SETUP.md.'); }
  };
  bar.appendChild(btn('View front', 'blue', open('front'))); bar.appendChild(btn('View back', 'blue', open('back'))); bar.appendChild(btn('Hide images', 'ghost', clearImages));
  idp.appendChild(bar); idp.appendChild(el('p', 'note', 'Every time an ID image or the full NIN is opened it is written to the audit log. Do not screenshot, download or share these documents.'));
  idp.appendChild(box); d.appendChild(idp);

  // Decision controls
  const dec = el('div'); dec.style.marginTop = '18px'; dec.appendChild(el('h3', '', 'Decision'));
  const open1 = a.status === 'submitted' || a.status === 'under_review';
  if (a.status === 'submitted') dec.appendChild(btn('Start review', 'blue', () => act(() => Admin.startReview(id), 'Marked under review.')));
  if (open1) {
    if (role !== 'manager') dec.appendChild(el('p', 'note', 'Only a manager can approve or reject. You can mark applications as under review.'));
    else if (mine) dec.appendChild(el('p', 'note', 'You cannot decide your own application.'));
    else {
      const ap = el('div', 'panel'); ap.style.margin = '12px 0'; ap.appendChild(el('h3', '', 'Approve'));
      const amt = el('input'); amt.type = 'number'; amt.min = 100000; amt.max = 50000000; amt.value = a.amount;
      const mo = el('input'); mo.type = 'number'; mo.min = 1; mo.max = 36; mo.value = a.months;
      const rate = el('input'); rate.type = 'number'; rate.min = 0; rate.max = 20; rate.step = '0.01'; rate.placeholder = 'Set per company policy';
      const due = el('input'); due.type = 'date'; const dd = new Date(); dd.setMonth(dd.getMonth() + 1); due.value = dd.toISOString().slice(0, 10);
      const note = el('textarea'); note.rows = 2; note.maxLength = 500;
      const g2 = el('div', 'grid');
      [field('Approved amount (UGX)', amt), field('Months', mo), field('Interest per month, flat (%)', rate), field('First instalment due', due)].forEach(x => g2.appendChild(x));
      ap.appendChild(g2); ap.appendChild(field('Decision note (optional)', note));
      ap.appendChild(btn('Approve loan', 'gold', () => {
        if (rate.value === '') return toast('Enter the interest rate first.');
        if (!confirm('Approve ' + fmt(+amt.value) + ' over ' + mo.value + ' months for ' + a.fullName + '? This creates the repayment schedule.')) return;
        act(() => Admin.approve(id, { amount: amt.value, months: mo.value, ratePct: rate.value, firstDue: due.value, note: note.value }), 'Loan approved.');
      }));
      dec.appendChild(ap);

      const rj = el('div', 'panel'); rj.style.margin = '12px 0'; rj.appendChild(el('h3', '', 'Reject'));
      const why = el('textarea'); why.rows = 3; why.maxLength = 500; why.placeholder = 'Reason (required, shown to the customer)';
      rj.appendChild(field('Rejection reason', why));
      rj.appendChild(btn('Reject application', 'red', () => {
        if (why.value.trim().length < 5) return toast('Record a rejection reason first.');
        if (!confirm('Reject this application? The customer will see your reason.')) return;
        act(() => Admin.reject(id, why.value), 'Application rejected.');
      }));
      dec.appendChild(rj);
    }
  }
  if (a.status === 'approved' && role === 'manager') dec.appendChild(btn('Mark as disbursed (loan becomes active)', 'blue', () => { if (confirm('Confirm the money has been paid out to the customer?')) act(() => Admin.disburse(id), 'Loan is now active.'); }));
  if (!open1 && a.status === 'rejected') dec.appendChild(el('p', 'note', 'This application was rejected.'));
  d.appendChild(dec);

  // Repayment schedule
  if (['approved', 'active', 'completed', 'defaulted'].includes(a.status)) {
    const sp = el('div'); sp.style.marginTop = '18px'; sp.appendChild(el('h3', '', 'Repayment schedule'));
    const holder = el('div', 'scroll'); sp.appendChild(holder); d.appendChild(sp);
    try {
      const rows = await Admin.schedule(id), today = new Date().toISOString().slice(0, 10);
      const tb = el('table'), th = el('thead'), hr = el('tr');
      ['#', 'Due', 'Amount', 'Status', ''].forEach(h => hr.appendChild(el('th', '', h))); th.appendChild(hr); tb.appendChild(th);
      const body = el('tbody'); let paid = 0, left = 0;
      rows.forEach(r => {
        const tr = el('tr'), late = isOverdue(r, today);
        if (r.status === 'paid') paid += r.amount; else left += r.amount;
        tr.appendChild(el('td', '', r.n)); tr.appendChild(el('td', '', r.due)); tr.appendChild(el('td', '', fmt(r.amount)));
        tr.appendChild(el('td', '', r.status === 'paid' ? 'Paid ' + when(r.paidAt) : late ? 'OVERDUE' : 'Due'));
        const c = el('td');
        if (a.status === 'active' && r.status !== 'paid') c.appendChild(btn('Record payment', 'ghost', () => { if (confirm('Record instalment #' + r.n + ' (' + fmt(r.amount) + ') as received?')) act(() => Admin.recordPayment(id, r.n), 'Payment recorded.'); }));
        tr.appendChild(c); body.appendChild(tr);
      });
      tb.appendChild(body); holder.appendChild(tb);
      sp.appendChild(el('p', 'note', 'Paid ' + fmt(paid) + ' | Outstanding ' + fmt(left) + '. Payments here are manual records; this app does not move money.'));
      if (a.status === 'active') {
        const row = el('div'); row.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap';
        if (rows.length && rows.every(r => r.status === 'paid')) row.appendChild(btn('Mark loan completed', 'gold', () => act(() => Admin.complete(id), 'Loan completed.')));
        row.appendChild(btn('Mark as defaulted', 'red', () => { if (confirm('Mark this loan as defaulted?')) act(() => Admin.markDefaulted(id), 'Marked as defaulted.'); }));
        sp.appendChild(row);
      }
    } catch (x) { holder.textContent = 'Could not load the schedule.'; }
  }
}

// ---- Login ----
$('lf').addEventListener('submit', async e => {
  e.preventDefault(); $('lerr').textContent = ''; $('lb').disabled = true;
  try { await Auth.logIn($('le').value, $('lp').value); $('lf').reset(); } catch (x) { $('lerr').textContent = x.message; }
  $('lb').disabled = false;
});
$('out').addEventListener('click', () => Auth.logOut());
show('login');
Auth.onChange(onAuth);
