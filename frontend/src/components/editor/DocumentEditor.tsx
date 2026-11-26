import { useCallback, useEffect, useRef, useState } from "react";
import axios, { type AxiosInstance } from "axios";
import { FileImage, X } from "lucide-react";
import EditorCanvas, { type EditorCanvasHandle } from "./EditorCanvas";
import EditorToolbar from "./EditorToolbar";
import type {
  AnnotationPayload,
  EditorHistoryState,
  EditorTool,
  Note,
  NoteAnnotations,
} from "./editor.types";
import "./editor.css";

interface DocumentEditorProps {
  note: Note;
  api: AxiosInstance;
  onClose: () => void | Promise<void>;
  onEditOcr: () => void | Promise<void>;
}

type SaveStatus = "loading" | "saved" | "pending" | "saving" | "error";

function getResponseDetail(value: unknown): string | null {
  if (typeof value !== "object" || value === null || !("detail" in value)) {
    return null;
  }
  return typeof value.detail === "string" ? value.detail : null;
}

function getRequestError(error: unknown, fallback: string): string {
  return axios.isAxiosError(error)
    ? getResponseDetail(error.response?.data) ?? fallback
    : fallback;
}

async function getLoadError(error: unknown): Promise<string> {
  if (!axios.isAxiosError(error)) {
    return "Не удалось загрузить исходное изображение.";
  }

  let responseData: unknown = error.response?.data;
  if (typeof Blob !== "undefined" && responseData instanceof Blob) {
    try {
      responseData = JSON.parse(await responseData.text()) as unknown;
    } catch {
      responseData = null;
    }
  }

  const detail = getResponseDetail(responseData);
  if (detail) return detail;
  if (error.response?.status === 404) {
    return "Исходное изображение недоступно. У старого конспекта может отсутствовать достоверная привязка к файлу.";
  }
  return "Не удалось загрузить исходное изображение.";
}

const SAVE_DELAY_MS = 1500;

export default function DocumentEditor({
  note,
  api,
  onClose,
  onEditOcr,
}: DocumentEditorProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [annotations, setAnnotations] = useState<NoteAnnotations | null>(null);
  const [annotationsLoaded, setAnnotationsLoaded] = useState(false);
  const [annotationLoadError, setAnnotationLoadError] = useState<string | null>(null);
  const [annotationRestoreError, setAnnotationRestoreError] = useState<string | null>(null);
  const [annotationLoadAttempt, setAnnotationLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [color, setColor] = useState("#111827");
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [fontSize, setFontSize] = useState(24);
  const [bold, setBold] = useState(false);
  const [activeTool, setActiveTool] = useState<EditorTool>("pen");
  const [zoom, setZoom] = useState(1);
  const [hasSelection, setHasSelection] = useState(false);
  const [history, setHistory] = useState<EditorHistoryState>({
    canUndo: false,
    canRedo: false,
  });
  const canvasRef = useRef<EditorCanvasHandle>(null);
  const latestAnnotationsRef = useRef<AnnotationPayload | null>(null);
  const annotationRevisionRef = useRef(0);
  const isDirtyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const isClosingRef = useRef(false);

  const saveAnnotations = useCallback(
    async (payload: AnnotationPayload, revision: number): Promise<boolean> => {
      if (revision === annotationRevisionRef.current) {
        setSaveStatus("saving");
        setSaveError(null);
      }

      const request = saveQueueRef.current.catch(() => undefined).then(async () => {
        await api.put(`/notes/${note.id}/annotations`, payload);
      });
      saveQueueRef.current = request;

      try {
        await request;
        if (revision === annotationRevisionRef.current) {
          isDirtyRef.current = false;
          setSaveStatus("saved");
        }
        return true;
      } catch (error: unknown) {
        if (revision === annotationRevisionRef.current) {
          setSaveError(getRequestError(error, "Не удалось сохранить аннотации."));
          setSaveStatus("error");
        }
        return false;
      }
    },
    [api, note.id],
  );

  const handleAnnotationsChange = useCallback(
    (payload: AnnotationPayload) => {
      latestAnnotationsRef.current = payload;
      annotationRevisionRef.current += 1;
      isDirtyRef.current = true;
      setSaveStatus("pending");
      setSaveError(null);

      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
      const revision = annotationRevisionRef.current;
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void saveAnnotations(payload, revision);
      }, SAVE_DELAY_MS);
    },
    [saveAnnotations],
  );

  const flushAnnotations = useCallback(async (): Promise<boolean> => {
    if (saveTimerRef.current !== null) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    while (isDirtyRef.current) {
      const payload = latestAnnotationsRef.current;
      if (!payload) return false;
      const revision = annotationRevisionRef.current;
      const saved = await saveAnnotations(payload, revision);
      if (!saved) return false;
    }
    return true;
  }, [saveAnnotations]);

  const exitAfterSave = useCallback(
    async (action: () => void | Promise<void>) => {
      if (isClosingRef.current) return;
      isClosingRef.current = true;
      setIsClosing(true);

      const saved = await flushAnnotations();
      if (!saved) {
        isClosingRef.current = false;
        setIsClosing(false);
        return;
      }

      await action();
    },
    [flushAnnotations],
  );

  const handleClose = useCallback(() => {
    void exitAfterSave(onClose);
  }, [exitAfterSave, onClose]);

  const handleEditOcr = useCallback(() => {
    void exitAfterSave(onEditOcr);
  }, [exitAfterSave, onEditOcr]);

  const retrySave = useCallback(() => {
    const payload = latestAnnotationsRef.current;
    if (payload) void saveAnnotations(payload, annotationRevisionRef.current);
  }, [saveAnnotations]);

  const handleHistoryChange = useCallback((nextHistory: EditorHistoryState) => {
    setHistory(nextHistory);
  }, []);

  const handleSelectionChange = useCallback((selected: boolean) => {
    setHasSelection(selected);
  }, []);

  const handleCanvasReady = useCallback(() => {
    if (!isDirtyRef.current) setSaveStatus("saved");
  }, []);

  const handleRestoreError = useCallback((message: string) => {
    setAnnotationRestoreError(message);
  }, []);

  const retryAnnotationLoad = useCallback(() => {
    setAnnotations(null);
    setAnnotationsLoaded(false);
    setAnnotationLoadError(null);
    setAnnotationRestoreError(null);
    setSaveError(null);
    setSaveStatus("loading");
    setAnnotationLoadAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    let isActive = true;
    let objectUrl: string | null = null;

    setFileUrl(null);
    setLoadError(null);
    setIsLoading(true);

    void api
      .get<Blob>(`/notes/${note.id}/file`, { responseType: "blob" })
      .then(({ data }) => {
        const nextUrl = URL.createObjectURL(data);
        if (!isActive) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setFileUrl(nextUrl);
      })
      .catch(async (error: unknown) => {
        const message = await getLoadError(error);
        if (isActive) setLoadError(message);
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [api, note.id]);

  useEffect(() => {
    let isActive = true;
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    latestAnnotationsRef.current = null;
    annotationRevisionRef.current = 0;
    isDirtyRef.current = false;
    isClosingRef.current = false;

    void api
      .get<NoteAnnotations | null>(`/notes/${note.id}/annotations`)
      .then(({ data }) => {
        if (!isActive) return;
        setAnnotations(data);
        setAnnotationsLoaded(true);
      })
      .catch((error: unknown) => {
        if (isActive) {
          setAnnotationLoadError(
            getRequestError(error, "Не удалось загрузить сохранённые аннотации."),
          );
        }
      });

    return () => {
      isActive = false;
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, [api, note.id, annotationLoadAttempt]);

  const saveStatusText = {
    loading: "Загрузка аннотаций…",
    saved: "Сохранено",
    pending: "Ожидает сохранения…",
    saving: "Сохранение…",
    error: "Ошибка сохранения",
  }[saveStatus];
  const headerStatusText = annotationLoadError
    ? "Ошибка загрузки аннотаций"
    : annotationRestoreError
      ? "Ошибка восстановления аннотаций"
      : saveStatusText;

  return (
    <div
      className="document-editor-overlay"
      role="presentation"
      onClick={handleClose}
    >
      <section
        className={`document-editor${isClosing ? " is-closing" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-busy={isClosing}
        aria-label={`Редактор: ${note.filename}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="document-editor-header">
          <div className="document-editor-heading">
            <FileImage size={20} aria-hidden="true" />
            <div className="document-editor-title-wrap">
              <h1 className="document-editor-title">{note.filename}</h1>
              <span className="document-editor-subtitle">Редактор изображения</span>
            </div>
          </div>
          <div className="document-editor-header-actions">
            <span
              className={`editor-save-notice editor-save-${saveStatus}`}
              role="status"
              aria-live="polite"
            >
              {headerStatusText}
            </span>
            {saveStatus === "error" && (
              <button
                type="button"
                className="editor-retry-button"
                onClick={retrySave}
                disabled={isClosing}
              >
                Повторить сохранение
              </button>
            )}
            <button
              type="button"
              className="editor-close-button"
              onClick={handleClose}
              aria-label="Закрыть редактор"
              disabled={isClosing}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="document-editor-layout">
          <EditorToolbar
            activeTool={activeTool}
            color={color}
            strokeWidth={strokeWidth}
            fontSize={fontSize}
            bold={bold}
            zoom={zoom}
            history={history}
            hasSelection={hasSelection}
            hasOcrText={note.text !== null}
            onToolChange={setActiveTool}
            onColorChange={setColor}
            onStrokeWidthChange={setStrokeWidth}
            onFontSizeChange={setFontSize}
            onBoldChange={setBold}
            onZoomChange={setZoom}
            onUndo={() => canvasRef.current?.undo()}
            onRedo={() => canvasRef.current?.redo()}
            onDeleteSelected={() => canvasRef.current?.deleteSelected()}
            onEditOcr={handleEditOcr}
          />

          <main className="document-editor-workspace">
            {isLoading || !annotationsLoaded ? (
              <div className="editor-message" role="status">
                {isLoading ? "Загружаем оригинал…" : "Загружаем аннотации…"}
              </div>
            ) : loadError ? (
              <div className="editor-message editor-message-error" role="alert">
                {loadError}
              </div>
            ) : annotationLoadError ? (
              <div className="editor-message editor-message-error" role="alert">
                <div>
                  <p>{annotationLoadError}</p>
                  <button
                    type="button"
                    className="editor-tool-button"
                    onClick={retryAnnotationLoad}
                  >
                    Повторить загрузку
                  </button>
                </div>
              </div>
            ) : annotationRestoreError ? (
              <div className="editor-message editor-message-error" role="alert">
                {annotationRestoreError}
              </div>
            ) : fileUrl ? (
              <EditorCanvas
                key={fileUrl}
                imageUrl={fileUrl}
                filename={note.filename}
                tool={activeTool}
                color={color}
                strokeWidth={strokeWidth}
                fontSize={fontSize}
                bold={bold}
                zoom={zoom}
                initialAnnotations={annotations}
                onAnnotationsChange={handleAnnotationsChange}
                onCanvasReady={handleCanvasReady}
                onHistoryChange={handleHistoryChange}
                onSelectionChange={handleSelectionChange}
                onRestoreError={handleRestoreError}
                ref={canvasRef}
              />
            ) : (
              <div className="editor-message editor-message-error" role="alert">
                Не удалось загрузить исходное изображение.
              </div>
            )}
          </main>
        </div>
        {saveError && (
          <p className="editor-save-error-message" role="alert">
            {saveError}
          </p>
        )}
      </section>
    </div>
  );
}
