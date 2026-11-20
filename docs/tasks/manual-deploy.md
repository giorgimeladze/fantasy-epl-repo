# Manual deploy to Lightsail

- **Written:** 2026-11-19
- **Why:** the GitHub Actions deploy ([deployment-roadmap.md](deployment-roadmap.md) Phase 6) is paused. Until it works, deploy from the laptop with these steps. They do the same as `.github/workflows/deploy.yml`, by hand.
- **Server:** `fantasy-epl-4c75`, `13.61.248.179`, https://fantasy-epl-gio.duckdns.org

## How to read this guide

- **Everything runs in a terminal on your laptop**, opened at the repo root. You never log in to the server by hand: each `ssh …` command runs one thing on the server and comes back.
- **Use one terminal window for the whole deploy.** Step 1 sets variables (`$SHA`, `$HOST`, …) that the later steps use. If you close the window or open a new one, run step 1 again first.
- **Each grey box is one paste.** Copy the whole box, paste it into the terminal, press Enter once. Don't split a box into lines, and don't merge two boxes.
- **Wait for each box to finish** (the prompt comes back) and check the "Expected" line before the next box.
- Lines starting with `#` are comments; pasting them is harmless.

## 0. Before you start

Paste, one box at a time:

```bash
git switch master
git pull
git status
```

Expected: `nothing to commit, working tree clean`. If not, commit or stash first: **the release is built from the last commit, not from your files**, so uncommitted changes are not deployed.

```bash
ssh -i ~/.ssh/fantasy-epl ubuntu@13.61.248.179 echo connected
```

Expected: `connected`, with no host-key warning.

## 1. Set the variables

```bash
SHA=$(git rev-parse --short HEAD)
HOST=ubuntu@13.61.248.179
KEY=~/.ssh/fantasy-epl
DOMAIN=fantasy-epl-gio.duckdns.org
echo "Deploying $SHA to $DOMAIN"
```

Expected: `Deploying <7 characters> to fantasy-epl-gio.duckdns.org`.

## 2. Build the release

Builds a clean copy of the commit in a temporary folder, so your own `node_modules`, `.env` and database never end up in the release. Takes 1–2 minutes.

```bash
BUILD=$(mktemp -d)
git archive HEAD | tar -x -C "$BUILD"
cd "$BUILD" && npm ci && npm run check && npm run build && npm ci --omit=dev -w app/server && tar -czf "/tmp/release-$SHA.tar.gz" package.json package-lock.json node_modules app/server/package.json app/server/dist app/client/dist deploy $(ls -d app/server/node_modules 2>/dev/null)
cd - > /dev/null
ls -lh "/tmp/release-$SHA.tar.gz"
```

Expected: the last line shows the tarball, about 1 MB. If `npm run check` fails (a test or lint error), nothing after it runs and `ls` says `No such file`: fix the code first.

Building on a Mac is fine: the server's only dependency (Express) is plain JavaScript, and SQLite is built into Node.

## 3. Upload and unpack on the server

```bash
scp -i "$KEY" "/tmp/release-$SHA.tar.gz" "$HOST:/tmp/"
```

Expected: no output (or a progress line), prompt back.

```bash
ssh -i "$KEY" "$HOST" "cd /opt/fantasy-epl/releases && if [ -d $SHA ]; then echo 'Already on the server'; else rm -rf .tmp-$SHA && mkdir .tmp-$SHA && tar -xzf /tmp/release-$SHA.tar.gz -C .tmp-$SHA && mv .tmp-$SHA $SHA; fi; rm -f /tmp/release-$SHA.tar.gz; ls -1t"
```

Expected: a list of release names, with yours (`$SHA`) on top. Deploying the same commit again prints `Already on the server` and keeps the existing copy, which is fine: it is the same code.

## 4. Change the env file (only when a setting changes)

**Skip to step 5** when the settings in `/etc/fantasy-epl/env` stay the same, which is most deploys.

To change a setting (for example to add the second account), you edit a **copy**. Step 5b installs it, keeps the old file as `env.prev`, and puts the old one back if the new release fails.

```bash
ssh -t -i "$KEY" "$HOST" "sudo install -m 600 -o ubuntu /etc/fantasy-epl/env /tmp/fantasy-epl.env && nano /tmp/fantasy-epl.env"
```

This opens the copy in the `nano` editor, inside your terminal. For the second account, add these three lines at the end (all three, or none), with your values after `=`:

```
ACCOUNT2_USERNAME=
ACCOUNT2_PASSWORD=
ACCOUNT2_FPL_TEAM_ID=
```

One value per line, no quotes, no backslashes. Save: **Ctrl+O**, then **Enter**. Exit: **Ctrl+X**. You are back on your laptop's prompt.

## 5. Activate the release

Run **exactly one** of the two boxes.

**5a.** If you skipped step 4:

```bash
ssh -i "$KEY" "$HOST" "bash /opt/fantasy-epl/releases/$SHA/deploy/release.sh $SHA $DOMAIN"
```

**5b.** If you did step 4:

```bash
ssh -i "$KEY" "$HOST" "bash /opt/fantasy-epl/releases/$SHA/deploy/release.sh $SHA $DOMAIN /tmp/fantasy-epl.env"
```

Expected: the last line is `==> <sha> is live`.

If instead you see `!! <sha> is unhealthy`, the script shows the server's last log lines, logs `Rolling back to …`, and puts back the previous release (and, for 5b, the previous env file). The site keeps running the old version. Read the log lines, fix the problem, and start again from step 1.

## 6. Check

```bash
curl -fsS "https://$DOMAIN/api/health"
```

Expected: `{"status":"ok"}`.

```bash
ssh -i "$KEY" "$HOST" "readlink /opt/fantasy-epl/current && systemctl is-active fantasy-epl && free -m"
```

Expected: a path ending in your `$SHA`, then `active`, then the memory table.

Then in the browser: open https://fantasy-epl-gio.duckdns.org, log in, open each page. With a second account, log in as it in another tab and check it shows the friend's team.

Optional, to watch the server's log live while you click around (stop it with **Ctrl+C**):

```bash
ssh -i "$KEY" "$HOST" "journalctl -u fantasy-epl -f"
```

## 7. Clean up the laptop

```bash
rm -rf "$BUILD" "/tmp/release-$SHA.tar.gz"
```

The server keeps the newest 3 releases and deletes older ones itself.

## Going back by hand

**To an older release.** First list them:

```bash
ssh -i "$KEY" "$HOST" "ls -1t /opt/fantasy-epl/releases"
```

Then set `SHA` to the one you want and run step 5a (it is already on the server, so no build or upload):

```bash
SHA=paste-the-release-name-here
ssh -i "$KEY" "$HOST" "bash /opt/fantasy-epl/releases/$SHA/deploy/release.sh $SHA $DOMAIN"
```

**To the previous env file:**

```bash
ssh -i "$KEY" "$HOST" "sudo cp -p /etc/fantasy-epl/env.prev /etc/fantasy-epl/env && sudo systemctl restart fantasy-epl"
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `zsh: command not found` or an empty name in a command (e.g. `/tmp/release-.tar.gz`) | The variables are missing: new terminal window. Run step 1 again. |
| `No release at /opt/fantasy-epl/releases/<sha>` | Step 3 didn't run or failed. Run it again. |
| `Missing /etc/fantasy-epl/env` | The env file is gone. Recreate it from `deploy/production.env.example` (owner root, mode 600). |
| Unhealthy, log says `… must be set in production` | A required setting is missing from the env file. |
| Unhealthy, log says `Set all of ACCOUNT2_USERNAME, …` | Only some of the second account's lines are set: add all three or remove all three. |
| `REMOTE HOST IDENTIFICATION HAS CHANGED` | The instance was rebuilt. Check it really was, then `ssh-keygen -R 13.61.248.179` and connect again. |
| https doesn't load, http does | Caddy has no certificate yet: `ssh -i "$KEY" "$HOST" "journalctl -u caddy -n 50"`. |
