-- CreateEnum
CREATE TYPE "ModelBrain" AS ENUM ('OFFLINE', 'PLAYER_KEY', 'SERVER_KEY');

-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "offlineAllowed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RegressionRun" ADD COLUMN     "apiKeySealed" TEXT,
ADD COLUMN     "brain" "ModelBrain" NOT NULL DEFAULT 'OFFLINE';

-- AlterTable
ALTER TABLE "Run" ADD COLUMN     "apiKeySealed" TEXT,
ADD COLUMN     "brain" "ModelBrain" NOT NULL DEFAULT 'OFFLINE';
