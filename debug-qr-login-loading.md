# Debug Session: qr-login-loading
- **Status**: [OPEN]
- **Issue**: QR-Code im Desktop-Login bleibt auf "Loading" und es wird keine Socket-ID erzeugt.
- **Debug Server**: http://127.0.0.1:7777/event
- **Log File**: .dbg/trae-debug-log-qr-login-loading.ndjson

## Reproduction Steps
1. Desktop-App starten.
2. Login-Seite oeffnen.
3. Rechten QR-Bereich beobachten.
4. Erwartet: QR-Code erscheint.
5. Ist: "Loading..." bleibt sichtbar.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Der QR-Socket verbindet sich in Electron nicht. | High | Low | Rejected |
| B | Der Server lehnt den QR-Handshake trotz Sonderfall ab. | High | Medium | Confirmed |
| C | `connect`/`connect_error` feuert, aber `qrSocketId` wird im Renderer nicht gesetzt. | Medium | Low | Rejected |
| D | Die App laeuft noch mit altem Bundle oder falscher Socket-Konfiguration. | Medium | Medium | Partially confirmed |

## Log Evidence
- `AuthPage.tsx:qr-init` meldet `socketUrl=https://softspace.cc` und `isElectron=true`.
- `AuthPage.tsx:connect_error` meldet zweimal `message=unauthenticated`.
- Damit ist bestaetigt, dass der Socket-Aufbau den Server erreicht, aber im Backend auth-seitig abgewiesen wird.

## Verification Conclusion
- Pre-fix evidence: Remote Server antwortet beim QR-Socket mit `unauthenticated`, daher bleibt `qrSocketId` leer und die UI zeigt nur `Loading...`.
- Fix in Code: Backend akzeptiert QR-Login jetzt sowohl ueber `query.qrLogin` als auch `auth.qrLogin`; der Client sendet beide Marker.
- Post-fix runtime verification auf dem produktiven Server steht noch aus, weil der produktive Backend-Stand laut Logs noch nicht den neuen QR-Bypass verwendet.
