# STARLINK HYPERCORE FINANCE: setup guide

Installable website and app (PWA) with Firebase. This guide covers the original setup plus the loan application and staff portal.

## What the app does

| Area | Who | National ID needed? |
|---|---|---|
| Website, sign-up, login, demo ledger, profile | Everyone. Accounts are activated by two steps: verify email (link), then verify phone (6-digit SMS code). | **No.** Registration never asks for a National ID. |
| Loan application (`index.html` > Dashboard > Loans) | Verified customers | **Yes, only here.** NIN, legal names, date of birth, ID front and back photos, phone, work and income, amount and period, plus explicit consent. |
| Staff portal (`/admin.html`) | Listed staff only | Reviews applications, approves or rejects, tracks repayments. |

Applications are never approved automatically. The rules only let a **manager** change a loan to approved or rejected, and a manager cannot decide their own application.

## 1. Firebase project

1. console.firebase.google.com > create a project > add a **Web app** > copy its config.
2. Paste the values into `firebase-config.js`. Never paste service-account or admin keys anywhere.
3. Build > Authentication > Sign-in method > enable **Email/Password** and **Phone**. Edit the verification and password-reset email templates.
   Phone sign-in sends the SMS codes. Under Authentication > Settings > SMS region policy, allow **Uganda (UG)**. While testing, add fictional numbers under Phone > "Phone numbers for testing" (no SMS is sent or billed for those). Real SMS delivery may need the Blaze plan and has daily quotas, so check what the console shows. Your site domain must also be in Authorized domains (step 4), because the invisible reCAPTCHA check runs there.
4. Authentication > Settings > Authorized domains: keep only your real domains.
5. Build > Firestore Database > create database (production mode).
6. Build > Storage > get started (production mode). **Storage holds the National ID photos.** Newer Firebase projects may require the pay-as-you-go (Blaze) plan to use Cloud Storage. It has a free monthly allowance but needs a billing account, so check what the console asks for. Without Storage, loan applications cannot accept ID photos.

## 2. Deploy

```
npm i -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only hosting,firestore:rules,storage
```

`firebase.json` is included. It serves the site from this folder, adds security headers, and marks `/admin.html` as no-store and noindex. Test locally first with `npx serve .` (modules and service workers need http, not file://).

## 3. Allow the staff portal to open ID photos (one time)

The portal opens ID images through the Storage rules without creating shareable links. Browsers need CORS enabled on the bucket for that.

1. Edit `storage-cors.json` and put your real site addresses in `origin`.
2. Run (Google Cloud SDK): `gsutil cors set storage-cors.json gs://YOUR_BUCKET` (the bucket name is in `firebase-config.js` as `storageBucket`).

## 4. Create staff accounts

Staff accounts are created by hand. Nobody can make themselves staff from the app.

1. Create the staff member's account (they can sign up on the normal site, or add them under Authentication > Users). They **must verify their email**.
2. Copy their **User UID** from Authentication > Users.
3. Firestore > start a collection `admins` > document ID = that UID > field `role` (string) = `officer` or `manager`.

| Role | Can do |
|---|---|
| `officer` | See applications, open ID images and NIN (logged), mark under review, record repayments, mark a loan defaulted or completed |
| `manager` | Everything an officer can, plus approve, reject, mark as disbursed, and read the audit log |

Use at least two managers so a manager's own application can be decided by someone else.

## 5. Loan flow

1. Customer registers (no National ID), verifies email, verifies phone with the SMS code, and opens Dashboard > Loans > **Apply for a loan**.
2. The form stays locked until they tick the consent box. Then they enter NIN, legal names, date of birth, phone, work and income, choose amount and repayment period, and upload ID front and back.
3. Photos are resized and re-saved as JPEG in the browser (this also removes location data from the photo), uploaded to a private Storage folder, and the application is saved as **Submitted**.
4. Staff open `/admin.html`, review, and either approve (setting the amount, months, monthly interest rate and first due date, which creates the repayment schedule) or reject with a required reason shown to the customer.
5. After the money is paid out, a manager marks the loan **disbursed** (active). Staff record each instalment as it is received. When all are paid the loan is marked completed.

This app records and tracks loans. It does **not** send or collect money.

## 6. How the sensitive data is protected

- **NIN** is stored in a separate private document. The customer can write it once and can never read it back. The dashboard and staff list show only the last 4 characters; staff must click **Reveal**, which is logged first.
- **ID photos** are in Storage under `loan-ids/{customerUid}/{applicationId}/`. Only listed staff can read them. Customers can upload each image once and cannot read, replace or delete it.
- **Phone OTP**: the phone number is linked to the customer's account after an SMS code. The rules only accept a loan application (and ID uploads) from an account with a verified phone, and the phone on the application must equal the verified number, so it cannot be swapped. Existing customers who already verified their email are asked for the phone step the next time they log in. The staff portal does not require a phone.
- **Consent** is required by the rules, stored with a server timestamp and a consent text version.
- **Audit log** (`auditLog`) records approvals, rejections, payments, NIN reveals and ID image views, written in the same step as the action. Entries cannot be edited or deleted from the app, and only managers can read them.
- **No automatic approval.** Customers can only create an application with status `submitted`.
- Staff are logged out after 15 minutes of inactivity, and ID images hide again after 90 seconds.
- The staff portal is never cached by the service worker.

### Limits you should know about

- The audit log is written by the staff browser, so a technically skilled staff member could skip writing an entry for a *view* (the rules cannot force it). For stronger guarantees, move NIN and image access behind Cloud Functions (needs the Blaze plan) and turn on Firebase **App Check**.
- The NIN check validates the **format** only (14 characters, starts with `CM` or `CF`). It does not confirm the NIN is real or belongs to the applicant. Staff must compare the NIN and photos with the person. Automated verification would need an agreement with NIRA.
- Photos are protected by Google's encryption at rest and by the rules above, not by your own keys.
- Turn on Firebase billing alerts and review who is in the `admins` collection regularly.

## 7. Before using real customers and real money

This repository is a working prototype with demonstration figures. Before collecting real National IDs or lending real money, get professional advice on at least:

- Money-lending and microfinance licensing in Uganda (the Uganda Microfinance Regulatory Authority and Bank of Uganda rules).
- The Data Protection and Privacy Act, 2019 (registration, privacy notice, retention and deletion, breach handling).
- A written privacy policy, loan terms, and complaint process, linked from the site.
- Replacing the demo address, phone and email in `index.html`, and the demo rate in the loan estimator.

None of this is legal advice.

## Install on Android
For a real APK file, see `ANDROID.md` (built with GitHub Actions from the `android/` folder; it opens this same website, so web and app share one backend and database).

For the PWA route:
Open your https address in Chrome on the phone. Use the in-app **Install app** button, or the Chrome menu > **Install app** / **Add to Home Screen**.
It opens full-screen with the Hypercore icon and splash. Desktop Chrome and Edge show an install icon in the address bar.

## Updating
After changing any file, change `V = 'shf-v4'` in `sw.js` (for example to `shf-v5`) so users get the new version.

## Tests
`node --test tests/loan-calc.test.mjs` checks the NIN, phone, OTP code, name and age rules and the repayment schedule maths.
