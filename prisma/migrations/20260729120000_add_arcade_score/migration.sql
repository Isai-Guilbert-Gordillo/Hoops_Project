-- CreateTable
CREATE TABLE "ArcadeScore" (
    "id" TEXT NOT NULL,
    "initials" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArcadeScore_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ArcadeScore" ADD CONSTRAINT "ArcadeScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
