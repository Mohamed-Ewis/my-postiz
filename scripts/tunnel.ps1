# Starts a Cloudflare quick tunnel to the local app so Instagram can fetch media.
# 1) Install once:  winget install --id Cloudflare.cloudflared
# 2) Run:           powershell -ExecutionPolicy Bypass -File scripts\tunnel.ps1
# 3) Copy the https://xxxx.trycloudflare.com URL into .env as MEDIA_PUBLIC_BASE_URL, then restart the app + worker.
# Note: quick-tunnel URLs change on every run. For a fixed URL use a named tunnel (see README).
param([int]$Port = 3000)
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
  Write-Host "cloudflared not found. Install: winget install --id Cloudflare.cloudflared" -ForegroundColor Yellow
  exit 1
}
cloudflared tunnel --url "http://localhost:$Port"
