export default defineEventHandler(async (event) => prisma.tag.findMany({ where: { userId: await requireUserId(event) }, orderBy: { name: 'asc' } }))
