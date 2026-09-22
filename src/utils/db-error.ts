/** MySQL ER_DUP_ENTRY / SQLite unique violation. */
export function isDuplicateKeyError(err: unknown): boolean {
  const code =
    (err as { code?: string; driverError?: { code?: string } })?.code ??
    (err as { driverError?: { code?: string } })?.driverError?.code;
  const errno =
    (err as { errno?: number })?.errno ??
    (err as { driverError?: { errno?: number } })?.driverError?.errno;
  return code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT' || errno === 1062;
}
