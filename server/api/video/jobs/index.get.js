export default defineEventHandler(async (event) => {
  const userId = await requireUserId(event)
  const jobs = await prisma.videoJob.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 })
  const media = await prisma.media.findMany({ where: { id: { in: jobs.map(j => j.outputMediaId).filter(Boolean) } } })
  return jobs.map(j => {
    const m = media.find(x => x.id === j.outputMediaId)
    return { ...j, spec: undefined, externalData: undefined, output: m ? { ...m, url: localMediaUrl(m.path), thumbUrl: m.thumbnail ? localMediaUrl(m.thumbnail) : null } : null }
  })
})
