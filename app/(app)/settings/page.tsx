import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  HouseholdSettings,
  LogoutButton,
  MembersSettings,
  NotificationSettings,
  PasswordSettings,
  ProfileSettings,
} from "@/components/SettingsForms";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();

  const members = await prisma.user.findMany({
    where: { householdId: user.householdId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, color: true, email: true },
  });

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Settings</h1>

      <ProfileSettings name={user.name} color={user.color} />
      <NotificationSettings
        notifyOnComplete={user.notifyOnComplete}
        dailyDigest={user.dailyDigest}
      />
      <HouseholdSettings
        householdName={user.household.name}
        timezone={user.household.timezone}
      />
      <MembersSettings members={members} currentUserId={user.id} />
      <PasswordSettings />
      <LogoutButton />
    </div>
  );
}
