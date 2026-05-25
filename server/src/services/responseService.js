export function sendSuccess(res, data = {}, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function toBoolean(value) {
  return Boolean(value);
}
