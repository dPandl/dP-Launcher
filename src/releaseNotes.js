export const releaseNotes = [
  {
    version: '0.1.14',
    date: '15.11.2026',
    title: 'TV-Modus: Zeiger und Tastatur über den Dialogen, keine doppelte Tastatur',
    whatsNew: [],
    bugFixes: [
      'Im TV-Modus liegen der virtuelle Mauszeiger und die Bildschirmtastatur jetzt über allen Dialogen und nicht mehr darunter',
      'Ist die Bildschirmtastatur des Launchers an, öffnet sich die Tastatur des Systems (zum Beispiel am Steam Deck) nicht mehr zusätzlich'
    ],
    adjustments: []
  },
  {
    version: '0.1.13',
    date: '15.11.2026',
    title: 'Zu Steam hinzufügen: Launcher als Nicht-Steam-Spiel mit Bildern',
    whatsNew: [
      'Auf dem Steam Deck fragt der Launcher beim ersten Start, ob er zu Steam hinzugefügt werden soll, mit Poster, Grid, Banner, Icon und Logo',
      'In den Einstellungen gibt es dafür den neuen Abschnitt „Steam“, unter Windows und Linux. Danach Steam einmal neu starten'
    ],
    bugFixes: [],
    adjustments: []
  },
  {
    version: '0.1.12',
    date: '15.11.2026',
    title: 'TV-Modus: der ganze Launcher mit Controller und Steam Deck bedienbar',
    whatsNew: [
      'Neuer TV-Modus (Knopf oben in der Titelleiste, Start oder Select am Controller): Vollbild, größere Oberfläche, ohne Titelleiste. Beenden mit Esc oder Start',
      'Der ganze Launcher lässt sich mit Steuerkreuz, Stick, Tastatur und Controller bedienen: A wählt, B geht zurück, LB und RB wechseln den Reiter',
      'Virtuelle Maus: Der rechte Stick bewegt den Zeiger, der rechte Trigger klickt, mit dem linken Trigger und dem rechten Stick wird gescrollt. Unter Windows folgt der Mauszeiger dem Controller',
      'Die Server-Karte (BlueMap) wird nach einem Klick mit dem Controller gesteuert: linker Stick WASD, RT Linksklick, LT Rechtsklick, A Leertaste, B Shift, LB und RB scrollen, im Vollbild dreht der rechte Stick die Kamera. Start, Select oder Esc führen zurück',
      'Bildschirmtastatur für Eingabefelder, mit dem Controller bedienbar und in den Einstellungen abschaltbar. Sie öffnet sich nur beim Anklicken oder mit A',
      'Tastenhinweise mit den Symbolen deines Controllers (Xbox, PlayStation, Switch, Steam Deck oder Tastatur): Select halten blendet sie ein',
      'Dialoge, Auswahlfelder und Schieberegler lassen sich mit dem Controller bedienen'
    ],
    bugFixes: [],
    adjustments: [
      'Im TV-Modus ist der Speichern-Knopf der Einstellungen ausgeblendet, gespeichert wird beim Verlassen des Reiters',
      'Der Auswahl-Rahmen im TV-Modus hat die Themefarbe und ist auch auf bunten Knöpfen gut zu sehen'
    ]
  },
  {
    version: '0.1.11',
    date: '14.11.2026',
    title: 'Steam Deck: Absturz im Desktop-Modus behoben',
    whatsNew: [],
    bugFixes: [
      'Auf dem Steam Deck startet der Launcher im Desktop-Modus wieder (Version 0.1.10 stürzte dort beim Start ab)',
      'Doppelte Zeichen bei der Steam-Tastatur werden jetzt direkt in den Eingabefeldern herausgefiltert',
      'Nach einem Update unter Linux bleibt die Startdatei garantiert ausführbar'
    ],
    adjustments: []
  },
  {
    version: '0.1.10',
    date: '14.11.2026',
    title: 'Updates automatisch finden, Skin-Anzeige und Steam Deck',
    whatsNew: [
      'Der Launcher sucht alle paar Minuten nach Updates, nicht nur beim Start',
      'Im Changelog gibt es den Knopf „Nach Updates suchen“ mit Statusanzeige'
    ],
    bugFixes: [
      'Nach einem Skin-Wechsel zeigen die Seitenleiste und das Profil sofort den neuen Skin und holen ihn direkt von Mojang',
      'Auf dem Steam Deck werden Eingaben über die Steam-Tastatur nicht mehr doppelt geschrieben',
      'Die Erfolgs- und Fehlermeldungen im Mod-Store sind im Dark Mode wieder lesbar und nicht mehr zu hell'
    ],
    adjustments: []
  },
  {
    version: '0.1.9',
    date: '14.11.2026',
    title: 'Starteinstellungen für RAM und Fenster, bessere Anleitungen',
    whatsNew: [
      'Neben „Spielen“ öffnet ein Knopf die Starteinstellungen des Servers: Arbeitsspeicher per Slider und Fenster (Standard, eigene Größe, Vollbild)',
      'RAM und Fenster lassen sich auch global in den Einstellungen und pro Instanz festlegen, eigene Werte gehen vor den globalen',
      'Der RAM-Slider richtet sich nach dem Arbeitsspeicher des PCs, das letzte Drittel ist rot und warnt',
      'Anleitungen gehören zum gewählten Server, mit Server-Auswahl auf der Seite',
      'Admins können Anleitungen als JSON exportieren und importieren, auch einzelne',
      'Mod-Auswahl für Anleitungen und Kapitel mit Mehrfachauswahl, Anzahl der Anleitungen pro Mod, Filter „Ohne Anleitung“ und Sortierung',
      'Allgemeine Anleitungen, deren Kapitel mit Mods verknüpft sind, und Kapitel lassen sich per Pfeile umsortieren',
      'Neue und aktualisierte Anleitungen sind hervorgehoben, bis du sie gesehen hast, und lassen sich nach „zuletzt aktualisiert“ sortieren',
      'Nach „Backup erstellen & Testen“ fragt der Launcher, ob der Server neu gestartet werden soll'
    ],
    bugFixes: [
      'Die Beispiel-Anleitungen erscheinen nicht mehr im Launcher',
      'Beim Zurückgehen in der Anleitungs-Bearbeitung kommt die Verwerfen-Frage sofort und „Bearbeiten“ öffnet nicht mehr die erste Anleitung'
    ],
    adjustments: [
      'Der Theme-Verlauf färbt jetzt das aktive Menü-Icon und die Fortschrittsbalken'
    ]
  },
  {
    version: '0.1.8',
    date: '13.11.2026',
    title: 'Genauere Config-Anzeige beim Veröffentlichen',
    whatsNew: [],
    bugFixes: [
      'Beim Veröffentlichen gelten Configs nicht mehr als geändert, wenn sich nur Zeitstempel-Kommentare oder Zeilenenden unterscheiden (zum Beispiel iris.properties)'
    ],
    adjustments: []
  },
  {
    version: '0.1.7',
    date: '13.11.2026',
    title: 'Configs, Shader und Ressourcenpakete kommen bei Spielern an',
    whatsNew: [
      'Configs gelten bei den Spielern nur beim ersten Start, einzelne Dateien lassen sich mit „Immer überschreiben“ bei jedem Start erzwingen',
      'Im Server-Admin lassen sich Configs mit „Jetzt hochladen“ ohne neue Modpack-Version und ohne Changelog aktualisieren',
      'Die Veröffentlichen-Karte zeigt geänderte Configs an, und der Knopf ist auch bei reinen Config-Änderungen frei',
      'Alle, Keine und Empfohlene in der Config-Auswahl, dazu ein Umschalter für „Immer überschreiben“',
      'Neuer Knopf „Configs zurücksetzen“ in der Testinstanz'
    ],
    bugFixes: [
      'Ressourcenpakete, Shader, Standard-Shader und Configs des Modpacks kommen jetzt tatsächlich bei den Spielern an',
      'Die Testinstanz überschreibt deine Config-Änderungen nicht mehr bei jedem Start',
      'Auf Linux heißt die Startdatei dP-Launcher'
    ],
    adjustments: []
  },
  {
    version: '0.1.6',
    date: '13.11.2026',
    title: 'Eigene Mods im Modpack',
    whatsNew: [
      'Im Server-Admin-Entwurf lassen sich eigene Mods (.jar) hinzufügen, die nicht von Modrinth kommen',
      'Für eigene Mods stellst du ein, ob sie für Client, Server oder beide gelten',
      'Eigene Mods für den Client werden beim Veröffentlichen automatisch an alle Spieler verteilt, Mods für den Server gehen aufs Panel'
    ],
    bugFixes: [],
    adjustments: [
      'Die Update-Prüfung überspringt eigene Mods, sie sind im Entwurf mit „Eigene Mod“ gekennzeichnet'
    ]
  },
  {
    version: '0.1.5',
    date: '13.11.2026',
    title: 'Updates auf einen Blick, Skin-Bibliothek und Server neu starten',
    whatsNew: [
      'Bei Mods, Ressourcenpaketen und Shadern siehst du jetzt, ob ein Update verfügbar ist, und kannst es direkt installieren, auch im Server-Admin-Entwurf',
      'Ein Filter zeigt nur die Einträge mit verfügbarem Update',
      'Eigene Skins: hochladen, benennen, in 3D ansehen und direkt wechseln',
      'Saisonale Skins pro Jahreszeit und eine neue Kategorie Gaming',
      'Im Server-Admin gibt es unter „Auf Server anwenden“ die Knöpfe „Server neu starten“ und „Server-Konsole öffnen“',
      'Der Reiter „Server-Chat“ heißt jetzt „Chat & Karte“'
    ],
    bugFixes: [
      'Slim- und Classic-Skins werden zuverlässig erkannt',
      'Der Zurück-Knopf auf der Detailseite führt wieder zu den installierten Mods oder zum Entwurf',
      'Änderungen an Ressourcenpaketen und Shadern erscheinen im Veröffentlichen-Schritt und im Spieler-Changelog',
      'Im Server-Admin steht nicht mehr fälschlich „Verbinde zuerst deinen BisectHosting-Server“'
    ],
    adjustments: [
      'Die Config-Liste im Server-Admin lädt deutlich schneller',
      'Das Backup vor dem Aufspielen sichert nur noch Mods, die ersetzt oder entfernt werden',
      'Die 3D-Vorschau der Skins dreht sich langsamer'
    ]
  },
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
