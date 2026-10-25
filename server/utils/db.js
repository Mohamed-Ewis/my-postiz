import { PrismaClient } from '@prisma/client'

const g = globalThis
export const prisma = g.__prisma || new PrismaClient()
if (process.env.NODE_ENV !== 'production') g.__prisma = prisma

export const parseJSON = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback } catch { return fallback }
}
