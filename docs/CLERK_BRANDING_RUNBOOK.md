# Clerk Branding Rollout

ChurchCoin styles all embedded Clerk components through
`lib/clerkAppearance.ts`. Clerk-hosted Account Portal pages and transactional
emails do not inherit those application styles and must be configured in the
Clerk Dashboard before a production release.

## Repository-controlled surfaces

Verify these states locally and in the production Clerk instance:

- Sign in: password, social providers, passkey, invalid credentials, and
  account-not-found errors.
- Sign up: optional fields, password validation, social-provider hand-off,
  email verification, expired verification, and resend-code states.
- Recovery: forgot-password identification, email code, new password, success,
  and expired code.
- MFA: method selection, SMS/email code, authenticator QR code, backup code,
  error, and success states.
- User menu: identity preview, Manage account, Add account, Sign out,
  multi-session account switching, keyboard focus, and narrow viewports.
- Manage account: Profile and Security pages, connected accounts, email and
  phone rows, password and passkey dialogs, active devices, destructive
  actions, the modal close control, and the mobile drawer.

## Clerk Dashboard configuration

In the production Clerk application, configure the following values to match
the ChurchCoin Refined Ledger system:

### Branding and Account Portal

- Application name: `ChurchCoin`
- Logo: the production ChurchCoin mark with sufficient light-background
  contrast; do not use the tiny navigation favicon as the primary logo.
- Primary colour: `#1c1917`
- Link/accent colour: `#a9743f`
- Background: `#faf9f7`
- Body font: DM Sans
- Border radius: 8px
- Home URL: the production ChurchCoin origin
- Privacy URL: `<production-origin>/privacy`
- Terms URL: `<production-origin>/terms`

Check the hosted Account Portal at desktop and mobile widths. Application
`appearance` props do not style these hosted pages.

### Email and SMS templates

Audit every enabled authentication template, including:

- Verify email address
- Reset password
- Magic link / sign-in link
- Organisation or application invitation
- Email change confirmation
- New-device and security notifications

For each template:

- Use `ChurchCoin` as the sender/display name.
- Use the ChurchCoin logo and paper/ink/amber palette.
- Keep the reason for the message explicit and use plain UK English.
- Include a visible expiry time for codes or links.
- Include a “If you did not request this” security sentence.
- Link Privacy and Terms to the production ChurchCoin pages.
- Send test messages to Gmail, Outlook, Apple Mail, and a narrow mobile client.
- Confirm the production sender domain has SPF, DKIM, and DMARC configured.

## OAuth provider branding

Google, Facebook, and other providers own their consent screens. In each
provider console, ensure the public application name, logo, privacy URL, terms
URL, support contact, and authorised production origins all identify
ChurchCoin consistently.

## Release sign-off

- Test with a newly created user and an existing user.
- Test a user with MFA and a user with multiple active sessions.
- Confirm the embedded UI contains no duplicate Sign in/Sign up prompts or
  vendor-development footer.
- Confirm Account Portal pages and all received messages say ChurchCoin.
- Repeat the audit after Clerk SDK upgrades because element names and rendered
  states can change between releases.
