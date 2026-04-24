// ============================================================
// Google Apps Script for Python-kurs fremgangssporing
// ============================================================
//
// Oppsett (gjøres én gang av læreren):
//
// 1. Gå til https://sheets.google.com og opprett et nytt regneark.
// 2. Gi arket navnet "Fremgang" (viktig — scriptet bruker dette navnet).
// 3. Legg til kolonneoverskrifter i rad 1:
//       A: Navn  |  B: Passord  |  C: Fremgang  |  D: Sist oppdatert
// 4. Åpne Utvidelser → Apps Script.
// 5. Lim inn hele denne filen, erstatt standard-koden.
// 6. Klikk Distribuer → Ny distribusjon → Nettapp.
//       - "Kjør som": Meg
//       - "Hvem har tilgang": Alle
// 7. Klikk Distribuer. Kopier URL-en du får.
// 8. Lim URL-en inn i python-kurs/config.js under appsScriptUrl,
//    og sett enableCloudSync til true.
//
// Merk: passord lagres i klartekst — greit for skolebruk, ikke for
// sensitiv informasjon.
// ============================================================

function doGet(e) {
    var action   = e.parameter.action;
    var name     = e.parameter.name     || '';
    var password = e.parameter.password || '';
    var progress = e.parameter.progress || '';

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Fremgang');
    if (!sheet) {
        return _json({ success: false, error: 'Arket "Fremgang" finnes ikke.' });
    }

    if (action === 'register') return _register(sheet, name, password);
    if (action === 'login')    return _login(sheet, name, password);
    if (action === 'save')     return _save(sheet, name, password, progress);

    return _json({ success: false, error: 'Ukjent handling: ' + action });
}

// -----------------------------------------------------------------------
// Register a new user
// -----------------------------------------------------------------------
function _register(sheet, name, password) {
    if (!name || !password) {
        return _json({ success: false, error: 'Navn og passord er påkrevd.' });
    }
    var row = _findRow(sheet, name);
    if (row > 0) {
        return _json({ success: false, error: 'Navnet er allerede tatt. Velg et annet.' });
    }
    sheet.appendRow([name, password, '', new Date()]);
    return _json({ success: true });
}

// -----------------------------------------------------------------------
// Login — returns saved progress
// -----------------------------------------------------------------------
function _login(sheet, name, password) {
    var row = _findRow(sheet, name);
    if (row < 0) {
        return _json({ success: false, error: 'Fant ikke brukeren. Har du registrert deg?' });
    }
    var storedPw = sheet.getRange(row, 2).getValue();
    if (storedPw !== password) {
        return _json({ success: false, error: 'Feil passord.' });
    }
    var progress = sheet.getRange(row, 3).getValue();
    return _json({ success: true, progress: progress || '{}' });
}

// -----------------------------------------------------------------------
// Save progress for an existing user
// -----------------------------------------------------------------------
function _save(sheet, name, password, progress) {
    var row = _findRow(sheet, name);
    if (row < 0) {
        return _json({ success: false, error: 'Bruker ikke funnet.' });
    }
    var storedPw = sheet.getRange(row, 2).getValue();
    if (storedPw !== password) {
        return _json({ success: false, error: 'Feil passord.' });
    }
    sheet.getRange(row, 3).setValue(progress);
    sheet.getRange(row, 4).setValue(new Date());
    return _json({ success: true });
}

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------
function _findRow(sheet, name) {
    var data = sheet.getRange('A:A').getValues();
    for (var i = 0; i < data.length; i++) {
        if (data[i][0] === name) return i + 1; // 1-indexed
    }
    return -1;
}

function _json(obj) {
    return ContentService
        .createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}
