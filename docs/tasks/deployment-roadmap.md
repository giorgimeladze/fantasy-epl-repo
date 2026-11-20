# Deployment roadmap (Lightsail, Terraform, GitHub Actions)

- **Written:** 2026-10-30
- **Goal and design:** [spec 008](../specs/008-production-deployment.md). This file is the step-by-step order of work. Where the two differ, this file is newer: the state bucket (spec R1) moved to Phase 7, the first time something other than a laptop runs Terraform.
- **Status:** see [Progress](#progress).

## Progress

Last checked 2026-11-18 (after Phase 5).

**Done**
- [x] Phase 0: IAM permissions, SSH key `~/.ssh/fantasy-epl`, `.gitignore`
- [x] Phase 1: `infra/prod/` applied. Instance `fantasy-epl-4c75` (`nano_3_0`), static IP `13.61.248.179`, ports 22/80/443
- [x] Phase 2: `cloud-init.sh` works (Node 22.23, Caddy 2.11, 1 GB swap, `fpl` user, folders); `http://13.61.248.179` → 200
- [x] Committed: `4da8675` (Terraform + instance)

**Open, in order**
- [x] **Phase 2.5, firewall drift:** all `port_info` fields explicit (IPv4 only), applied; `plan` → No changes
- [x] Commit this roadmap (in `57f46f5`)
- [x] **Phase 3:** `fantasy-epl-gio.duckdns.org` → `13.61.248.179` (dig ok, http 200); `variable "domain"` + `output "url"` added
- [x] Phase 4.1: only writes are `DATABASE_PATH` + its `-wal`/`-shm` siblings (`db/database.ts`); nothing else on disk
- [x] Phase 4.2: `deploy/fantasy-epl.service`. `systemd-analyze verify` clean, security exposure 2.9 OK. Not installed yet (`release.sh` does that)
- [x] Phase 4.3: `deploy/Caddyfile` (`caddy validate` ok on the server)
- [x] Phase 4.4: `deploy/production.env.example` (template; real file created on the server by hand)
- [x] Phase 4.5: build flow tested: `git archive` into a temp dir → `npm ci` → check → build → `npm ci --omit=dev -w app/server` (3.8 MB) → tar
- [x] Phase 4.4 (server): `/etc/fantasy-epl/env` created by hand
- [x] Phase 4.6: `deploy/release.sh` (syntax checked; not run yet)
- [x] FPL API reachable from the server (200)
- [x] Phase 4.7: release `b490f21` deployed by hand; live at https://fantasy-epl-gio.duckdns.org (Let's Encrypt cert, http → 308 redirect, security headers)
- [x] Phase 4.8: login + every page's API 200; history import (4 seasons) ok; peak node RSS 134 MB, swap 146 MB, 0 restarts on `nano_3_0`; back by itself ~20 s after reboot
- First attempt failed: `release.sh` was staged but not committed, so the tarball (built from `HEAD` by `git archive`) didn't contain it, `release.sh` wasn't found, and Caddy kept its default `:80` config (→ "refused to connect" on https). **Commit before building.**
- [x] Phase 5: `.github/workflows/ci.yml` (jobs `App (lint, typecheck, test, build)`, `Terraform (fmt, validate)`), green on PR #1 (merged). Ruleset `master` active: PR required, both checks required, no force push, no deletion. **From now on every change to `master` goes through a PR.**
- **2026-11-20:** Phase 6 failed because `vars.*` reached the job empty (secrets worked; cause unknown). `DEPLOY_HOST` and `DOMAIN` now sit in `deploy.yml`, the host key in `deploy/known_hosts` (fingerprint checked against the server), so the workflow uses no GitHub variables. Until it runs green, deploy by hand with [manual-deploy.md](manual-deploy.md).
- [ ] Phase 6: `deploy.yml` written; `release.sh` takes the env file as 3rd arg and restores it on rollback. Left: `production` environment, merge, rollback test
- [ ] Phase 7: `infra/bootstrap/` (bucket, OIDC, roles) + state migration
- [ ] Phase 8: Terraform plan/apply in CI
- [ ] Phase 9: optional extras

## Why this order

1. **Make it exist, then make it work, then automate it.** A server comes before its setup, and a process that works by hand comes before automating it.
2. **Do the risky one-shot parts while there is nothing to lose.** Changing `user_data` rebuilds the server, which costs nothing while it is empty.
3. **Add each piece only when something needs it.** The bucket and the AWS role arrive in Phase 7, when GitHub first runs Terraform. App deploys only need SSH.
4. **Automate the frequent, low-risk part first.** App deploys (Phase 6) happen on most pushes; infrastructure changes (Phase 8) are rare and riskier.

| # | Phase | Run from | Done when | Status |
| --- | --- | --- | --- | --- |
| 0 | Preparation | Laptop, AWS console | `plan` can talk to Lightsail | Done |
| 1 | Lightsail server in Terraform | Laptop | SSH into a bare Ubuntu server | Done |
| 2 | First-boot setup (`user_data`) | Laptop | Node, Caddy, swap, user, folders, all automatic | Done |
| 3 | Domain (DuckDNS) | duckdns.org, laptop | The domain resolves to the static IP | Done |
| 4 | First deploy by hand | Laptop → server | The app is live over HTTPS | Done |
| 5 | CI checks on pull requests | GitHub | Every PR is linted, typechecked, tested, built | Done |
| 6 | App deploy workflow | GitHub | Push to `master` → checks → live | |
| 7 | State bucket + GitHub login to AWS | Laptop | State in S3, GitHub can log into AWS | |
| 8 | Terraform in CI | GitHub | Changing `infra/` and pushing updates AWS | |
| 9 | Optional extras | Any | Pick as needed | |

---

## Phase 0: Preparation (done)

1. IAM user `GiorgiMAC` has Lightsail permissions (`AdministratorAccess` for the setup phase).
2. SSH key: `ssh-keygen -t ed25519 -f ~/.ssh/fantasy-epl`. The same key is used for SSH from the laptop and, later, by GitHub (Phase 6).
3. `.gitignore`: `.terraform/`, `*.tfstate*`, `*.tfvars`.
4. Terraform ≥ 1.14 and AWS CLI v2 installed. For CLI commands set `AWS_REGION=eu-north-1` (no default region is configured).

## Phase 1: Lightsail server in Terraform (done)

Files in `infra/prod/`: `versions.tf` (AWS `~> 6.0`, random `~> 3.6`, `default_tags`), `variables.tf`, `main.tf`, `outputs.tf`, and `.terraform.lock.hcl` (committed).

1. `random_id` (2 bytes) + `local.name` = `fantasy-epl-<hex>`. The suffix is stored in state, so it never changes.
2. `aws_lightsail_key_pair` from `file(pathexpand(var.ssh_public_key_path))`. Uploading your own public key keeps the private key out of state.
3. `aws_lightsail_instance`: `nano_3_0` ($5, 512 MB), `ubuntu_24_04`, zone `${var.aws_region}a`, optional `add_on` AutoSnapshot.
4. `aws_lightsail_static_ip` + `aws_lightsail_static_ip_attachment`.
5. `aws_lightsail_instance_public_ports`: 22, 80, 443. It replaces Lightsail's default firewall.
6. Outputs: `static_ip`, `ssh_command`.
7. Check: `terraform plan` → `apply` → `$(terraform output -raw ssh_command)`.

Result: `fantasy-epl-4c75` at **13.61.248.179**.

## Phase 2: First-boot setup (done, one fix left)

1. `infra/prod/cloud-init.sh`, passed as `user_data = file("${path.module}/cloud-init.sh")`. It sets up 1 GB swap, Node 22 (NodeSource), Caddy (official repo), `sqlite3`, the `fpl` system user, and these folders:
   - `/opt/fantasy-epl/releases` (owner `ubuntu`)
   - `/var/lib/fantasy-epl` (owner `fpl`, 750)
   - `/etc/fantasy-epl` (owner root, 700)
2. `lifecycle { replace_triggered_by = [aws_lightsail_instance.app.created_at] }` on the IP attachment and on the firewall.
3. Apply, then `ssh-keygen -R 13.61.248.179` (a rebuilt server has a new host key), wait about 3 minutes.
4. Check: `cloud-init status --wait; node -v; caddy version; free -m; id fpl; ls -ld …`, and `http://13.61.248.179` returns 200.
5. **Left to do:** `terraform plan` still wants to replace the firewall on every run. The port 22 block has no `cidrs`, and the others lack `ipv6_cidrs`/`cidr_list_aliases`, so AWS fills them in after creation. Give all three `port_info` blocks:
   ```hcl
   cidrs             = ["0.0.0.0/0"]
   ipv6_cidrs        = []
   cidr_list_aliases = []
   ```
   Then run `terraform fmt`, `apply`, and `plan`. It must say **No changes.**
6. Commit `.gitignore` + `infra/prod/`.

**Lessons from this phase:**
- **Lightsail puts its own `#!/bin/sh` script in front of `user_data`,** so the script runs under dash. Write POSIX sh only (no `pipefail`, `[[ ]]`, arrays).
- **Replacing an instance detaches its static IP,** and Terraform doesn't notice when the instance keeps its name. That's what `replace_triggered_by` fixes.
- **Debugging setup:** `sudo tail -50 /var/log/cloud-init-output.log` and `cloud-init status --long`. If the static IP is detached, the instance's temporary IP still works for SSH; see `aws lightsail get-instances`.
- **Always read `plan`** for `forces replacement` / `must be replaced` before `apply`. After every apply, `plan` should say "No changes."

## Phase 3: Domain with DuckDNS (next)

1. duckdns.org → sign in (GitHub) → add a subdomain, e.g. `fantasy-epl-gio`.
2. Set **current ip** to `13.61.248.179` (it pre-fills the laptop's IP) → **update ip**.
3. Keep the DuckDNS token private; it can repoint the domain. It's only needed if automation ever updates the IP.
4. Check: `dig +short <name>.duckdns.org` → `13.61.248.179`; `curl -sI http://<name>.duckdns.org` → `200`.
5. Terraform: `variable "domain"` (default `"<name>.duckdns.org"`) and `output "url"` = `"https://${var.domain}"`. `plan` shows only the new output, no resource changes.

Done when `dig` returns the static IP and `terraform output url` prints the address. HTTPS itself comes in Phase 4, when Caddy gets its real config.

## Phase 4: First deploy by hand

Everything here goes in a new `deploy/` folder. Phase 6 runs these same files from GitHub, so get them right by hand first.

1. **Check what the server writes to disk.** The database path comes from `DATABASE_PATH`. Confirm nothing else is written under `app/server/` (history imports, logs). `ProtectSystem=strict` in step 2 will catch anything missed.
2. **`deploy/fantasy-epl.service`** (systemd):
   - `User=fpl`, `WorkingDirectory=/opt/fantasy-epl/current/app/server`
   - `EnvironmentFile=/etc/fantasy-epl/env`
   - `ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning dist/server.js`. Call `node` directly rather than `npm start`, which also reads `../../.env`.
   - `Restart=on-failure`
   - Hardening: `NoNewPrivileges=yes`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/fantasy-epl`, `PrivateTmp=yes`
3. **`deploy/Caddyfile`:**
   ```
   DOMAIN_PLACEHOLDER {
       encode gzip
       reverse_proxy 127.0.0.1:3001
   }
   ```
   `release.sh` replaces the placeholder with the domain. Caddy then fetches and renews the Let's Encrypt certificate and redirects HTTP to HTTPS.
4. **The env file** `/etc/fantasy-epl/env` (root, mode 600):
   ```
   NODE_ENV=production
   PORT=3001
   DATABASE_PATH=/var/lib/fantasy-epl/fpl.sqlite
   ADMIN_USERNAME=…
   ADMIN_PASSWORD=…
   FPL_TEAM_ID=…
   ```
   `NODE_ENV=production` makes the server refuse to start if a secret is missing.
5. **Build the release on the laptop:**
   - `npm ci && npm run check && npm run build`
   - Then a production-only install: `npm ci --omit=dev`. Express is pure JS, so building on a Mac is fine.
   - Tar up: `package.json`, `package-lock.json`, `node_modules/`, `app/server/package.json`, `app/server/dist/`, `app/client/dist/`, `deploy/`. Name it `release-<git sha>.tar.gz`.
   - The paths must stay as they are: [app.ts](../../app/server/src/app.ts) finds the client at `../../client/dist` from `app/server/dist/`.
6. **`deploy/release.sh <sha> <domain>`**, run on the server as `ubuntu` (which has passwordless sudo):
   1. Unpack into `/opt/fantasy-epl/releases/<sha>`.
   2. Install the systemd unit, `daemon-reload`, `enable`.
   3. Render the Caddyfile with the domain → `caddy validate` → install → `systemctl reload caddy`.
   4. Remember the previous `current`, then `ln -sfn` the new release → `systemctl restart fantasy-epl`.
   5. Health check: `curl -fsS http://127.0.0.1:3001/api/health`, retried for about 20 s.
   6. If it fails: point `current` back at the previous release, restart, show `journalctl -u fantasy-epl -n 50`, exit 1.
   7. Delete all but the 3 newest releases.
7. **Deploy by hand:**
   - `scp` the tarball, then on the server: unpack `deploy/` and run `release.sh`.
   - Create the env file once with `sudo tee` + `chmod 600`.
8. **Check:**
   - `https://<domain>` shows the login page, the certificate is valid, and `http://` redirects.
   - Log in, open the dashboard (the first load imports history: watch `journalctl -u fantasy-epl -f` and memory with `free -m`).
   - Restart the server (`sudo reboot`) and confirm it comes back by itself.
   - Run `curl https://fantasy.premierleague.com/api/bootstrap-static/` from the server, in case FPL blocks data-centre IPs.

Done when the app works over HTTPS after a reboot.

## Phase 5: CI checks on pull requests (done)

1. **`.github/workflows/ci.yml`:**
   - Triggers: `pull_request`, plus `workflow_call` so the deploy workflow can reuse it.
   - App job: checkout → `actions/setup-node` (`node-version-file: .nvmrc`, `cache: npm`) → `npm ci` → `npm run check` → `npm run build`.
   - Terraform job: `hashicorp/setup-terraform` → `terraform fmt -check -recursive infra` → `terraform -chdir=infra/prod init -backend=false` → `validate`. No AWS access is needed.
2. Open a PR to test it. Break a test on purpose once and see it fail.
3. **Branch protection on `master`:** require the CI checks before merging.

Done when a PR shows green checks, and a broken one can't be merged.

## Phase 6: App deploy workflow

1. **GitHub → Settings → Environments → `production`:**

   | Kind | Name | Value |
   | --- | --- | --- |
   | Secret | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `FPL_TEAM_ID` | the production values |
   | Secret | `DEPLOY_SSH_KEY` | contents of `~/.ssh/fantasy-epl` (the private key) |
   | Secret (optional) | `ACCOUNT2_USERNAME`, `ACCOUNT2_PASSWORD`, `ACCOUNT2_FPL_TEAM_ID` | the second account, all three or none |

   No GitHub *variables*: they reached the job empty. The non-secret values live in the repo instead: `DEPLOY_HOST` and `DOMAIN` in `deploy.yml`'s job `env`, and the pinned host key in `deploy/known_hosts`. Pinning means GitHub refuses to deploy to an impostor. **Update all three whenever the instance is rebuilt.** To refresh the key: `ssh-keyscan -t ed25519 <ip> > deploy/known_hosts`, then check that `ssh-keygen -lf deploy/known_hosts` matches `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run on the server.

   Environment settings: **Deployment branches → Selected branches → `master`**, so no other branch gets these secrets. Secrets must be one line, without quotes or backslashes (systemd's `EnvironmentFile` interprets those).
2. **`.github/workflows/deploy.yml`:**
   - Triggers: `push` to `master` (every merged PR), plus `workflow_dispatch` ("Run workflow": re-deploy the latest `master`, e.g. after changing a secret)
   - `concurrency: { group: production, cancel-in-progress: false }`
   - Job `check`: `uses: ./.github/workflows/ci.yml`
   - Job `deploy`, with `needs: check` and `environment: production`:
     1. Build the tarball as in Phase 4.5.
     2. Write the SSH key, copy `deploy/known_hosts`, and add an `ssh` host alias `prod` (`StrictHostKeyChecking yes`).
     3. `scp` the tarball; unpack into `releases/.<sha>.tmp`, then rename to `releases/<sha>` (skipped when it already exists, i.e. a re-deploy).
     4. Build the env file from secrets (passed as step `env:`, never in the command text) and pipe it over `ssh` to `/tmp/fantasy-epl.env` (mode 600).
     5. Run `release.sh <sha> <domain> /tmp/fantasy-epl.env`: it installs the env file (old one kept as `env.prev`), activates, and on a failed health check restores both the previous release and the previous env file.
     6. From the runner: `curl -fsS https://$DOMAIN/api/health`.
3. Test it: merge a small visible change, watch it go live. Then test the rollback: delete the `FPL_TEAM_ID` secret (a missing secret reaches the workflow as an empty string, and `production.ts` refuses to start without it; GitHub doesn't allow an empty value, and a space would pass), "Run workflow", and confirm the job fails with `Rolling back` + `Rollback healthy` while the site stays up. Restore the secret and run it again.

Done when a push to `master` deploys with no manual steps, and a bad deploy rolls back.

## Phase 7: State bucket + GitHub login to AWS

1. **`infra/bootstrap/`** (its own `versions.tf`, `variables.tf`, `main.tf`, `outputs.tf`):
   - `data "aws_caller_identity"`, `locals` (bucket name `fantasy-epl-tfstate-<account id>`, `token.actions.githubusercontent.com`)
   - `aws_s3_bucket` (`prevent_destroy`), plus `_versioning`, `_server_side_encryption_configuration` (AES256), `_public_access_block` (all four `true`)
   - `aws_iam_openid_connect_provider`, with `client_id_list = ["sts.amazonaws.com"]`
   - **Deploy role:** trust `sub = repo:giorgimeladze/fantasy-epl-repo:environment:production`. Permissions: `lightsail:*`, plus state bucket `ListBucket` and `Get/Put/DeleteObject`.
   - **Plan role** (for PRs in Phase 8): trust `sub = repo:giorgimeladze/fantasy-epl-repo:pull_request`. Permissions: `lightsail:Get*`, state `Get/ListBucket`, plus `Put/DeleteObject` on `*.tflock` only.
   - Outputs: both role ARNs and the bucket name.
2. `terraform init && plan && apply` from the laptop.
3. **Move bootstrap's own state:** add `backend "s3" { bucket, key = "bootstrap/terraform.tfstate", region, use_lockfile = true, encrypt = true }` → `terraform init -migrate-state`.
4. **Move prod's state:** the same `backend "s3"` block in `infra/prod/versions.tf` with `key = "prod/terraform.tfstate"` → `terraform init -migrate-state` → `plan` says **No changes**. Then delete the local `terraform.tfstate*` files.
5. **Make prod runnable without the laptop's files.** `file(pathexpand("~/.ssh/fantasy-epl.pub"))` doesn't exist on a GitHub runner. Replace `ssh_public_key_path` with `ssh_public_key`, holding the public key text itself (it isn't secret, so it's fine as a default in `variables.tf`). Check `plan` shows **No changes**: the key text is the same, so nothing is replaced.
6. GitHub: add `AWS_ROLE_ARN` to the `production` environment, and `AWS_PLAN_ROLE_ARN` as a repository variable.

Done when both stacks keep their state in S3, the laptop has no state files, and `plan` is clean.

## Phase 8: Terraform in CI

1. **`ci.yml`:** a `plan` job on PRs that touch `infra/**`:
   - `permissions: id-token: write, pull-requests: write`
   - `aws-actions/configure-aws-credentials` with `AWS_PLAN_ROLE_ARN`
   - `terraform init` → `plan -no-color` → post the plan as a PR comment
2. **`deploy.yml`:** an `infra` job between `check` and `deploy`:
   - `environment: production`, `permissions: id-token: write`
   - log in with `AWS_ROLE_ARN` → `init` → `plan -out=tfplan` → `apply tfplan`. With no changes it does nothing.
   - Optional: read `terraform output -raw static_ip` and pass it to `deploy` instead of the hard-coded `DEPLOY_HOST`.
3. Test: a PR that changes something harmless (e.g. a tag) shows a plan comment; merging applies it; the next run says no changes.
4. **Rebuilds:** if a PR's plan shows the instance `must be replaced`, the server is rebuilt and the database is lost (unless restored from a snapshot or a Phase 9 data disk). The same PR must update `deploy/known_hosts`, `DEPLOY_HOST` and `DOMAIN` in `deploy.yml`, or the deploy refuses the new host key.

Done when changing `infra/` and merging updates AWS, with the plan reviewed on the PR first.

## Phase 9: Optional extras (any order)

- **Data disk:** an `aws_lightsail_disk` (8 GB) + attachment at `/var/lib/fantasy-epl`, with `prevent_destroy`. The database then survives an instance rebuild.
- **Off-server backups:** a nightly `sqlite3 .backup` to the S3 bucket (needs an IAM user or Lightsail bucket key on the server).
- **Close port 22:** deploy through Tailscale (a GitHub Action joins the tailnet), or open 22 to the runner's IP only during the job.
- **Separate deploy user:** a `deploy` user with sudo limited to `systemctl restart fantasy-epl`, `systemctl reload caddy` and installing the unit/Caddyfile/env file, instead of `ubuntu` with full sudo.
- **Uptime alert:** a Lightsail metric alarm, or an external pinger on `/api/health`.
- **Snapshots:** the `add_on` AutoSnapshot, if not already enabled.
- **A real domain:** change `var.domain` and the DNS record; Caddy fetches the new certificate itself.
