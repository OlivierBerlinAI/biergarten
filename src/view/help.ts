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
      'und baue den Garten Schritt für Schritt aus. Im Kern dreht sich alles um <b>einen großen ' +
      'Kreislauf</b>: Zufriedene Gäste verlassen den Garten gut gelaunt und heben deinen <b>Ruf</b> – ' +
      'ein höherer Ruf lockt mehr neue Gäste an – mehr Gäste bringen mehr <b>Umsatz</b> – mit dem Geld ' +
      'baust du aus und stellst Personal ein – besserer Service macht die Gäste wieder zufriedener. ' +
      'Der Kreislauf dreht sich aber auch andersherum: Unzufriedene Gäste drücken den Ruf, dann kommen ' +
      'weniger, der Umsatz bricht weg. Achte deshalb stets auf den Kontostand – geht dir das <b>Geld</b> ' +
      'aus, ist die Runde vorbei. Beginne klein, beobachte, woran es den Gästen fehlt, und investiere ' +
      'die Gewinne gezielt in den Engpass.</p>',
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
      'den <b>Bierpreis</b> ein: Die Gäste erwarten etwa 8 €; jeder Euro <b>darunter hebt</b> ihre ' +
      'Zufriedenheit, jeder Euro <b>darüber senkt</b> sie. Ein Bier <b>löscht den Durst</b> sofort – macht ' +
      'aber zugleich etwas satt (Hunger steigt) und füllt die <b>Blase</b>, weshalb die Gäste danach früher ' +
      'aufs Klo müssen. Bier kommt nur über eine <b>Bar (Ausschank)</b> und <b>Servicekräfte</b> zum Gast; ' +
      'zu wenig Service bedeutet lange <b>Warteschlangen</b>, und Warten kostet laufend Zufriedenheit. ' +
      'Halte den <b>Bier-Tank</b> gefüllt – „Bier bestellen" liefert nach kurzer Lieferzeit die eingestellte ' +
      'Nachkaufmenge. Läuft der Tank leer, geht ein wartender Gast frustriert und sofort. Bier, Klo und ' +
      'Service hängen also direkt zusammen.</p>',
  },
  {
    title: '🥨 Essen',
    html:
      '<p><b>Brezelstände</b> stillen den Hunger – und Hunger entsteht vor allem durchs <b>Biertrinken</b>, ' +
      'die beiden Bedürfnisse gehören also zusammen. Klick einen Stand an, um <b>Preis</b>, <b>Bestellmenge</b> ' +
      'und <b>Auto-Lieferung</b> einzustellen; auch hier gilt: Über dem erwarteten Preis (~2,50 €) sinkt die ' +
      'Zufriedenheit, darunter steigt sie. Wie beim Bier brauchen auch die Stände <b>Servicekräfte</b> zum ' +
      'Verkaufen. Ein <b>leerer Stand</b> enttäuscht hungrige Gäste spürbar – behalte den Vorrat also im Auge. ' +
      'Aber Achtung: Niemand will eine Brezn von gestern. Übrige Brezn werden bei <b>Tagesbeginn entsorgt</b> ' +
      '(das kostet dich den Einkauf). Lager deshalb nicht zu viele ein, sondern passend zum erwarteten Andrang.</p>',
  },
  {
    title: '🚽 Toiletten',
    html:
      '<p>Die Toiletten sind die <b>direkte Folge des Bierausschanks</b>: Jedes Bier füllt die Blase, und ' +
      'ab einem gewissen Druck sucht der Gast ein Klo. Baue genügend <b>WC-Häuser</b> und einen <b>Klo-Tank</b>, ' +
      'in dem sich die Abwässer sammeln. Findet ein Gast <b>kein freies, sauberes Klo</b> – oder ist der ' +
      '<b>Klo-Tank voll</b> –, kommt es im schlimmsten Fall zum „Malheur": eine Pfütze als <b>Unrat</b> plus ' +
      'ein heftiger Zufriedenheitseinbruch. Ein gelungener Klogang dagegen <b>hebt</b> die Laune. Ist der Tank ' +
      'voll, leert ihn der <b>Klowagen</b> gegen Gebühr; ohne das blockieren die Klos komplett. Eine ' +
      '<b>Nutzungsgebühr</b> bringt Geld, kostet aber bei jedem Besuch Zufriedenheit – ein kleiner Betrag ist ' +
      'meist verkraftbar, zu viel vergrault die Gäste. So koppeln Bier → Blase → Klo → Sauberkeit ineinander.</p>',
  },
  {
    title: '🧹 Sauberkeit',
    html:
      '<p>Gäste (und Hunde) hinterlassen mit der Zeit <b>Unrat (💩)</b>, dazu kommen die Pfützen aus ' +
      'Klo-Malheurs. Jeder Haufen in der Nähe zieht die Zufriedenheit der umstehenden Gäste <b>laufend</b> ' +
      'nach unten – viel Dreck wirkt also stärker als wenig. <b>Putzkräfte</b> räumen den Unrat weg und ' +
      'schrubben zugleich verschmutzte Klos, während <b>Gärtner</b> die Deko pflegen. Hier schließt sich der ' +
      'Bogen zur Sauberkeit der Toiletten: Zu wenige Putzkräfte → schmutzige Klos und liegender Unrat → ' +
      'sinkende Zufriedenheit → unzufriedene Abgänge → schlechterer <b>Ruf</b> → weniger Gäste. Wächst der ' +
      'Garten, brauchst du mehr Putzpersonal – die Unrat- und Verschmutzungs-Anzeigen oben links zeigen, ' +
      'ob du hinterherkommst.</p>',
  },
  {
    title: '🎵 Deko & DJ',
    html:
      '<p><b>Deko</b> (Büsche, Blumen, Bäume) und <b>DJs</b> wirken nicht aufs Geld, sondern direkt auf die ' +
      '<b>Zufriedenheit</b> der Gäste in der Umgebung – sie sind dein Hebel, um die Stimmung über das ' +
      'Nötigste hinaus zu heben. Gepflegte Pflanzen geben einen <b>Bonus</b>, vertrocknete dagegen einen ' +
      '<b>Malus</b>; deshalb braucht Deko <b>Gärtner</b>, die sie frisch halten (oder den Auto-Austausch, ' +
      'der tote Pflanzen gegen Geld ersetzt). Ein <b>DJ</b> hebt die Laune im mittleren Umkreis – steht man ' +
      'aber zu nah dran oder überlappen sich mehrere DJs, kippt der Effekt ins Negative. Setz DJs also ' +
      'verteilt und mit Abstand zu den Sitzplätzen.</p>',
  },
  {
    title: '👥 Personal',
    html:
      '<p>Personal ist das <b>Bindeglied</b> zwischen Ausstattung und zufriedenen Gästen: <b>Servicekräfte</b> ' +
      'schenken Bier aus und verkaufen Brezn (sie werden automatisch dorthin geschickt, wo gerade der größte ' +
      'Andrang ist), <b>Putzkräfte</b> beseitigen Unrat und Klo-Schmutz, <b>Gärtner</b> pflegen die Deko und ' +
      '<b>DJs</b> betreiben die DJ-Pulte. Über die ＋/－ Knöpfe stellst du ein oder entlässt – jede Einstellung ' +
      'kostet einmalig plus <b>täglichen Lohn</b>, der laufend abgeht. Hier liegt die Gratwanderung: <b>Zu ' +
      'wenig</b> Personal → lange Schlangen, liegender Dreck, tote Deko → unzufriedene Gäste; <b>zu viel</b> ' +
      'Personal → die Löhne fressen den Gewinn, du kannst dir Bier, Brezn oder Ausbau nicht mehr leisten. ' +
      'Stell also genau so viel ein, wie der aktuelle Andrang rechtfertigt.</p>',
  },
  {
    title: '😊 Gäste',
    html:
      '<p>Jeder Gast hat eigene Bedürfnisse – <b>Durst</b>, <b>Hunger</b>, <b>Blasendruck</b> – und eine ' +
      'daraus resultierende <b>Zufriedenheit</b>. Diese Zufriedenheit ist die <b>zentrale Stellgröße</b> des ' +
      'Spiels: Sie steigt durch erfüllte Bedürfnisse, faire Preise, Deko und Musik, und sie sinkt durch ' +
      'Warten, Dreck, volle Klos, überteuerte Preise oder fehlende Plätze. Sie entscheidet, <b>wie lange ' +
      'ein Gast bleibt und wie viel er ausgibt</b> – und beim Gehen prägt sie deinen Ruf: unzufriedene ' +
      'Abgänge zählen dabei <b>schwerer</b> als zufriedene. Über <b>👥 Gäste</b> öffnest du die Liste und den ' +
      'vollständigen <b>Verlauf</b> jedes Einzelnen – ideal, um zu sehen, woran es gerade hakt (Schlange? ' +
      'Klo? Preis?), und genau dort nachzubessern.</p>',
  },
  {
    title: '📣 Werbung & Ruf',
    html:
      '<p>Der <b>Ruf (Langzeit)</b> ist die <b>Brücke</b> zwischen der Zufriedenheit von heute und den Gästen ' +
      'von morgen: Er ist ein gleitender Durchschnitt über viele Abgänge und bestimmt, <b>wie viele neue ' +
      'Gäste pro Stunde</b> überhaupt erscheinen – grob etwa „Ruf geteilt durch 10". Zufriedene Abgänge heben ' +
      'ihn langsam, unzufriedene drücken ihn (und das stärker). Weil er so träge ist, wirken frühe Fehler ' +
      'lange nach. Das <b>Werbebudget</b> pro Tag ist die schnelle Alternative: Es gibt einen sofortigen ' +
      'Ruf-Schub, der aber täglich abklingt – Werbung musst du also laufend zahlen, um sie zu halten. ' +
      'Faustregel: Werbung füllt kurzfristig den Garten, ein guter Ruf trägt ihn dauerhaft.</p>',
  },
  {
    title: '💰 Geld',
    html:
      '<p>Geld ist das Ergebnis aller anderen Mechaniken und zugleich dein Treibstoff: <b>Einnahmen</b> kommen ' +
      'aus dem Verkauf von Bier und Brezn sowie aus Klogebühren, <b>Ausgaben</b> aus Einkauf (Bier, Brezn), ' +
      'Löhnen, Bauten, Klowagen und Werbung. Entscheidend ist: Mehr Umsatz entsteht nicht durch höhere Preise, ' +
      'sondern über den <b>Kreislauf</b> – zufriedene Gäste, guter Ruf, mehr Besucher, die länger bleiben und ' +
      'mehr kaufen. Höhere Preise bringen kurz mehr pro Verkauf, senken aber die Zufriedenheit und damit ' +
      'mittelfristig die Gästezahl. Oben links siehst du Geld und Kennzahlen wie den Umsatz pro Besucher, ' +
      'über der Uhr poppen Ein- und Ausgaben in Echtzeit auf. Halte das Konto im <b>Plus</b> – bei null ist ' +
      'die Runde vorbei.</p>',
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
