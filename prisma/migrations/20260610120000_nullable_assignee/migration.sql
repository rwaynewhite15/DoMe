-- Allow tasks/events to be unassigned ("Anyone" / no one).
-- The existing foreign key permits NULLs; we only need to drop the NOT NULL.
ALTER TABLE "Task" ALTER COLUMN "assigneeId" DROP NOT NULL;
