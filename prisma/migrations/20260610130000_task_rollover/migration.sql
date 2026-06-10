-- "Keep until done" tasks: a non-recurring task flagged to carry over stays on
-- today's list until it is completed, costing budget only once.
ALTER TABLE "Task" ADD COLUMN "rollover" BOOLEAN NOT NULL DEFAULT false;
