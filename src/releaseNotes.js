export const releaseNotes = [
  {
    version: '0.1.4',
    date: '13.11.2026',
    title: 'Server-Chat mit Karte und schnellere Updates',
    whatsNew: [
      'Im Server-Chat wählst du den Server per Dropdown und wechselst zwischen Chat und Karte (zum Beispiel BlueMap)',
      'Die Fabric-Version gilt nach der Auswahl im Server-Admin sofort für alle Spieler, ohne Changelog und ohne extra Schritt',
      'Der Server-Admin kann einen Karten-Link für den Server hinterlegen'
    ],
    bugFixes: [
      'Updates und der Java-Download laden deutlich schneller',
      'Der Spielen-Knopf bleibt nach dem Beenden oder Abbrechen nicht mehr hängen',
      'Die Server-Version im Server-Management ist jetzt korrekt, auch bei Servern mit SRV-Adresse',
      'Der Config-Editor im Server-Admin öffnet den richtigen Ordner',
      'Das Eintragen des Starbase-API-Keys setzt die App nicht mehr zurück'
    ],
    adjustments: []
  },
  {
    version: '0.1.3',
    date: '12.11.2026',
    title: 'Fabric-Version, Server-Adresse und ein Fix beim Spielstart',
    whatsNew: [
      'Minecraft- und Fabric-Version lassen sich im Server-Admin einstellen, auch vom BisectHosting-Server auslesen',
      'Eine geänderte Server-Adresse wird über GitHub synchronisiert und beim Spieler automatisch übernommen'
    ],
    bugFixes: [
      'Der Launcher startet mit der Fabric-Version aus dem Manifest statt immer mit der neuesten',
      'Der Spielen-Knopf bleibt nach einem reinen Mod-Abgleich nicht mehr auf „wird gestartet“ hängen'
    ],
    adjustments: [
      'Server-Adressen behalten die eingegebene Schreibweise',
      'Eine geänderte Minecraft- oder Fabric-Version lässt sich auch ohne Mod-Änderung veröffentlichen'
    ]
  },
  {
    version: '0.1.2',
    date: '12.11.2026',
    title: 'Übersichtlichere Update-Hinweise',
    whatsNew: [
      'Das Update-Fenster zeigt die Release Notes mit Überschriften und farbigen Abschnitten für Neuerungen, Fehlerbehebungen und Anpassungen'
    ],
    bugFixes: [
      'Die Release Notes im Update-Fenster erscheinen nicht mehr als roher Text mit Markdown-Zeichen'
    ],
    adjustments: [
      'Die Webseite nutzt das App-Icon als Tab-Symbol'
    ]
  },
  {
    version: '0.1.1',
    date: '12.11.2026',
    title: 'Server-Admin, Versionsauswahl und Darstellung für Server',
    whatsNew: [
      'Versionen von Mods, Resourcepacks und Shadern lassen sich beim Installieren und im Entwurf gezielt auswählen, falls die neueste nicht funktioniert',
      'Das Server-Admin hat einen eigenen Server mit Name, Adresse und Repository, unabhängig von der Spielliste',
      'BisectHosting-Zugangsdaten, GitHub-Repository, Darstellung und Server-Datei stehen an einem Ort im Server-Admin',
      'Name, Beschreibung und Banner (PNG im Verhältnis 30:10, bis Full HD) für Server, auf GitHub für alle Spieler und in der geteilten Serverdatei',
      'Der Server-Abgleich lädt Mods gebündelt hoch, mit Fortschrittsbalken und Rücksicht auf das Anfrage-Limit des Panels',
      'Die Startanzeige bleibt, bis Minecraft wirklich offen ist',
      'Beim Veröffentlichen des Modpacks lässt sich eine eigene Versionsnummer wählen',
      'Reine Client-Mods lassen sich nach einer Rückfrage direkt auf den Server laden'
    ],
    bugFixes: [
      'Der Ordner-Knopf der Testinstanz öffnet den richtigen Ordner',
      'Das Veröffentlichen in ein leeres GitHub-Repository funktioniert',
      'Der Server-Testmodus endet nach dem Veröffentlichen',
      'Abstürze durch fehlende Symbole in Changelog und Modpack-Ansicht behoben'
    ],
    adjustments: [
      'Mehrzeilige Eingabefelder im Stil der App',
      'Der Changelog des Servers lässt sich im Server-Admin bearbeiten'
    ]
  },
  {
    version: '0.1.0',
    date: '01.11.2026',
    title: 'Initiale Version des saisonalen Minecraft Launchers',
    whatsNew: [
      'Modernes saisonales Design mit dynamischer Farb- und Logoanpassung (Herbst, Winter, Frühling, Sommer)',
      '1-Klick Mod-Synchronisation über das Bisect Server-Manifest ohne eigenen Mod-Filehoster',
      'Direkte Modrinth-Integration zum Durchsuchen und Installieren von Mods, Resourcepacks und Shaderpacks',
      'Automatischer Abgleich und Download über Modrinths Highspeed-CDN mit SHA-1 Integritätsprüfung',
      'Auto-Update direkt im Launcher, als Installer oder portable'
    ],
    bugFixes: [
      'Initiale Erstellung des Projekts'
    ],
    adjustments: [
      'Unterstützung für Minecraft 1.21.1 und Fabric Modloader'
    ]
  }
];
