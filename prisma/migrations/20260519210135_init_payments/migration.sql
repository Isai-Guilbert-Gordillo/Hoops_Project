-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Tournament" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "maxTeams" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "inscriptionFee" INTEGER NOT NULL DEFAULT 0,
    "organizerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tournament_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Tournament" ("category", "createdAt", "id", "maxTeams", "name", "organizerId", "startDate", "updatedAt", "venue") SELECT "category", "createdAt", "id", "maxTeams", "name", "organizerId", "startDate", "updatedAt", "venue" FROM "Tournament";
DROP TABLE "Tournament";
ALTER TABLE "new_Tournament" RENAME TO "Tournament";
CREATE TABLE "new_TournamentEnrollment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tournamentId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "amountPaid" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TournamentEnrollment_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TournamentEnrollment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TournamentEnrollment" ("createdAt", "id", "status", "teamId", "tournamentId") SELECT "createdAt", "id", "status", "teamId", "tournamentId" FROM "TournamentEnrollment";
DROP TABLE "TournamentEnrollment";
ALTER TABLE "new_TournamentEnrollment" RENAME TO "TournamentEnrollment";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
