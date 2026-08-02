-- DropForeignKey
ALTER TABLE "Player" DROP CONSTRAINT "Player_lobbyId_fkey";

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_lobbyId_fkey" FOREIGN KEY ("lobbyId") REFERENCES "Lobby"("id") ON DELETE CASCADE ON UPDATE CASCADE;
