import {
  ArrowRight,
  Bold,
  Circle as CircleIcon,
  Eraser,
  FileText,
  Hand,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Type,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import ColorPicker from "./ColorPicker";
import type { EditorHistoryState, EditorTool } from "./editor.types";

interface EditorToolbarProps {
  activeTool: EditorTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  bold: boolean;
  zoom: number;
  history: EditorHistoryState;
  hasSelection: boolean;
  onToolChange: (tool: EditorTool) => void;
  onColorChange: (color: string) => void;
  onStrokeWidthChange: (width: number) => void;
  onFontSizeChange: (size: number) => void;
  onBoldChange: (bold: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  onReturnToOcr: () => void;
}

export default function EditorToolbar({
  activeTool,
  color,
  strokeWidth,
  fontSize,
  bold,
  zoom,
  history,
  hasSelection,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onFontSizeChange,
  onBoldChange,
  onZoomChange,
  onUndo,
  onRedo,
  onDeleteSelected,
  onReturnToOcr,
}: EditorToolbarProps) {
  const toolButtons = [
    { id: "pen" as const, label: "Перо", Icon: Pencil },
    { id: "marker" as const, label: "Маркер", Icon: Highlighter },
    { id: "eraser" as const, label: "Ластик", Icon: Eraser },
    { id: "pan" as const, label: "Перемещение", Icon: Hand },
    { id: "select" as const, label: "Выбор", Icon: MousePointer2 },
    { id: "text" as const, label: "Текст", Icon: Type },
    { id: "line" as const, label: "Линия", Icon: Minus },
    { id: "arrow" as const, label: "Стрелка", Icon: ArrowRight },
    { id: "rectangle" as const, label: "Прямоугольник", Icon: Square },
    { id: "circle" as const, label: "Круг", Icon: CircleIcon },
  ];

  return (
    <aside className="editor-tools" aria-label="Инструменты редактора">
      <div className="editor-tool-group">
        <span className="editor-control-label">Инструмент</span>
        <div className="editor-tool-buttons">
          {toolButtons.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              className={`editor-tool-button editor-tool-choice-button${activeTool === id ? " is-active" : ""}`}
              aria-pressed={activeTool === id}
              title={label}
              onClick={() => onToolChange(id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <ColorPicker
        value={color}
        disabled={activeTool === "eraser" || activeTool === "pan"}
        onChange={onColorChange}
      />

      {activeTool !== "text" && (
        <label className="editor-width-control">
          <span className="editor-control-label">
            {activeTool === "eraser" ? "Размер ластика" : "Толщина линии"}:{" "}
            {strokeWidth} px
          </span>
          <input
            type="range"
            min="1"
            max="48"
            value={strokeWidth}
            onChange={(event) =>
              onStrokeWidthChange(Number(event.target.value))
            }
            aria-label={
              activeTool === "eraser" ? "Размер ластика" : "Толщина линии"
            }
            disabled={activeTool === "pan"}
          />
        </label>
      )}

      {activeTool === "text" && (
        <div className="editor-text-controls">
          <label className="editor-width-control">
            <span className="editor-control-label">Размер текста: {fontSize} px</span>
            <input
              type="range"
              min="12"
              max="96"
              value={fontSize}
              onChange={(event) => onFontSizeChange(Number(event.target.value))}
              aria-label="Размер текста"
            />
          </label>
          <button
            type="button"
            className={`editor-tool-button${bold ? " is-active" : ""}`}
            aria-pressed={bold}
            onClick={() => onBoldChange(!bold)}
          >
            <Bold size={18} aria-hidden="true" />
            <span>Жирный</span>
          </button>
        </div>
      )}

      <div className="editor-history-controls" role="group" aria-label="История действий">
        <button
          type="button"
          className="editor-tool-button editor-icon-button"
          onClick={onUndo}
          disabled={!history.canUndo}
          aria-label="Отменить действие"
          title="Отменить действие"
        >
          <Undo2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="editor-tool-button editor-icon-button"
          onClick={onRedo}
          disabled={!history.canRedo}
          aria-label="Повторить действие"
          title="Повторить действие"
        >
          <Redo2 size={18} aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className="editor-tool-button"
        onClick={onDeleteSelected}
        disabled={!hasSelection}
        aria-label="Удалить выбранный объект"
        title="Удалить выбранный объект"
      >
        <Trash2 size={18} aria-hidden="true" />
        <span>Удалить</span>
      </button>

      <div className="editor-zoom-control">
        <span className="editor-control-label">Масштаб: {Math.round(zoom * 100)}%</span>
        <div className="editor-zoom-row">
          <button
            type="button"
            className="editor-tool-button editor-icon-button"
            onClick={() => onZoomChange(Math.max(0.5, Math.round((zoom - 0.1) * 10) / 10))}
            disabled={zoom <= 0.5}
            aria-label="Уменьшить масштаб"
            title="Уменьшить масштаб"
          >
            <ZoomOut size={18} aria-hidden="true" />
          </button>
          <input
            type="range"
            min="50"
            max="300"
            step="10"
            value={Math.round(zoom * 100)}
            onChange={(event) => onZoomChange(Number(event.target.value) / 100)}
            aria-label="Масштаб документа"
          />
          <button
            type="button"
            className="editor-tool-button editor-icon-button"
            onClick={() => onZoomChange(Math.min(3, Math.round((zoom + 0.1) * 10) / 10))}
            disabled={zoom >= 3}
            aria-label="Увеличить масштаб"
            title="Увеличить масштаб"
          >
            <ZoomIn size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <button type="button" className="editor-tool-button" onClick={onReturnToOcr}>
        <FileText size={18} aria-hidden="true" />
        <span>К результатам OCR</span>
      </button>
    </aside>
  );
}
