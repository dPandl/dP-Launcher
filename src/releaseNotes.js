export const releaseNotes = [
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
