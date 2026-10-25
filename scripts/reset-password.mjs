// Usage: npm run reset-password   (asks for email + new password)
import { createInterface } from 'node:readline/promises'
import { PrismaClient } from '@prisma/client'
import { hashPasswordScrypt } from '../server/utils/crypto.js'

const rl = createInterface({ input: process.stdin, output: process.stdout })
const prisma = new PrismaClient()
const users = await prisma.user.findMany({ select: { email: true } })
console.log('Users:', users.map(u => u.email).join(', '))
const email = ((await rl.question(`Email [${users[0]?.email}]: `)) || users[0]?.email || '').toLowerCase().trim()
const password = await rl.question('New password (8+ chars): ')
rl.close()
if (password.length < 8) { console.error('Password too short'); process.exit(1) }
await prisma.user.update({ where: { email }, data: { passwordHash: hashPasswordScrypt(password) } })
console.log('Password updated for', email)
await prisma.$disconnect()
