/** Returns the single app user, creating it from .env admin creds if configured. */
export async function ensureEnvUser () {
  const { adminEmail, adminPassword } = useRuntimeConfig()
  const count = await prisma.user.count()
  if (count === 0 && adminEmail && adminPassword) {
    return prisma.user.create({
      data: { email: adminEmail.toLowerCase(), name: 'Admin', passwordHash: hashPasswordScrypt(adminPassword) }
    })
  }
  return null
}

export async function requireUserId (event) {
  const { user } = await requireUserSession(event)
  return user.id
}
