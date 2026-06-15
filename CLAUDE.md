# Pre-Vente Project

## Run Mobile App on Phone (Live Reload)

**Prérequis :** Téléphone branché en USB, même Wi-Fi que le PC.

### Lancer (2 terminaux)

**Terminal 1 — Backend :**
```powershell
cd app\backend
node src/index.js
```

**Terminal 2 — Mobile live reload :**
```powershell
cd app\mobile
npx ionic serve --host=0.0.0.0
```

Ouvrir l'app **Pré-Vente** sur le téléphone → live reload actif.

### Inspecter depuis Chrome (à faire à chaque session)

**Terminal PowerShell — Port forwarding :**
```powershell
$env:PATH += ";$env:LOCALAPPDATA\Android\Sdk\platform-tools"
adb reverse tcp:8100 tcp:8100
adb reverse tcp:3000 tcp:3000
```

Aller sur `chrome://inspect/#devices` → cliquer **inspect**.

### Réinstaller l'APK (si changement de plugins Capacitor)
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH += ";$env:JAVA_HOME\bin;$env:LOCALAPPDATA\Android\Sdk\platform-tools"
cd app\mobile
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
adb install -r "c:\Users\HP\Desktop\Personnel\pre-vente\app\mobile\android\app\build\outputs\apk\debug\app-debug.apk"
```

## Configuration

- **IP locale PC :** `192.168.11.110`
- **Backend URL (mobile) :** `http://192.168.11.110:3000/api`
- **Live reload URL :** `http://192.168.11.110:8100`
