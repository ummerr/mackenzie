/**
 * Text that must never appear in a committed bundle. Shared by the Garmin
 * inventory gate (which refuses a bundle on a match) and the capture tests
 * (which prove the nightly capture's output passes the same gate). If
 * Garmin's own JSON someday legitimately trips one of these, narrow the
 * pattern with a comment — never delete it.
 */
/** The Grint gate's list: the classic client's session is a PHP cookie. */
export const GRINT_SECRET_SHAPED = [/set-cookie/i, /phpsessid/i, /\bauthorization\b/i, /document\.cookie/i];

/**
 * The one narrowing (2026-10-15): the /score page served to a fresh session
 * carries a "WHY SPONSOR" promo whose inline helper writes a dismissal
 * cookie — `document.cookie = name + "=" + (value || "") + expires + ...`.
 * A browser that dismissed it years ago is never served it, which is why no
 * hand capture ever tripped this. A cookie *write* in the site's own page
 * script is not a recorded secret; a cookie *read* or any other mention
 * still is. The pattern stays; this exempts only that exact helper shape.
 */
const DOCUMENT_COOKIE_WRITE_HELPER = /document\.cookie\s*=\s*name\s*\+/;

/** Every secret-shaped violation in a Grint bundle's text, as the gate prints them. */
export function grintSecretViolations(text) {
  const out = [];
  for (const re of GRINT_SECRET_SHAPED) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let hit;
    while ((hit = g.exec(text))) {
      const window = text.slice(hit.index, hit.index + 40);
      if (re.source === "document\\.cookie" && DOCUMENT_COOKIE_WRITE_HELPER.test(window)) continue;
      out.push({ re, index: hit.index });
    }
  }
  return out;
}

export const SECRET_SHAPED = [
  /set-cookie/i,
  /\bauthorization\b/i,
  /\bbearer\b/i,
  /access[_-]?token/i,
  /refresh[_-]?token/i,
  /\bjwt\b/i,
  /document\.cookie/i,
  /localStorage/i,
];
