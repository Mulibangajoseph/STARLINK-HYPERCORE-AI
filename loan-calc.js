// Pure helpers shared by the customer app, the admin portal and the tests. No browser or Firebase code here.

export const CONSENT_VERSION = '2026-11-v1';
export const CONSENT_TEXT =
  'I agree that Starlink Hypercore Finance may collect and process my National Identification Number (NIN), ' +
  'my National ID images and my personal details only to verify my identity and assess this loan application. ' +
  'Only authorised staff can see them, every view is recorded, and I can ask for them to be deleted ' +
  'subject to any legal record-keeping duties.';

export const EMPLOYMENT_TYPES = ['employed', 'self-employed', 'business-owner', 'other'];
export const LIMITS = { minAmount: 100000, maxAmount: 50000000, minMonths: 1, maxMonths: 36, maxIdBytes: 5 * 1024 * 1024 };

// Ugandan NIN: 14 characters. Starts with C, then M or F, then 12 letters/digits.
// This checks the FORMAT only. It does not prove the NIN is real or belongs to the applicant.
export function normaliseNin(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
export function validNin(v) { return /^C[MF][A-Z0-9]{12}$/.test(normaliseNin(v)); }

export function normalisePhone(v) {
  let p = String(v || '').replace(/[\s-]/g, '');
  if (/^0[0-9]{9}$/.test(p)) p = '+256' + p.slice(1);       // 0772123456 -> +256772123456
  else if (/^256[0-9]{9}$/.test(p)) p = '+' + p;
  return p;
}
export function validPhone(v) { return /^\+?[0-9]{9,15}$/.test(normalisePhone(v)); }
// Phone OTP needs a full international number (E.164), for example +256772123456.
export function validE164(v) { return /^\+[1-9][0-9]{8,14}$/.test(normalisePhone(v)); }
// SMS codes from Firebase are 6 digits.
export function cleanOtp(v) { return String(v || '').replace(/\D/g, ''); }
export function validOtp(v) { return /^[0-9]{6}$/.test(cleanOtp(v)); }

export function validName(v) {
  const s = String(v || '').trim().replace(/\s+/g, ' ');
  const parts = s.split(' ');
  return s.length >= 5 && s.length <= 100 && parts.length >= 2 && parts.every(p => p.length >= 2) && /^[A-Za-z][A-Za-z'.\- ]+$/.test(s);
}
export function cleanName(v) { return String(v || '').trim().replace(/\s+/g, ' '); }

// dob is YYYY-MM-DD. Returns whole years, or -1 if the date is invalid.
export function ageOn(dob, today = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return -1;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return -1;
  let a = today.getUTCFullYear() - y;
  if (today.getUTCMonth() + 1 < mo || (today.getUTCMonth() + 1 === mo && today.getUTCDate() < d)) a--;
  return a;
}

export function maskNin(last4) { return '**********' + String(last4 || '????'); }

// Flat-rate loan: total = principal * (1 + monthly rate * months). Rates are set by staff at approval.
export function flatTotal(amount, months, ratePct) { return Math.round(amount * (1 + (ratePct / 100) * months)); }

function pad(n) { return String(n).padStart(2, '0'); }
// firstDue is YYYY-MM-DD. Later due dates keep the same day, clamped to the month's last day.
export function buildSchedule({ amount, months, ratePct, firstDue }) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDue || '');
  if (!m || !(amount > 0) || !(months >= 1) || !(ratePct >= 0)) throw new Error('Invalid loan terms.');
  const y0 = +m[1], mo0 = +m[2] - 1, day = +m[3];
  const total = flatTotal(amount, months, ratePct);
  const base = Math.floor(total / months);
  const out = [];
  for (let i = 0; i < months; i++) {
    const y = y0 + Math.floor((mo0 + i) / 12), mo = (mo0 + i) % 12;
    const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    out.push({
      n: i + 1,
      due: y + '-' + pad(mo + 1) + '-' + pad(Math.min(day, last)),
      amount: i === months - 1 ? total - base * (months - 1) : base
    });
  }
  return out;
}

export function isOverdue(item, todayIso) { return item.status !== 'paid' && item.due < todayIso; }

export const STATUS_LABEL = {
  submitted: 'Submitted',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  active: 'Active',
  completed: 'Completed',
  defaulted: 'Defaulted'
};
