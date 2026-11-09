<div align="center">

# CollectDesk

**Commercial collections · case management workspace**

A focused full-stack B2B prototype for tracking overdue invoice cases, coordinating collection teams, and reporting **verified** recoveries.

[**Live demo**](https://collectdesk-preview-ah80.onrender.com/login) · [**Service health**](https://collectdesk-preview-ah80.onrender.com/api/health) · [**CI results**](https://github.com/Syed-Nazeer-07/CollectDesk/actions)

</div>

---

> [!IMPORTANT]
> **Fictional-data internship MVP.** This application does not collect money, contact debtors, store uploaded evidence, or process real invoices. Render's free instance sleeps when idle; a cold start can be slow.

## The product

| Workspace | Capabilities |
| --- | --- |
| **Creditor** | Create and edit draft invoices, submit overdue cases, follow public progress and verified recovery |
| **Administrator** | Review requests, assign operators, manage lifecycle, verify/reject/reverse demonstration receipts |
| **Case operator** | Manage assigned cases and share public or internal activity |
| **Dashboard** | Outstanding balance, net verified recovery, illustrative fees, case-status filters and recent activity |

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

The live demonstration retains these seeded accounts:

| Role | Email |
| --- | --- |
| Administrator | `admin@demo.collectdesk.test` |
| Creditor | `creditor@demo.collectdesk.test` |
| Case operator | `operator@demo.collectdesk.test` |

Their password is configured **privately** through `DEMO_SEED_PASSWORD` in Render. It is not included in this repository.

Email signup, verification, Google Sign-In and new-company onboarding are implemented **but disabled on the public preview unless its owner has configured and enabled the relevant providers**. Public registration never creates administrator or operator accounts.

**Enable public creditor registration:** Set `PUBLIC_REGISTRATION_ENABLED=true` in your host's private environment variables, then configure at least one provider:

- **Google Sign-In:** `GOOGLE_CLIENT_ID` from an OAuth web client with the deployed site set as an authorized JavaScript origin.
- **Email verification (Render Free):** Use HTTPS transactional email via `RESEND_API_KEY` + `AUTH_FROM_EMAIL` (verified domain), **or** `BREVO_API_KEY` + `BREVO_FROM_EMAIL` (registered verified sender). Emails can be sent to Gmail and other addresses. Signups become active only when the recipient follows the one-time, 30-minute email link.
- **Gmail SMTP (local or SMTP-capable hosting only):** `GMAIL_SMTP_USER` + `GMAIL_SMTP_APP_PASSWORD`, using a Google App Password. Render Free blocks outgoing SMTP ports 465 and 587, so Gmail SMTP is deliberately not advertised as available on Render without an explicit paid-host override (`ALLOW_SMTP_ON_RENDER=true`). **Do not set this override on Render Free.**

Store every API key or app password only in the hosting provider's secret settings. A Google OAuth Client ID is not a Gmail SMTP password. If no working sender is configured, the registration page stays disabled rather than creating unverifiable accounts.

## Run locally

**Requirements:** Docker Desktop (Linux containers), Node.js/npm, and a locally configured `.env.compose`.

```powershell
Copy-Item .env.compose.example .env.compose
# Configure JWT_SECRET (32+ characters) and DEMO_SEED_PASSWORD (12+ characters).
docker compose --env-file .env.compose build
docker compose --env-file .env.compose --profile seed run --rm seed
docker compose --env-file .env.compose up -d database api web
```

Open **http://localhost:3000/login**. The database volume preserves local fictional records across normal restarts.

```bash
npm test
npm run build
```

GitHub Actions also tests the complete role workflows and browser UI against an isolated MongoDB instance. The browser audit writes fictional data and should **never** be run against a production database.

## Project deliverables

- [Product requirements document](docs/Commercial_Collections_PRD_v0.1.pdf)
- [Competitor research](docs/Commercial_Collections_Competitor_Research_Enhanced.pdf)

## Scope and limitations

This project is intended for demonstration and technical evaluation. It does **not** provide production-grade payment processing, business identity verification, secure document upload, password recovery, or multi-document financial transactions. A real commercial deployment would require independent security review, transactional reconciliation, monitoring, backups, and a reliable always-on hosting service.

**Cold-start note:** Render Free may show its own loading screen before Next.js starts. A green deployment and successful automated test cannot remove free-tier sleep delays.

---

<div align="center"><sub>CollectDesk · Commercial Collections MVP · 2026</sub></div>
