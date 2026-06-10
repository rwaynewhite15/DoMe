import { requireUser } from "@/lib/auth";
import { getMembers, getTasksForManage } from "@/lib/queries";
import { localDayKey } from "@/lib/dates";
import { TasksManager } from "@/components/TasksManager";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const tz = user.household.timezone;
  const hid = user.householdId;

  const [members, tasks] = await Promise.all([
    getMembers(hid),
    getTasksForManage(hid, tz),
  ]);

  return (
    <TasksManager
      tasks={tasks}
      members={members}
      currentUserId={user.id}
      defaultDate={localDayKey(new Date(), tz)}
    />
  );
}
