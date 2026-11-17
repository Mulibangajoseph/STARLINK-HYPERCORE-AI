// Customer-side loan application UI. National ID details are collected here and nowhere else.
import { Auth, Loans } from './auth-firebase.js';
import { STATUS_LABEL, flatTotal, isOverdue } from './loan-calc.js';

const $ = id => document.getElementById(id);
const fmt = n => 'UGX ' + Math.round(n).toLocaleString('en-UG');
const day = ms => ms ? new Date(ms).toLocaleDateString('en-UG', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export function initLoans({ toast }) {
  const dlg = $('lapp'), form = $('laf'), err = $('la-err'), body = $('la-body'), submit = $('la-submit'), consent = $('la-consent');
  $('la-consent-text').textContent = Loans.consentText;

  // Applicants must be at least 18.
  const max = new Date(); max.setFullYear(max.getFullYear() - 18);
  $('la-dob').max = max.toISOString().slice(0, 10);

  function est() {
    const a = +$('la-amt').value, m = +$('la-mo').value;
    $('la-amtv').textContent = a.toLocaleString('en-UG'); $('la-mov').textContent = m;
    $('la-est').textContent = 'Example only at 2% per month flat: about ' + fmt(flatTotal(a, m, 2) / m) + ' a month. Our staff set the real rate if your loan is approved.';
  }
  $('la-amt').addEventListener('input', est); $('la-mo').addEventListener('input', est); est();

  // The form stays locked until the customer gives consent to collect identity documents.
  consent.addEventListener('change', () => { body.disabled = !consent.checked; submit.disabled = !consent.checked; });

  function wipe() { form.reset(); body.disabled = true; submit.disabled = true; err.textContent = ''; est(); }
  dlg.addEventListener('close', wipe);
  $('la-cancel').addEventListener('click', () => dlg.close());

  $('la-open').addEventListener('click', () => {
    const u = Auth.user();
    if (!u) return toast('Log in to apply for a loan.');
    if (!Loans.available()) return toast('Loan applications are switched on once Firebase is configured.');
    if (!u.verified) return toast('Verify your email first, then apply.');
    if (!u.phoneVerified) return toast('Verify your phone number first, then apply.');
    wipe();
    // The application uses the phone number already verified by SMS code, so it cannot be changed here.
    $('la-phone').value = u.phone; $('la-phone').readOnly = true;
    dlg.showModal();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true;
    try {
      await Loans.apply({
        consent: consent.checked,
        fullName: $('la-name').value, nin: $('la-nin').value, dob: $('la-dob').value, phone: $('la-phone').value,
        front: $('la-front').files[0], back: $('la-back').files[0],
        employment: { status: $('la-emp').value, employer: $('la-employer').value, title: $('la-title').value, monthlyIncome: $('la-income').value },
        amount: $('la-amt').value, months: $('la-mo').value, purpose: $('la-purpose').value
      });
      dlg.close(); toast('Application submitted. Our staff will review it.'); refresh();
    } catch (x) { err.textContent = x.message || 'Could not submit. Try again.'; submit.disabled = !consent.checked; }
  });

  async function schedule(id, holder) {
    holder.textContent = 'Loading...';
    try {
      const rows = await Loans.schedule(id), today = new Date().toISOString().slice(0, 10), t = el('table', 'sch'), tb = el('tbody');
      rows.forEach(r => {
        const tr = el('tr'), late = isOverdue(r, today);
        tr.appendChild(el('td', '', '#' + r.n + ' due ' + r.due));
        tr.appendChild(el('td', '', fmt(r.amount) + ' ' + (r.status === 'paid' ? '(paid)' : late ? '(overdue)' : '')));
        tb.appendChild(tr);
      });
      t.appendChild(tb); holder.textContent = ''; holder.appendChild(t);
    } catch (x) { holder.textContent = 'Could not load the schedule.'; }
  }

  async function refresh() {
    const ul = $('la-list'), u = Auth.user();
    ul.textContent = '';
    if (!u || !Loans.available() || !u.verified || !u.phoneVerified) {
      ul.appendChild(el('li', 'empty', Loans.available() ? 'Verify your email and phone number to apply for a loan.' : 'Loan applications are available once Firebase is configured.'));
      return;
    }
    try {
      const list = await Loans.mine();
      if (!list.length) { ul.appendChild(el('li', 'empty', 'No loan applications yet.')); return; }
      list.forEach(a => {
        const li = el('li'), left = el('span', 'ln'), right = el('span', 'st ' + a.status, STATUS_LABEL[a.status] || a.status);
        left.appendChild(document.createTextNode(fmt(a.approved ? a.approved.amount : a.amount) + ' over ' + (a.approved ? a.approved.months : a.months) + ' months'));
        left.appendChild(el('small', '', 'Applied ' + day(a.createdAt)));
        if (a.status === 'rejected' && a.rejectionReason) left.appendChild(el('small', '', 'Reason: ' + a.rejectionReason));
        if (a.approved) left.appendChild(el('small', '', 'Total to repay ' + fmt(a.approved.total) + ' at ' + a.approved.ratePct + '% per month'));
        if (['approved', 'active', 'completed', 'defaulted'].includes(a.status)) {
          const b = el('button', 'lnk', 'Show repayment schedule'), h = el('div');
          b.type = 'button'; b.addEventListener('click', () => { b.hidden = true; schedule(a.id, h); });
          left.appendChild(b); left.appendChild(h);
        }
        li.appendChild(left); li.appendChild(right); ul.appendChild(li);
      });
    } catch (x) { ul.appendChild(el('li', 'empty', 'Could not load your applications.')); }
  }
  return { refresh };
}
