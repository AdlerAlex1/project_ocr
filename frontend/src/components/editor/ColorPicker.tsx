const COLORS = [
  { name: "Чёрный", value: "#111827" },
  { name: "Красный", value: "#ef4444" },
  { name: "Синий", value: "#3b82f6" },
  { name: "Зелёный", value: "#22c55e" },
  { name: "Жёлтый", value: "#facc15" },
  { name: "Белый", value: "#ffffff" },
];

interface ColorPickerProps {
  value: string;
  disabled?: boolean;
  onChange: (color: string) => void;
}

export default function ColorPicker({
  value,
  disabled = false,
  onChange,
}: ColorPickerProps) {
  return (
    <div className="editor-color-picker" role="group" aria-label="Цвет инструмента">
      <span className="editor-control-label">Цвет</span>
      <div className="editor-color-swatches">
        {COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            className={`editor-color-swatch${value === color.value ? " is-selected" : ""}`}
            style={{ backgroundColor: color.value }}
            aria-label={color.name}
            aria-pressed={value === color.value}
            disabled={disabled}
            title={color.name}
            onClick={() => onChange(color.value)}
          />
        ))}
      </div>
    </div>
  );
}
