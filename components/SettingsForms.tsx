"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MEMBER_COLORS, TIMEZONES } from "@/lib/colors";
import { Avatar } from "@/components/ui";
import {
  changePasswordAction,
  updateSettingsAction,
} from "@/app/actions/settings";
import { addMemberAction, removeMemberAction } from "@/app/actions/members";
import { logoutAction } from "@/app/actions/auth";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-4">
      <h2 className="mb-3 text-base font-semibold text-zinc-800">{title}</h2>
      {children}
    </section>
  );
}

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {MEMBER_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-full ring-2 ring-offset-2 ${
            value === c ? "ring-zinc-800" : "ring-transparent"
          }`}
          style={{ background: c }}
          aria-label={`Color ${c}`}
        />
      ))}
    </div>
  );
}

function Status({ msg }: { msg: string | null }) {
  if (!msg) return null;
  const ok = msg === "Saved";
  return (
    <span className={`text-sm ${ok ? "text-emerald-600" : "text-red-600"}`}>
      {msg}
    </span>
  );
}

export function ProfileSettings({
  name: initialName,
  color: initialColor,
}: {
  name: string;
  color: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateSettingsAction({ name, color });
      setMsg(r.ok ? "Saved" : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card title="Your profile">
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Color</label>
          <ColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={pending} className="btn-primary">
            Save
          </button>
          <Status msg={msg} />
        </div>
      </div>
    </Card>
  );
}

export function NotificationSettings({
  notifyOnComplete: nc,
  dailyDigest: dd,
}: {
  notifyOnComplete: boolean;
  dailyDigest: boolean;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [notifyOnComplete, setNc] = useState(nc);
  const [dailyDigest, setDd] = useState(dd);
  const [msg, setMsg] = useState<string | null>(null);

  function save(next: { notifyOnComplete?: boolean; dailyDigest?: boolean }) {
    setMsg(null);
    start(async () => {
      const r = await updateSettingsAction(next);
      setMsg(r.ok ? "Saved" : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card title="Email notifications">
      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <span className="text-sm">When a task I assigned is completed</span>
          <input
            type="checkbox"
            checked={notifyOnComplete}
            onChange={(e) => {
              setNc(e.target.checked);
              save({ notifyOnComplete: e.target.checked });
            }}
            className="h-5 w-5"
          />
        </label>
        <label className="flex items-center justify-between">
          <span className="text-sm">Daily points digest</span>
          <input
            type="checkbox"
            checked={dailyDigest}
            onChange={(e) => {
              setDd(e.target.checked);
              save({ dailyDigest: e.target.checked });
            }}
            className="h-5 w-5"
          />
        </label>
        <Status msg={msg} />
      </div>
    </Card>
  );
}

export function HouseholdSettings({
  householdName: hn,
  timezone: tz,
}: {
  householdName: string;
  timezone: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [householdName, setHn] = useState(hn);
  const [timezone, setTz] = useState(tz);
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateSettingsAction({ householdName, timezone });
      setMsg(r.ok ? "Saved" : r.error);
      if (r.ok) router.refresh();
    });
  }

  const tzOptions = TIMEZONES.includes(timezone)
    ? TIMEZONES
    : [timezone, ...TIMEZONES];

  return (
    <Card title="Household">
      <div className="space-y-3">
        <div>
          <label className="label">Household name</label>
          <input
            className="input"
            value={householdName}
            onChange={(e) => setHn(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Timezone</label>
          <select
            className="input"
            value={timezone}
            onChange={(e) => setTz(e.target.value)}
          >
            {tzOptions.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">
            Drives the rolling weekly budget window and daily digest timing.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={pending} className="btn-primary">
            Save
          </button>
          <Status msg={msg} />
        </div>
      </div>
    </Card>
  );
}

export function MembersSettings({
  members,
  currentUserId,
}: {
  members: { id: string; name: string; color: string; email: string }[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function add() {
    setMsg(null);
    start(async () => {
      const r = await addMemberAction({ name, email, password });
      if (r.ok) {
        setName("");
        setEmail("");
        setPassword("");
        setShowAdd(false);
        router.refresh();
      } else {
        setMsg(r.error);
      }
    });
  }

  function remove(id: string) {
    if (!confirm("Remove this member?")) return;
    setMsg(null);
    start(async () => {
      const r = await removeMemberAction(id);
      setMsg(r.ok ? null : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <Card title="Members">
      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 rounded-xl border border-border p-2.5"
          >
            <Avatar name={m.name} color={m.color} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{m.name}</div>
              <div className="truncate text-xs text-muted">{m.email}</div>
            </div>
            {m.id !== currentUserId && (
              <button
                onClick={() => remove(m.id)}
                disabled={pending}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {showAdd ? (
        <div className="mt-3 space-y-3 rounded-xl border border-border p-3">
          <input
            className="input"
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Temporary password (8+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setShowAdd(false)}
              className="btn-ghost flex-1"
            >
              Cancel
            </button>
            <button
              onClick={add}
              disabled={pending}
              className="btn-primary flex-1"
            >
              Add member
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="btn-ghost mt-3 w-full"
        >
          + Add member
        </button>
      )}
      {!showAdd && msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
    </Card>
  );
}

export function PasswordSettings() {
  const [pending, start] = useTransition();
  const [currentPassword, setCur] = useState("");
  const [newPassword, setNew] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  function save() {
    setMsg(null);
    start(async () => {
      const r = await changePasswordAction({ currentPassword, newPassword });
      if (r.ok) {
        setCur("");
        setNew("");
        setMsg("Saved");
      } else {
        setMsg(r.error);
      }
    });
  }

  return (
    <Card title="Change password">
      <div className="space-y-3">
        <input
          className="input"
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={(e) => setCur(e.target.value)}
        />
        <input
          className="input"
          type="password"
          placeholder="New password (8+ chars)"
          value={newPassword}
          onChange={(e) => setNew(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={pending} className="btn-primary">
            Update password
          </button>
          <Status msg={msg} />
        </div>
      </div>
    </Card>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="btn-ghost w-full text-red-600">
        Log out
      </button>
    </form>
  );
}
