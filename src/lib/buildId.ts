// Einmal pro Build ausgewertet (Node-Modul-Caching) – dieselbe ID auf allen
// Seiten. Wird an /assets/*.css|js angehängt, damit Browser nach einem neuen
// Deploy nicht die alte, für 1 Jahr "immutable" gecachte Datei behalten.
const now = new Date();
export const BUILD_TIME = now.toISOString();
export const BUILD_ID = now.getTime().toString(36);
