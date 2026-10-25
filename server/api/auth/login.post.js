export default defineEventHandler(async (event) => {
  await ensureEnvUser()
  const { email, password } = await readBody(event)
  const user = email ? await prisma.user.findUnique({ where: { email: String(email).toLowerCase().trim() } }) : null
  if (!user || !verifyPasswordScrypt(String(password || ''), user.passwordHash)) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid email or password' })
  }
  await setUserSession(event, { user: { id: user.id, email: user.email, name: user.name } })
  return { ok: true }
})
