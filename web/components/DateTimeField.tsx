import { useRef } from "react";

type Props = { label: string; value: string; onChange: (value: string) => void; placeholder?: string };

export function DateTimeField({ label, value, onChange, placeholder = "YYYY-MM-DD HH:mm:ss" }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const pickerValue = value.trim().replace(" ", "T").slice(0, 16);

  function openPicker() {
    const input = picker.current;
    if (!input) return;
    try {
      if (typeof input.showPicker === "function") input.showPicker();
      else { input.focus(); input.click(); }
    } catch {
      input.focus();
      input.click();
    }
  }

  return <label className="date-time-field">
    <span>{label}</span>
    <span className="date-time-control">
      <input aria-label={label} type="text" value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
      <button type="button" className="date-time-picker-button" aria-label={`เลือกวันที่และเวลา: ${label}`} title="เลือกจากปฏิทิน" onClick={openPicker}>📅</button>
      <input ref={picker} className="date-time-native-picker" type="datetime-local" step="60" tabIndex={-1} aria-hidden="true"
        value={/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(pickerValue) ? pickerValue : ""}
        onChange={event => onChange(event.target.value ? `${event.target.value.replace("T", " ")}:00` : "")} />
    </span>
  </label>;
}
