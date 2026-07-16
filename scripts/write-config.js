/**
 * Genera config.js desde variables de entorno (Netlify / CI).
 * SUPABASE_URL + SUPABASE_ANON_KEY
 */
const fs = require("fs");
const path = require("path");

const url = process.env.SUPABASE_URL || process.env.AYUNO_SUPABASE_URL || "";
const anonKey =
  process.env.SUPABASE_ANON_KEY || process.env.AYUNO_SUPABASE_ANON_KEY || "";

const out = path.join(__dirname, "..", "config.js");
const contents = `/**
 * Generado en build. No editar a mano en Netlify.
 */
window.AYUNO_SUPABASE = {
  url: ${JSON.stringify(url)},
  anonKey: ${JSON.stringify(anonKey)},
};
`;

fs.writeFileSync(out, contents, "utf8");

if (!url || !anonKey) {
  console.warn(
    "[write-config] SUPABASE_URL / SUPABASE_ANON_KEY vacíos: leads solo en localStorage."
  );
} else {
  console.log("[write-config] config.js generado con Supabase.");
}
