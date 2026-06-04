# 🍺 Biergarten-Tycoon

**▶️ Jetzt im Browser spielen: <https://olivierberlinai.github.io/biergarten/>**
(automatisch via GitHub Pages bei jedem Push auf `main` veröffentlicht)

Ein kleines Management-Spiel in **TypeScript** (Paper.js). Gäste kommen rein,
holen sich Bier am Ausschank (und zahlen dafür), trinken am Biertisch, gehen bei
voller Blase aufs Klo und dann wieder nach Hause. Hunde laufen gemütlich herum.

Du betreibst den Garten:

- **Bierpreis-Regler** – höher = mehr Umsatz pro Bier, aber weniger zufriedene
  Gäste und weniger Nachkäufe.
- **Bier-Tank** leert sich pro Verkauf. **„Bier bestellen"** liefert nicht sofort:
  im Button läuft ein **Fortschrittsbalken** (10–45 s), kurz vor Ankunft **fährt
  ein Bierwagen ins Bild** zum Ausschank und der Tank füllt sich **graduell**.
  Über den **Mengen-Slider** wählst du, wie viel geliefert wird — **größere Mengen
  sind günstiger** (1 L ≈ 1 €, 10 L ≈ 0,80 €, 100 L ≈ 0,50 €). Du **startest ohne Bier**.
- **Klowagen** funktioniert genauso (Button-Balken + Wagen fährt zum Klo) und
  pumpt den Tank dann **graduell** leer.
- **Möbel auf dem Feld platzieren**: Button klicken → halbtransparente Vorschau
  folgt der Maus → aufs Feld klicken setzt es ab (Esc bricht ab). **Biertisch**
  (bis 2 Bänke à **3 Plätze** = 6), **Stehtisch** (4 Hocker), **Bierbank** (klick
  auf einen Biertisch mit freier Seite). **Keine Obergrenze** — du kannst das
  ganze Feld vollbauen (nur durch Platz begrenzt).
- **Uhr** unten links: 20 s = 1 Stunde, Betrieb **10:00–23:00**. Ab **22:00**
  (letzte Runde) kein Bier-Verkauf und keine neuen Gäste; um 23:00 beginnt der
  nächste Tag. **1 L Bier rein = 1 L in den Klo-Tank**. Einmal pro Stunde fliegt
  ein **−X €** (Stundenlohn) über die Uhr.
- **Ruf (Langzeit-Zufriedenheit)** ist der Mittelwert abreisender Gäste und
  steuert die Gäste-Zahl: **pro Stunde kommen ≈ Ruf/10 Gäste** (bei 50 % also 5),
  **±30 %** und zu **zufälligen Zeiten** innerhalb der Stunde.

- **Personal**: **Servicekräfte** sind die gelben Bedienungen — eine zusammen-
  gelegte Rolle, die **Bier zapft *und* Brezn verkauft** und sich automatisch
  dahin stellt, wo gerade am meisten los ist (Theke mit Schlange / Brezelstand
  mit hungrigen Gästen); zu wenige → Schlange & Frust. **Putzkräfte** sind kleine
  Arbeiter mit **roter Mütze**, die durch den Garten laufen, **Unrat** aufsammeln
  und das **Klo schrubben**. Beide kosten Einstellung + laufenden Lohn pro Schicht.
- **Klo**: Der **Klo-Tank** füllt sich 1:1 mit dem Bierverkauf und wird **nur vom
  Klowagen** geleert; mit **„Klo-Tank ausbauen"** verdoppelst du sein Volumen
  (200 €, dann 400 €). Die **Verschmutzung** steigt pro Nutzung und sinkt **nur
  durch Putzkräfte** und wirkt **linear**: bei X % Verschmutzung wollen X % der
  Gäste nicht mehr aufs Klo (0 % = alle zufrieden). Ist der Tank voll oder ein
  Gast findet es zu dreckig, **läuft er trotzdem hin**, merkt es **erst am Klo**,
  holt sein Handtuch und geht — mit **50 % Chance auf ein Malheur** auf dem Weg
  raus. Hunde und gelegentlich Gäste hinterlassen ebenfalls Unrat.
- **Hunde** laufen herum und hinterlassen ab und zu etwas; ab und zu kommt ein
  streunender Hund dazu. Mit **🐕 Hundefänger** (kostet Geld) fängst du alle
  Hunde fängt — er **läuft ihnen hinterher** (etwas schneller als sie) und fängt
  sie nacheinander ein. Das **mögen die Gäste nicht** (Zufriedenheit sinkt je
  gefangenem Hund).

Gäste kommen mit **wenig Durst** rein, gehen **zu einem freien Platz** und legen
dort ihr **Handtuch** ab (wer zuerst da ist, gewinnt) — erst danach geht's bei
Durst zum Ausschank. Der Durst steigt mit der Zeit. **Unrat in der Nähe** (sitzen,
stehen, vorbeilaufen) macht sie unzufrieden. Sie werden zufriedener beim **Trinken** und **Klo-Gang**,
unzufriedener beim **Warten** und **Bezahlen**. Durst sinkt nur im **Sitzen**.
Geld gibt es, sobald der Ausschank fertig gezapft hat.

Ist **kein Bier** da, warten sie nicht erst an — sie gehen **sofort frustriert**;
ebenso bei **maximalem Durst**. Wer **unzufrieden** geht, **schadet dem Ruf
stark** (und bei schlechtem Ruf kommen viel weniger Neue). Ist **kein Platz**
frei, laufen Gäste eine Weile herum und gehen dann wieder. Mit der **Nachkauf-
menge** (Slider) bestimmst du, wie viel Bier eine Bestellung liefert — und du
**startest ohne Bier**.

**Ziel:** **1.000.000 €** erwirtschaften (Sieg). Bei **−100 €** Schulden ist das
Spiel verloren.

Anzeigen für Zufriedenheit, Durst, Blase, Geld/Besucher und den Gesamt-Ruf
findest du oben links; auf dem Ausschank läuft ein Zapf-Balken, am Klohaus ein
Verschmutzungs-Balken. Die Wirtschaft tunst du in `src/config.ts`.

## Bauen

Der TypeScript-Quellcode in `src/` wird nach `dist/` kompiliert:

```bash
npm install        # einmalig: TypeScript + Paper.js-Typen
npm run build      # src/ -> dist/  (einmalig)
npm run watch      # baut bei jeder Änderung neu
```

## Starten (LAN)

```bash
./serve.sh          # Port 8000 (baut dist/ bei Bedarf automatisch)
./serve.sh 9000     # anderer Port
```

Das Skript bindet an `0.0.0.0`, ist also aus dem ganzen LAN erreichbar.
Es zeigt beim Start die passende URL an, z. B.:

- lokal:  <http://localhost:8000/>
- im LAN: `http://<deine-IP>:8000/`

Geräte im selben Netz öffnen einfach die LAN-URL im Browser.

> Falls andere Geräte nicht draufkommen: prüfe die Firewall (z. B.
> `sudo ufw allow 8000/tcp`).

## Headless / CLI

Das Backend ist komplett von der Darstellung getrennt und läuft **ohne Browser**.
Ein Auto-Player demonstriert einen Testlauf ganz ohne Spielereingaben:

```bash
npm run build
node dist/cli.js            # ~3 Spieltage
node dist/cli.js 16000      # eigene Tick-Zahl (60 Ticks = 1 Spielsekunde)
```

## Bedienung

Oben rechts (**Management**): Bierpreis-Regler, Bier bestellen, Klowagen,
Tisch/Stehtisch/Bierbank platzieren und Personal (`＋ Titel －`). Möbel setzt du,
indem du den Button klickst und dann **aufs Feld klickst** (Esc bricht ab).
Unten links die **Uhr** mit **Geschwindigkeit 1× / 2× / 4× / 8×**. Unten:

- **⏸ Pause** – hält das Spiel an / setzt es fort
- **🎵 Atmo** / **🔊 Ton** – Geräuschkulisse / stumm

## Architektur

Sauber getrennt in **Backend** (reine, Tick-basierte Simulation, kein Paper.js /
DOM — headless und CLI-spielbar) und **Frontend** (Paper.js-Renderer + DOM-UI,
liest nur den Backend-Zustand und sendet Kommandos). Pro Animationsframe rechnet
das Frontend `Geschwindigkeit` Ticks und zeichnet dann den Zustand.

| Datei / Ordner               | Inhalt                                              |
|------------------------------|-----------------------------------------------------|
| `src/config.ts`              | gemeinsame Konstanten + Wirtschafts-Balancing       |
| `src/cli.ts`                 | headless Auto-Player (Testläufe ohne Eingabe)       |
| `src/main.ts`                | Frontend-Einstieg: Render-Loop + Geschwindigkeit    |
| **Backend** `src/sim/`       | **reine Simulation (kein Paper.js)**                |
| `sim/game.ts`                | `Game`: Tick-Loop, Kommandos, Platzierung           |
| `sim/economy.ts`             | Geld, Tanks, Lieferung, Personal, Ruf, Sieg/Pleite  |
| `sim/clock.ts`               | Uhr (20 s = 1 Stunde, Sperrstunde, Tageswechsel)    |
| `sim/seating.ts`             | Biertische/Stehtische, Sitzplätze (reine Daten)     |
| `sim/litter.ts`              | Unrat                                               |
| `sim/vec.ts`                 | 2D-Vektor + RNG-Hilfen                               |
| `sim/entities/*.ts`          | Gast, Hund, Putzkraft, Hundefänger (reine Logik)    |
| **Frontend** `src/view/`     | **Paper.js + DOM**                                  |
| `view/renderer.ts`           | zeichnet Sprites aus dem Backend-Zustand            |
| `view/placement.ts`          | Möbel-Platzierung (Vorschau + Maus via Paper-Tool)  |
| `view/scenery.ts`            | statisches Bühnenbild                               |
| `view/gauges.ts`             | Balken auf Ausschank & Klohaus                      |
| `view/hud.ts` / `controls.ts`| Anzeigen / Buttons + Regler + Geschwindigkeit       |
| `view/sound.ts`              | prozedurale Sound-Engine (Web Audio)                |
| `serve.sh`                   | LAN-Webserver (Python)                              |

> Hinweis: Paper.js wird per CDN geladen (`window.paper`), beim ersten Laden ist
> also Internet nötig. Die TypeScript-Typen kommen aus dem npm-Paket `paper`.
