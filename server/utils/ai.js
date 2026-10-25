import { generateText as gt, generateImage as gi } from '../lib/ai.js'

const wrap = fn => async (...a) => {
  try { return await fn(...a) } catch (e) { throw createError({ statusCode: e.statusCode || 500, statusMessage: e.message }) }
}
export const generateText = wrap(gt)
export const generateImage = wrap(gi)
