// Auth, demo ledger, customer loan applications and the staff (admin) API.
// With Firebase configured everything is stored in Firebase. Without it the site runs in demo mode:
// accounts and the demo ledger stay in this browser, and loan applications are switched off
// because identity documents must never be kept in browser storage.
import { firebaseConfig, configured } from './firebase-config.js';
import {
  CONSENT_VERSION, CONSENT_TEXT, EMPLOYMENT_TYPES, LIMITS,
  normaliseNin, validNin, normalisePhone, validPhone, validE164, cleanOtp, validOtp, validName, cleanName, ageOn, buildSchedule
} from './loan-calc.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
let fb = null;
async function load() {
  if (fb) return fb;
  const [A, Au, Fs, St] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'),
    import(SDK + 'firebase-firestore.js'), import(SDK + 'firebase-storage.js')
  ]);
  const app = A.initializeApp(firebaseConfig);
  fb = { app, Au, Fs, St, auth: Au.getAuth(app), db: Fs.getFirestore(app), storage: St.getStorage(app) };
  return fb;
}

const MODE = configured ? 'firebase' : 'demo';
const listeners = [];
let cur = null;
function notify() { listeners.forEach(f => { try { f(); } catch (e) { /* a listener must not break the others */ } }); }
function need(c) { if (!c) throw new Error('Please log in first.'); return c; }

const ERR = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Choose a stronger password (8+ characters, a letter and a number).',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/invalid-phone-number': 'Enter a valid phone number, for example 0772 123456.',
  'auth/missing-phone-number': 'Enter your phone number.',
  'auth/invalid-verification-code': 'That code is not correct. Check the SMS and try again.',
  'auth/missing-verification-code': 'Enter the 6-digit code from the SMS.',
  'auth/code-expired': 'That code has expired. Request a new one.',
  'auth/credential-already-in-use': 'That phone number is already used by another account.',
  'auth/account-exists-with-different-credential': 'That phone number is already used by another account.',
  'auth/provider-already-linked': 'A phone number is already verified on this account.',
  'auth/captcha-check-failed': 'Security check failed. Refresh the page and try again.',
  'auth/quota-exceeded': 'Too many SMS codes were sent. Try again later.',
  'auth/operation-not-allowed': 'Phone sign-in is not enabled for this project yet.',
  'auth/billing-not-enabled': 'SMS codes need billing enabled on the Firebase project.',
  'auth/invalid-app-credential': 'Security check failed. Refresh the page and try again.',
  'auth/requires-recent-login': 'Please log in again, then retry.',
  'permission-denied': 'You are not allowed to do that.'
};
function friendly(e) {
  const m = ERR[e && e.code]; if (m) return new Error(m);
  return e instanceof Error && !e.code ? e : new Error('Something went wrong. Try again.');
}

// ---------------- demo storage (browser only) ----------------
const DK = 'shf-demo';
function dRead() { try { return JSON.parse(localStorage.getItem(DK)) || { users: {}, session: null }; } catch (e) { return { users: {}, session: null }; } }
function dWrite(d) { try { localStorage.setItem(DK, JSON.stringify(d)); } catch (e) { /* storage blocked */ } }
async function hash(s) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('shf-demo:' + s));
  return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
}
function dUser() {
  const d = dRead(), u = d.session && d.users[d.session];
  return u ? { uid: d.session, email: d.session, name: u.name, verified: u.verified, since: u.since, phone: u.phone || '', phoneVerified: !!u.phoneVerified } : null;
}

// ---------------- phone OTP state (memory only, never saved) ----------------
let confirmation = null;   // Firebase ConfirmationResult
let verifier = null;       // invisible reCAPTCHA
let demoOtp = null;        // demo mode only: { phone, code }
function dropVerifier() { try { if (verifier) verifier.clear(); } catch (e) { /* already cleared */ } verifier = null; }

// ---------------- Auth ----------------
export const Auth = {
  mode: MODE,
  note: MODE === 'demo' ? 'Demo mode: Firebase is not configured yet, so accounts stay in this browser only.' : '',
  user() { return cur; },
  onChange(f) {
    listeners.push(f);
    if (MODE === 'demo') { cur = dUser(); f(); }
  },
  async signUp(name, email, pw) {
    name = cleanName(name); email = String(email || '').trim().toLowerCase();
    try {
      if (MODE === 'demo') {
        const d = dRead();
        if (d.users[email]) throw new Error('An account with this email already exists. Try logging in.');
        d.users[email] = { name, hash: await hash(pw), since: new Date().toISOString(), verified: false };
        d.session = email; dWrite(d); cur = dUser(); notify(); return;
      }
      const f = await load();
      const c = await f.Au.createUserWithEmailAndPassword(f.auth, email, pw);
      if (name) await f.Au.updateProfile(c.user, { displayName: name });
      await f.Au.sendEmailVerification(c.user);
      cur = mapUser(c.user); notify();
    } catch (e) { throw friendly(e); }
  },
  async logIn(email, pw) {
    email = String(email || '').trim().toLowerCase();
    try {
      if (MODE === 'demo') {
        const d = dRead(), u = d.users[email];
        if (!u || u.hash !== await hash(pw)) throw new Error('Wrong email or password.');
        d.session = email; dWrite(d); cur = dUser(); notify(); return;
      }
      const f = await load();
      await f.Au.signInWithEmailAndPassword(f.auth, email, pw);
    } catch (e) { throw friendly(e); }
  },
  async logOut() {
    this.cancelPhone();
    if (MODE === 'demo') { const d = dRead(); d.session = null; dWrite(d); cur = null; notify(); return; }
    const f = await load(); await f.Au.signOut(f.auth);
  },
  async reset(email) {
    email = String(email || '').trim();
    if (MODE === 'demo') return;
    try { const f = await load(); await f.Au.sendPasswordResetEmail(f.auth, email); }
    catch (e) { if (e && (e.code === 'auth/user-not-found')) return; throw friendly(e); } // never reveal whether an email exists
  },
  async resend() {
    if (MODE === 'demo') return;
    try { const f = await load(); await f.Au.sendEmailVerification(need(f.auth.currentUser)); } catch (e) { throw friendly(e); }
  },
  async check() {
    if (MODE === 'demo') return;
    try {
      const f = await load(), u = need(f.auth.currentUser);
      await u.reload(); await u.getIdToken(true); // refresh the token so rules see email_verified
      cur = mapUser(u); notify();
    } catch (e) { throw friendly(e); }
  },
  async verifyDemo() {
    if (MODE !== 'demo') return;
    const d = dRead(); if (d.session) { d.users[d.session].verified = true; dWrite(d); cur = dUser(); notify(); }
  },
  // ---- Phone number OTP. The phone is linked to the signed-in account, so the email login keeps working. ----
  // buttonId is the id of the button that requests the code; Firebase attaches an invisible reCAPTCHA to it.
  async sendPhoneCode(rawPhone, buttonId) {
    const phone = normalisePhone(rawPhone);
    if (!validE164(phone)) throw new Error('Enter a valid phone number, for example 0772 123456.');
    if (MODE === 'demo') {
      if (!cur) throw new Error('Please log in first.');
      demoOtp = { phone, code: String(Math.floor(100000 + Math.random() * 900000)), at: Date.now() };
      return { phone, demoCode: demoOtp.code };
    }
    try {
      const f = await load(), u = need(f.auth.currentUser);
      dropVerifier();
      verifier = new f.Au.RecaptchaVerifier(f.auth, buttonId, { size: 'invisible' });
      confirmation = await f.Au.linkWithPhoneNumber(u, phone, verifier);
      return { phone };
    } catch (e) { confirmation = null; dropVerifier(); throw friendly(e); }
  },
  async confirmPhoneCode(rawCode) {
    const code = cleanOtp(rawCode);
    if (!validOtp(code)) throw new Error('Enter the 6-digit code from the SMS.');
    if (MODE === 'demo') {
      if (!demoOtp || Date.now() - demoOtp.at > 5 * 60 * 1000) throw new Error('That code has expired. Request a new one.');
      if (demoOtp.code !== code) throw new Error('That code is not correct. Check the SMS and try again.');
      const d = dRead();
      if (d.session) { d.users[d.session].phone = demoOtp.phone; d.users[d.session].phoneVerified = true; dWrite(d); }
      demoOtp = null; cur = dUser(); notify(); return;
    }
    try {
      if (!confirmation) throw new Error('Request a new code first.');
      await confirmation.confirm(code);
      confirmation = null; dropVerifier();
      const f = await load(), u = need(f.auth.currentUser);
      await u.reload(); await u.getIdToken(true); // refresh the token so security rules see the verified phone
      cur = mapUser(u); notify();
    } catch (e) { throw friendly(e); }
  },
  cancelPhone() { confirmation = null; demoOtp = null; dropVerifier(); },

  async setName(name) {
    name = cleanName(name);
    if (MODE === 'demo') { const d = dRead(); if (d.session) { d.users[d.session].name = name; dWrite(d); cur = dUser(); notify(); } return; }
    try { const f = await load(); await f.Au.updateProfile(need(f.auth.currentUser), { displayName: name }); cur = mapUser(f.auth.currentUser); notify(); }
    catch (e) { throw friendly(e); }
  }
};
function mapUser(u) {
  const phone = u.phoneNumber || '';
  return { uid: u.uid, email: u.email, name: u.displayName || '', verified: u.emailVerified, since: u.metadata && u.metadata.creationTime, phone, phoneVerified: !!phone };
}

if (MODE === 'firebase') {
  load().then(f => f.Au.onAuthStateChanged(f.auth, u => { cur = u ? mapUser(u) : null; notify(); }))
    .catch(() => { cur = null; notify(); });
}

// ---------------- Demo ledger (not real money) ----------------
export const Ledger = {
  async list() {
    const u = need(cur);
    if (MODE === 'demo') { try { return JSON.parse(localStorage.getItem(DK + '-l-' + u.uid)) || []; } catch (e) { return []; } }
    const f = await load(), { collection, getDocs, query, orderBy } = f.Fs;
    const s = await getDocs(query(collection(f.db, 'users', u.uid, 'ledger'), orderBy('d')));
    return s.docs.map(x => x.data());
  },
  async add(en) {
    const u = need(cur), row = { t: en.t, a: en.a, n: en.n, d: Date.now() };
    if (MODE === 'demo') {
      const L = await this.list(); L.push(row);
      try { localStorage.setItem(DK + '-l-' + u.uid, JSON.stringify(L)); } catch (e) { throw new Error('Could not save.'); }
      return;
    }
    const f = await load(); await f.Fs.addDoc(f.Fs.collection(f.db, 'users', u.uid, 'ledger'), row);
  }
};

// ---------------- shared helpers for loans ----------------
function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : null); }
function norm(id, d) {
  const o = Object.assign({ id }, d);
  ['createdAt', 'reviewedAt', 'paidAt', 'at'].forEach(k => { if (k in o) o[k] = ms(o[k]); });
  if (o.consent && 'at' in o.consent) o.consent = Object.assign({}, o.consent, { at: ms(o.consent.at) });
  return o;
}

// Resize and re-encode an ID photo as JPEG. This keeps uploads small and strips EXIF data such as GPS location.
async function prepareImage(file) {
  if (!file) throw new Error('Choose both ID images.');
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('ID images must be JPG, PNG or WebP photos.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That photo is too large. Use one under 15 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('Could not read that image.')); i.src = url; });
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Could not process that image.');
    if (blob.size > LIMITS.maxIdBytes) throw new Error('That photo is still too large after compression. Try a clearer, closer shot.');
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

// ---------------- Customer loans ----------------
export const Loans = {
  available() { return MODE === 'firebase'; },
  consentText: CONSENT_TEXT,

  async mine() {
    const u = need(cur), f = await load(), { collection, getDocs, query, where } = f.Fs;
    const s = await getDocs(query(collection(f.db, 'loanApplications'), where('uid', '==', u.uid)));
    return s.docs.map(x => norm(x.id, x.data())).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  },

  async schedule(id) {
    const f = await load(), { collection, getDocs } = f.Fs;
    const s = await getDocs(collection(f.db, 'loanApplications', id, 'schedule'));
    return s.docs.map(x => norm(x.id, x.data())).sort((a, b) => a.n - b.n);
  },

  // p: { nin, fullName, dob, phone, employment:{status,employer,title,monthlyIncome}, amount, months, purpose, consent, front, back }
  async apply(p) {
    const u = need(cur);
    if (MODE !== 'firebase') throw new Error('Loan applications need Firebase to be configured first.');
    if (!u.verified) throw new Error('Verify your email before applying for a loan.');
    if (!u.phoneVerified) throw new Error('Verify your phone number with the SMS code before applying for a loan.');
    if (p.consent !== true) throw new Error('You must agree to the identity-document consent to continue.');
    // The application phone is always the number verified by OTP; the security rules check the same thing.
    const nin = normaliseNin(p.nin), phone = u.phone, fullName = cleanName(p.fullName);
    if (!validNin(nin)) throw new Error('Enter your 14-character National Identification Number (NIN), for example CM12345678ABCD.');
    if (!validName(fullName)) throw new Error('Enter your full legal names exactly as on your National ID (at least two names).');
    const age = ageOn(p.dob);
    if (age < 0) throw new Error('Enter a valid date of birth.');
    if (age < 18) throw new Error('You must be 18 or older to apply for a loan.');
    if (age > 100) throw new Error('Check your date of birth.');
    if (!validPhone(phone)) throw new Error('Enter a valid phone number, for example 0772 123456.');
    const e = p.employment || {};
    if (!EMPLOYMENT_TYPES.includes(e.status)) throw new Error('Choose your employment status.');
    const income = Math.round(+e.monthlyIncome);
    if (!(income > 0) || income > 1e9) throw new Error('Enter your average monthly income in UGX.');
    const amount = Math.round(+p.amount), months = Math.round(+p.months);
    if (!(amount >= LIMITS.minAmount && amount <= LIMITS.maxAmount)) throw new Error('Choose a loan amount between UGX ' + LIMITS.minAmount.toLocaleString('en-UG') + ' and ' + LIMITS.maxAmount.toLocaleString('en-UG') + '.');
    if (!(months >= LIMITS.minMonths && months <= LIMITS.maxMonths)) throw new Error('Choose a repayment period of 1 to 36 months.');

    const [front, back] = [await prepareImage(p.front), await prepareImage(p.back)];

    const f = await load(), { doc, collection, writeBatch, serverTimestamp } = f.Fs, { ref, uploadBytes } = f.St;
    const appRef = doc(collection(f.db, 'loanApplications'));
    const base = 'loan-ids/' + u.uid + '/' + appRef.id + '/';
    try {
      await uploadBytes(ref(f.storage, base + 'front.jpg'), front, { contentType: 'image/jpeg' });
      await uploadBytes(ref(f.storage, base + 'back.jpg'), back, { contentType: 'image/jpeg' });
      const b = writeBatch(f.db);
      b.set(appRef, {
        uid: u.uid, status: 'submitted', fullName, dob: p.dob, phone,
        employment: { status: e.status, employer: String(e.employer || '').trim().slice(0, 80), title: String(e.title || '').trim().slice(0, 60), monthlyIncome: income },
        amount, months, purpose: String(p.purpose || '').trim().slice(0, 200),
        ninLast4: nin.slice(-4),
        docs: { front: base + 'front.jpg', back: base + 'back.jpg' },
        consent: { accepted: true, version: CONSENT_VERSION, at: serverTimestamp() },
        createdAt: serverTimestamp()
      });
      b.set(doc(f.db, 'loanApplications', appRef.id, 'private', 'identity'), { uid: u.uid, nin, createdAt: serverTimestamp() });
      await b.commit();
    } catch (err) { throw friendly(err); }
    return appRef.id;
  }
};

// ---------------- Staff (admin portal) ----------------
// Every action below is written to auditLog in the SAME batch as the change it describes.
export const Admin = {
  async role() {
    const u = need(cur);
    if (MODE !== 'firebase') return null;
    const f = await load();
    try {
      const s = await f.Fs.getDoc(f.Fs.doc(f.db, 'admins', u.uid));
      return s.exists() && ['officer', 'manager'].includes(s.data().role) ? s.data().role : null;
    } catch (e) { return null; }
  },

  async list() {
    const f = await load(), { collection, getDocs, query, orderBy, limit } = f.Fs;
    const s = await getDocs(query(collection(f.db, 'loanApplications'), orderBy('createdAt', 'desc'), limit(200)));
    return s.docs.map(x => norm(x.id, x.data()));
  },

  async schedule(id) { return Loans.schedule(id); },

  _log(f, batch, action, targetId, detail) {
    const u = need(cur);
    batch.set(f.Fs.doc(f.Fs.collection(f.db, 'auditLog')), {
      actorUid: u.uid, actorEmail: u.email, action, targetId, detail: String(detail || '').slice(0, 300), at: f.Fs.serverTimestamp()
    });
  },
  async _logNow(action, targetId, detail) {
    const f = await load(), b = f.Fs.writeBatch(f.db);
    this._log(f, b, action, targetId, detail); await b.commit();
  },

  // The audit entry is written first. If it fails, the sensitive data is not shown.
  async revealNin(id) {
    await this._logNow('view_nin', id, 'Revealed full NIN');
    const f = await load(), s = await f.Fs.getDoc(f.Fs.doc(f.db, 'loanApplications', id, 'private', 'identity'));
    if (!s.exists()) throw new Error('No NIN record found.');
    return s.data().nin;
  },
  async idImage(id, side) {
    if (side !== 'front' && side !== 'back') throw new Error('Unknown side.');
    await this._logNow('view_id_' + side, id, 'Viewed National ID ' + side);
    const f = await load();
    // getBlob goes through Storage security rules and exposes no shareable link. It needs the CORS step in SETUP.md.
    return f.St.getBlob(f.St.ref(f.storage, 'loan-ids/' + (await this._owner(id)) + '/' + id + '/' + side + '.jpg'));
  },
  async _owner(id) {
    const f = await load(), s = await f.Fs.getDoc(f.Fs.doc(f.db, 'loanApplications', id));
    if (!s.exists()) throw new Error('Application not found.');
    return s.data().uid;
  },

  async _update(id, action, detail, fields, extra) {
    const f = await load(), b = f.Fs.writeBatch(f.db), u = need(cur);
    b.update(f.Fs.doc(f.db, 'loanApplications', id), Object.assign({
      reviewedBy: u.uid, reviewedByEmail: u.email, reviewedAt: f.Fs.serverTimestamp()
    }, fields));
    if (extra) extra(f, b);
    this._log(f, b, action, id, detail);
    try { await b.commit(); } catch (e) { throw friendly(e); }
  },

  startReview(id) { return this._update(id, 'start_review', 'Marked under review', { status: 'under_review' }); },

  // terms: { amount, months, ratePct, firstDue (YYYY-MM-DD), note }
  approve(id, t) {
    const amount = Math.round(+t.amount), months = Math.round(+t.months), ratePct = +t.ratePct;
    if (!(amount >= LIMITS.minAmount && amount <= LIMITS.maxAmount)) throw new Error('Approved amount is outside the allowed range.');
    if (!(months >= 1 && months <= LIMITS.maxMonths)) throw new Error('Approved period must be 1 to 36 months.');
    if (!(ratePct >= 0 && ratePct <= 20)) throw new Error('Enter the monthly interest rate as a percentage (0 to 20).');
    const sched = buildSchedule({ amount, months, ratePct, firstDue: t.firstDue });
    const total = sched.reduce((s, x) => s + x.amount, 0);
    return this._update(id, 'approve', 'Approved UGX ' + amount + ' over ' + months + ' months at ' + ratePct + '%/month',
      { status: 'approved', decisionNote: String(t.note || '').trim().slice(0, 500), approved: { amount, months, ratePct, firstDue: t.firstDue, total } },
      (f, b) => sched.forEach(s => b.set(f.Fs.doc(f.db, 'loanApplications', id, 'schedule', String(s.n).padStart(2, '0')), { n: s.n, due: s.due, amount: s.amount, status: 'due' })));
  },

  reject(id, reason) {
    reason = String(reason || '').trim();
    if (reason.length < 5) throw new Error('Record a rejection reason (at least 5 characters).');
    return this._update(id, 'reject', 'Rejected: ' + reason.slice(0, 200), { status: 'rejected', rejectionReason: reason.slice(0, 500) });
  },

  disburse(id) { return this._update(id, 'disburse', 'Marked loan as disbursed (active)', { status: 'active' }); },
  markDefaulted(id) { return this._update(id, 'default', 'Marked loan as defaulted', { status: 'defaulted' }); },
  complete(id) { return this._update(id, 'complete', 'All instalments paid; loan completed', { status: 'completed' }); },

  async recordPayment(id, n) {
    const f = await load(), u = need(cur), b = f.Fs.writeBatch(f.db), key = String(n).padStart(2, '0');
    b.update(f.Fs.doc(f.db, 'loanApplications', id, 'schedule', key), { status: 'paid', paidAt: f.Fs.serverTimestamp(), recordedBy: u.uid });
    this._log(f, b, 'record_payment', id, 'Recorded payment for instalment ' + n);
    try { await b.commit(); } catch (e) { throw friendly(e); }
  },

  async audit() {
    const f = await load(), { collection, getDocs, query, orderBy, limit } = f.Fs;
    const s = await getDocs(query(collection(f.db, 'auditLog'), orderBy('at', 'desc'), limit(150)));
    return s.docs.map(x => norm(x.id, x.data()));
  }
};
