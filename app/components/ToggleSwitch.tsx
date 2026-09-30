"use client";

export function ToggleSwitch({ checked, onChange, label, disabled = false }: {
  checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean;
}) {
  return <button type="button" className="toggleSwitch" role="switch" aria-checked={checked}
    aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}><span/></button>;
}
