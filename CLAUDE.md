@AGENTS.md

## Never run these yourself: tell the user first

Changes to git history, AWS, the server or GitHub are made by the user. Stop before them and give the exact commands, in order, with one line each on what it does and what output to expect; then wait for the user to run them and report back.

- **Git:** anything that changes the repo or remote: `add`, `commit`, `push`, `pull`, `merge`, `rebase`, `reset`, `checkout`/`switch`, `branch`, `tag`, `stash`, `gh pr …`. Read-only is fine: `status`, `log`, `diff`, `show`.
- **Terraform:** `apply`, `destroy`, `import`, `state …`, `init -migrate-state`. Fine: `fmt`, `validate`, `plan`, `output`, `init` (without migrating state).
- **AWS CLI:** anything that creates, changes or deletes. Fine: `get-*`, `describe-*`, `list-*`.
- **Deploys and the server:** uploading or activating a release (`scp`, `release.sh`), writing files, `systemctl restart`/`reload`, `reboot`, installing packages. Fine: read-only checks over SSH (`systemctl status`, `journalctl`, `free`, `ls`, `curl` health checks).
- **External services:** DuckDNS, GitHub settings, secrets or environments, Let's Encrypt.

Editing files in the working tree is fine.
