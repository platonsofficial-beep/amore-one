# ONE — Privacy Policy

_Last updated: [FILL IN: date of publication]_

ONE is a management app for hospitality venues (restaurants, bars, cafés). It covers staff schedules, attendance (clock-in), leave, tasks, stock, reservations and team chat. This policy explains what personal data ONE handles, why, and what your rights are.

## 1. Who we are and our role

**Provider of ONE:** [FILL IN: legal entity name], [FILL IN: registered address], company registration no. [FILL IN: number], email: [FILL IN: privacy contact email].

We act in two different roles:

- **Controller** for your own ONE **account**: your login email, password, sign-in sessions, device and push-notification settings, and how we run, secure and support the service.
- **Processor** for the data a venue (our customer) enters about its **staff, guests and suppliers**. The venue (the employer or business) is the controller of that data and decides why it is used. We process it only on the venue's instructions, under a Data Processing Agreement (DPA). If you are a venue's employee or guest, please send requests about that data to the venue first. We will help the venue answer them.

**Data Protection Officer / contact:** [FILL IN: DPO name or "not appointed", plus contact email].

## 2. What data we process

| Category | Examples | Whose data |
|---|---|---|
| Account | Email, password (stored only as a secure hash by our authentication provider), sign-in times, session tokens | App users |
| Team profile | Name, display name, role, position, department, profile photo, contact phone/email, linked employee record | Staff |
| HR data (entered by the venue) | Hire date, contract type, weekly hours, salary, emergency contact, internal notes | Staff |
| Schedules & leave | Shifts, availability, leave requests and decisions, notes | Staff |
| Attendance | Clock-in/out times, lateness, and a location check at clock-in/out (see below) | Staff |
| Permissions | Which modules each member can view or manage | Staff |
| Tasks & operations | Checklists, completion notes, announcements, activity logs (who did what and when) | Staff |
| Team chat | Messages, replies, reactions, attachments (e.g. photos), read status | Staff |
| Reservations | Guest name, phone number, party size, date/time, table and free-text notes (which may include preferences or allergies, if the venue enters them) | Venue guests |
| Suppliers & stock | Supplier company name, contact name, phone, email, address, tax ID; stock and order records | Supplier contacts |
| Invitations | Invited person's email, role, invitation status | Invited staff |
| Device & notifications | Push-notification subscription (browser/device endpoint and keys), device label, user agent | App users |
| Technical | Server logs (IP address, request time), error logs kept by our hosting providers | All users |

**Location at clock-in:** If the venue turns on location checks, ONE asks your device for its position **only when you press clock-in or clock-out**. It compares that position with the venue's location. We store only the **distance, the accuracy and whether you were inside the allowed area**, not your coordinates. ONE never tracks your location in the background. You can refuse location permission; the venue then decides how your clock-in is handled.

**Special categories:** ONE is not designed to collect health or other sensitive data. Reservation notes may contain allergy or dietary information if a venue enters it. Venues should record only what they need and are responsible for having a legal basis for it.

We do **not** sell personal data. We do **not** use advertising or third-party analytics or tracking. We do **not** use your data for automated decisions with legal effects.

## 3. Why we use data, and our legal bases (GDPR Art. 6)

- **Providing ONE to you and the venue** (accounts, schedules, chat, reservations and so on): performance of a contract (Art. 6(1)(b)). For staff and guest data, the venue relies on its own bases, for example the employment contract, legal obligations, legitimate interests, or guests' consent and contract for bookings.
- **Security, fraud prevention, logs and backups:** legitimate interests (Art. 6(1)(f)).
- **Push notifications and the location check:** your device permission, which you can withdraw at any time in your device settings. The venue's legitimate interest in accurate attendance records also applies to the location check.
- **Legal obligations**, such as accounting and responding to authorities: Art. 6(1)(c).

## 4. Who receives the data (sub-processors)

| Provider | Purpose | Location |
|---|---|---|
| Supabase Inc. | Database, authentication, file storage (profile photos, chat attachments), scheduled jobs, push-sending function | Data hosted in the EU (AWS eu-west-1, Ireland); Supabase is a US company |
| Vercel Inc. | Hosting and delivery of the web app | Global edge network; US company |
| Amazon Web Services | Underlying infrastructure of Supabase | EU region (Ireland) |
| Apple / Google / Mozilla push services | Delivering push notifications to your device (the content of the notification passes through them) | Global |
| Apple App Store / Google Play | App distribution (governed by their own privacy policies) | Global |

Other users of the same venue see data according to the permissions the venue sets. For example, managers see schedules, and chat members see the messages in their conversations.

## 5. International transfers

Our main data store is in the EU (Ireland). Some providers (Supabase, Vercel, push services) are US companies and may access data or process technical data outside the EEA. Where that happens, we rely on the EU-US Data Privacy Framework (where the provider is certified) and/or the European Commission's Standard Contractual Clauses, plus additional safeguards. [FILL IN: confirm the DPAs signed with Supabase and Vercel.]

## 6. How long we keep data

- **Account data:** while your account is active. It is deleted or anonymised within [FILL IN: e.g. 30] days of a deletion request or account closure, unless the law requires us to keep it longer.
- **Venue data (staff, guests, chat, attendance and so on):** for as long as the venue uses ONE, or as the venue instructs. When the venue ends its subscription, it is deleted within [FILL IN: e.g. 90] days. Venues should set their own retention periods, for example for guest reservations.
- **Backups:** kept for up to [FILL IN: e.g. 7–30] days by our hosting provider.
- **Server logs:** short-term, according to our providers' log retention.

## 7. Security

Encrypted connections (HTTPS/TLS), encryption at rest by our hosting provider, row-level access rules that separate venues and roles, private storage buckets for photos and attachments, and hashed passwords. No system is 100% secure. We will notify affected venues, and the authority where required, of personal data breaches without undue delay.

## 8. Your rights

Under the GDPR you have the right to: **access** your data; get it **corrected**; have it **erased**; **restrict** or **object** to processing; **data portability**; and **withdraw consent** at any time. You can also ask about our activities as a processor.

- **Account data:** contact us at [FILL IN: privacy email]. You can delete your account from inside the app (Profile → "Διαγραφή λογαριασμού") and download your data (Profile → "Λήψη των δεδομένων μου"). Deletion instructions: /delete-account.
- **Staff and guest data held by a venue:** contact the venue. We will forward your request to the venue and help it respond.

We answer within one month (extendable by two months for complex requests).

**Complaints:** you can complain to the **Commissioner for Personal Data Protection (Cyprus)**, 1 Iasonos Street, 1082 Nicosia (P.O. Box 23378, 1682 Nicosia), tel. +357 22818456, commissioner@dataprotection.gov.cy, www.dataprotection.gov.cy. You can also complain to the authority in your own EU country.

## 9. Cookies and local storage

ONE does **not** use advertising or analytics cookies. It uses your browser's or app's local storage only for things that are strictly necessary: keeping you signed in (authentication token), remembering the active venue, and display preferences (for example, collapsed schedule areas). It also uses an offline cache (service worker) so the app loads fast. Because all of these are strictly necessary, no consent banner is required.

## 10. Children

ONE is meant for workplace use by people aged 16 and over. We do not knowingly collect data about children. Venues must not enter children's data except where lawful, for example a guest booking made by an adult.

## 11. Changes

We will post updates here and change the date above. For significant changes we will notify you in the app.

## 12. Contact

[FILL IN: legal entity name], [FILL IN: address], [FILL IN: privacy email].
