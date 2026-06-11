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
      'und baue den Garten Schritt für Schritt aus. Mit zufriedenen Gästen steigt dein Ruf, ' +
      'der wiederum neue Gäste anlockt – ein guter Garten trägt sich also selbst. ' +
      'Achte aber stets auf deinen Kontostand: Geht dir das <b>Geld</b> aus, ist die Runde vorbei. ' +
      'Beginne klein, beobachte was die Gäste brauchen, und investiere die Gewinne gezielt weiter.</p>',
  },
  {
    title: '🕹️ Steuerung',
    html:
      '<p>Mit dem <b>Mausrad</b> zoomst du zum Mauszeiger hin oder weg, mit gedrückter ' +
      '<b>mittlerer Maustaste</b> schiebst du den Bildausschnitt. Ein <b>Klick auf einen Gast</b> ' +
      'lässt die Kamera ihm folgen und öffnet seine Infos – panst oder zoomst du weg, löst sich die Verfolgung wieder. ' +
      'Die <b>Leertaste</b> pausiert und startet das Spiel; mit den Knöpfen <b>1× – 8×</b> stellst du die ' +
      'Spielgeschwindigkeit ein. Ein <b>Rechtsklick</b> beendet den Bau- oder Abreißmodus, und <b>Esc</b> ' +
      'schließt offene Fenster und Menüs.</p>',
  },
  {
    title: '🔨 Bauen',
    html:
      '<p>Über <b>🔨 Bauen</b> öffnest du das Baumenü mit den Kategorien Getränke, Essen, Sitzen, Klo, ' +
      'Deko und Generell. Wähle ein Objekt aus, dann platzierst du es per Klick im Garten – Rechtsklick ' +
      'beendet das Platzieren. Jeder Bau kostet Geld, der aktuelle Preis steht direkt auf dem Knopf; ' +
      'ist er ausgegraut, kannst du ihn dir gerade nicht leisten. <b>🗑️ Abreißen</b> entfernt Gebautes wieder. ' +
      'Tische, Bänke und Stehtische geben den Gästen Sitzplätze, und mit <b>Wegen</b> lenkst du ihre Laufrouten ' +
      'gezielt zu Bar, Essen und Klo.</p>',
  },
  {
    title: '🍺 Bier',
    html:
      '<p>Das Bier ist das Herz des Biergartens und deine wichtigste Einnahmequelle. Stell mit dem Regler ' +
      'den <b>Bierpreis</b> ein: zu teuer schreckt ab, zu billig verschenkt Gewinn. Halte den <b>Bier-Tank</b> ' +
      'gefüllt – mit „Bier bestellen" liefert ein Wagen die eingestellte <b>Nachkaufmenge</b> nach kurzer ' +
      'Lieferzeit. Damit überhaupt ausgeschenkt werden kann, brauchst du eine <b>Bar (Ausschank)</b> und ' +
      '<b>Servicekräfte</b>, die das Bier an die Gäste bringen. Läuft der Tank leer, bleiben die Gäste ' +
      'durstig, unzufrieden und gehen früher – behalte die Tank-Anzeige oben links im Blick.</p>',
  },
  {
    title: '🥨 Essen',
    html:
      '<p><b>Brezelstände</b> stillen den Hunger der Gäste und bringen zusätzliches Geld. Klick einen Stand an, ' +
      'um seinen <b>Preis</b>, die <b>Bestellmenge</b> und die <b>Auto-Lieferung</b> einzustellen; im Fenster ' +
      'siehst du auch den aktuellen Vorrat dieses Stands. Ein leerer Stand verkauft nichts und lässt hungrige ' +
      'Gäste stehen – behalte den Vorrat also im Auge. Aber Achtung: Niemand will eine Brezn von gestern. ' +
      'Übrig gebliebene Brezn werden bei <b>Tagesbeginn entsorgt</b> (das kostet dich den Einkauf). ' +
      'Lager deshalb nicht zu viele ein, sondern eher passend zum erwarteten Andrang.</p>',
  },
  {
    title: '🚽 Toiletten',
    html:
      '<p>Wer viel trinkt, muss auch mal – ohne genug Klos staut sich der <b>Blasendruck</b> und die Laune kippt. ' +
      'Baue genügend <b>WC-Häuser</b> und einen <b>Klo-Tank</b>, in dem sich die Abwässer sammeln. Ist der Tank ' +
      'voll, schaffst du mit dem <b>Klowagen</b> Abhilfe, der ihn gegen Gebühr leert. Volle oder schmutzige Klos ' +
      'drücken spürbar die Stimmung, also halte sie sauber. Eine <b>Nutzungsgebühr</b> bringt dir Geld, kostet ' +
      'aber bei jedem Klogang etwas Zufriedenheit – ein kleiner Betrag ist meist verkraftbar, zu viel vergrault ' +
      'die Gäste.</p>',
  },
  {
    title: '🧹 Sauberkeit',
    html:
      '<p>Gäste hinterlassen mit der Zeit <b>Unrat (💩)</b> im Garten, der sich sichtbar ansammelt. ' +
      '<b>Putzkräfte</b> räumen ihn weg und halten die Anlage sauber, während <b>Gärtner</b> sich um die ' +
      'Deko (Büsche, Blumen, Bäume) kümmern und sie frisch halten. Ein dreckiger Garten senkt die ' +
      'Zufriedenheit der Anwesenden und beschädigt langfristig deinen <b>Ruf</b>, was wiederum weniger ' +
      'Gäste bedeutet. Wächst der Garten, brauchst du entsprechend mehr Putzpersonal – die Unrat-Anzeige ' +
      'oben links zeigt dir, ob du hinterherkommst.</p>',
  },
  {
    title: '👥 Personal',
    html:
      '<p>Dein Personal hält den Laden am Laufen: <b>Servicekräfte</b> schenken Bier aus, <b>Putzkräfte</b> ' +
      'beseitigen Unrat, <b>Gärtner</b> pflegen die Deko und <b>DJs</b> sorgen für Stimmung. Über die ＋/－ ' +
      'Knöpfe stellst du ein oder entlässt – jede Einstellung kostet einmalig eine Gebühr <b>plus täglichen ' +
      'Lohn</b>, der laufend von deinem Konto abgeht. Zu wenig Personal führt zu langen Wartezeiten und ' +
      'genervten Gästen, zu viel frisst unnötig Lohnkosten. Passe die Mannschaft also an die Größe deines ' +
      'Gartens und den aktuellen Andrang an.</p>',
  },
  {
    title: '😊 Gäste',
    html:
      '<p>Jeder Gast hat eigene Bedürfnisse: <b>Durst</b>, <b>Hunger</b>, <b>Blasendruck</b> und eine daraus ' +
      'resultierende <b>Zufriedenheit</b>. Werden die Bedürfnisse erfüllt, steigt die Laune; lange Wartezeiten, ' +
      'volle Klos oder Dreck drücken sie. Über <b>👥 Gäste</b> öffnest du eine Liste aller Gäste und kannst den ' +
      'gesamten <b>Verlauf</b> jedes Einzelnen nachverfolgen – praktisch, um zu sehen, woran es gerade hakt. ' +
      'Zufriedene Gäste bleiben länger, kaufen mehr und verbessern deinen Ruf, unzufriedene gehen früher.</p>',
  },
  {
    title: '📣 Werbung & Ruf',
    html:
      '<p>Mit dem <b>Werbebudget</b> pro Tag machst du deinen Biergarten bekannter und lockst zusätzliche ' +
      'Gäste an – der eingestellte Betrag wird täglich investiert. Der <b>Ruf (Langzeit)</b> ist dein ' +
      'wichtigster Wachstumshebel: Er steigt langsam durch viele zufriedene Gäste und sinkt durch schlechte ' +
      'Erlebnisse wie Dreck, volle Klos oder leere Bar. Ein hoher Ruf bringt von ganz allein mehr Besucher, ' +
      'ein schlechter lässt den Garten verwaisen. Werbung wirkt sofort, ein guter Ruf dafür dauerhaft.</p>',
  },
  {
    title: '💰 Geld',
    html:
      '<p>Oben links findest du dein <b>Geld</b>, das verkaufte Bier und weitere Kennzahlen wie den Umsatz ' +
      'pro Besucher. <b>Einnahmen</b> kommen aus dem Verkauf von Bier und Essen sowie aus Klogebühren; ' +
      '<b>Ausgaben</b> entstehen durch Einkauf (Bier, Brezn), Löhne, Bauten, den Klowagen und Werbung. ' +
      'Über der Uhr unten links zeigen dir grüne und rote Zahlen jede Einnahme und Ausgabe in Echtzeit an. ' +
      'Plane Investitionen so, dass dein Konto immer im <b>Plus</b> bleibt – bei null ist die Runde vorbei.</p>',
  },
  {
    title: '⏯️ Pause & Hilfe',
    html:
      '<p>Dieses Handbuch öffnest du jederzeit über den Knopf <b>📖 Hilfe</b> im unteren Menü. Solange es ' +
      'geöffnet ist, <b>pausiert das Spiel</b> automatisch und läuft beim Schließen mit der vorherigen ' +
      'Geschwindigkeit weiter. Du schließt es über das ✕, mit <b>Esc</b> oder per Klick auf den abgedunkelten ' +
      'Hintergrund. Mit dem <b>Häkchen unten</b> kannst du einstellen, dass das Handbuch nicht mehr ' +
      'automatisch beim Spielstart erscheint – diese Einstellung wird in deinem Browser gespeichert.</p>',
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
