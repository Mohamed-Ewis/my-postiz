export default defineEventHandler(async (event) => prisma.template.findMany({ where: { userId: await requireUserId(event) }, orderBy: { createdAt: 'desc' } }))
