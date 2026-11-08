# CollectDesk · email registration and Google Sign-In

**Status:** Implemented behind secure configuration gates. Existing seeded demo accounts still work. No public registration is enabled until a workspace administrator supplies the external provider settings and opts in.

## What has been built

- **Email and password signup:** `/signup` collects name, company, email and a strong password. The API creates an *unverified* temporary registration, sends an expiring link, and only activates a creditor/company after the user confirms it at `/signup/verify`.
- **Google Sign-In:** optional Google Identity Services button. The API validates the Google ID token using Google's public signing keys, exact client ID/audience, issuer, expiry, verified email and a single-use server nonce.
- **Google company onboarding:** new Google users visit `/onboarding` to register their own company before any case API is accessible.
- **Role safety:** public registration creates **Creditor** accounts only. No browser-supplied role is accepted; Administrator and Operator remain controlled demo/staff accounts.
- **Isolation:** every newly created creditor has its own organization ID. Existing accounts aren't silently linked to Google by email; password accounts must use their existing login.
- **Rate limits and feedback:** registration and Google token verification have request limits; unconfigured signup visibly says unavailable instead of silently allowing insecure accounts.

This remains a **fictional demonstration**. No real financial or debtor information should be entered.

## Activate email verification

1. Create an email provider account (the implementation uses the [Resend Email API](https://resend.com/docs/api-reference/emails/send-email)).
2. Verify a domain you control and configure a sender, for example `CollectDesk <accounts@your-verified-domain.example>`. Free test-only senders often cannot email arbitrary reviewers.
3. In the Render service's **Environment**, configure the following **privately**:
   - `RESEND_API_KEY` — secret API token for the email sender.
   - `AUTH_FROM_EMAIL` — verified From name/address.
   - `PUBLIC_REGISTRATION_ENABLED` — set to `true` **only after** the other settings have been validated.
4. Redeploy/restart and open `/signup`. Try a fictional creditor account with an email you can receive and follow the 30-minute confirmation link.
5. Review abuse prevention and database retention before expanding beyond an isolated demonstration.

**Never** paste these secrets into GitHub, README, screenshots or chat.

## Activate Google Sign-In

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Configure the Google Auth Platform/consent screen for this demonstration. In Testing mode, add your own and the reviewer's Google accounts as test users as needed.
3. Create a **Web application** OAuth client.
4. Add `https://collectdesk-preview-ah80.onrender.com` under **Authorized JavaScript origins**. The application uses the Google Identity Services JavaScript **popup callback**, not the server-side redirect-code flow; it does not need a redirect URI.
5. Copy the **client ID** into Render's `GOOGLE_CLIENT_ID` variable. This value is public by design; do **not** enter the client secret in frontend files.
6. Set `PUBLIC_REGISTRATION_ENABLED=true` and redeploy after verifying the client configuration.
7. At `/login`, choose the Google button; a first-time user must enter their company on `/onboarding`.

The Google button remains hidden when the integration is unconfigured. Google credentials are *not* accepted without server-side signature verification.

## Existing demo accounts

`admin@demo.collectdesk.test`, `operator@demo.collectdesk.test`, and the seeded creditor accounts continue using the existing private `DEMO_SEED_PASSWORD`. No existing password is changed by this release. To prevent accidental privilege changes, Google login does **not** automatically link to any pre-existing email/password account.

## Not yet included

- Password recovery and cross-provider account linking.
- Company invitations, staff provisioning and administrator approval of real business identities.
- Production-grade email deliverability monitoring and abuse protection.
- Reliable always-on hosting. Free Render cold starts are independent of Google or email authentication.
- Any authority to receive real debtor invoices or payments.

Before external commercial use, require a fresh independent security review, verified business onboarding, safe account recovery and a reliable email-delivery/hosting plan.
