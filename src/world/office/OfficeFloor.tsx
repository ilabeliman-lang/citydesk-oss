import { useEffect, useState } from "react";
import { botReply, type Department, type OfficeBot } from "./roster";
import { listOffice } from "./officeList";
import { floorPanes } from "./panes";

/** Departments of the operator office. Directories are desks. Files are children. They do not run. */
export function OfficeFloor() {
  const panes = floorPanes();
  const [rows, setRows] = useState<Department[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [said, setSaid] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  useEffect(() => {
    let dead = false;
    void listOffice().then((r) => { if (!dead) setRows(r.departments); }).catch(() => undefined);
    return () => { dead = true; };
  }, []);

  const speak = (bot: OfficeBot) => setReply(botReply(bot, said));

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-[#e8c9a4]">Departments</p>
      <p className="text-[#d9cbb8]">{panes.join(" · ")}</p>
      {rows.length === 0 ? <p className="text-[#d9cbb8]">The office roster is still loading.</p> : null}
      {rows.map((dept) => (
        <div key={dept.path}>
          <button type="button" className="min-h-9 w-full rounded-full bg-white/10 px-3 text-left" onClick={() => { setOpen(open === dept.path ? null : dept.path); speak(dept); }}>
            {dept.name} · {dept.desks.length} desks · {dept.files.length} files
          </button>
          {open === dept.path ? (
            <ul className="mt-1 space-y-1 pl-2">
              {dept.desks.map((d) => (
                <li key={d.path}><button type="button" className="min-h-8 text-left underline" onClick={() => speak(d)}>{d.name}</button></li>
              ))}
              {dept.files.slice(0, 8).map((f) => (
                <li key={f.path}><button type="button" className="min-h-8 text-left text-[#d9cbb8]" onClick={() => speak(f)}>{f.name}</button></li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <label className="block">
        <span className="text-[#d9cbb8]">Say something to the bot you tapped</span>
        <input value={said} onChange={(e) => setSaid(e.target.value)} className="mt-1 h-9 w-full rounded-full bg-black/30 px-3" />
      </label>
      {reply ? <p>{reply}</p> : null}
    </div>
  );
}
