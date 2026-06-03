#!/usr/bin/env bash
# Startet die Biergarten-Simulation als Webserver im LAN.
# Aufruf:  ./serve.sh [PORT]   (Standard-Port: 8000)

set -e
PORT="${1:-8000}"
cd "$(dirname "$0")"

# TypeScript nach dist/ bauen, falls noch nicht geschehen (npm muss installiert sein)
if [ ! -f dist/main.js ]; then
  echo "ℹ️  dist/ fehlt – baue TypeScript (npm run build) ..."
  npm run build
fi

# Erste nicht-lokale IPv4-Adresse für die LAN-URL ermitteln
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -z "$LAN_IP" ] && LAN_IP="<deine-IP>"

echo "🍺  Biergarten läuft auf:"
echo "    lokal:   http://localhost:${PORT}/"
echo "    im LAN:  http://${LAN_IP}:${PORT}/"
echo
echo "Beenden mit Strg+C."
echo

# An 0.0.0.0 binden, damit andere Geräte im LAN zugreifen können
exec python3 -m http.server "$PORT" --bind 0.0.0.0
