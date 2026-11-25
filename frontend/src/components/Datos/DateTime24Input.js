import { useEffect, useRef, useState } from "react";

function toDisplay(value) {
  if (!value) return "";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}` : "";
}

function toLocalValue(value) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const d = Number(day), m = Number(month), h = Number(hour), min = Number(minute);
  const date = new Date(Number(year), m - 1, d, h, min);
  if (date.getFullYear() !== Number(year) || date.getMonth() !== m - 1 || date.getDate() !== d || h > 23 || min > 59) return null;
  return `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export default function DateTime24Input({ id, label, value, onChange, minValue, maxValue }) {
  const pickerRef = useRef(null);
  const [text, setText] = useState(() => toDisplay(value || ""));

  useEffect(() => setText(toDisplay(value || "")), [value]);

  const handleTextChange = (event) => {
    const next = event.target.value;
    setText(next);
    const parsed = toLocalValue(next);
    if (parsed) onChange(parsed);
  };

  const handlePickerChange = (event) => {
    const next = event.target.value;
    if (next) {
      setText(toDisplay(next));
      onChange(next);
    }
  };

  return (
    <div className="filter-datetime-24">
      <input
        type="text"
        id={id}
        value={text}
        onChange={handleTextChange}
        onBlur={() => setText(toDisplay(value || ""))}
        placeholder="dd/mm/aaaa HH:mm"
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${label}, formato dd/mm/aaaa HH:mm`}
        aria-describedby={`${id}-format`}
      />
      <span id={`${id}-format`} className="visually-hidden">Formato de 24 horas, día, mes, año, hora y minutos.</span>
      <button type="button" className="filter-datetime-24__calendar" aria-label={`Elegir ${label}`} onClick={() => pickerRef.current?.showPicker?.()}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={pickerRef}
        className="filter-datetime-24__native"
        type="datetime-local"
        lang="es-MX"
        step="60"
        value={value || ""}
        onChange={handlePickerChange}
        min={minValue || undefined}
        max={maxValue || undefined}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}
