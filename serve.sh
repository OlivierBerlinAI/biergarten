#!/usr/bin/env bash
# Startet die Biergarten-Simulation als Webserver im LAN.
# Aufruf:  ./serve.sh [PORT]   (Standard-Port: 8000)

set -e
PORT="${1:-8000}"
cd "$(dirname "$0")"

# TypeScript IMMER frisch nach dist/ bauen, damit der Server nie alten Stand
# ausliefert (sonst zeigt der Browser Quelländerungen nicht). npm muss da sein.
echo "ℹ️  Baue TypeScript (npm run build) ..."
npm run build

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
