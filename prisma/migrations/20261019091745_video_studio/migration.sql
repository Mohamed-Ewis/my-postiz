-- AlterTable
ALTER TABLE "Media" ADD COLUMN "thumbnail" TEXT;

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'render',
    "title" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "stage" TEXT,
    "spec" TEXT NOT NULL DEFAULT '{}',
    "provider" TEXT,
    "externalId" TEXT,
    "externalData" TEXT,
    "outputMediaId" TEXT,
    "postId" TEXT,
    "error" TEXT,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'rss',
    "config" TEXT NOT NULL DEFAULT '{}',
    "accountIds" TEXT NOT NULL DEFAULT '[]',
    "aiRewrite" BOOLEAN NOT NULL DEFAULT true,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "mode" TEXT NOT NULL DEFAULT 'draft',
    "videoMode" BOOLEAN NOT NULL DEFAULT false,
    "videoAspect" TEXT NOT NULL DEFAULT '9:16',
    "intervalMin" INTEGER NOT NULL DEFAULT 30,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Feed" ("accountIds", "aiRewrite", "config", "createdAt", "enabled", "id", "intervalMin", "language", "lastError", "lastFetchedAt", "mode", "name", "type", "url", "userId") SELECT "accountIds", "aiRewrite", "config", "createdAt", "enabled", "id", "intervalMin", "language", "lastError", "lastFetchedAt", "mode", "name", "type", "url", "userId" FROM "Feed";
DROP TABLE "Feed";
ALTER TABLE "new_Feed" RENAME TO "Feed";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VideoJob_state_kind_idx" ON "VideoJob"("state", "kind");
