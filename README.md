<div align="center">

# CollectDesk

**Commercial collections · case management workspace**

A focused full-stack B2B prototype for tracking overdue invoice cases, coordinating collection teams, and reporting **verified** recoveries.

[**Customer landing page**](https://collectdesk.onrender.com/) · [**Sign in**](https://collectdesk.onrender.com/login) · [**Service health**](https://collectdesk.onrender.com/api/health) · [**CI results**](https://github.com/Syed-Nazeer-07/CollectDesk/actions)

</div>

---

> [!IMPORTANT]
> **Sample-data MVP for technical evaluation.** This application does not collect money, contact debtors, store uploaded evidence, or process real invoices. Render's free instance sleeps when idle; a cold start can be slow.

**Deployment URL:** Render has assigned `https://collectdesk.onrender.com` to the new CollectDesk web service. Deployment readiness and sign-in must be verified before sharing credentials or treating the site as a working demo. The previous preview remains available as a fallback until the cutover is tested.

**Deployment setup:** The new Render web service must build from `./Dockerfile.render` (not `./Dockerfile`) and run `node scripts/start-hosted.mjs`, with `MONGODB_URI` and `JWT_SECRET` configured privately. Set `WEB_ORIGIN=https://collectdesk.onrender.com`. Update the Google OAuth **Authorized JavaScript origins** to include this HTTPS origin; for email signups, configure an authorized sender. Keep keys out of Git. GitHub live checks now target the new URL by default.

## Customer onboarding

The public home page (`/`) introduces CollectDesk, explains the core workflow and staff roles, and links directly into **Create account** (`/login?mode=signup`) or **Sign in** (`/login`). Both authentication modes share one right-side panel. Registration continues through Google Sign-In plus company setup, or verified email registration where configured. The landing-page preview metrics are illustrative, not live operational data.

New creditor dashboards include a **getting-started checklist** driven by actual accessible cases (company setup, first draft, submission, review outcome), rather than manually checked or invented progress. A **Help & support** workspace (`/support`) allows authenticated users, including users still completing company setup, to submit categorized requests and view their own outcomes. Administrators can triage and resolve requests with recorded notes. Support is in-app only; no automated email delivery or service-level guarantee is implied.

## The product

| Workspace | Capabilities |
| --- | --- |
| **Creditor** | Create and edit draft invoices, submit overdue cases, follow public progress and verified recovery |
| **Administrator** | Review requests, assign operators, manage lifecycle, verify/reject/reverse demonstration receipts |
| **Case operator** | Manage assigned cases and share public or internal activity |
| **Dashboard** | Outstanding balance, net verified recovery, illustrative fees, case-status filters and recent activity |
| **Help & support** | Private support ticket intake, status/history, and administrator-only resolution workflow |
| **Staff invitations** | Admin-issued one-time, email-delivered operator invitations; private activation, expiration and revocation |
| **Sample evidence** | Optional private synthetic PDF upload/list/download/delete per case, disabled by default |

**Core flow**

`Draft → Submitted → Review → Assigned → Progress → Reconciliation → Closed`

Every case stays scoped to its creditor organization. Pending receipts do not count toward recovery; reversals are separate correction entries. Closing a case does not imply full payment.

## Technology

| Layer | Stack |
| --- | --- |
| Interface | Next.js 16, React 19, TypeScript |
| API | Node.js 22, Express 5, Zod |
| Storage | MongoDB Atlas, Mongoose |
| Authentication | Signed httpOnly session cookies, bcrypt; optional verified-email and Google identity flows |
| Hosting | Render Docker preview (one container, two internal processes) |
| Verification | API integration tests, Chromium browser audit, hosted-container and external-HTTPS checks |

### Authentication

The preview includes these pre-provisioned reviewer identities (sign-in roles are assigned, not user-selectable):

| Role | Email |
| --- | --- |
| Administrator | `admin@demo.collectdesk.test` |
| Creditor | `creditor@demo.collectdesk.test` |
| Case operator | `operator@demo.collectdesk.test` |

Their passwords are configured **privately** through `DEMO_SEED_PASSWORD` in Render. They are not included in this repository. Share reviewer credentials securely, outside the public repository.

Sign-in and account creation share one page. Email signup, verification, Google Sign-In and company onboarding are available **only when the corresponding providers have been configured by the deployment owner**. Public registration grants Creditor access only. Administrator and Operator identities must be provisioned separately, and the Account & access page displays the signed-in role without offering a role selector.

**Staff invitations:** Administrators can access `/staff` to invite case operators through a verified transactional email sender. Invitations are single use, expire in 24 hours, and may be revoked before acceptance. Invitees set their own password at the private emailed `/staff/activate` link. Public signup never grants operator or administrator privileges. Administrator accounts remain separately provisioned. Without a configured sender, staff invitations fail closed rather than generating shared credentials.

**Password recovery:** Existing users can open `/forgot-password` from sign-in. When an email provider is configured, a valid account receives a single-use reset link expiring in 30 minutes. Recovery does not disclose whether an email address exists, does not change account roles, and invalidates old sessions after resetting. `/reset-password?token=...` refuses reused or expired tokens. Recovery remains available to existing accounts even when new registrations are disabled. The reset URL is removed from browser history after loading and its responses use no-referrer/no-store headers.

**Enable public creditor registration:** Set `PUBLIC_REGISTRATION_ENABLED=true` in your host's private environment variables, then configure at least one provider:

- **Google Sign-In:** `GOOGLE_CLIENT_ID` from an OAuth web client with the deployed site set as an authorized JavaScript origin.
- **Email verification (Render Free):** Use HTTPS transactional email via `RESEND_API_KEY` + `AUTH_FROM_EMAIL` (verified domain), **or** `BREVO_API_KEY` + `BREVO_FROM_EMAIL` (registered verified sender). Emails can be sent to Gmail and other addresses. Signups become active only when the recipient follows the one-time, 30-minute email link.
- **Gmail SMTP (local or SMTP-capable hosting only):** `GMAIL_SMTP_USER` + `GMAIL_SMTP_APP_PASSWORD`, using a Google App Password. Render Free blocks outgoing SMTP ports 465 and 587, so Gmail SMTP is deliberately not advertised as available on Render without an explicit paid-host override (`ALLOW_SMTP_ON_RENDER=true`). **Do not set this override on Render Free.**

Store every API key or app password only in the hosting provider's secret settings. A Google OAuth Client ID is not a Gmail SMTP password. If no working sender is configured, the registration page stays disabled rather than creating unverifiable accounts.

## Synthetic evidence and release verification

- **Private demo PDFs:** Set `SAMPLE_EVIDENCE_ENABLED=true` explicitly to enable small, synthetic PDF attachments in editable creditor cases. Default is disabled. Each PDF is limited to **1 MiB** and each case to **three files**. All reads and deletes check the active user and case role/organization, and downloads are served as attachments rather than publicly hosted files.
- **Not production evidence storage:** Files are stored in a private MongoDB GridFS bucket. Malware scanning/quarantine, verified retention/deletion policies, external storage authorization and privacy approval **are not implemented**. Do not upload real invoices, financial data or personal debtor records.
- **Release identity:** `/api/v1/meta/release` exposes the non-secret release commit prefix (when `RENDER_GIT_COMMIT` is present) and database status. Compare this with the latest approved GitHub commit after Render finishes deploying.
- **Approval checklist:** See [implementation worklist](docs/IMPLEMENTATION_CHECKLIST.md) and [release-readiness criteria](docs/RELEASE_READINESS.md). CI passing never substitutes for live OAuth/email tests, representative UAT or designated operator sign-off.

## Run locally

**Requirements:** Docker Desktop (Linux containers), Node.js/npm, and a locally configured `.env.compose`.

```powershell
Copy-Item .env.compose.example .env.compose
# Configure JWT_SECRET (32+ characters) and DEMO_SEED_PASSWORD (12+ characters).
docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
```

Open **http://localhost:3000/** for the customer landing page or **http://localhost:3000/login** to sign in. The database volume preserves local fictional records across normal restarts.

```bash
npm test
npm run build
```

GitHub Actions also tests the complete role workflows and browser UI against an isolated MongoDB instance. The browser audit writes fictional data and should **never** be run against a production database.

## Project deliverables

- [Product requirements document](docs/Commercial_Collections_PRD_v0.1.pdf)
- [Competitor research](docs/Commercial_Collections_Competitor_Research_Enhanced.pdf)
- [Playbook-aligned release readiness & QA gates](docs/RELEASE_READINESS.md)

## Scope and limitations

This project is intended for demonstration and technical evaluation. It does **not** provide production-grade payment processing, business identity verification, secure document upload, administrator-issued staff invitations, or multi-document financial transactions. In-app support tickets are not live chat or a staffed service agreement. A real commercial deployment would require independent security review, transactional reconciliation, monitoring, backups, and a reliable always-on hosting service.

**Cold-start note:** Render Free may show its own loading screen before Next.js starts. A green deployment and successful automated test cannot remove free-tier sleep delays.

---

<div align="center"><sub>CollectDesk · Commercial Collections MVP · 2026</sub></div>
