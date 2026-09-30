import { useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

interface Props {
    value: Date | null;                 // committed start time (null = send now)
    onChange: (d: Date | null) => void;
}

const tomorrowAt = (h: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(h, 0, 0, 0);
    return d;
};

const PRESETS = [
    { label: "Tomorrow", date: () => tomorrowAt(9) },
    { label: "Tomorrow, 10:00 AM", date: () => tomorrowAt(10) },
    { label: "Tomorrow, 11:00 AM", date: () => tomorrowAt(11) },
    { label: "Tomorrow, 3:00 PM", date: () => tomorrowAt(15) },
];

// <input type="datetime-local"> needs local time in "YYYY-MM-DDTHH:mm"
const toLocalInput = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function SendLaterPopover({ value, onChange }: Props) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<Date | null>(value);
    const ref = useRef<HTMLDivElement>(null);

    // Close when clicking outside
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);

    const toggle = () => {
        setDraft(value); // reopen with the committed value
        setOpen((o) => !o);
    };

    const isValid = draft !== null && draft.getTime() > Date.now();

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={toggle}
                title={value ? `Scheduled: ${value.toLocaleString()}` : "Send later"}
                className={`rounded-full p-2 hover:bg-gray-100 ${value ? "text-green-600" : "text-gray-500"}`}
            >
                <Clock size={20} />
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border bg-white p-5 shadow-lg">
                    <h3 className="mb-4 font-semibold text-gray-900">Send Later</h3>

                    <input
                        type="datetime-local"
                        min={toLocalInput(new Date())}
                        value={draft ? toLocalInput(draft) : ""}
                        onChange={(e) => setDraft(e.target.value ? new Date(e.target.value) : null)}
                        placeholder="Pick date & time"
                        className="w-full border-b pb-2 text-sm text-gray-700 outline-none"
                    />

                    <ul className="mt-4 space-y-1">
                        {PRESETS.map((p) => {
                            const d = p.date();
                            const selected = draft?.getTime() === d.getTime();
                            return (
                                <li key={p.label}>
                                    <button
                                        type="button"
                                        onClick={() => setDraft(d)}
                                        className={`w-full rounded px-1 py-2 text-left text-sm hover:bg-gray-50 ${selected ? "font-medium text-green-700" : "text-gray-700"
                                            }`}
                                    >
                                        {p.label}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div className="mt-8 flex items-center justify-end gap-4">
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="text-sm font-medium text-gray-900"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={!isValid}
                            onClick={() => {
                                onChange(draft);
                                setOpen(false);
                            }}
                            className="rounded-full border border-green-600 px-5 py-1.5 text-sm font-medium text-green-600 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            Done
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}