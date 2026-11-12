# dP Launcher

Ein moderner, performanter und eleganter Minecraft Server Launcher mit saisonalem Design, automatischem Mod-Sync über Modrinth und GitHub Pages Auto-Updates.

---

## ✨ Features

* **Saisonales Design & Theming:**
  * Automatische Erkennung der aktuellen Jahreszeit (Herbst, Winter, Frühling, Sommer) mit passenden Farben, Glow-Effekten und Icons.
  * Manuell umschaltbar in den Einstellungen.
* **1-Klick Mod-Synchronisation:**
  * Keine Hosting-Kosten für Mods: Der Launcher liest das Manifest (`server-manifest.json`) und lädt die Mods direkt über das ultraschnelle CDN von **Modrinth** herunter.
  * SHA-1 Hash-Prüfung verhindert redundante Downloads und stellt die Integrität sicher.
  * Veraltete Mods werden automatisch bereinigt.
* **Integrierter Modrinth Store:**
  * Suche nach Mods, Shaderpacks und Resourcepacks direkt in der App.
  * Automatisch vorgefiltert für deine Minecraft-Version (z. B. `1.21.1`) und deinen Modloader (`Fabric`).
  * 1-Klick-Installation in den richtigen Ordner.
* **Auto-Update System (GitHub Releases & Pages):**
  * Erkennt neue Versionen auf GitHub und ermöglicht 1-Klick-In-App-Updates (wie in Griddly CSV).
* **Instanzen & Server:**
  * Mehrere Instanzen mit eigener Minecraft-Version, Modloader und RAM-Einstellung.
  * Mehrere Server, Import über `.dpmcserver`-Dateien.
* **Skin Studio & Profil:** Skins verwalten, 3D-Vorschau, Microsoft-Login.
* **Server-Admin:** Modpack, Changelog und Guides pflegen und veröffentlichen.
* **Mod-Manager:**
  * Lokale Mods anzeigen, mit einem Klick deaktivieren (`.disabled`) oder löschen.
  * Direkter Absprung in den Datei-Explorer.

---

## 🛠️ Entwicklung & Starten

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Entwicklung starten
```bash
npm run electron:dev
```

### 3. Build für Windows erstellen
```bash
npm run dist:win
```

### 4. Neue Version veröffentlichen
```bash
npm run publish-app
```
*(Liest Version und Changelog aus `src/releaseNotes.js`, baut die App und aktualisiert die Versionen).*

---

## 📋 Modliste verwalten (Server-Manifest)

Das Manifest liegt im GitHub-Repo des jeweiligen Servers. Die Modliste wird im Launcher unter **Server-Admin → Modpack** gepflegt, nicht von Hand. Der Tab erscheint nur für Microsoft-Konten, deren UUID im Manifest unter `admins` steht.

1. **Entwurf bearbeiten:** Mods über die Modrinth-Suche hinzufügen. Version, Dateiname und `sha1` werden festgeschrieben, Pflicht-Abhängigkeiten kommen automatisch dazu.
2. **Lokal testen:** Startet den Entwurf in einer eigenen Instanz (`instances/modpack-test`). Die normale Installation, Spieler und Server bleiben unverändert.
3. **Auf Server anwenden:** Gleicht den `/mods`-Ordner des BisectHosting-Servers mit dem Entwurf ab. Von Hand abgelegte Mods bleiben erhalten.
4. **Veröffentlichen:** Committet das Manifest per GitHub-API und erhöht `modpackVersion`. Die Launcher der Spieler erkennen die neue Version und synchronisieren vor dem nächsten Spielstart.

Das Modpack-Update ist vom App-Update (`npm run publish-app`) unabhängig. BisectHosting-Key und GitHub-Token liegen nur in den lokalen `launcher-settings.json`.
