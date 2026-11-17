import test from 'node:test';
import assert from 'node:assert/strict';
import { validNin, normaliseNin, normalisePhone, validPhone, validE164, validOtp, cleanOtp, validName, ageOn, buildSchedule, flatTotal, maskNin, isOverdue } from '../loan-calc.js';

test('OTP phone must be full international format; codes are 6 digits', () => {
  assert.ok(validE164('0772 123456'));
  assert.ok(validE164('+256772123456'));
  assert.ok(!validE164('772123456'));
  assert.ok(!validE164('12345'));
  assert.ok(validOtp('123456'));
  assert.ok(validOtp('123 456'));
  assert.equal(cleanOtp(' 12-34 56 '), '123456');
  for (const bad of ['', '12345', '1234567', 'abcdef', null, undefined]) assert.ok(!validOtp(bad), String(bad));
});

test('NIN: 14 chars, C + M/F + 12 alphanumerics', () => {
  assert.ok(validNin('CM86052102EEGA'));
  assert.ok(validNin(' cf 8605 2102 eega '));
  assert.equal(normaliseNin(' cm86052102eega '), 'CM86052102EEGA');
  for (const bad of ['', 'CM1234', 'XM86052102EEGA', 'CX86052102EEGA', 'CM86052102EEGAA', 'CM86052102EEG!', null, undefined]) assert.ok(!validNin(bad), String(bad));
});
test('phone numbers normalise to +256', () => {
  assert.equal(normalisePhone('0772 123456'), '+256772123456');
  assert.equal(normalisePhone('256772123456'), '+256772123456');
  assert.ok(validPhone('0701-234-567'));
  assert.ok(!validPhone('12345'));
  assert.ok(!validPhone('abc'));
});
test('legal names need at least two names and sane characters', () => {
  assert.ok(validName("Mary-Ann O'Neil Nakato"));
  assert.ok(!validName('Madonna'));
  assert.ok(!validName('A B'));
  assert.ok(!validName('John <script>'));
});
test('age is exact on the birthday and rejects invalid dates', () => {
  const t = new Date(Date.UTC(2026, 10, 14));
  assert.equal(ageOn('2008-11-14', t), 18);
  assert.equal(ageOn('2008-11-15', t), 17);
  assert.equal(ageOn('1990-02-30', t), -1);
  assert.equal(ageOn('nonsense', t), -1);
});
test('flat-rate schedule adds up and clamps month ends', () => {
  const s = buildSchedule({ amount: 3000000, months: 12, ratePct: 2, firstDue: '2026-12-15' });
  assert.equal(s.length, 12);
  assert.equal(s.reduce((a, x) => a + x.amount, 0), flatTotal(3000000, 12, 2));
  assert.equal(flatTotal(3000000, 12, 2), 3720000);
  assert.equal(s[0].due, '2026-12-15'); assert.equal(s[1].due, '2027-01-15'); assert.equal(s[11].due, '2027-11-15');
  const e = buildSchedule({ amount: 1000000, months: 4, ratePct: 3, firstDue: '2026-01-31' });
  assert.deepEqual(e.map(x => x.due), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});
test('odd totals put the remainder on the last instalment', () => {
  const s = buildSchedule({ amount: 1000001, months: 3, ratePct: 2.5, firstDue: '2026-12-01' });
  assert.equal(s.reduce((a, x) => a + x.amount, 0), flatTotal(1000001, 3, 2.5));
});
test('invalid terms throw', () => {
  assert.throws(() => buildSchedule({ amount: 0, months: 3, ratePct: 2, firstDue: '2026-12-01' }));
  assert.throws(() => buildSchedule({ amount: 1000, months: 3, ratePct: 2, firstDue: 'x' }));
});
test('masking never shows more than the last 4 characters', () => {
  assert.equal(maskNin('EEGA'), '**********EEGA');
});
test('overdue only when unpaid and past due', () => {
  assert.ok(isOverdue({ due: '2026-01-01', status: 'due' }, '2026-02-01'));
  assert.ok(!isOverdue({ due: '2026-01-01', status: 'paid' }, '2026-02-01'));
  assert.ok(!isOverdue({ due: '2026-03-01', status: 'due' }, '2026-02-01'));
});
