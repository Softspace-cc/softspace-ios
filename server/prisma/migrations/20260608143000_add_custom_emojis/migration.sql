-- CreateTable
CREATE TABLE "CustomEmoji" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'EMOJI',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomEmoji_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomEmoji_userId_name_key" ON "CustomEmoji"("userId", "name");

-- CreateIndex
CREATE INDEX "CustomEmoji_userId_position_idx" ON "CustomEmoji"("userId", "position");
