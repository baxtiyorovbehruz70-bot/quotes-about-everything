# Quote Flashcard

A flash-card website: press the card and a random quote on life, love and existence appears.
Quotes live in a Neon (Postgres) database, and an admin panel lets you add or delete quotes
without touching the code. Everyone who visits sees the changes straight away.

```
public/index.html   the page (design)
public/app.js       card logic + admin panel
public/quotes.json  starter quotes (also loaded into the database on first run)
server.js           web server + API
db.js               database connection, table creation, first-run seeding
render.yaml         Render deployment settings
```

## 1. Neon (database)

1. Sign in at https://neon.tech and create a project.
2. Open **Connect** and copy the connection string. It looks like
   `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`.
3. Keep it private. You will paste it into Render in step 3.

The table is created automatically and filled with the starter quotes the first time the server starts.

## 2. GitHub

Create an empty repository on GitHub (no README), then in this folder run:

```bash
git init
git add .
git commit -m "Quote flashcard website"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

The `.gitignore` keeps `node_modules` and your `.env` secrets out of GitHub.

## 3. Render (hosting)

1. At https://render.com choose **New +** -> **Blueprint**, connect the GitHub repository, and approve.
   (Or choose **New +** -> **Web Service** and fill in: Build Command `npm ci`, Start Command `npm start`.)
2. When asked for environment variables, set:
   - `DATABASE_URL`: your Neon connection string
   - `ADMIN_PASSWORD`: a long password only you know
   - `SESSION_SECRET`: filled in automatically by the Blueprint (for a manual Web Service, type any long random text)
3. Deploy. Your site appears at `https://your-service.onrender.com`.

## Using the admin panel

Open the site and press **Ctrl+Shift+A**, add `#admin` to the address, or click the faint lock icon in the bottom-right corner.
Sign in with `ADMIN_PASSWORD`.

- **Add quotes:** one per line, written as `"Quote text." — Author Name`. Numbers at the start of a line are ignored.
  A note in brackets, such as `(attribution disputed)`, is shown under the author.
- **Delete quotes:** search the list and press Delete. This works for every quote, including the starter ones.
- **Change the password:** edit `ADMIN_PASSWORD` in the Render dashboard and redeploy.

## Run it on your own computer (optional)

```bash
cp .env.example .env     # then fill in DATABASE_URL and ADMIN_PASSWORD
npm install
npm run dev              # opens on http://localhost:3000
```

## Good to know

- On Render's free plan the site falls asleep after about 15 minutes without visitors. The first visit afterwards
  can take around a minute. Neon also pauses an idle database and wakes it in about a second. Pressing the card
  while it wakes shows "Waking things up".
- The starter quotes include attributions marked as disputed, translated or paraphrased. Check them before you
  rely on them for anything formal.
