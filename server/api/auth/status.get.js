export default defineEventHandler(async () => {
  await ensureEnvUser()
  const count = await prisma.user.count()
  return { needsSetup: count === 0 }
})
