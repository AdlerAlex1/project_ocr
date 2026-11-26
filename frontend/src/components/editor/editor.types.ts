export interface Note {
  id: number;
  filename: string;
  status: string;
  text: string | null;
  subject?: string;
}

export type EditorTool =
  | "pen"
  | "marker"
  | "eraser"
  | "pan"
  | "select"
  | "text"
  | "line"
  | "arrow"
  | "rectangle"
  | "circle";

export interface EditorHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export interface AnnotationPayload {
  width: number;
  height: number;
  canvas: Record<string, unknown>;
}

export interface NoteAnnotations extends AnnotationPayload {
  updated_at: string;
}
