import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    const domains = ['apadeh.me', 'damnmail.com', 'wadooh.cx'];
    for (const name of domains) {
        await prisma.domain.upsert({
            where: { name },
            update: { isActive: true },
            create: { name, isActive: true }
        });
    }
}
main()
    .finally(async () => {
    await prisma.$disconnect();
})
    .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
