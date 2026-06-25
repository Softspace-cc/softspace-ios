import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function clean() {
  console.log('Starting cleanup...');

  // Due to strict foreign key constraints, we must delete bottom-up or just delete servers first.
  console.log('Deleting ALL messages...');
  await prisma.message.deleteMany({});
  await prisma.dMMessage.deleteMany({});
  
  console.log('Deleting ALL attachments and reactions...');
  await prisma.attachment.deleteMany({});
  await prisma.reaction.deleteMany({});

  console.log('Deleting ALL channels and roles...');
  await prisma.channel.deleteMany({});
  await prisma.role.deleteMany({});

  console.log('Deleting ALL server members...');
  await prisma.serverMemberRole.deleteMany({});
  await prisma.serverMember.deleteMany({});

  console.log('Deleting ALL servers...');
  const deleteServers = await prisma.serverGuild.deleteMany({});
  console.log(`Deleted ${deleteServers.count} servers.`);

  console.log('Deleting ALL DM Channels...');
  await prisma.dMChannelMember.deleteMany({});
  const deleteDMs = await prisma.dMChannel.deleteMany({});
  console.log(`Deleted ${deleteDMs.count} DM Channels.`);

  console.log('Deleting ALL Friendships...');
  const deleteFriendships = await prisma.friendship.deleteMany({});
  console.log(`Deleted ${deleteFriendships.count} friendships.`);

  // 1. Delete all users EXCEPT 'PVJamie'
  console.log('Deleting users (except PVJamie)...');
  const deleteUsers = await prisma.user.deleteMany({
    where: {
      username: {
        not: 'PVJamie'
      }
    }
  });
  console.log(`Deleted ${deleteUsers.count} users.`);

  // Reset PVJamie's avatar/banner if any
  console.log('Resetting PVJamie profile images...');
  await prisma.user.updateMany({
    where: { username: 'PVJamie' },
    data: {
      avatarUrl: null,
      bannerUrl: null
    }
  });

  // 2. Delete all files in uploads directory
  const uploadsDir = path.join(__dirname, 'uploads');
  if (fs.existsSync(uploadsDir)) {
    console.log(`Cleaning uploads directory: ${uploadsDir}`);
    const files = fs.readdirSync(uploadsDir);
    let deletedCount = 0;
    for (const file of files) {
      if (file !== '.gitkeep' && file !== 'README.md') {
        fs.unlinkSync(path.join(uploadsDir, file));
        deletedCount++;
      }
    }
    console.log(`Deleted ${deletedCount} files from uploads.`);
  } else {
    console.log('Uploads directory not found, skipping file cleanup.');
  }

  console.log('Cleanup complete!');
}

clean()
  .catch(e => {
    console.error('Error during cleanup:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });