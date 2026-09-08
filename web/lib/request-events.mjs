export function recordRequestEvent(entry, type, detail, at = new Date().toISOString()) {
  const events = Array.isArray(entry.history) ? entry.history : [];
  entry.history = [...events, { type, at, ...detail }];
  entry.updated_at = at;
}

export function changeRequestStatus(entry, status, at = new Date().toISOString()) {
  if (entry.status === status) return false;
  const previous = entry.status;
  entry.status = status;
  recordRequestEvent(entry, "STATUS_CHANGED", { from: previous, to: status }, at);
  return true;
}
