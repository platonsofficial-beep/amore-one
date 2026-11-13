# ONE subscriptions, free month, and app lock

Planning only. Nothing here is live. The SQL file is not applied. No Stripe account or keys were created.

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

Anyone who signs up may take **one free month of Start or Pro, with no card**. Group has no free month. When the free month ends, or a paid subscription lapses, that venue **locks**. Owners, general managers, and managers see a screen to choose a plan and pay. Hosts and staff see a short note to ask their manager. Rows stay in the database.

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

- `billing_accounts` — one per paying person. `owner_auth_user_id`, `stripe_customer_id`, `plan` (`start` | `pro` | `group`), `interval` (`month` | `month3` | `month6` | `year`), `status` (`trialing` | `active` | `past_due` | `locked` | `canceled`), `trial_ends_at`, `current_period_end`, `extra_venue_qty`, `comped` (internal venues such as the demo), `past_due_since`.
- `billing_account_venues` — `workspace_id` unique, so a venue has one account. `billing_account_id`.
- No card columns. Stripe keeps the card.

Helper `workspace_allows_writes(workspace_id)` is true when the venue is `comped`, or the account is `trialing` and `trial_ends_at` is in the future, or `active`, or `past_due` for fewer than 3 days. Otherwise it is false.

Writes: a `BEFORE INSERT OR UPDATE OR DELETE` trigger on operational tables calls that helper and raises `subscription_locked`. Reads stay open so the lock screen can show the venue name and so nothing is deleted. Security-definer RPCs (chat send, stock movement, schedule publish, employee create, `create_workspace_venue`) must call the same helper themselves, because they bypass row policies.

The client may read its own venue's status. Only the webhook, using the service role, may change `status`, Stripe ids, and period end.

## 3. Server pieces

Put these in Supabase Edge Functions so the service role never ships to the browser. Vercel already hosts the app; it should only hold the publishable Stripe key.

1. `start-trial` — called once after sign-up, with plan `start` or `pro`. Creates the billing account, the first workspace, the owner membership, and the profile. Sets `trial_ends_at` to one calendar month later in the venue timezone (`Europe/Nicosia` unless they pick another), stored as `timestamptz`. No Stripe customer yet.
2. `create-checkout-session` — owner, general manager, or manager. Creates the Stripe Customer if needed, then a Checkout Session in EUR for the selected plan, period, and extra-venue quantity. Prices are the amounts in the table, exclusive of tax. Success and cancel URLs return to Settings → Plans & billing.
3. `customer-portal` — same roles. Opens the Stripe Customer Portal so they can change card, plan, or cancel.
4. `stripe-webhook` — verifies the Stripe signature. On `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, and `customer.subscription.updated/deleted`, it sets `status`, `current_period_end`, and `extra_venue_qty`. Payment failed sets `past_due`. After 3 days, or when the subscription is deleted, status becomes `locked`. Data is not deleted.

Trial end without a card: a daily scheduled function flips `trialing` to `locked` when `trial_ends_at` has passed. Do not trust the phone clock.

Lock check: every write path uses `workspace_allows_writes`. The UI also hides the app, but a crafted request must get `subscription_locked` from Postgres.

## 4. Client (English)

- **Trial banner** on Today for owners, general managers, and managers while `trialing`: “12 days left on your free month.” Tapping it opens Plans & billing. Hidden for staff and hosts. Hidden once they pay.
- **Settings → Plans & billing** for those same roles. Period control: Monthly, 3 months, 6 months, Yearly. Three cards with the exact totals above, the staff and venue limits, and “Prices exclude VAT.” Extra-venue lines for Pro and Group. Buttons: “Continue on this plan” (Checkout) and, once they have paid, “Manage billing” (Portal). Group does not offer a free month.
- **Owner lock screen** replaces the app when the venue is locked and the role is owner, general manager, or manager. Copy: the venue is paused, data is safe, choose a plan to continue. Same prices. No other navigation.
- **Staff lock screen** for host and staff. Copy: “Your venue’s subscription needs renewing. Ask your manager.” No prices, no Stripe button. Sign out stays available.

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

- **Demo venue.** `AMORE.NICOSIA` and any test workspace must be marked `comped` before the lock ships, or the live demo locks.
- **First-login bootstrap.** `createOwnerMembershipIfMissing` still offers the default workspace to a user with no membership, if that workspace has zero members. New signups should call `start-trial` instead, and must never become owner of the demo venue.
- **Trial clock.** Store `timestamptz`. Count “days left” in the venue timezone (`Europe/Nicosia` by default), not the phone’s UTC day. A trial that starts on 13 Nov ends on 13 Dec at the same local time. Postgres `interval '1 month'` handles short months.
- **Several venues, one person.** One billing account. If it locks, every venue on it locks. A person who owns venue A and is staff at venue B sees the pay screen only in A, and the “ask your manager” screen in B.
- **Host.** Treated like staff for the lock screen. They do not pay.
- **Free month is once.** A second venue, or a new account with the same person, does not get another free month. Stripe customer email plus `owner_auth_user_id` is the check.
- **Past due.** Three days of grace, then lock. Card retries stay inside Stripe. We do not delete data on cancel.
- **Caps.** Adding the 16th active employee on Start, or the 41st on Pro, or a 4th Pro venue, fails in the database with a plain message. Group staff are unlimited. Extra Group venues need the Stripe quantity first.
- **RPC holes.** Chat and stock RPCs bypass row locks. They have to call `workspace_allows_writes` or the lock is only visual.
- **VAT shown too early.** Do not add 19% until he is registered. The mockups say prices exclude VAT and do not invent a tax line.
