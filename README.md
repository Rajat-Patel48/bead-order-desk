# Bead Order Desk

Order tracking for a bead business. Staff take an order, send it to the factory, the factory confirms and marks it ready, the customer is told — and the **owner sees where every order is without calling anyone**.

```
app/      Expo (React Native) app — Android + iPhone (+ web for testing)
server/   Node + Express + PostgreSQL API, WhatsApp Cloud API webhook, alert scheduler
```

## How it works

| Step | Who | How it's recorded |
|---|---|---|
| Taken | Staff | New order in the app, items picked from the stock list **with the exact names staff already use** |
| Sent to factory | Staff | One tap. Automatic WhatsApp (Cloud API) or opens WhatsApp with the message ready, or "gave it by phone" |
| Factory confirmed | **Factory only** | Taps *I received this order*, taps **Received** on the WhatsApp message, or replies `OK 0311-K7Q` |
| In production → Ready | Factory only | Taps in the app, or replies `START …` / `READY …` |
| Customer informed | Staff (or automatic) | WhatsApp template sent automatically when the factory marks ready, or staff tap / call |
| Delivered | Staff | Tap |

Rules the server enforces (not just the app):
- Staff **cannot** mark an order as confirmed by the factory. Only a factory login, the factory's own WhatsApp number, or the owner can.
- WhatsApp replies are only accepted from numbers registered as factory workers (or the owner). Anyone else is ignored.
- Every change stores who, when, and how (app / phone call / WhatsApp reply). The owner sees this timeline on each order.
- Orders that sit too long in a step turn red and send a push notification to the owner **and** to whoever has to act. Limits are set in Settings.

Owner tabs: **Orders** (live board grouped by stage, search by customer / order no. / item), **Reports** (time per step, per-staff send speed), **Team** (add people, reset PINs, deactivate), **Settings**.

Login is **mobile number + 4–6 digit PIN**, created by the owner. 5 wrong PINs lock the account for 15 minutes. Resetting a PIN or deactivating someone logs them out on every phone.

---

## Run it on your PC (Windows, PowerShell)

Needs: [Node.js 22 LTS](https://nodejs.org), [PostgreSQL 16](https://www.postgresql.org/download/windows/) (or a free cloud database from Neon/Supabase), and the **Expo Go** app on your phone for quick testing.

### 1. Server

```powershell
cd server
npm install
Copy-Item .env.example .env
notepad .env   # set DATABASE_URL and a long random JWT_SECRET
npm run seed:items                                   # loads the 2,376 items from the stock list, names untouched
npm run create-owner -- "Owner Name" 98XXXXXXXX 1234  # the owner's login
npm run dev                                          # API on http://localhost:4000
```

To reload items from a fresh Tally export later: `npm run seed:items -- "C:\path\to\StkSummary.xlsx"` (column A = name, column B = unit). New items are added, nothing is renamed or deleted.

Tests (uses a separate database):

```powershell
$env:TEST_DATABASE_URL = "postgres://postgres:password@localhost:5432/beads_test"
npm test
```

### 2. App

```powershell
cd app
npm install
Copy-Item .env.example .env
ipconfig   # find your PC's IPv4 address, e.g. 192.168.1.10
notepad .env   # EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
npx expo start
```

Scan the QR code with Expo Go (phone and PC on the same Wi‑Fi). Log in with the owner number and PIN, then add staff and factory workers in **Team**.

Push notifications don't work in Expo Go. They need a real build (step 4).

---

## Put it online

1. **Database**: create a free Postgres on [Neon](https://neon.tech) or [Supabase](https://supabase.com). Copy the connection string, set `DATABASE_SSL=true`.
2. **Server**: deploy the `server/` folder to [Render](https://render.com) or [Railway](https://railway.app) (any Node host works).
   - Build: `npm install && npm run build` · Start: `npm start` (runs migrations automatically)
   - Set the env vars from `.env.example`. Run `npm run seed:items` and `npm run create-owner` once from the host's shell.
3. Point the app at it: `EXPO_PUBLIC_API_URL=https://your-server.onrender.com`

Render's free tier sleeps after inactivity, so the first request takes ~30 s and the alert scheduler stops while it sleeps. For a real business, use a paid instance (a few hundred rupees a month).

## Build the Android and iPhone apps

```powershell
cd app
npx eas-cli@latest login
npx eas-cli@latest init                                  # creates the project and fills extra.eas.projectId (needed for push)
npx eas-cli@latest build -p android --profile preview    # .apk you can send on WhatsApp and install directly
npx eas-cli@latest build -p android --profile production # .aab for the Play Store
npx eas-cli@latest build -p ios --profile production     # needs an Apple Developer account (USD 99/year)
```

Android push notifications also need Firebase credentials uploaded to EAS: see Expo's push notification setup guide.

---

## WhatsApp Cloud API (automatic messages)

Without these settings the app still works: staff tap a button and WhatsApp opens with the message typed out, and they press send. With them, the **server sends messages itself and reads the factory's replies**.

### What the business needs (start now, approval takes days)
1. A **Meta Business account** (business.facebook.com), ideally verified with GST / business documents.
2. A **phone number not currently on WhatsApp** (a new SIM is easiest). It becomes the business's WhatsApp number.
3. In [developers.facebook.com](https://developers.facebook.com): create an app → add **WhatsApp** → add the number → create a **permanent System User access token** with `whatsapp_business_messaging` permission.

### Two message templates (WhatsApp Manager → Message templates, category **Utility**, language **English**)

**`new_order_factory`**
```
New order {{1}} for {{2}}. Due: {{3}}. Items: {{4}}. Tap Received below when you have this order.
```
Button: **Quick reply** → `Received`

**`order_ready_customer`**
```
Namaste {{1}}, your order {{2}} is ready. Thank you, {{3}}.
```

If Meta rejects a template, reword it slightly and resubmit. If you rename them, set `WA_TEMPLATE_FACTORY` / `WA_TEMPLATE_CUSTOMER`. If you skip the button, set `WA_TEMPLATE_FACTORY_BUTTON=false`.

### Connect the webhook
- Callback URL: `https://your-server/webhooks/whatsapp`
- Verify token: the value of `WA_VERIFY_TOKEN`
- Subscribe to the **messages** field
- Set `WA_APP_SECRET` (App settings → Basic) so the server rejects fake webhook calls

### What the factory can reply
| Reply | Effect |
|---|---|
| Tap **Received** on the order message | Confirmed |
| `OK 0311-K7Q` (also: received, mila) | Confirmed |
| `START 0311-K7Q` (also: started, making) | In production |
| `READY 0311-K7Q` (also: done, taiyar) | Ready → customer messaged automatically |
| `OK` alone | Confirms only if exactly one order is waiting, otherwise asks for the number |

The server replies with a ✅ so the worker knows it worked. Delivery receipts (sent / delivered / read) for the factory message show on the order, so the owner can see a message was **read** but not confirmed.

**Costs:** Meta charges per template message (utility rates in India are low but not zero). Replies within 24 hours of the factory's message are free. Check current rates on Meta's pricing page before going live.

---

## Known limits (v1)

- **The app is only as true as the taps.** If the factory makes an order and never taps or replies, the board shows "In production". The red overdue alerts are how missed taps get caught. The owner should insist for the first weeks: if it's not in the app, it isn't done.
- No partial deliveries yet (an order is ready as a whole).
- Stock quantities are not tracked: the Tally export has none. Tally stays the source of truth for stock and billing.
- Customers don't log in. They only get WhatsApp messages.
