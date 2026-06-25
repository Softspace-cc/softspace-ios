# [OPEN] spotify-presence

## Symptom
- Spotify wird nur erkannt, wenn das Spotify-Fenster aktiv ist.
- Im Profil erscheint dadurch weiter `Playing: ...` aus dem aktiven Fenstertitel statt echter Spotify-Rich-Presence.

## Hypothesen
- H1: `window.electron.getMediaSessions()` liefert in der Renderer-Polling-Logik leere Daten.
- H2: `windows-media-sessions` liefert bei dieser Windows/Spotify-Kombination keine brauchbaren Sessions.
- H3: Die UI kann Rich-Presence korrekt rendern, bekommt aber aktuell keine JSON-Rich-Presence.
- H4: Ein Windows-WinRT-Fallback kann Songtitel und Timeline auch ohne aktives Spotify-Fenster liefern.

## Evidenz
- Renderer-Debuglog: `.dbg/trae-debug-log-spotify-presence.ndjson` enthaelt mehrfach `sessions: []`.
- Direkter Prozess-Test: `Get-Process Spotify` liefert im Hintergrund nur `Spotify Premium`, also keinen Songtitel.
- WinRT-PowerShell-Test: liefert `Source=Spotify.exe`, `Title=Way Too Self Aware`, `Artist=Ian Asher`, `PositionMs`, `EndMs`.

## Schlussfolgerung
- H1 bestaetigt.
- H2 fuer diese Laufzeit bestaetigt.
- H3 bestaetigt durch vorhandene `RichPresenceDisplay`-Logik.
- H4 bestaetigt durch den erfolgreichen PowerShell-WinRT-Test.

## Geplanter Fix
- `get-media-sessions` in Electron zuerst normal probieren.
- Wenn leer oder fehlerhaft, auf WinRT-PowerShell-Fallback fuer Spotify zurueckfallen.
- Renderer weiter unveraendert ueber dieselbe IPC-Methode bedienen.
