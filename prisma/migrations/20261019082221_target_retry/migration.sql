-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PostTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "content" TEXT,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "state" TEXT NOT NULL DEFAULT 'QUEUE',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "lockedAt" DATETIME,
    "releaseId" TEXT,
    "releaseUrl" TEXT,
    "error" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostTarget_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostTarget_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PostTarget" ("accountId", "content", "createdAt", "error", "id", "postId", "publishedAt", "releaseId", "releaseUrl", "settings", "state", "updatedAt") SELECT "accountId", "content", "createdAt", "error", "id", "postId", "publishedAt", "releaseId", "releaseUrl", "settings", "state", "updatedAt" FROM "PostTarget";
DROP TABLE "PostTarget";
ALTER TABLE "new_PostTarget" RENAME TO "PostTarget";
CREATE INDEX "PostTarget_state_nextAttemptAt_idx" ON "PostTarget"("state", "nextAttemptAt");
CREATE UNIQUE INDEX "PostTarget_postId_accountId_key" ON "PostTarget"("postId", "accountId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
