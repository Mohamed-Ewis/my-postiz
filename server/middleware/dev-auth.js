// Temporary dev bypass: when AUTH_DISABLED=true, auto-login as the first user.
// Remove AUTH_DISABLED from .env to bring the login screen back.
export default defineEventHandler(async (event) => {
  if (process.env.AUTH_DISABLED !== 'true') return
  const session = await getUserSession(event)
  if (session?.user) return
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!user) return
  await setUserSession(event, { user: { id: user.id, email: user.email, name: user.name } })
})
