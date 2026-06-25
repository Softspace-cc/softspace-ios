# Debug Session: dm-route-404

Status: OPEN

## Symptom
- `GET /api/dms/:channelId` liefert `404 (Not Found)`
- danach folgt `Error: Failed to fetch dm`
- außerdem schlagen DM-Gruppenaktionen wie Mitglied entfernen fehl

## Hypothesen
1. Es existiert kein `GET /api/dms/:channelId`-Endpoint im Backend, obwohl das Frontend ihn verwendet.
2. Die DM-Aktionsrouten akzeptieren nur exakte IDs, das Frontend liefert aber je nach Zustand Name oder ID.
3. Nach Gruppenaktionen wird die DM-Liste nicht sauber neu geladen, wodurch die UI auf veralteten Daten arbeitet.
4. Das globale Context-Menü fängt Kontextklicks ab und verhindert lokale Menü-Aktionen teilweise.

## Evidence
- Browser-Log zeigt mehrfach `GET https://softspace.cc/api/dms/<id> 404`
- Browser-Log zeigt `DELETE https://softspace.cc/api/dms/<id>/members/<userId> 404`

## Next
- Backend-DM-Routen prüfen und Single-DM-Load plus Gruppenaktionen gegen denselben Resolver vereinheitlichen
- Danach Frontend erneut gegen die korrigierten Routen verifizieren
