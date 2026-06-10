import { requireUser } from "@/lib/auth";
import { SideNav, MobileHeader, BottomNav } from "@/components/Nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const navUser = {
    name: user.name,
    color: user.color,
    householdName: user.household.name,
  };

  return (
    <div className="flex min-h-screen w-full flex-col md:flex-row">
      <SideNav user={navUser} />
      <div className="flex min-h-screen flex-1 flex-col">
        <MobileHeader user={navUser} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
