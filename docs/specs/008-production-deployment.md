# 008 — Production deployment (Lightsail, Terraform, GitHub Actions)

- **Status:** Draft
- **Started:** 2026-10-30
- **Scope:** Run the app in production on AWS Lightsail. Terraform describes all of the infrastructure, and GitHub Actions checks, provisions and deploys every push to `master`.
- **Builds on:** [007 — Structure cleanup](007-structure-cleanup.md) (`npm run check`). No API or UI changes.

## Goal

The dashboard only runs on a laptop today. This update makes it reachable over HTTPS from anywhere, with no manual steps after a one-time setup:

- **Push to `master`** → lint, typecheck and tests run → Terraform applies any infrastructure change → the new build goes live. Any failing step stops everything after it, so prod keeps running the last good version.
- **Infrastructure is code.** The instance, static IP, firewall, data disk, snapshots, DNS and CI access live in Terraform (`infra/`). Changing a file there and pushing changes AWS.
- **Secrets never live in git or in Terraform state.** They are stored as GitHub `production` environment secrets and written to the server at deploy time.

Why Lightsail: one Node process with SQLite on local disk and in-memory sessions has to run as exactly one instance, so a load balancer, auto-scaling or RDS adds cost and buys nothing. Lightsail costs $5–7/mo flat and includes the static IP, transfer and snapshots.

## How it works

```
 push to master
      │
      ▼
 ┌──────────┐   fail → stop, prod unchanged
 │ 1. check │   npm ci · npm run check · npm run build · terraform fmt -check + validate
 └────┬─────┘
      ▼
 ┌──────────┐   AWS access through GitHub OIDC (no stored AWS keys)
 │ 2. infra │   terraform apply (does nothing when infra/ didn't change)
 └────┬─────┘
      ▼
 ┌──────────┐   SSH to the instance with a deploy key
 │ 3. deploy│   upload the release tarball → write the env file from secrets
 └────┬─────┘   → switch the `current` symlink → restart → GET /api/health
      ▼            (health check fails → switch back to the previous release)
   live
```

Each layer has one job:

| Layer | Owns | Changes when |
| --- | --- | --- |
| **Terraform** (`infra/`) | Lightsail instance, static IP, firewall ports, data disk, automatic snapshots, DNS records, SSH key pair; the IAM role CI uses | `infra/` changes |
| **cloud-init** (instance `user_data`) | One-time machine setup: Node 22, Caddy, `fpl` system user, mounting the data disk, SSH hardening | Almost never (changing it rebuilds the instance, see R2) |
| **Deploy job** (`deploy/` + workflow) | App build, `.env`, systemd unit, Caddyfile | Every push |

The SQLite database lives on a **separate Lightsail disk** mounted at `/var/lib/fantasy-epl`, not on the instance's root disk. If Terraform ever rebuilds the instance, the data (draft plan included) survives and is reattached.

### On the server

```
/opt/fantasy-epl/
  releases/<git-sha>/        app/server/dist, app/client/dist, production node_modules, package.json files
  current -> releases/<sha>  the release systemd runs; the last 3 are kept for rollback
/etc/fantasy-epl/env         NODE_ENV=production, ADMIN_*, FPL_TEAM_ID, PORT, DATABASE_PATH (mode 600, owner root)
/var/lib/fantasy-epl/        data disk: fpl.sqlite
```

- **systemd** runs `node dist/server.js` as `fpl` with `EnvironmentFile=/etc/fantasy-epl/env` and restarts it on failure.
- **Caddy** listens on 80/443, fetches the Let's Encrypt certificate itself and proxies to `127.0.0.1:3001`. Port 3001 is never public.
- `NODE_ENV=production` makes [production.ts](../../app/server/src/config/production.ts) refuse to start when a secret is missing, so a bad deploy fails the health check instead of serving errors.

### Environment variables

| Variable | Stored in | Notes |
| --- | --- | --- |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `FPL_TEAM_ID` | GitHub environment **`production`** → *secrets* | Written to `/etc/fantasy-epl/env` on every deploy. To change one: edit the secret, then re-run the deploy. |
| `PORT`, `DATABASE_PATH` | Fixed in the workflow (`3001`, `/var/lib/fantasy-epl/fpl.sqlite`) | Not secret |
| `DEPLOY_SSH_KEY` | GitHub environment `production` → secret | Private half of the deploy key. Terraform only gets the public half. |
| `AWS_ROLE_ARN`, `DOMAIN` | GitHub environment `production` → *variables* | Not secret |

Secrets stay out of Terraform on purpose: anything passed to Terraform ends up in plain text in its state file.

## Requirements

### R1. Terraform bootstrap (applied once, by hand)
- `infra/bootstrap/`: S3 bucket for Terraform state (versioned, encrypted, public access blocked), the GitHub OIDC identity provider, and an IAM role that only this repo's `master` branch and `production` environment can assume.
- The role's permissions are limited to Lightsail, the DNS zone and the state bucket.
- Run once from a laptop with admin credentials; its own state stays local (or is migrated into the bucket afterwards).

### R2. Terraform production stack (`infra/prod/`)
- S3 backend with native lock file (`use_lockfile`, Terraform ≥ 1.10). No DynamoDB table needed.
- Lightsail instance: Ubuntu 24.04, `small_3_0` (2 GB) or `micro_3_0` (1 GB), with automatic daily snapshots via `add_on`.
- Static IP plus its attachment; Lightsail key pair built from the deploy public key.
- Public ports: 80 and 443 open to everyone; 22 open (key-only, see Known limitations).
- Data disk (8 GB, about $0.80/mo) attached at `/var/lib/fantasy-epl`, with `prevent_destroy`.
- DNS: an A record for the domain pointing at the static IP (Lightsail DNS zone or Route 53, see Open decisions).
- `user_data` (cloud-init) does the one-time setup from the table above. Changing it replaces the instance, which is safe because the data disk is separate.
- Outputs: static IP and domain, used by the deploy job.

### R3. App packaging (`deploy/`)
- `deploy/fantasy-epl.service` (systemd unit) and `deploy/Caddyfile` (domain taken from an environment variable).
- `deploy/release.sh`: runs on the server; unpacks a release, installs unit/Caddyfile if they changed, switches `current`, restarts, checks health and rolls back on failure, then removes old releases.
- The tarball is built on the runner with `npm ci --omit=dev`, so the server never compiles anything. Express is pure JS, so building on the x86_64 runner is fine.

### R4. CI on pull requests (`.github/workflows/ci.yml`)
- `npm ci`, `npm run check`, `npm run build` on Node from `.nvmrc`.
- `terraform fmt -check`, `terraform validate`, and `terraform plan` posted as a PR comment when `infra/` changed.
- Required status check on `master` (branch protection).

### R5. Deploy on push to `master` (`.github/workflows/deploy.yml`)
- Jobs `check` → `infra` → `deploy`, each needing the one before.
- `infra` and `deploy` run in the GitHub environment `production`, so they get its secrets.
- `concurrency: production` with `cancel-in-progress: false`, so two pushes never deploy at the same time.
- Manual `workflow_dispatch` to re-deploy (for example after changing a secret).
- Terraform's provider and version are pinned (`.terraform.lock.hcl` committed) so CI and laptop plans match.

### R6. Production readiness in the app
- No code changes are expected: `/api/health` exists, Express already serves `app/client/dist`, and `DATABASE_PATH`/`PORT` come from the environment.
- Docs: README "Deploying" section (one-time setup checklist below) and an `infra/CLAUDE.md` like the other folders.

## One-time setup (manual, about 30 minutes)

1. Decide the two open questions below.
2. AWS: create or choose the account, then `terraform apply` in `infra/bootstrap/` with admin credentials.
3. Generate a deploy key: `ssh-keygen -t ed25519 -f fantasy-epl-deploy`. The public key goes in `infra/prod/terraform.tfvars`, the private key in GitHub.
4. GitHub → Settings → Environments → `production`: add the secrets and variables from the table above. Optionally require yourself as reviewer, so every prod deploy waits for one click.
5. Domain: point the registrar's nameservers at the DNS zone (if the zone is AWS-managed).
6. Push. The first run creates the instance; cloud-init needs about 2 minutes, which the deploy job waits out by retrying SSH.

## Open decisions

- **Domain.** HTTPS through Let's Encrypt needs a domain name. Options: use one you already own (add an A record at your registrar or move the zone to Lightsail DNS, which is free), or buy one through Route 53 (~$14/yr for `.com`, zone $0.50/mo). *Recommended: Lightsail DNS zone, so the record is in Terraform at no extra cost.*
- **Approval gate.** Deploy fully automatically on every green push, or wait for a one-click approval on the `production` environment. *Recommended: automatic, since rollback on a failed health check covers bad builds.*

## Done

- [ ] **R1**: Terraform bootstrap (state bucket, OIDC, CI role)
- [ ] **R2**: Production stack (instance, IP, ports, data disk, snapshots, DNS, cloud-init)
- [ ] **R3**: systemd unit, Caddyfile, release script with rollback
- [ ] **R4**: PR workflow (checks + Terraform plan comment)
- [ ] **R5**: Deploy workflow (check → infra → deploy)
- [ ] **R6**: README deploy section, `infra/CLAUDE.md`

## Known limitations

- **SSH is open to the internet.** GitHub-hosted runners have no fixed IP, so port 22 can't be limited to them. Mitigations: key-only login, no root login, fail2ban from cloud-init. See next steps for closing it.
- **Short downtime on deploy** (about 1–2 s while the process restarts). Running one instance makes this unavoidable and fine for a personal tool.
- **Logins don't survive a deploy.** Sessions are in memory, so every deploy logs you out (existing behaviour).
- **Snapshots are daily.** A failure can lose up to a day of draft-plan edits.
- **The FPL API might block data-centre IPs.** Check with `curl` from the instance after the first deploy. The response cache keeps call volume low.
- **Destroying a Terraform resource** (as opposed to updating it) still goes through on push. `prevent_destroy` guards only the data disk; review plan comments on PRs.

## Possible next steps

- [ ] Close port 22: deploy through Tailscale (GitHub Action joins the tailnet), or open 22 only for the runner's IP during the job.
- [ ] Off-box backups: nightly `sqlite3 .backup` to S3, on top of Lightsail snapshots.
- [ ] Uptime alert: Lightsail metric alarm, or an external pinger on `/api/health`.
- [ ] A staging environment (second Terraform workspace) if changes get riskier.
