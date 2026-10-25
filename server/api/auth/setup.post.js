export default defineEventHandler(async (event) => {
  await ensureEnvUser()
  if (await prisma.user.count() > 0) throw createError({ statusCode: 403, statusMessage: 'Already set up' })
  const { email, password, name } = await readBody(event)
  if (!email || !password || password.length < 8) {
    throw createError({ statusCode: 400, statusMessage: 'Email and password (8+ chars) required' })
  }
  const user = await prisma.user.create({
    data: { email: email.toLowerCase().trim(), name: name || null, passwordHash: hashPasswordScrypt(password) }
  })
  await setUserSession(event, { user: { id: user.id, email: user.email, name: user.name } })
  return { ok: true }
})
