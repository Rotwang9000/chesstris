# Tetches.com cutover runbook

A focused, one-pass runbook for taking the rebranded code from "dev
machine" to "live at tetches.com on 95.216.77.237". Assumes the
server is the same Ubuntu host as before — adapt paths if not.

Each step says **what to do** and **how to verify**. Everything you
need to `sudo` lives in clearly-marked code blocks; everything else
is non-root.

---

## 0. Prerequisites

- DNS `A` records for `tetches.com` and `www.tetches.com` (and
  `staging.tetches.com` if you want a staging copy) → `95.216.77.237`.
- The repo has been pushed to `main` (and `develop` if you keep a
  staging branch). The rebrand commit is in `main`.
- You have root SSH access to the host.

Verify DNS before doing anything else:

```bash
dig +short tetches.com           # should print 95.216.77.237
dig +short www.tetches.com       # should print 95.216.77.237
dig +short staging.tetches.com   # optional, only if you want staging
```

If a lookup is empty, fix the DNS at your registrar first. Certbot
will refuse to issue a cert for a domain that doesn't resolve to the
server.

---

## 1. SSH to the server and pull the rebranded code

```bash
ssh root@95.216.77.237
```

Whether you keep the old `tetches.live` directories around for
rollback or wipe them is your call. The safest is to leave them in
place until tetches.com is verified live, then delete.

Create the new deploy targets:

```bash
mkdir -p /var/www/tetches.live /var/www/tetches.staging /var/www/.deploy-triggers
chown -R rotwang:rotwang /var/www/tetches.live /var/www/tetches.staging
```

Pull the code into the live tree (replace `<repo-url>` with whatever
git remote you use — could be GitHub HTTPS, or a Jenkins-driven
deploy if you have that already):

```bash
sudo -u rotwang bash -c '
  cd /var/www/tetches.live &&
  git clone --depth 50 <repo-url> . &&
  git checkout main &&
  npm ci --omit=dev
'
```

(For staging do the same with `--branch develop` and the
`tetches.staging` dir. You can skip staging on first cutover.)

---

## 2. Move the persisted world (if you want to keep state)

The old server stored its world snapshot under
`/var/www/tetches.live` (or wherever `WORLD_SNAPSHOT_PATH` pointed).
If you want to retain players' captured pieces, promotion credits,
and AI roster:

```bash
# Adjust filenames to whatever your persistence layer wrote — check
# the WORLD_SNAPSHOT_PATH in the OLD process's env.
cp /var/www/tetches.live/data/world.json /var/www/tetches.live/data/world.json 2>/dev/null || true
chown -R rotwang:rotwang /var/www/tetches.live/data
```

Otherwise just skip this step — the new server starts with a fresh
world.

---

## 3. Provision a TLS-less nginx config for the certbot handshake

Certbot needs to serve an ACME challenge over plain HTTP first.
Create a *minimal* nginx site that lets it through:

```bash
sudo tee /etc/nginx/sites-available/tetches.com > /dev/null <<'NGINX'
server {
    listen 80;
    server_name tetches.com www.tetches.com;

    # Let's Encrypt webroot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Everything else: proxy to Node so people can still play
    # while the cert is being issued. Certbot will replace this
    # with an HTTPS redirect once it succeeds.
    location / {
        proxy_pass http://127.0.0.1:3666;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
NGINX

sudo mkdir -p /var/www/certbot
sudo ln -sf /etc/nginx/sites-available/tetches.com /etc/nginx/sites-enabled/tetches.com
sudo nginx -t && sudo systemctl reload nginx
```

Quick check that nginx is serving HTTP for the new host:

```bash
curl -I http://tetches.com    # should be 200 (or a 502 if Node isn't up yet)
```

---

## 4. Start the Node process under PM2 (port 3666)

```bash
sudo -u rotwang bash -c '
  cd /var/www/tetches.live &&
  pm2 start ecosystem.config.cjs --only tetches-production &&
  pm2 save
'
```

Confirm it's listening:

```bash
ss -ltnp | grep :3666
curl -s http://127.0.0.1:3666/ | head -n 20
```

You should see the new `<title>Tetches</title>` and the green-loading
HTML.

If the process refuses to start, check
`/var/www/tetches.live/logs/err.log` — the most common gotcha is a
stale `.env` from the old domain. Copy the relevant secrets across:

```bash
sudo -u rotwang cp /var/www/tetches.live/.env /var/www/tetches.live/.env  # if you kept it
# then edit and replace any *.tetches.com URLs with *.tetches.com
```

---

## 5. Issue the certificate

Now that nginx is happily proxying HTTP, run certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx \
    -d tetches.com \
    -d www.tetches.com \
    --redirect \
    --agree-tos \
    -m you@example.com   # use your real email — Let's Encrypt sends renewal warnings
```

Certbot rewrites
`/etc/nginx/sites-available/tetches.com` with the SSL bits + a
redirect from `:80` to `:443`. Reload happens automatically.

Verify:

```bash
curl -I https://tetches.com
curl -I https://www.tetches.com
```

Both should be `200`, and `:80` should now be `301 → https://`.

---

## 6. Replace the bootstrap config with our hardened one

The bootstrap config in step 3 is intentionally minimal — once
certbot has wired in the SSL bits, swap to the
production-tuned nginx config from the repo (it adds security
headers, splits Socket.IO / API / static-asset routes, and sets
cache TTLs):

```bash
sudo cp /var/www/tetches.live/ci/nginx-production.conf \
    /etc/nginx/sites-available/tetches.com

# Certbot wrote the ssl_certificate lines into a different file
# layout, so re-apply them. The repo's nginx-production.conf
# already references /etc/letsencrypt/live/tetches.com/{fullchain,privkey}.pem
# — verify those files exist:
sudo ls -la /etc/letsencrypt/live/tetches.com/

sudo nginx -t && sudo systemctl reload nginx
```

If `nginx -t` complains about `ssl_dhparam`, generate one (it's a
one-off, ~2 min):

```bash
sudo openssl dhparam -out /etc/letsencrypt/ssl-dhparams.pem 2048
```

---

## 7. Smoke test

From your local machine, not the server:

```bash
curl -sI https://tetches.com | head -n 5
curl -sI https://www.tetches.com | head -n 5
# (Both should be 200 OK)

# Socket.IO probe
curl -sI 'https://tetches.com/socket.io/?EIO=4&transport=polling' | head -n 5
```

Then open `https://tetches.com` in a browser. The loading screen
should say "Loading Tetches..." and the title bar should be
`Tetches`. The game should load, you should be able to join, place
tetrominoes, and watch orbs / power-ups appear correctly placed on
their host cells.

---

## 8. Repeat for staging (optional)

If you want a staging copy at `staging.tetches.com`:

```bash
# DNS A record: staging.tetches.com -> 95.216.77.237
# Then:
sudo cp /var/www/tetches.live/ci/nginx-staging.conf \
    /etc/nginx/sites-available/staging.tetches.com
sudo ln -sf /etc/nginx/sites-available/staging.tetches.com \
    /etc/nginx/sites-enabled/staging.tetches.com

sudo certbot --nginx -d staging.tetches.com --redirect --agree-tos -m you@example.com

# PM2 staging process
sudo -u rotwang bash -c '
  cd /var/www/tetches.staging &&
  git clone --branch develop --depth 50 <repo-url> . &&
  npm ci --omit=dev &&
  pm2 start ecosystem.config.cjs --only tetches-staging &&
  pm2 save
'
```

---

## 9. Wire Jenkins for ongoing deploys

If Jenkins is already running on the host (per `ci/README.md`),
trigger a build of the `main` branch — the `Deploy to Production`
stage will rsync the new code into `/var/www/tetches.live`, write a
trigger to `/var/www/.deploy-triggers/`, and the host's
`ci/deploy-watcher.sh` cron picks it up and `pm2 restart`s.

If Jenkins isn't set up yet:

```bash
# As root on the host, from the cloned repo:
sudo bash /var/www/tetches.live/ci/jenkins-setup.sh
```

That builds the Jenkins-in-Docker container on port 8090 and prints
the initial admin password. Configure a pipeline job pointing at the
repo (the included `Jenkinsfile` is the entire definition).

---

## 10. Decommission the old name (cleanup)

Once you've confirmed tetches.com is happy for a few days:

```bash
# Remove old nginx config + symlink
sudo rm -f /etc/nginx/sites-{available,enabled}/tetches.com
sudo rm -f /etc/nginx/sites-{available,enabled}/staging.tetches.com
sudo nginx -t && sudo systemctl reload nginx

# Stop and delete old PM2 processes
pm2 delete tetches-staging tetches-production 2>/dev/null
pm2 save

# Archive (don't delete) the old code/world for two weeks just in case:
sudo mv /var/www/tetches.live /var/www/_archive_tetches.live.$(date +%Y%m%d)
sudo mv /var/www/tetches.staging /var/www/_archive_tetches.staging.$(date +%Y%m%d)
```

The Let's Encrypt cert for the old domain will silently expire on
its next renewal cycle — no action needed.

---

## Rollback plan

If something goes wrong and tetches.com is broken, you can serve the
old site temporarily by re-pointing the symlinks:

```bash
sudo rm -f /etc/nginx/sites-enabled/tetches.com
sudo ln -s /etc/nginx/sites-available/tetches.com /etc/nginx/sites-enabled/tetches.com
sudo nginx -t && sudo systemctl reload nginx
pm2 restart tetches-production
```

Then point a DNS CNAME from `tetches.com` to `tetches.com`. Players
get redirected, you get to investigate.
