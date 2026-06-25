-- AlterTable
ALTER TABLE "Channel" ADD COLUMN "permissionOverrides" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN "mentionedRoleIds" TEXT;

-- CreateTable
CREATE TABLE "VerificationCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerBan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerBan_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerBan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ServerMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "nickname" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timeoutUntil" DATETIME,
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "isDeafened" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ServerMember" ("id", "joinedAt", "nickname", "serverId", "userId") SELECT "id", "joinedAt", "nickname", "serverId", "userId" FROM "ServerMember";
DROP TABLE "ServerMember";
ALTER TABLE "new_ServerMember" RENAME TO "ServerMember";
CREATE INDEX "ServerMember_serverId_idx" ON "ServerMember"("serverId");
CREATE UNIQUE INDEX "ServerMember_userId_serverId_key" ON "ServerMember"("userId", "serverId");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "bannerUrl" TEXT,
    "bio" TEXT,
    "pronouns" TEXT,
    "identityTags" TEXT,
    "accentColor" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'online',
    "customStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("accentColor", "avatarUrl", "bannerUrl", "bio", "createdAt", "customStatus", "displayName", "email", "id", "identityTags", "lastSeenAt", "locale", "passwordHash", "pronouns", "status", "theme", "updatedAt", "username") SELECT "accentColor", "avatarUrl", "bannerUrl", "bio", "createdAt", "customStatus", "displayName", "email", "id", "identityTags", "lastSeenAt", "locale", "passwordHash", "pronouns", "status", "theme", "updatedAt", "username" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VerificationCode_userId_type_idx" ON "VerificationCode"("userId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ServerBan_serverId_userId_key" ON "ServerBan"("serverId", "userId");
