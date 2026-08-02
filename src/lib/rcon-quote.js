/** Reject args that can break quoted RCON command boundaries. */
export function assertSafeRconArg(value, label = "value") {
  const s = String(value ?? "");
  if (!s || /["\\\r\n]/.test(s)) {
    const err = new Error(`Invalid ${label}`);
    err.code = "RCON_ARG";
    throw err;
  }
  if (s.length > 128) {
    const err = new Error(`${label} is too long`);
    err.code = "RCON_ARG";
    throw err;
  }
  return s;
}

export function quoteRconArg(value, label = "value") {
  return `"${assertSafeRconArg(value, label)}"`;
}
