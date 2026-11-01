# 🌲 Minecraft Server Launcher (Saisonal & Modrinth-Powered)

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

## 📋 Server-Manifest anpassen (`server-manifest.json`)

Du musst Mods nicht selbst hochladen! Trage einfach den Modrinth-Slug ein:

```json
{
  "serverName": "Bisect Community Server",
  "serverAddress": "dein-server.bisecthosting.me:25565",
  "gameVersion": "1.21.1",
  "loader": "fabric",
  "cleanOldMods": true,
  "requiredMods": [
    { "slug": "fabric-api", "name": "Fabric API" },
    { "slug": "sodium", "name": "Sodium" },
    { "slug": "simple-voice-chat", "name": "Simple Voice Chat" }
  ]
}
```
Der Launcher fragt die Modrinth-API ab und lädt automatisch die jeweils neueste, kompatible Version herunter!
