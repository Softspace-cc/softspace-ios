-- CreateTable
CREATE TABLE "User" (
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
    "status" TEXT NOT NULL DEFAULT 'online',
    "customStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerGuild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT,
    "bannerUrl" TEXT,
    "description" TEXT,
    "vanityUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ServerGuild_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#c9a8ff',
    "position" INTEGER NOT NULL DEFAULT 0,
    "permissions" BIGINT NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "nickname" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServerMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerMember_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServerMemberRole" (
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    PRIMARY KEY ("memberId", "roleId"),
    CONSTRAINT "ServerMemberRole_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ServerMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServerMemberRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TEXT',
    "topic" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Channel_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Channel_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Channel" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    "replyToId" TEXT,
    CONSTRAINT "Message_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Message" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "dmMessageId" TEXT,
    "url" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Attachment_dmMessageId_fkey" FOREIGN KEY ("dmMessageId") REFERENCES "DMMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT,
    "dmMessageId" TEXT,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reaction_dmMessageId_fkey" FOREIGN KEY ("dmMessageId") REFERENCES "DMMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DMChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "iconUrl" TEXT,
    "ownerId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DMChannelMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dmChannelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DMChannelMember_dmChannelId_fkey" FOREIGN KEY ("dmChannelId") REFERENCES "DMChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DMChannelMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DMMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dmChannelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" DATETIME,
    CONSTRAINT "DMMessage_dmChannelId_fkey" FOREIGN KEY ("dmChannelId") REFERENCES "DMChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DMMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invite" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "serverId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "expiresAt" DATETIME,
    "maxUses" INTEGER,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invite_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ServerGuild" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invite_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerGuild_vanityUrl_key" ON "ServerGuild"("vanityUrl");

-- CreateIndex
CREATE INDEX "Role_serverId_idx" ON "Role"("serverId");

-- CreateIndex
CREATE INDEX "ServerMember_serverId_idx" ON "ServerMember"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerMember_userId_serverId_key" ON "ServerMember"("userId", "serverId");

-- CreateIndex
CREATE INDEX "Channel_serverId_idx" ON "Channel"("serverId");

-- CreateIndex
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_authorId_idx" ON "Message"("authorId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "Attachment_dmMessageId_idx" ON "Attachment"("dmMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_dmMessageId_userId_emoji_key" ON "Reaction"("dmMessageId", "userId", "emoji");

-- CreateIndex
CREATE UNIQUE INDEX "DMChannelMember_dmChannelId_userId_key" ON "DMChannelMember"("dmChannelId", "userId");

-- CreateIndex
CREATE INDEX "DMMessage_dmChannelId_createdAt_idx" ON "DMMessage"("dmChannelId", "createdAt");

-- CreateIndex
CREATE INDEX "Friendship_recipientId_idx" ON "Friendship"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "Friendship_requesterId_recipientId_key" ON "Friendship"("requesterId", "recipientId");

-- CreateIndex
CREATE INDEX "Invite_serverId_idx" ON "Invite"("serverId");
