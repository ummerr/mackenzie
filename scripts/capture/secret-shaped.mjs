/**
 * Text that must never appear in a committed bundle. Shared by the Garmin
 * inventory gate (which refuses a bundle on a match) and the capture tests
 * (which prove the nightly capture's output passes the same gate). If
 * Garmin's own JSON someday legitimately trips one of these, narrow the
 * pattern with a comment — never delete it.
 */
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
