import { useEffect, useState } from 'react';

interface SlideToConfirmProps {
  label: string;
  disabled?: boolean;
  disabledLabel?: string;
  onConfirm: () => void | Promise<void>;
}

export default function SlideToConfirm({
  label,
  disabled = false,
  disabledLabel = 'Programado',
  onConfirm,
}: SlideToConfirmProps) {
  const [value, setValue] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (disabled) setValue(0);
  }, [disabled]);

  const handleRelease = () => {
    if (disabled || busy) {
      setValue(0);
      return;
    }
    if (value >= 95) {
      setBusy(true);
      Promise.resolve(onConfirm())
        .catch(() => {})
        .finally(() => {
          setBusy(false);
          setValue(0);
        });
      return;
    }
    setValue(0);
  };

  const labelText = disabled ? disabledLabel : busy ? 'Procesando...' : label;
  const background = `linear-gradient(to right, #2563eb ${value}%, #e5e7eb ${value}%)`;

  return (
    <div className="relative w-full">
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(event) => setValue(Number(event.target.value))}
        onMouseUp={handleRelease}
        onTouchEnd={handleRelease}
        onKeyUp={handleRelease}
        className="slide-input"
        style={{ background }}
        disabled={disabled || busy}
        aria-label={labelText}
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm font-semibold text-gray-700">
        {labelText}
      </div>
    </div>
  );
}
