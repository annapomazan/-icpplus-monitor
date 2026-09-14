# ICPPLUS Monitor — Barcelona (free, GitHub-hosted)

This watches the ICPPLUS "Cita Previa Extranjeria" site for Barcelona,
checks for available appointment slots every ~15 minutes, and sends you a
Telegram message the instant slots may be open — with a direct link to
finish the booking yourself (CAPTCHA + SMS are always done manually).

It costs nothing: it runs on GitHub's free Actions minutes, and the
dashboard is a free GitHub Pages site.

---

## What this does NOT do

- It does **not** solve CAPTCHAs.
- It does **not** submit any booking form automatically.
- It only tells you the moment slots *may* be available, so you can jump in
  and book within seconds.

---

## One-time setup (about 15-20 minutes)

### Step 1 — Create a new GitHub repository

1. Go to https://github.com/new
2. Name it `icpplus-monitor` (or anything you like).
3. Set it to **Public** (required for free GitHub Pages on personal accounts)
   or Private if you have GitHub Pro — public is fine, nothing sensitive is
   stored here.
4. Click **Create repository**.

### Step 2 — Upload these files

In your new repo, click **"Add file" → "Upload files"**, and drag in this
entire folder's contents, keeping the structure:

```
icpplus-monitor/
├── .github/
│   └── workflows/
│       └── monitor.yml
├── data/
│   ├── profiles.json
│   └── status.json
├── monitor.py
├── requirements.txt
├── index.html
└── README.md
```

GitHub's upload UI supports drag-and-drop of folders in most browsers. If it
doesn't preserve folder structure, create the folders manually first (type
`.github/workflows/monitor.yml` as the filename when uploading — GitHub will
create the folders for you).

Commit directly to the `main` branch.

### Step 3 — Create your Telegram bot (2 minutes)

1. Open Telegram, search for **@BotFather**, start a chat.
2. Send `/newbot`, follow the prompts (pick any name and a username ending
   in "bot").
3. BotFather gives you a **token** like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ`.
   Save it.
4. Now you need your **chat ID**. Search for **@userinfobot** on Telegram,
   start a chat with it, and it will reply with your numeric ID (e.g.
   `987654321`). Save it.
5. Important: send any message (e.g. "hi") to YOUR new bot first — Telegram
   bots can't message you until you've messaged them.

### Step 4 — Add your Telegram details as repo secrets

1. In your repo, go to **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
   - Name: `TELEGRAM_BOT_TOKEN` → value: the token from BotFather.
3. Click **New repository secret** again.
   - Name: `TELEGRAM_CHAT_ID` → value: your numeric chat ID.

### Step 5 — Enable GitHub Pages

1. In your repo, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Choose branch `main`, folder `/ (root)`. Save.
4. After a minute, GitHub shows you a URL like
   `https://yourusername.github.io/icpplus-monitor/` — this is your
   dashboard.

### Step 6 — Point the dashboard at your repo

1. Open `index.html` in your repo (click it, then the pencil/edit icon).
2. Near the bottom, find:
   ```js
   const GH_USER = "YOUR_GITHUB_USERNAME";
   const GH_REPO = "icpplus-monitor";
   ```
3. Replace `YOUR_GITHUB_USERNAME` with your actual GitHub username, and
   `icpplus-monitor` with your actual repo name (if different).
4. Commit the change.

### Step 7 — Add your clients

1. Open `data/profiles.json` in your repo and click the pencil/edit icon.
2. For each client, add an entry like:

   ```json
   {
     "id": "unique_short_id",
     "name": "Client display name",
     "enabled": true,
     "province": "Barcelona",
     "procedure_name": "POLICIA-TOMA DE HUELLAS (EXPEDICION DE TARJETA)",
     "no_slots_phrases": [],
     "selectors": {}
   }
   ```

   - `id` must be unique and contain no spaces (e.g. `client1`, `maria_lopez`).
   - `procedure_name` must match the **exact text** in the ICPPLUS dropdown.
     Check the real site to confirm wording for your case — it sometimes
     varies.
   - Set `"enabled": false` to pause monitoring for a client without
     deleting them.

3. Commit the change.

### Step 8 — Run it once manually to test

1. Go to the **Actions** tab in your repo.
2. Click **"ICPPLUS Monitor"** in the left sidebar.
3. Click **"Run workflow"** → **Run workflow** (this is the manual trigger,
   `workflow_dispatch`).
4. Wait 1-3 minutes, then click into the run to see logs. Check that it
   completes without errors.
5. Visit your dashboard URL (from Step 5) — it should show your clients'
   statuses.

From now on, it runs automatically every ~15 minutes.

---

## If a procedure or province isn't found

The ICPPLUS site's exact dropdown text and page structure can vary slightly.
If a profile's log (visible in the dashboard, "Show log") shows it getting
stuck on a step:

1. Go to the real ICPPLUS site, walk through the flow manually for that
   province/procedure.
2. Note the exact visible text of the procedure in its dropdown.
3. Update `procedure_name` in `data/profiles.json` to match exactly
   (including accents/capitalization).
4. If a specific HTML element ID has changed, you can override it via the
   `selectors` field for that profile — see `DEFAULT_SELECTORS` at the top
   of `monitor.py` for the list of overridable keys.

---

## Adjusting the check frequency

Edit `.github/workflows/monitor.yml`, the line:

```yaml
- cron: "*/15 * * * *"
```

`*/15` means every 15 minutes. You could use `*/10` for every 10 minutes.
GitHub Actions free tier gives 2,000 minutes/month on a personal account;
each run takes roughly 1-3 minutes per client profile, so monitoring 2-3
clients every 10-15 minutes comfortably fits within the free quota. Going
much more frequent than every 5 minutes risks both running out of free
minutes and getting your IP rate-limited by the government site.

---

## When an alert fires

1. You get a Telegram message with a direct link.
2. Open that link in the browser where you have the Tampermonkey autofill
   script installed (from the original `icpplus_app` folder —
   `autofill_userscript.js`).
3. You may need to quickly redo province/procedure selection if the session
   expired.
4. Pick the matching client profile in the floating Tampermonkey panel,
   click **Autofill**.
5. Solve the CAPTCHA, enter the SMS code, and submit — fast, slots go in
   seconds.
