import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Canvas,
  Circle,
  IText,
  Line,
  Path,
  PencilBrush,
  Rect,
} from "fabric";
import type { CanvasEvents, FabricObject } from "fabric";
import type {
  AnnotationPayload,
  EditorHistoryState,
  EditorTool,
  NoteAnnotations,
} from "./editor.types";

interface EditorCanvasProps {
  imageUrl: string;
  filename: string;
  tool: EditorTool;
  color: string;
  strokeWidth: number;
  fontSize: number;
  bold: boolean;
  zoom: number;
  initialAnnotations: NoteAnnotations | null;
  onAnnotationsChange: (annotations: AnnotationPayload) => void;
  onCanvasReady: () => void;
  onHistoryChange: (history: EditorHistoryState) => void;
  onSelectionChange: (hasSelection: boolean) => void;
  onRestoreError: (message: string) => void;
}

export interface EditorCanvasHandle {
  undo: () => void;
  redo: () => void;
  deleteSelected: () => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface FrameDimensions {
  width: number;
  height: number;
}

interface CanvasLayout {
  width: number;
  height: number;
  imageLeft: number;
  imageTop: number;
  imageWidth: number;
  imageHeight: number;
  viewportTransform: [number, number, number, number, number, number];
}

interface PanOffset {
  x: number;
  y: number;
}

interface Point {
  x: number;
  y: number;
}

type ShapeTool = Extract<EditorTool, "line" | "arrow" | "rectangle" | "circle">;
type FabricEventHandler<Event> = (event: Event) => void;

function getCanvasLayout(
  image: ImageDimensions,
  frame: FrameDimensions,
  zoom: number,
): CanvasLayout {
  const frameWidth = frame.width || image.width;
  const frameHeight = frame.height || image.height;
  const availableWidth = Math.max(1, frameWidth - 48);
  const availableHeight = Math.max(1, frameHeight - 48);
  const imageScale = Math.min(
    1,
    availableWidth / image.width,
    availableHeight / image.height,
  );
  const imageWidth = image.width * imageScale;
  const imageHeight = image.height * imageScale;
  const zoomCompensation = Math.min(zoom, 1);
  const width = frameWidth / zoomCompensation;
  const height = frameHeight / zoomCompensation;
  const imageLeft = (width - imageWidth) / 2;
  const imageTop = (height - imageHeight) / 2;

  return {
    width,
    height,
    imageLeft,
    imageTop,
    imageWidth,
    imageHeight,
    viewportTransform: [
      imageWidth / image.width,
      0,
      0,
      imageHeight / image.height,
      imageLeft,
      imageTop,
    ],
  };
}

function applyCanvasLayout(canvas: Canvas, layout: CanvasLayout): void {
  canvas.setDimensions({ width: layout.width, height: layout.height });
  canvas.setViewportTransform(layout.viewportTransform);
  canvas.calcOffset();
}

interface ShapeDrag {
  pointerId: number;
  start: Point;
  preview: FabricObject;
}

function markerColor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
  if (!hex) return color;

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, 0.35)`;
}

function isShapeTool(tool: EditorTool): tool is ShapeTool {
  return (
    tool === "line" ||
    tool === "arrow" ||
    tool === "rectangle" ||
    tool === "circle"
  );
}

function createShape(
  tool: ShapeTool,
  start: Point,
  end: Point,
  color: string,
  strokeWidth: number,
): FabricObject {
  const options = {
    fill: "rgba(0, 0, 0, 0)",
    stroke: color,
    strokeWidth,
    strokeLineCap: "round" as const,
    strokeLineJoin: "round" as const,
    selectable: false,
    evented: false,
    objectCaching: false,
  };

  if (tool === "line") {
    return new Line([start.x, start.y, end.x, end.y], options);
  }

  if (tool === "arrow") {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.min(28, Math.max(12, strokeWidth * 3));
    const leftHead = {
      x: end.x - headLength * Math.cos(angle - Math.PI / 6),
      y: end.y - headLength * Math.sin(angle - Math.PI / 6),
    };
    const rightHead = {
      x: end.x - headLength * Math.cos(angle + Math.PI / 6),
      y: end.y - headLength * Math.sin(angle + Math.PI / 6),
    };
    const path = [
      `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      `M ${leftHead.x} ${leftHead.y} L ${end.x} ${end.y} L ${rightHead.x} ${rightHead.y}`,
    ].join(" ");
    return new Path(path, { ...options, fill: null });
  }

  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);

  if (tool === "rectangle") {
    return new Rect({ ...options, left, top, width, height });
  }

  const diameter = Math.min(width, height);
  return new Circle({
    ...options,
    left: left + (width - diameter) / 2,
    top: top + (height - diameter) / 2,
    radius: Math.max(1, diameter / 2),
  });
}

const EditorCanvas = forwardRef<EditorCanvasHandle, EditorCanvasProps>(
  function EditorCanvas(
    {
      imageUrl,
      filename,
      tool,
      color,
      strokeWidth,
      fontSize,
      bold,
      zoom,
      initialAnnotations,
      onAnnotationsChange,
      onCanvasReady,
      onHistoryChange,
      onSelectionChange,
      onRestoreError,
    },
    ref,
  ) {
    const frameRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);
    const canvasElementRef = useRef<HTMLCanvasElement>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const activeToolRef = useRef(tool);
    const colorRef = useRef(color);
    const strokeWidthRef = useRef(strokeWidth);
    const fontSizeRef = useRef(fontSize);
    const boldRef = useRef(bold);
    const canvasReadyRef = useRef(false);
    const historyRef = useRef<string[]>([]);
    const historyIndexRef = useRef(0);
    const panRef = useRef<PanOffset>({ x: 0, y: 0 });
    const [dimensions, setDimensions] = useState<ImageDimensions | null>(null);
    const [frameDimensions, setFrameDimensions] = useState<FrameDimensions>({
      width: 0,
      height: 0,
    });
    const [pan, setPan] = useState<PanOffset>({ x: 0, y: 0 });
    const [canvasReady, setCanvasReady] = useState(false);
    const canvasLayout = useMemo(
      () =>
        dimensions
          ? getCanvasLayout(dimensions, frameDimensions, zoom)
          : null,
      [dimensions, frameDimensions, zoom],
    );
    const canvasLayoutRef = useRef<CanvasLayout | null>(canvasLayout);
    canvasLayoutRef.current = canvasLayout;

    const publishHistory = useCallback(() => {
      onHistoryChange({
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1,
      });
    }, [onHistoryChange]);

    const reportAnnotations = useCallback(
      (canvas: Canvas) => {
        if (!dimensions) return;
        onAnnotationsChange({
          width: dimensions.width,
          height: dimensions.height,
          canvas: canvas.toJSON(),
        });
      },
      [dimensions, onAnnotationsChange],
    );

    const pushHistory = useCallback(() => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !canvasReadyRef.current) return;

      const snapshot = JSON.stringify(canvas.toJSON());
      const currentHistory = historyRef.current.slice(
        0,
        historyIndexRef.current + 1,
      );
      if (currentHistory[currentHistory.length - 1] === snapshot) return;

      currentHistory.push(snapshot);
      historyRef.current = currentHistory;
      historyIndexRef.current = currentHistory.length - 1;
      publishHistory();
      reportAnnotations(canvas);
    }, [publishHistory, reportAnnotations]);

    const restoreHistory = useCallback(
      async (nextIndex: number) => {
        const canvas = fabricCanvasRef.current;
        const snapshot = historyRef.current[nextIndex];
        if (!canvas || !canvasReadyRef.current || snapshot === undefined) return;

        historyIndexRef.current = nextIndex;
        await canvas.loadFromJSON(snapshot);
        if (fabricCanvasRef.current !== canvas) return;
        const layout = canvasLayoutRef.current;
        if (layout) applyCanvasLayout(canvas, layout);
        canvas.requestRenderAll();
        publishHistory();
        reportAnnotations(canvas);
      },
      [publishHistory, reportAnnotations],
    );

    const deleteSelected = useCallback(() => {
      const canvas = fabricCanvasRef.current;
      const selected = canvas?.getActiveObjects() ?? [];
      if (!canvas || selected.length === 0) return;

      selected.forEach((object) => {
        if (object instanceof IText && object.isEditing) object.exitEditing();
      });
      canvas.discardActiveObject();
      canvas.remove(...selected);
      canvas.requestRenderAll();
      onSelectionChange(false);
      pushHistory();
    }, [onSelectionChange, pushHistory]);

    useImperativeHandle(
      ref,
      () => ({
        undo: () => {
          if (historyIndexRef.current > 0) {
            void restoreHistory(historyIndexRef.current - 1);
          }
        },
        redo: () => {
          if (historyIndexRef.current < historyRef.current.length - 1) {
            void restoreHistory(historyIndexRef.current + 1);
          }
        },
        deleteSelected,
      }),
      [deleteSelected, restoreHistory],
    );

    useEffect(() => {
      const frame = frameRef.current;
      if (!frame) return;

      const updateFrameDimensions = () => {
        const nextDimensions = {
          width: frame.clientWidth,
          height: frame.clientHeight,
        };
        setFrameDimensions((current) =>
          current.width === nextDimensions.width &&
          current.height === nextDimensions.height
            ? current
            : nextDimensions,
        );
      };

      updateFrameDimensions();
      const resizeObserver = new ResizeObserver(updateFrameDimensions);
      resizeObserver.observe(frame);
      return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
      const canvasElement = canvasElementRef.current;
      if (!canvasElement || !dimensions) return;
      if (
        initialAnnotations &&
        (initialAnnotations.width !== dimensions.width ||
          initialAnnotations.height !== dimensions.height)
      ) {
        onRestoreError(
          "Размер исходного изображения отличается от сохранённых аннотаций. Данные не перезаписаны.",
        );
        return;
      }

      const canvas = new Canvas(canvasElement, {
        width: dimensions.width,
        height: dimensions.height,
        isDrawingMode: false,
        selection: false,
        skipTargetFind: true,
      });
      const initialLayout = canvasLayoutRef.current;
      if (initialLayout) {
        applyCanvasLayout(canvas, initialLayout);
      }
      fabricCanvasRef.current = canvas;
      canvasReadyRef.current = false;

      let frameId: number | null = null;
      const refreshCanvasOffset = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(() => {
          frameId = null;
          if (fabricCanvasRef.current !== canvas) return;
          canvas.calcOffset();
          canvas.requestRenderAll();
        });
      };

      let panStart:
        | {
            pointerId: number;
            clientX: number;
            clientY: number;
            originX: number;
            originY: number;
          }
        | null = null;
      let shapeDrag: ShapeDrag | null = null;
      const upperCanvas = canvas.upperCanvasEl;

      const handlePointerDown = (event: PointerEvent) => {
        if (!canvasReadyRef.current || event.button !== 0) return;

        const activeTool = activeToolRef.current;
        if (activeTool === "pan") {
          event.preventDefault();
          panStart = {
            pointerId: event.pointerId,
            clientX: event.clientX,
            clientY: event.clientY,
            originX: panRef.current.x,
            originY: panRef.current.y,
          };
          upperCanvas.setPointerCapture(event.pointerId);
          return;
        }

        if (activeTool === "text") {
          event.preventDefault();
          const point = canvas.getScenePoint(event);
          const text = new IText("Текст", {
            left: point.x,
            top: point.y,
            fill: colorRef.current,
            fontSize: fontSizeRef.current,
            fontWeight: boldRef.current ? "bold" : "normal",
            fontFamily: "Arial",
            editable: true,
            selectable: true,
            evented: true,
          });
          canvas.add(text);
          canvas.setActiveObject(text);
          text.enterEditing();
          text.selectAll();
          canvas.requestRenderAll();
          pushHistory();
          return;
        }

        if (isShapeTool(activeTool)) {
          event.preventDefault();
          const start = canvas.getScenePoint(event);
          shapeDrag = {
            pointerId: event.pointerId,
            start,
            preview: createShape(
              activeTool,
              start,
              start,
              colorRef.current,
              strokeWidthRef.current,
            ),
          };
          canvas.add(shapeDrag.preview);
          upperCanvas.setPointerCapture(event.pointerId);
        }
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (!canvasReadyRef.current) return;
        if (panStart?.pointerId === event.pointerId) {
          event.preventDefault();
          const nextPan = {
            x: panStart.originX + event.clientX - panStart.clientX,
            y: panStart.originY + event.clientY - panStart.clientY,
          };
          panRef.current = nextPan;
          setPan(nextPan);
          return;
        }

        if (shapeDrag?.pointerId === event.pointerId) {
          event.preventDefault();
          const canvas = fabricCanvasRef.current;
          if (!canvas || !isShapeTool(activeToolRef.current)) return;

          canvas.remove(shapeDrag.preview);
          shapeDrag.preview = createShape(
            activeToolRef.current,
            shapeDrag.start,
            canvas.getScenePoint(event),
            colorRef.current,
            strokeWidthRef.current,
          );
          canvas.add(shapeDrag.preview);
          canvas.requestRenderAll();
        }
      };

      const finishPointerAction = (event: PointerEvent) => {
        if (panStart?.pointerId === event.pointerId) panStart = null;
        if (shapeDrag?.pointerId === event.pointerId) {
          const drag = shapeDrag;
          shapeDrag = null;
          const activeTool = activeToolRef.current;
          const end = canvas.getScenePoint(event);
          const distance = Math.hypot(
            end.x - drag.start.x,
            end.y - drag.start.y,
          );
          if (event.type === "pointercancel" || distance < 2 || !isShapeTool(activeTool)) {
            canvas.remove(drag.preview);
          } else {
            drag.preview.set({ selectable: true, evented: true });
            canvas.setActiveObject(drag.preview);
            canvas.requestRenderAll();
            pushHistory();
          }
        }
        if (upperCanvas.hasPointerCapture(event.pointerId)) {
          upperCanvas.releasePointerCapture(event.pointerId);
        }
      };

      upperCanvas.addEventListener("pointerdown", handlePointerDown);
      upperCanvas.addEventListener("pointermove", handlePointerMove);
      upperCanvas.addEventListener("pointerup", finishPointerAction);
      upperCanvas.addEventListener("pointercancel", finishPointerAction);

      const resizeObserver = new ResizeObserver(refreshCanvasOffset);
      if (frameRef.current) resizeObserver.observe(frameRef.current);
      if (imageRef.current) resizeObserver.observe(imageRef.current);
      window.addEventListener("resize", refreshCanvasOffset);

      const handlePathCreated: FabricEventHandler<
        CanvasEvents["path:created"]
      > = ({ path }) => {
        if (activeToolRef.current === "eraser") {
          path.set({
            globalCompositeOperation: "destination-out",
            stroke: "#000000",
            opacity: 1,
            selectable: false,
            evented: false,
          });
          canvas.requestRenderAll();
        }
        pushHistory();
      };
      const handleObjectModified: FabricEventHandler<
        CanvasEvents["object:modified"]
      > = () => pushHistory();
      const handleTextChanged: FabricEventHandler<
        CanvasEvents["text:changed"]
      > = () => pushHistory();
      const handleSelectionChanged = () => {
        onSelectionChange(canvas.getActiveObjects().length > 0);
      };

      canvas.on("path:created", handlePathCreated);
      canvas.on("object:modified", handleObjectModified);
      canvas.on("text:changed", handleTextChanged);
      canvas.on("selection:created", handleSelectionChanged);
      canvas.on("selection:updated", handleSelectionChanged);
      canvas.on("selection:cleared", handleSelectionChanged);

      const initializeCanvas = async () => {
        try {
          if (initialAnnotations) {
            await canvas.loadFromJSON(initialAnnotations.canvas);
          }
          if (!isActive || fabricCanvasRef.current !== canvas) return;

          const layout = canvasLayoutRef.current;
          if (layout) applyCanvasLayout(canvas, layout);
          historyRef.current = [JSON.stringify(canvas.toJSON())];
          historyIndexRef.current = 0;
          canvas.requestRenderAll();
          publishHistory();
          canvasReadyRef.current = true;
          setCanvasReady(true);
          onSelectionChange(false);
          onCanvasReady();
          refreshCanvasOffset();
        } catch {
          if (isActive) {
            onRestoreError(
              "Не удалось восстановить сохранённые аннотации. Данные не перезаписаны.",
            );
          }
        }
      };
      let isActive = true;
      void initializeCanvas();

      return () => {
        isActive = false;
        resizeObserver.disconnect();
        window.removeEventListener("resize", refreshCanvasOffset);
        upperCanvas.removeEventListener("pointerdown", handlePointerDown);
        upperCanvas.removeEventListener("pointermove", handlePointerMove);
        upperCanvas.removeEventListener("pointerup", finishPointerAction);
        upperCanvas.removeEventListener("pointercancel", finishPointerAction);
        canvas.off("path:created", handlePathCreated);
        canvas.off("object:modified", handleObjectModified);
        canvas.off("text:changed", handleTextChanged);
        canvas.off("selection:created", handleSelectionChanged);
        canvas.off("selection:updated", handleSelectionChanged);
        canvas.off("selection:cleared", handleSelectionChanged);
        if (frameId !== null) cancelAnimationFrame(frameId);
        fabricCanvasRef.current = null;
        canvasReadyRef.current = false;
        historyRef.current = [];
        historyIndexRef.current = 0;
        onHistoryChange({ canUndo: false, canRedo: false });
        onSelectionChange(false);
        void canvas.dispose();
      };
    }, [
      dimensions,
      initialAnnotations,
      onCanvasReady,
      onHistoryChange,
      onRestoreError,
      onSelectionChange,
      publishHistory,
      pushHistory,
    ]);

    useEffect(() => {
      const canvas = fabricCanvasRef.current;
      if (!canvas || !canvasReadyRef.current || !canvasLayout) return;

      applyCanvasLayout(canvas, canvasLayout);
      canvas.requestRenderAll();
    }, [canvasLayout]);

    useEffect(() => {
      const previousTool = activeToolRef.current;
      activeToolRef.current = tool;
      colorRef.current = color;
      strokeWidthRef.current = strokeWidth;
      fontSizeRef.current = fontSize;
      boldRef.current = bold;
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const isDrawing =
        canvasReady &&
        (tool === "pen" || tool === "marker" || tool === "eraser");
      canvas.isDrawingMode = isDrawing;
      canvas.selection = tool === "select";
      canvas.skipTargetFind = tool !== "select";
      if (previousTool !== tool && tool !== "select") {
        const activeObject = canvas.getActiveObject();
        if (activeObject instanceof IText && activeObject.isEditing) {
          activeObject.exitEditing();
        }
        canvas.discardActiveObject();
      }
      canvas.upperCanvasEl.style.cursor =
        tool === "pan"
          ? "grab"
          : tool === "text"
            ? "text"
            : tool === "select"
              ? "default"
              : "crosshair";

      if (isDrawing) {
        const brush = new PencilBrush(canvas);
        brush.color =
          tool === "marker"
            ? markerColor(color)
            : tool === "eraser"
              ? "rgba(255, 255, 255, 0.55)"
              : color;
        brush.width = strokeWidth;
        brush.strokeLineCap = "round";
        brush.strokeLineJoin = "round";
        canvas.freeDrawingBrush = brush;
      }
      canvas.requestRenderAll();
    }, [bold, canvasReady, color, dimensions, fontSize, strokeWidth, tool]);

    useEffect(() => {
      panRef.current = pan;
      const canvas = fabricCanvasRef.current;
      if (!canvas) return;

      const frameId = requestAnimationFrame(() => {
        canvas.calcOffset();
        canvas.requestRenderAll();
      });
      return () => cancelAnimationFrame(frameId);
    }, [zoom, pan]);

    return (
      <div className="editor-page-frame" ref={frameRef}>
        <div
          className={`editor-page editor-page-tool-${tool}`}
          style={{
            ...(canvasLayout
              ? { width: canvasLayout.width, height: canvasLayout.height }
              : {}),
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt={filename}
            draggable={false}
            style={
              canvasLayout
                ? {
                    left: canvasLayout.imageLeft,
                    top: canvasLayout.imageTop,
                    width: canvasLayout.imageWidth,
                    height: canvasLayout.imageHeight,
                    maxWidth: "none",
                    maxHeight: "none",
                  }
                : undefined
            }
            onLoad={(event) => {
              setDimensions({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              });
            }}
          />
          <canvas ref={canvasElementRef} className="editor-drawing-canvas" />
          {!canvasReady && (
            <div className="editor-canvas-loading" role="status">
              Восстанавливаем аннотации…
            </div>
          )}
        </div>
      </div>
    );
  },
);

export default EditorCanvas;
