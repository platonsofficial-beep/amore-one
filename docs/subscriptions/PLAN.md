# ONE subscriptions, free month, and app lock

Built behind `VITE_SUBSCRIPTIONS_ENABLED`, which is off unless set to `true`. The SQL file is in the repo and is not applied. No Stripe account or keys were created.

Prices are per venue, excluding VAT.

| Plan | Monthly | 3 months (−10%) | 6 months (−20%) | Yearly (−25%) | Who it is for |
| --- | --- | --- | --- | --- | --- |
| Start | €29 | €78 | €139 | €261 | One venue, up to 15 staff |
| Pro | €59 | €159 | €283 | €531 | All features, 1 venue included, up to 40 staff, up to 3 venues |
| Group | €129 | €348 | €619 | €1,161 | Up to 5 venues included, unlimited staff |

Extra venues use the same period discount.

- Pro: +€20 / month per venue after the first, and only up to 3 venues. A yearly extra venue is €20 × 12 × 0.75 = €180 for the year.
- Group: 5 venues included. Each venue after the fifth is +€15 / month, with the same discount. A yearly extra venue is €15 × 12 × 0.75 = €135 for the year.
- Start is one venue only. It cannot add venues.

Each new venue gets its **own free month of Start or Pro, with no card**. Group has no free month. When that month ends, or a paid subscription lapses or a payment fails, the venue keeps working for **7 more days**. Owners, general managers, and managers see a daily banner with the days left and a Choose plan or Update payment button. Staff and hosts see nothing during those 7 days. When the 7 days end, the venue **locks**. Owners, general managers, and managers see a screen to choose a plan and pay. Hosts and staff see a short note to ask their manager. Rows stay in the database. The 7 days are one config value, `subscription_config.grace_days`, default 7.

A person can open several new venues and get a free month on each one. Start still caps them at 1 venue and Pro at 3, but a new login can start again. That abuse is accepted for this version.

## 1. What exists today

There is no organization and no billing table.

- A **venue** is one row in `public.workspaces` (`id`, `name`, `slug`). `AMORE.NICOSIA` (`amore-nicosia`) was inserted by `supabase/workspaces_schema.sql`.
- The signed-in person is `auth.users`. Their link to a venue is `public.workspace_members` (`workspace_id`, `auth_user_id`, `role`). Roles are `owner`, `general_manager`, `manager`, `host`, `staff`.
- The same person can be owner of several venues. `create_workspace_venue` (in `supabase/create_workspace_venue.sql`) inserts a new workspace and copies that user in as `owner`. Owners and general managers may call it. There is no cap.
- Venue details (name, timezone, currency, city) live on `workspace_profiles`, one row per workspace. New venues default to `Europe/Nicosia` and `EUR`.
- People on the Team screen are `public.employees` for that `workspace_id`. A disabled employee has `active = false` or status `Disabled` (`isEmployeeDisabled` in `src/services/staffService.js`). An employee is not the same row as a login.
- Sign-up (`src/services/authService.js`) only creates the auth user. The first membership is `createOwnerMembershipIfMissing`: if the user has no membership, it attaches them as **owner of the default workspace, and only when that workspace has zero members**. A new signup must not fall into `AMORE.NICOSIA`.
- There are no Edge Functions and no Stripe code. Chat and many stock writes go through security-definer RPCs, so a UI gate alone cannot lock the app.

**Who holds the subscription.** One payer, called a billing account, not each venue and not each login. The payer is the auth user who starts the trial or pays. Every venue they add hangs off that account. The lock is decided per venue, but every venue on a lapsed account locks together.

**Staff cap.** Count employees in that workspace who are not disabled. Do not count a login that has no employee row, and do not count a disabled employee. Enforce it in the employee insert path (RLS or the insert RPC), not only on the Add Employee button.

**Venue cap.** Count workspaces linked to the billing account. Start: 1. Pro: 1 included, 3 maximum. Group: 5 included, more only after the Stripe quantity for extra venues is raised. `create_workspace_venue` must refuse when the paid quantity does not cover the new venue.

## 2. Data model (not applied)

File: `supabase/subscriptions_schema.sql`. It is a proposal. Do not run it on the live project from this plan.

Tables:

- `billing_account_venues` — one row per venue. `plan`, `billing_interval`, `status` (`trialing` | `active` | `past_due` | `grace` | `locked` | `canceled` | `pending_payment`), `trial_ends_at`, `current_period_end`, `grace_started_at`, `grace_reason` (`trial` | `payment`), `free_forever`. Complimentary venues such as the demo are `free_forever` on this row, so a later real venue owned by the same person is not free.
- `subscription_config` — one row, `grace_days` default **7**.

- `billing_accounts` — one per paying person. `owner_auth_user_id` (nullable for the complimentary account), `stripe_customer_id`, `extra_venue_qty`.
- `billing_account_venues` — one row per venue, `workspace_id` unique. Plan, period, status, trial end, period end, grace start, and `free_forever` live here.
- No card columns. Stripe keeps the card.

`workspace_allows_writes` follows the grace rules above. A missing billing row stays writable. Writes go through a `BEFORE INSERT OR UPDATE OR DELETE` trigger on tables that have `workspace_id`, and on `chat_messages` when that table exists. The trigger reads the venue from `chat_conversations`. Service role bypasses it. Reads stay open.

## 3. Server pieces

Edge functions live in `supabase/functions/`. They read secrets from the environment. The browser never sees the service role or the Stripe secret.

1. `create_signup_venue` — SQL, not an edge function. A new signup with no membership creates a new workspace and a Start or Pro trial. It does not attach them to an existing venue.
2. `create-checkout-session` — Checkout in EUR for the selected plan, period, and extra-venue quantity. Prices are exclusive of tax.
3. `customer-portal` — owners, general managers, and managers open the Stripe Customer Portal.
4. `stripe-webhook` — verifies the Stripe signature. `invoice.payment_failed` and `customer.subscription.deleted` start the grace clock once. `checkout.session.completed` and `invoice.paid` set `active` with a future period end and clear grace, which unlocks immediately.

There is no daily job. Grace is `trial_ends_at` or `grace_started_at` plus `grace_days`. The phone clock is not the source of truth; Postgres `now()` is.

## 4. Client (English)

The UI is behind `VITE_SUBSCRIPTIONS_ENABLED=true`. Left unset, none of these screens render. The signup change (do not claim the demo venue) is the exception and is always on.

- **Trial banner** for owners, general managers, and managers while the free month is running: “12 days left on your free month.” Choose plan opens Plans & billing. Hidden for staff and hosts.
- **Grace banner** for those same roles after the free month ends, or after a payment fails, until the 7 days end. “Your free month has ended. You have N days left to choose a plan before ONE pauses.” / “Payment didn't go through. N days left to update payment.” Staff and hosts see nothing.
- **Settings → Plans & billing** for those same roles. Monthly, 3 months, 6 months, Yearly. Exact totals from the table. “Prices exclude VAT.”
- **Owner lock screen** after grace, for owner, general manager, and manager. The venue is paused, data is safe, choose a plan. Sign out stays available.
- **Staff lock screen** for host and staff. “Your venue’s subscription needs renewing. Ask your manager.” No prices. Sign out stays available.

Signup asks Start or Pro before the trial begins. It does not ask for a card.

## 5. Mockups

Static screens, navy `#0A1628` and gold `#D4AF37`. Not wired to the app.

| Screen | iPhone portrait 390×844 @2x | Tablet landscape 1180×820 @2x |
| --- | --- | --- |
| Trial banner | `/opt/cursor/artifacts/subscriptions-plan/trial-banner-iphone.png` | `/opt/cursor/artifacts/subscriptions-plan/trial-banner-tablet.png` |
| Plans & billing | `/opt/cursor/artifacts/subscriptions-plan/plans-billing-iphone.png` | `/opt/cursor/artifacts/subscriptions-plan/plans-billing-tablet.png` |
| Owner lock | `/opt/cursor/artifacts/subscriptions-plan/lock-owner-iphone.png` | `/opt/cursor/artifacts/subscriptions-plan/lock-owner-tablet.png` |
| Staff lock | `/opt/cursor/artifacts/subscriptions-plan/lock-staff-iphone.png` | `/opt/cursor/artifacts/subscriptions-plan/lock-staff-tablet.png` |

Source: `docs/subscriptions/mockups.html`.

## 6. What Platon does himself

This is not tax or legal advice. A Cyprus accountant should confirm the VAT part.

1. Create a Stripe account as an **individual / sole trader**, country **Cyprus**, in his own name. There is no company yet, so he should not sign up as a company.
2. Verify identity (passport or ID, and the selfie Stripe asks for) and add a bank account in his name (IBAN). Stripe will not pay out until this is done.
3. Stay in **test mode** until the app’s webhook is verified. Use the test card Stripe documents. Do not paste secret keys into the repo or into chat.
4. When the functions exist, put the secret key and webhook secret in Supabase function secrets, and the publishable key in the Vercel project. Switch to live mode only after a real €1 test he can refund.
5. VAT: the prices above exclude VAT. If he is not VAT-registered, Checkout should charge those amounts and not add VAT. Cyprus has a registration threshold; an accountant should say when he must register. After he has a VAT number, turn on **Stripe Tax**, keep prices exclusive, and let Checkout add tax (Cyprus standard VAT is 19% for a local customer; EU business customers can be reverse-charged when they give a valid VAT number).
6. He does not need to hand-build all 12 prices if the Checkout function creates them. He does need to confirm the live numbers match this table before the first real charge.

Rough card fees, from Stripe’s published European rates. They change, and Cyprus pricing in his dashboard wins:

- EEA cards: about **1.5% + €0.25**
- UK cards: about **2.5% + €0.25**
- Cards from outside Europe: about **3.25% + €0.25**
- Currency conversion, if the card is not billed in EUR: about **2%** extra
- Stripe Tax, if switched on: about **0.5%** of the charge where Stripe calculates the tax

Example, not a quote: a €29 Start month on an EEA card is about €0.69 in fees, so about €28.31 reaches the balance before any VAT he later owes the state.

## 7. Risks

- **Demo venues.** `AMORE.NICOSIA` and workspaces whose name or slug contains demo or test are seeded `free_forever` on the venue row. They never lock. A real venue created later by the same person is not free.
- **New signups.** `createOwnerMembershipIfMissing` calls `create_signup_venue` and does not insert an owner row on the oldest workspace. Until that SQL is applied, a brand-new signup is not joined to any venue.
- **Free month is per new venue.** Start is still one venue. Pro is still three. A new account can take another free month. That is the accepted abuse.
- **Grace.** Seven days, from `subscription_config.grace_days`. Day 0 and day 6 still allow writes. Day 7 locks. A successful payment during grace sets `active` with a future period end and unlocks immediately. Staff and hosts do not see the grace banner.
- **Trial clock.** Store `timestamptz`. Count “days left” in the venue timezone (`Europe/Nicosia` by default), not the phone’s UTC day. A trial that starts on 13 Nov ends on 13 Dec at the same local time. Postgres `interval '1 month'` handles short months.
- **Several venues, one person.** One billing account. If it locks, every venue on it locks. A person who owns venue A and is staff at venue B sees the pay screen only in A, and the “ask your manager” screen in B.
- **Host.** Treated like staff for the lock screen and for the grace banner. They do not pay.
- **Caps.** Adding the 16th active employee on Start, or the 41st on Pro, or a 4th Pro venue, fails in the database. Group staff are unlimited. Extra Group venues need the Stripe quantity first. A Group venue created past the included five is `pending_payment` until checkout.
- **Feature flag.** `VITE_SUBSCRIPTIONS_ENABLED` must be the string `true`. Production leaves it unset. A `subscriptionPreview` query is honored only when that flag is on and `VITE_AUTH_DISABLED` is on, so a production URL cannot force the lock screen.
- **VAT shown too early.** Do not add 19% until he is registered. The mockups say prices exclude VAT and do not invent a tax line.
