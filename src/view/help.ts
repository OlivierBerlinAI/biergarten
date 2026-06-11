// The in-game handbook: a full-screen overlay with a topic column (left) and a
// short description per topic (right). It opens automatically at game start —
// unless the player unticks "show at start", which is remembered in
// localStorage — and pauses the simulation for as long as it stays open
// (main.ts gates the tick loop on isOpen()).

/** localStorage key for the "show this handbook at game start" preference. */
const AUTO_OPEN_KEY = 'biergarten.help.autoopen';

interface Topic {
  title: string; // shown in the left column and as the content heading
  html: string;  // the short description (right column)
}

// Minimal manual: one entry per core game system. Kept short on purpose — it's
// a quick reference, not a full wiki.
const TOPICS: Topic[] = [
  {
    title: '🎯 Ziel',
    html:
      '<p>Führe deinen Biergarten zum Erfolg: Halte die Gäste zufrieden, mach Gewinn ' +
      'und baue den Garten Schritt für Schritt aus. Geht dir das <b>Geld</b> aus, ist die Runde vorbei.</p>',
  },
  {
    title: '🕹️ Steuerung',
    html:
      '<p><b>Mausrad</b> zoomt, <b>mittlere Maustaste</b> schiebt das Bild. Klick auf einen Gast ' +
      'folgt ihm und öffnet seine Infos. <b>Leertaste</b> pausiert; mit <b>1× – 8×</b> stellst du das Tempo ein. ' +
      '<b>Rechtsklick</b> beendet das Bauen oder Abreißen, <b>Esc</b> schließt offene Fenster.</p>',
  },
  {
    title: '🔨 Bauen',
    html:
      '<p>Über <b>🔨 Bauen</b> öffnest du das Baumenü mit den Kategorien Getränke, Essen, Sitzen, Klo, ' +
      'Deko und Generell. Wähle ein Objekt und platziere es per Klick. <b>🗑️ Abreißen</b> entfernt Gebautes. ' +
      'Tische, Bänke und Stehtische geben den Gästen Sitzplätze, Wege lenken ihre Laufrouten.</p>',
  },
  {
    title: '🍺 Bier',
    html:
      '<p>Das Herz des Biergartens. Stell den <b>Bierpreis</b> ein und halte den <b>Bier-Tank</b> gefüllt: ' +
      '„Bier bestellen" liefert die eingestellte Nachkaufmenge. Bau eine <b>Bar (Ausschank)</b>, damit ' +
      'Servicekräfte ausschenken können. Ohne Bier bleiben die Gäste durstig und unzufrieden.</p>',
  },
  {
    title: '🥨 Essen',
    html:
      '<p><b>Brezelstände</b> stillen den Hunger. Klick einen Stand an, um Preis, Bestellmenge und ' +
      '<b>Auto-Lieferung</b> einzustellen. Ein leerer Stand verkauft nichts – behalte den Vorrat im Auge. ' +
      'Aber Achtung: Niemand will eine Brezn von gestern – übrige Brezn werden bei Tagesbeginn ' +
      '<b>entsorgt</b>. Lager also nicht zu viele ein.</p>',
  },
  {
    title: '🚽 Toiletten',
    html:
      '<p>Wer trinkt, muss aufs Klo. Baue <b>WC-Häuser</b> und einen <b>Klo-Tank</b>; der <b>Klowagen</b> ' +
      'leert den Tank. Volle oder schmutzige Klos drücken die Stimmung. Eine <b>Nutzungsgebühr</b> bringt ' +
      'Geld, kostet aber Zufriedenheit.</p>',
  },
  {
    title: '🧹 Sauberkeit',
    html:
      '<p>Gäste hinterlassen <b>Unrat (💩)</b>. <b>Putzkräfte</b> halten den Garten sauber, <b>Gärtner</b> ' +
      'pflegen die Deko. Dreck senkt die Zufriedenheit und langfristig den Ruf.</p>',
  },
  {
    title: '👥 Personal',
    html:
      '<p>Stell <b>Servicekräfte</b> (schenken Bier aus), <b>Putzkräfte</b>, <b>Gärtner</b> und <b>DJs</b> ein. ' +
      'Jede Einstellung kostet einmalig plus täglichen Lohn. Zu wenig Personal bedeutet lange Wartezeiten ' +
      'und genervte Gäste.</p>',
  },
  {
    title: '😊 Gäste',
    html:
      '<p>Jeder Gast hat <b>Durst</b>, <b>Hunger</b>, <b>Blasendruck</b> und <b>Zufriedenheit</b>. ' +
      'Über <b>👥 Gäste</b> siehst du die Liste und den Verlauf jedes einzelnen Gasts. Zufriedene Gäste ' +
      'bleiben länger und geben mehr aus.</p>',
  },
  {
    title: '📣 Werbung & Ruf',
    html:
      '<p>Mit dem <b>Werbebudget</b> lockst du mehr Gäste an. Der <b>Ruf (Langzeit)</b> wächst durch ' +
      'zufriedene Gäste und sinkt durch schlechte Erlebnisse – er bestimmt, wie viele Gäste überhaupt kommen.</p>',
  },
  {
    title: '💰 Geld',
    html:
      '<p>Oben links siehst du <b>Geld</b>, verkauftes Bier und Kennzahlen. Einnahmen kommen aus Bier, ' +
      'Essen und Klogebühren; Ausgaben aus Einkauf, Löhnen, Bauten und Werbung. Bleib im <b>Plus</b>!</p>',
  },
  {
    title: '⏯️ Pause & Hilfe',
    html:
      '<p>Dieses Handbuch öffnest du jederzeit über <b>📖 Hilfe</b>. Solange es offen ist, <b>pausiert das ' +
      'Spiel</b>. Mit dem Häkchen unten kannst du das automatische Anzeigen beim Spielstart abschalten.</p>',
  },
];

export class Help {
  private readonly win = document.getElementById('helpwin');
  private readonly topicsEl = document.getElementById('help-topics');
  private readonly contentEl = document.getElementById('help-content');
  private opened = false;

  constructor() {
    this.buildTopics();

    document.getElementById('help-close')?.addEventListener('click', () => this.close());
    // Clicking the dimmed backdrop (outside the box) closes the handbook.
    this.win?.addEventListener('click', (e) => {
      if (e.target === this.win) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.opened) this.close();
    });

    const cb = document.getElementById('help-autoopen') as HTMLInputElement | null;
    if (cb) {
      cb.checked = Help.shouldAutoOpen();
      cb.addEventListener('change', () => {
        try {
          localStorage.setItem(AUTO_OPEN_KEY, cb.checked ? '1' : '0');
        } catch {
          /* localStorage may be unavailable (private mode); the toggle just won't persist. */
        }
      });
    }
  }

  /** Whether the handbook should pop up at game start (default: yes). */
  static shouldAutoOpen(): boolean {
    try {
      return localStorage.getItem(AUTO_OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  }

  isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.opened = true;
    this.win?.classList.remove('hidden');
  }

  close(): void {
    this.opened = false;
    this.win?.classList.add('hidden');
  }

  /** Build the left-column topic buttons and select the first one. */
  private buildTopics(): void {
    if (!this.topicsEl) return;
    const items: HTMLElement[] = [];
    for (const topic of TOPICS) {
      const btn = document.createElement('div');
      btn.className = 'help-topic';
      btn.textContent = topic.title;
      btn.addEventListener('click', () => {
        for (const it of items) it.classList.remove('sel');
        btn.classList.add('sel');
        this.showTopic(topic);
      });
      items.push(btn);
      this.topicsEl.appendChild(btn);
    }
    items[0]?.classList.add('sel');
    if (TOPICS[0]) this.showTopic(TOPICS[0]);
  }

  private showTopic(topic: Topic): void {
    if (this.contentEl) this.contentEl.innerHTML = `<h4>${topic.title}</h4>${topic.html}`;
  }
}
