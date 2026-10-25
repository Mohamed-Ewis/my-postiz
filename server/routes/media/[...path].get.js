// Logged-in users, or anyone with a valid signed URL (?exp&sig) — used by Instagram via the tunnel.
export default defineEventHandler(async (event) => {
  const rel = decodeURIComponent(getRouterParam(event, 'path') || '')
  const { exp, sig } = getQuery(event)
  if (!verifyMediaSignature(rel, exp, sig)) await requireUserSession(event)
  return sendMediaFile(event, rel)
})
