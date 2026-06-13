-- Quantity tasks: a task can be flagged so its points are earned per unit (e.g.
-- "Do a load of laundry" worth 5 pts per load). defaultPoints is then read as
-- points-per-unit, each occurrence tracks how many units were done, and the
-- occurrence's points is the total (per-unit × quantity).
ALTER TABLE "Task" ADD COLUMN "hasQuantity" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN "unit" TEXT;
ALTER TABLE "TaskOccurrence" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
