// filepath: resources/js/pages/editor.tsx
import { Head } from '@inertiajs/react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, Pattern, Point, FabricImage, Rect, util, type TFiller, type FabricObject } from 'fabric';
import type { CanvasEvents } from 'fabric';

// Frame metadata type carried in FabricObject.data (Fabric v6 keeps `data: any`)
type FrameData = {
    type: 'frame';
    frameId: string;
    fit: 'cover' | 'contain';
    name: string;
};

// Also bind image metadata to track which frame it belongs to
interface ImageDataMeta { frameOf: string }

// Background metadata attached to background FabricImage
interface BackgroundMeta { type: 'background'; url: string }

type WithImageData<T> = T & { data?: ImageDataMeta };
// For background image only
type WithBackgroundData<T> = T & { data?: BackgroundMeta };

// Helper: set a background image with CSS-like `cover` behavior and center it.
// Fabric 6: backgroundImage is a FabricObject assigned via property (no setBackgroundImage())
async function setBackgroundCover(canvas: Canvas, url: string) {
    // Load image element via Fabric util, then wrap in FabricImage
    const el = await util.loadImage(url);
    const img = new FabricImage(el) as WithBackgroundData<FabricImage>;

    // Compute cover scale to fill 1200x800 while preserving aspect ratio
    const cw = canvas.getWidth();
    const ch = canvas.getHeight();
    const iw = img.width ?? 0;
    const ih = img.height ?? 0;
    if (!iw || !ih) {
        throw new Error('Failed to read image dimensions');
    }
    const scale = Math.max(cw / iw, ch / ih);

    // Configure image transform and anchoring
    img.set({
        originX: 'center',
        originY: 'center',
        left: cw / 2,
        top: ch / 2,
        angle: 0,
        // background image should not be interactive; although not selectable as background,
        // keep flags off for safety if reused elsewhere
        selectable: false,
        evented: false,
        excludeFromExport: false,
    });
    // Attach original source url so we can serialize later
    img.data = { ...(img.data ?? {}), type: 'background', url };

    img.scaleX = scale;
    img.scaleY = scale;

    // Apply as backgroundImage; ensure it follows viewport transform during zoom/pan
    // Fabric 6: use backgroundVpt=true so background scales with zoom
    const c = canvas as Canvas & { backgroundVpt?: boolean };
    c.backgroundVpt = true;
    // Clear any previous background image reference
    canvas.backgroundImage = undefined;
    canvas.backgroundImage = img;
    canvas.requestRenderAll();
}

// Helper: clear background image but keep checkerboard pattern
function clearBackground(canvas: Canvas) {
    canvas.backgroundImage = undefined;
    canvas.requestRenderAll();
}

// Try to resolve a serializable URL for current background image
function getCanvasBackgroundUrl(canvas: Canvas): string | null {
    const bg = canvas.backgroundImage as unknown as FabricImage | undefined;
    if (!bg) return null;
    // Prefer custom data.url we attach in setBackgroundCover
    const withData = bg as unknown as WithBackgroundData<FabricImage>;
    const metaUrl = withData.data?.url;
    if (typeof metaUrl === 'string' && metaUrl.length > 0) return metaUrl;
    // Fall back to FabricImage element or src fields
    try {
        const hasGet = typeof (bg as FabricImage).getElement === 'function';
        const el = hasGet ? (bg as FabricImage).getElement() : null;
        const src = (el && 'currentSrc' in el ? (el as HTMLImageElement).currentSrc : undefined)
            || (el && 'src' in el ? (el as HTMLImageElement).src : undefined)
            || (bg as unknown as { src?: string }).src;
        return typeof src === 'string' ? src : null;
    } catch {
        return null;
    }
}

// Small util: v4+ browsers expose crypto.randomUUID; fallback keeps collisions unlikely
function newId() {
    const g = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto?.randomUUID?.();
    return g ?? `f-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Helpers to read/write frame data without using `any`
type WithFrameData<T> = T & { data?: FrameData };
function setRectData(rect: Rect, data: FrameData) {
    (rect as WithFrameData<Rect>).data = data;
}
function getRectData(rect: Rect): FrameData | undefined {
    const d = (rect as WithFrameData<Rect>).data;
    return d && d.type === 'frame' ? d : undefined;
}
function getObjectFrameData(obj: FabricObject | undefined | null): FrameData | undefined {
    if (!obj) return undefined;
    const d = (obj as WithFrameData<FabricObject>).data;
    return d && d.type === 'frame' ? d : undefined;
}

// Snap helpers for a Fabric object (v6). We snap left/top and scaled width/height to grid.
const GRID = 20;
function snapToGrid(rect: Rect) {
    const grid = GRID;
    const left = rect.left ?? 0;
    const top = rect.top ?? 0;
    const baseW = rect.width ?? 0;
    const baseH = rect.height ?? 0;
    const scaledW = rect.getScaledWidth();
    const scaledH = rect.getScaledHeight();

    const snappedLeft = Math.round(left / grid) * grid;
    const snappedTop = Math.round(top / grid) * grid;
    const snappedW = Math.max(grid, Math.round(scaledW / grid) * grid);
    const snappedH = Math.max(grid, Math.round(scaledH / grid) * grid);

    // Convert snapped scaled size back to scale factors against base width/height.
    // In Fabric v6, rect.width/height are unscaled object sizes.
    const nextScaleX = baseW ? snappedW / baseW : rect.scaleX ?? 1;
    const nextScaleY = baseH ? snappedH / baseH : rect.scaleY ?? 1;

    rect.set({ left: snappedLeft, top: snappedTop, scaleX: nextScaleX, scaleY: nextScaleY });
    rect.setCoords(); // keep controls aligned (Fabric 6)
}

// Helper: list images linked to a frame
function getImagesForFrame(canvas: Canvas | null, frameId: string): FabricImage[] {
    if (!canvas) return [];
    return canvas
        .getObjects()
        .filter((o): o is FabricImage => o instanceof FabricImage && (o as WithImageData<FabricImage>).data?.frameOf === frameId);
}

// Compute scale and placement for image to fit a frame (cover/contain)
function fitImageToFrame(img: FabricImage, frame: Rect, fit: 'cover' | 'contain') {
    const fW = frame.getScaledWidth();
    const fH = frame.getScaledHeight();
    const iW = img.width ?? 0;
    const iH = img.height ?? 0;
    if (!iW || !iH) return;
    const sx = fW / iW;
    const sy = fH / iH;
    const scale = fit === 'cover' ? Math.max(sx, sy) : Math.min(sx, sy);
    img.scaleX = scale;
    img.scaleY = scale;
    // center the image over the frame
    const left = (frame.left ?? 0) + fW / 2;
    const top = (frame.top ?? 0) + fH / 2;
    img.set({ originX: 'center', originY: 'center', left, top });
    img.setCoords();
}

// Ensure image has a clipPath aligned to the frame rect (absolute positioning, follows frame)
function ensureImageClip(img: FabricImage, frame: Rect) {
    const fW = frame.getScaledWidth();
    const fH = frame.getScaledHeight();
    // Avoid instanceof checks against clipPath; inspect type field instead
    const existingClip = img.clipPath as unknown as FabricObject | undefined;
    const clip = existingClip && existingClip.type === 'rect' ? (existingClip as unknown as Rect) : new Rect();
    clip.set({
        left: frame.left ?? 0,
        top: frame.top ?? 0,
        width: fW,
        height: fH,
        rx: frame.rx ?? 0,
        ry: frame.ry ?? 0,
        absolutePositioned: true,
        originX: 'left',
        originY: 'top',
    });
    img.clipPath = clip;
    img.setCoords();
}

export default function EditorPage() {
    // Fabric canvas refs
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const fabricMountRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const frameFileInputRef = useRef<HTMLInputElement | null>(null);

    // Drag-and-drop state for canvas container
    const canvasContainerRef = useRef<HTMLDivElement | null>(null);
    const dragCounterRef = useRef(0);
    const [dragActive, setDragActive] = useState(false);

    // Panel state reflecting currently selected frame
    const [activeFrame, setActiveFrame] = useState<Rect | null>(null);
    const [nameField, setNameField] = useState<string>('');
    const [fitField, setFitField] = useState<'cover' | 'contain'>('cover');
    const [xField, setXField] = useState<string>('');
    const [yField, setYField] = useState<string>('');
    const [wField, setWField] = useState<string>('');
    const [hField, setHField] = useState<string>('');

    // Export state: last export URL, loading, and a tiny toast flag
    const [exportUrl, setExportUrl] = useState<string | null>(null);
    const [exporting, setExporting] = useState<boolean>(false);
    const [showToast, setShowToast] = useState<boolean>(false);
    // New: Save/Load UX state
    const [saveBusy, setSaveBusy] = useState(false);
    const [loadBusy, setLoadBusy] = useState(false);
    const [lastSavedId, setLastSavedId] = useState<number | null>(null);
    const [infoToast, setInfoToast] = useState<string | null>(null);
    // New: export options
    const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');
    const [jpegQuality, setJpegQuality] = useState<number>(90); // 60–95

    // Update all images for a frame (re-clip and optionally re-fit)
    const updateImagesForFrame = useCallback((frame: Rect, opts?: { refit?: boolean }) => {
        const d = getRectData(frame);
        if (!d) return;
        const canvas = fabricCanvasRef.current;
        const images = getImagesForFrame(canvas, d.frameId);
        for (const img of images) {
            ensureImageClip(img, frame);
            if (opts?.refit) {
                fitImageToFrame(img, frame, d.fit);
            } else {
                const fW = frame.getScaledWidth();
                const fH = frame.getScaledHeight();
                img.set({ left: (frame.left ?? 0) + fW / 2, top: (frame.top ?? 0) + fH / 2 });
                img.setCoords();
            }
        }
        canvas?.requestRenderAll();
    }, []);

    // Zoom helpers (Fabric 6): use zoomToPoint for centered zoom
    const zoomBy = useCallback((factor: number) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        let next = canvas.getZoom() * factor;
        // Clamp zoom to sane bounds
        next = Math.max(0.1, Math.min(10, next));
        const center = new Point(canvas.getWidth() / 2, canvas.getHeight() / 2);
        canvas.zoomToPoint(center, next);
        canvas.requestRenderAll();
    }, []);

    const zoomIn = useCallback(() => zoomBy(1.1), [zoomBy]);
    const zoomOut = useCallback(() => zoomBy(1 / 1.1), [zoomBy]);

    const resetView = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        // Fabric 6: reset viewport transform and zoom to defaults
        canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        canvas.setZoom(1);
        canvas.requestRenderAll();
    }, []);

    // Helper: enumerate frames on canvas
    const getFrames = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return [] as Rect[];
        return canvas.getObjects().filter((o): o is Rect => getObjectFrameData(o) !== undefined);
    }, []);

    // Derive a reasonable export name (first frame name if present)
    const getExportName = useCallback(() => {
        // New behavior: explicit timestamped photobooth name with correct extension per requirements
        const ts = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
        const ext = exportFormat === 'jpeg' ? 'jpg' : 'png';
        return `photobooth-${stamp}.${ext}`;
    }, [exportFormat]);

    // Perform export: hide grid/controls, capture PNG/JPEG, POST to API, restore UI
    const onExportPng = useCallback(async () => {
        const canvas = fabricCanvasRef.current;
        if (!canvas || exporting) return;
        setExporting(true);

        // Save previous background filler (grid) and selection
        const prevBg = (canvas.backgroundColor ?? 'transparent') as unknown as TFiller | string;
        const prevActive = canvas.getActiveObject();

        try {
            if (prevActive) {
                canvas.discardActiveObject();
            }

            // Hide the grid by making background transparent
            canvas.backgroundColor = 'transparent' as unknown as TFiller;
            canvas.renderAll();

            // Capture with selected format and quality. Fabric 6 toDataURL docs:
            // https://fabricjs.com/docs/fabric.Canvas.html#toDataURL
            const fmt = exportFormat === 'jpeg' ? 'jpeg' : 'png';
            const q = fmt === 'jpeg' ? Math.max(0.6, Math.min(0.95, jpegQuality / 100)) : 1;
            const dataUrl = canvas.toDataURL({ format: fmt, quality: q, multiplier: 1 });

            // POST to backend export endpoint
            const name = getExportName();
            const res = await fetch('/api/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
                body: JSON.stringify({ dataUrl, name }),
            });

            if (!res.ok) {
                const text = await res.text();
                console.error('Export failed', res.status, text);
                alert('Export failed. Please try again.');
                return;
            }

            const payload = (await res.json()) as { url?: string };
            if (!payload.url) {
                alert('Export failed. Invalid server response.');
                return;
            }

            setExportUrl(payload.url);
            setShowToast(true);
            window.setTimeout(() => setShowToast(false), 2500);
        } catch (err) {
            console.error(err);
            alert('Unexpected error during export.');
        } finally {
            canvas.backgroundColor = prevBg as unknown as TFiller;
            if (prevActive) {
                canvas.setActiveObject(prevActive);
            }
            canvas.requestRenderAll();
            setExporting(false);
        }
    }, [exporting, exportFormat, jpegQuality, getExportName]);

    // Background button -> open file picker
    const onPickBackground = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    // Upload selected file and set as background cover
    const onFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Reset the input so selecting the same file again triggers change
        e.target.value = '';
        if (!file) return;
        try {
            const form = new FormData();
            // Laravel 12 UploadController expects field name 'image'
            form.append('image', file);
            const res = await fetch('/api/upload', { method: 'POST', body: form });
            if (!res.ok) {
                console.error('Upload failed', res.status, res.statusText);
                alert('Upload failed. Please try another file.');
                return;
            }
            const data = (await res.json()) as { url?: string };
            if (!data.url) {
                console.error('Invalid upload response payload');
                alert('Upload failed. Invalid server response.');
                return;
            }
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            await setBackgroundCover(canvas, data.url);
        } catch (err) {
            // Minimal UX; production could use a toast
            console.error(err);
            alert('Failed to set background image. Please try another file.');
        }
    }, []);

    // Create and add a new frame Rect with metadata
    const onAddFrame = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const frames = canvas.getObjects().filter((o): o is Rect => getObjectFrameData(o) !== undefined);
        const n = frames.length + 1;
        const id = newId();

        // Default size 400x300 centered-ish; snap to grid
        const width = 400;
        const height = 300;
        const left = Math.round((canvas.getWidth() / 2 - width / 2) / GRID) * GRID;
        const top = Math.round((canvas.getHeight() / 2 - height / 2) / GRID) * GRID;

        const rect = new Rect({
            left,
            top,
            width,
            height,
            fill: 'rgba(59,130,246,0.12)',
            stroke: '#3b82f6',
            strokeWidth: 2,
            strokeDashArray: [6, 6],
            strokeUniform: true,
            rx: 4,
            ry: 4,
            hasRotatingPoint: false,
            lockRotation: true,
            selectable: true,
            evented: true,
            cornerStyle: 'circle',
            transparentCorners: false,
        });
        setRectData(rect, { type: 'frame', frameId: id, fit: 'cover', name: `Frame ${n}` });

        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.requestRenderAll();

        // Update panel immediately
        setActiveFrame(rect);
        const scaledW = rect.getScaledWidth();
        const scaledH = rect.getScaledHeight();
        const newData = getRectData(rect);
        setNameField(newData?.name ?? '');
        setFitField(newData?.fit ?? 'cover');
        setXField(String(Math.round(rect.left ?? 0)));
        setYField(String(Math.round(rect.top ?? 0)));
        setWField(String(Math.round(scaledW)));
        setHField(String(Math.round(scaledH)));
    }, []);


    // Keep panel fields in sync with a given rect
    const syncPanelFromRect = useCallback((rect: Rect | null) => {
        if (!rect) {
            setActiveFrame(null);
            setNameField('');
            setFitField('cover');
            setXField('');
            setYField('');
            setWField('');
            setHField('');
            return;
        }
        setActiveFrame(rect);
        const data = getRectData(rect);
        const scaledW = rect.getScaledWidth();
        const scaledH = rect.getScaledHeight();
        setNameField(data?.name ?? '');
        setFitField(data?.fit ?? 'cover');
        setXField(String(Math.round(rect.left ?? 0)));
        setYField(String(Math.round(rect.top ?? 0)));
        setWField(String(Math.round(scaledW)));
        setHField(String(Math.round(scaledH)));
    }, []);

    // Commit numeric change helpers
    const commitPosition = useCallback((nextX?: number, nextY?: number) => {
        const rect = activeFrame;
        if (!rect) return;
        const left = Number.isFinite(nextX as number) ? (nextX as number) : rect.left ?? 0;
        const top = Number.isFinite(nextY as number) ? (nextY as number) : rect.top ?? 0;
        rect.set({ left, top });
        rect.setCoords();
        updateImagesForFrame(rect, { refit: false });
        fabricCanvasRef.current?.requestRenderAll();
    }, [activeFrame, updateImagesForFrame]);

    const commitSize = useCallback((nextW?: number, nextH?: number) => {
        const rect = activeFrame;
        if (!rect) return;
        const baseW = rect.width ?? 0;
        const baseH = rect.height ?? 0;
        let scaledW = rect.getScaledWidth();
        let scaledH = rect.getScaledHeight();
        if (Number.isFinite(nextW as number)) scaledW = Math.max(1, nextW as number);
        if (Number.isFinite(nextH as number)) scaledH = Math.max(1, nextH as number);
        const scaleX = baseW ? scaledW / baseW : rect.scaleX ?? 1;
        const scaleY = baseH ? scaledH / baseH : rect.scaleY ?? 1;
        rect.set({ scaleX, scaleY });
        rect.setCoords();
        updateImagesForFrame(rect, { refit: true });
        fabricCanvasRef.current?.requestRenderAll();
    }, [activeFrame, updateImagesForFrame]);

    // Selection and transforms wiring
    useEffect(() => {
        const mount = fabricMountRef.current;
        if (!mount) return;

        // Create a canvas element imperatively to avoid React reconciliation issues
        const el = document.createElement('canvas');
        // Append before Fabric wraps it; Fabric will insert its own wrapper around this element
        mount.appendChild(el);

        // Initialize Fabric 6 canvas
        const canvas = new Canvas(el, {
            width: 1200,
            height: 800,
            preserveObjectStacking: true,
            // keep background transparent; grid pattern applied below
            backgroundColor: 'transparent',
        });
        fabricCanvasRef.current = canvas;

        // Draw a faint 20px grid as a repeating background pattern
        const grid = GRID;
        const patternCanvas = document.createElement('canvas');
        patternCanvas.width = grid;
        patternCanvas.height = grid;
        const pctx = patternCanvas.getContext('2d');
        if (pctx) {
            pctx.clearRect(0, 0, grid, grid);
            pctx.strokeStyle = 'rgba(0,0,0,0.08)'; // subtle grid
            pctx.lineWidth = 1;
            // top and left lines to create tileable grid
            pctx.beginPath();
            pctx.moveTo(0, 0);
            pctx.lineTo(grid, 0);
            pctx.moveTo(0, 0);
            pctx.lineTo(0, grid);
            pctx.stroke();
            const pattern = new Pattern({ source: patternCanvas, repeat: 'repeat' });
            // Fabric 6: backgroundColor accepts TFiller; assign Pattern
            canvas.backgroundColor = pattern as unknown as TFiller;
            canvas.requestRenderAll();
        }

        // Selection listeners (Fabric v5/6): selection:created/updated/cleared
        const onSelectionChange = () => {
            const obj = canvas.getActiveObject();
            if (getObjectFrameData(obj)) {
                syncPanelFromRect(obj as Rect);
            } else {
                syncPanelFromRect(null);
            }
        };
        canvas.on('selection:created', onSelectionChange);
        canvas.on('selection:updated', onSelectionChange);
        canvas.on('selection:cleared', onSelectionChange);

        // Live update panel when moving/scaling the active frame
        const onObjectMoving = (e: CanvasEvents['object:moving']) => {
            const t = e?.target as Rect;
            if (!t || !getRectData(t)) return;
            setXField(String(Math.round(t.left ?? 0)));
            setYField(String(Math.round(t.top ?? 0)));
            setWField(String(Math.round(t.getScaledWidth())));
            setHField(String(Math.round(t.getScaledHeight())));
            updateImagesForFrame(t, { refit: false });
        };
        const onObjectScaling = (e: CanvasEvents['object:scaling']) => {
            const t = e?.target as Rect;
            if (!t || !getRectData(t)) return;
            setXField(String(Math.round(t.left ?? 0)));
            setYField(String(Math.round(t.top ?? 0)));
            setWField(String(Math.round(t.getScaledWidth())));
            setHField(String(Math.round(t.getScaledHeight())));
            updateImagesForFrame(t, { refit: true });
        };
        canvas.on('object:moving', onObjectMoving);
        canvas.on('object:scaling', onObjectScaling);

        // Snap on modify end
        const onModified = (e: CanvasEvents['object:modified']) => {
            const t = e?.target as Rect;
            if (!t || !getRectData(t)) return;
            snapToGrid(t);
            canvas.requestRenderAll();
            // After snap, re-sync & refit
            syncPanelFromRect(t);
            updateImagesForFrame(t, { refit: true });
        };
        canvas.on('object:modified', onModified);

        // Keyboard handlers: zoom and Delete to remove selected frame
        const onKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            // Do not hijack when typing into inputs/textareas/contenteditable
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            if (e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') {
                e.preventDefault();
                zoomIn();
            } else if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') {
                e.preventDefault();
                zoomOut();
            } else if (e.key === 'Delete') {
                const obj = canvas.getActiveObject();
                if (obj && getObjectFrameData(obj)) {
                    canvas.remove(obj);
                    canvas.discardActiveObject();
                    canvas.requestRenderAll();
                    syncPanelFromRect(null);
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);

        return () => {
            canvas.off('selection:created', onSelectionChange);
            canvas.off('selection:updated', onSelectionChange);
            canvas.off('selection:cleared', onSelectionChange);
            canvas.off('object:moving', onObjectMoving);
            canvas.off('object:scaling', onObjectScaling);
            canvas.off('object:modified', onModified);
            window.removeEventListener('keydown', onKeyDown);
            // Fabric 6 cleanup: dispose releases events, DOM refs, and internal state
            canvas.dispose();
            fabricCanvasRef.current = null;
            // Clear mount content to remove wrapper/canvases left by Fabric
            try { if (mount.contains(el)) mount.removeChild(el); } catch { /* ignore DOM cleanup errors */ }
            mount.innerHTML = '';
        };

    }, [syncPanelFromRect, zoomIn, zoomOut, updateImagesForFrame]);

    // Toolbar: trigger upload-to-frame
    const onPickUploadToFrame = useCallback(() => {
        if (!activeFrame || !getObjectFrameData(activeFrame)) {
            alert('Please select a frame first.');
            return;
        }
        frameFileInputRef.current?.click();
    }, [activeFrame]);

    // Helper to upload a File and insert into the currently active frame
    const uploadFileToActiveFrame = useCallback(async (file: File) => {
        const frame = activeFrame;
        const d = frame && getRectData(frame);
        if (!frame || !d) {
            // Use app toast instead of blocking alert
            setInfoToast('Please select a frame first.');
            window.setTimeout(() => setInfoToast(null), 2500);
            return;
        }
        try {
            const form = new FormData();
            form.append('image', file);
            // React drag & drop uses DataTransfer API; upload via Fetch to Laravel route
            // Docs: https://developer.mozilla.org/docs/Web/API/HTML_Drag_and_Drop_API
            const res = await fetch('/api/upload', { method: 'POST', body: form });
            if (!res.ok) {
                console.error('Upload failed', res.status, res.statusText);
                alert('Upload failed. Please try another file.');
                return;
            }
            const data = (await res.json()) as { url?: string };
            if (!data.url) {
                console.error('Invalid upload response payload');
                alert('Upload failed. Invalid server response.');
                return;
            }
            const el = await util.loadImage(data.url);
            const img = new FabricImage(el);
            img.set({ selectable: false, evented: false });
            (img as WithImageData<FabricImage>).data = { frameOf: d.frameId };
            fitImageToFrame(img, frame, d.fit);
            ensureImageClip(img, frame); // Fabric clipPath: https://fabricjs.com/docs/fabric.Object.html#clipPath (v6)
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            canvas.add(img);
            // Keep frame above image
            canvas.remove(frame);
            canvas.add(frame);
            canvas.requestRenderAll();
        } catch (err) {
            console.error(err);
            alert('Failed to upload image to frame.');
        }
    }, [activeFrame, setInfoToast]);

    // Handle image selection for frame upload
    const onFrameFileSelected = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        await uploadFileToActiveFrame(file);
    }, [uploadFileToActiveFrame]);

    // Drag-and-drop handlers on the canvas container
    const onDragEnterContainer = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current += 1;
        const types = Array.from(e.dataTransfer?.types ?? []);
        const hasFiles = types.includes('Files') || types.includes('public.file-url') || types.includes('text/uri-list');
        if (hasFiles) setDragActive(true);
    }, []);

    const onDragOverContainer = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault(); // Required to allow drop
        e.stopPropagation();
        const types = Array.from(e.dataTransfer?.types ?? []);
        const hasFiles = types.includes('Files') || types.includes('public.file-url') || types.includes('text/uri-list');
        if (hasFiles) {
            setDragActive(true);
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        }
    }, []);

    const onDragLeaveContainer = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) setDragActive(false);
    }, []);

    const onDropContainer = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current = 0;
        setDragActive(false);
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        const file = files[0]; // Process only the first file
        if (!file) return;
        if (!file.type || !file.type.startsWith('image/')) {
            // ignore non-image
            return;
        }
        await uploadFileToActiveFrame(file);
    }, [uploadFileToActiveFrame]);

    // Panel change handlers
    const onChangeName = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setNameField(e.target.value);
        const rect = activeFrame;
        if (!rect) return;
        const d = getRectData(rect);
        if (!d) return;
        setRectData(rect, { ...d, name: e.target.value });
    }, [activeFrame]);

    const onChangeFit = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value === 'contain' ? 'contain' : 'cover';
        setFitField(value);
        const rect = activeFrame;
        if (!rect) return;
        const d = getRectData(rect);
        if (!d) return;
        setRectData(rect, { ...d, fit: value });
        // Refit any linked images when fit mode changes
        updateImagesForFrame(rect, { refit: true });
    }, [activeFrame, updateImagesForFrame]);

    const onChangeX = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setXField(v);
        const n = Number(v);
        if (!Number.isNaN(n)) commitPosition(n, undefined);
    }, [commitPosition]);

    const onChangeY = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setYField(v);
        const n = Number(v);
        if (!Number.isNaN(n)) commitPosition(undefined, n);
    }, [commitPosition]);

    const onChangeW = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setWField(v);
        const n = Number(v);
        if (!Number.isNaN(n)) commitSize(n, undefined);
    }, [commitSize]);

    const onChangeH = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setHField(v);
        const n = Number(v);
        if (!Number.isNaN(n)) commitSize(undefined, n);
    }, [commitSize]);

    // Template serialization: minimal v1 format
    type TemplateV1 = {
        version: 1;
        canvas: { width: number; height: number };
        background_url: string | null;
        frames: Array<{ id: string; x: number; y: number; w: number; h: number; fit: 'cover' | 'contain'; name: string }>;
    };

    const serializeTemplate = useCallback((): TemplateV1 | null => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return null;
        const frames = getFrames();
        // Determine background url if any (we store URL returned by /api/upload)
        const bgUrl = getCanvasBackgroundUrl(canvas);
        return {
            version: 1,
            canvas: { width: canvas.getWidth(), height: canvas.getHeight() },
            background_url: bgUrl ?? null,
            frames: frames.map((r) => {
                const d = getRectData(r)!;
                return {
                    id: d.frameId,
                    x: Math.round(r.left ?? 0),
                    y: Math.round(r.top ?? 0),
                    w: Math.round(r.getScaledWidth()),
                    h: Math.round(r.getScaledHeight()),
                    fit: d.fit,
                    name: d.name,
                };
            }),
        };
    }, [getFrames]);

    // Helpers to clear objects
    const clearImages = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const prev = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;
        canvas.getObjects().forEach((o) => { if (o instanceof FabricImage) canvas.remove(o); });
        canvas.renderOnAddRemove = prev;
        canvas.requestRenderAll();
    }, []);

    const clearAllObjects = useCallback(() => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        const prev = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;
        canvas.getObjects().forEach((o) => canvas.remove(o));
        canvas.renderOnAddRemove = prev;
        canvas.requestRenderAll();
        syncPanelFromRect(null);
    }, [syncPanelFromRect]);

    // Rebuild from template JSON or server DB payload
    const rebuildFromTemplate = useCallback((tpl: unknown) => {
        const canvas = fabricCanvasRef.current;
        if (!canvas) return;
        type DbShape = { data: { canvas_width: number; canvas_height: number; elements: unknown } };
        type ElementsObj = { frames?: unknown; background_url?: unknown; canvas?: unknown };
        let t: TemplateV1 | null = null;
        if (typeof tpl === 'object' && tpl !== null) {
            const o = tpl as Record<string, unknown>;
            if ('version' in o && typeof (o as Record<string, unknown>).version === 'number') {
                const v = o as { version: number; canvas?: { width?: unknown; height?: unknown }; background_url?: unknown; frames?: unknown };
                if (v.version === 1) {
                    const cw = Number(v.canvas?.width);
                    const ch = Number(v.canvas?.height);
                    t = {
                        version: 1,
                        canvas: { width: Number.isFinite(cw) ? cw : 1200, height: Number.isFinite(ch) ? ch : 800 },
                        background_url: typeof v.background_url === 'string' ? v.background_url : null,
                        frames: Array.isArray(v.frames) ? (v.frames as TemplateV1['frames']) : [],
                    };
                }
            } else if ('data' in o && typeof o.data === 'object' && o.data !== null) {
                const db = o as unknown as DbShape;
                // Backward compat: elements may be array (frames only) or object with frames/background_url
                const el = db.data.elements;
                if (Array.isArray(el)) {
                    t = { version: 1, canvas: { width: db.data.canvas_width, height: db.data.canvas_height }, background_url: null, frames: el as TemplateV1['frames'] };
                } else if (el && typeof el === 'object') {
                    const eo = el as ElementsObj;
                    const frames = Array.isArray(eo.frames) ? (eo.frames as TemplateV1['frames']) : [];
                    const bg = typeof eo.background_url === 'string' ? eo.background_url : null;
                    const c = (eo.canvas && typeof eo.canvas === 'object') ? (eo.canvas as { width?: unknown; height?: unknown }) : {};
                    const cw = Number(c.width);
                    const ch = Number(c.height);
                    t = { version: 1, canvas: { width: Number.isFinite(cw) ? cw : db.data.canvas_width, height: Number.isFinite(ch) ? ch : db.data.canvas_height }, background_url: bg, frames };
                }
            }
        }
        if (!t) { alert('Unsupported template format.'); return; }
        // Resize canvas
        canvas.setDimensions({ width: t.canvas.width, height: t.canvas.height });
        // Clear objects and background first
        clearAllObjects();
        clearBackground(canvas);
        // Restore background if available; log and ignore if it fails to load
        if (t.background_url) {
            setBackgroundCover(canvas, t.background_url).catch((err) => {
                // Fail gracefully on 404 or load errors
                console.warn('Background image failed to load; proceeding without it', err);
                clearBackground(canvas);
            });
        }
        for (const f of t.frames) {
            const rect = new Rect({
                left: f.x, top: f.y, width: f.w, height: f.h,
                fill: 'rgba(59,130,246,0.12)', stroke: '#3b82f6', strokeWidth: 2,
                strokeDashArray: [6,6], strokeUniform: true, rx: 4, ry: 4,
                hasRotatingPoint: false, lockRotation: true, selectable: true, evented: true,
                cornerStyle: 'circle', transparentCorners: false,
            });
            setRectData(rect, { type: 'frame', frameId: f.id, fit: f.fit, name: f.name });
            canvas.add(rect);
        }
        canvas.requestRenderAll();
    }, [clearAllObjects]);

    // Save and Load handlers
    const onSaveTemplate = useCallback(async () => {
        if (saveBusy) return;
        const payload = serializeTemplate();
        if (!payload) return;
        setSaveBusy(true);
        try {
            const res = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
            if (!res.ok) { console.error('Save failed', res.status); alert('Save failed.'); return; }
            const json = await res.json();
            const id = (json?.data?.id as number | undefined) ?? null;
            setLastSavedId(id);
            setInfoToast(id ? `Template saved (id ${id})` : 'Template saved');
            window.setTimeout(() => setInfoToast(null), 2500);
        } catch (e) { console.error(e); alert('Unexpected error while saving template.'); }
        finally { setSaveBusy(false); }
    }, [saveBusy, serializeTemplate]);

    const onLoadTemplate = useCallback(async () => {
        if (loadBusy) return;
        const idStr = window.prompt('Enter template ID to load'+(lastSavedId ? ` (last saved: ${lastSavedId})` : '')+':');
        if (!idStr) return;
        const id = Number(idStr); if (!Number.isFinite(id)) { alert('Invalid template id.'); return; }
        setLoadBusy(true);
        try {
            const res = await fetch(`/api/templates/${id}`, { headers: { Accept: 'application/json' } });
            if (!res.ok) { alert('Template not found or server error.'); return; }
            clearImages();
            const json = await res.json();
            rebuildFromTemplate(json);
            setInfoToast('Template loaded (images cleared)');
            window.setTimeout(() => setInfoToast(null), 2500);
        } catch (e) { console.error(e); alert('Unexpected error while loading template.'); }
        finally { setLoadBusy(false); }
    }, [clearImages, lastSavedId, loadBusy, rebuildFromTemplate]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Head title="Editor" />

            {/* Top toolbar */}
            <header className="border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 p-3">
                    {/* Toolbar wired: Background, Add Frame */}
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={onPickBackground} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Background
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={onFileSelected}
                        />
                        <button type="button" onClick={onAddFrame} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Add Frame
                        </button>
                        <button type="button" onClick={resetView} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Reset View
                        </button>
                        <button type="button" onClick={onPickUploadToFrame} className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Upload to Frame
                        </button>
                        <input
                            ref={frameFileInputRef}
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={onFrameFileSelected}
                        />
                        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

                        {/* Export options */}
                        <label className="text-sm">Format</label>
                        <select
                            value={exportFormat}
                            onChange={(e) => setExportFormat(e.target.value === 'jpeg' ? 'jpeg' : 'png')}
                            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                        >
                            <option value="png">PNG</option>
                            <option value="jpeg">JPEG</option>
                        </select>
                        {exportFormat === 'jpeg' && (
                            <div className="flex items-center gap-2">
                                <label className="text-sm">Quality</label>
                                <input
                                    type="range"
                                    min={60}
                                    max={95}
                                    step={1}
                                    value={jpegQuality}
                                    onChange={(e) => setJpegQuality(Number(e.target.value))}
                                />
                                <span className="w-10 text-right text-xs tabular-nums">{jpegQuality}</span>
                            </div>
                        )}

                        <button
                            type="button"
                            onClick={onExportPng}
                            disabled={exporting}
                            className="rounded-md border border-border bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
                            title={exportFormat === 'jpeg' ? `Export JPEG (${jpegQuality})` : 'Export PNG'}
                        >
                            {exporting ? 'Exporting…' : exportFormat === 'jpeg' ? `Export JPEG (${jpegQuality})` : 'Export PNG'}
                        </button>
                        <button
                            type="button"
                            onClick={onSaveTemplate}
                            disabled={saveBusy}
                            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                            title="Save Template"
                        >
                            {saveBusy ? 'Saving…' : 'Save Template'}
                        </button>
                        <button
                            type="button"
                            onClick={onLoadTemplate}
                            disabled={loadBusy}
                            className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                            title="Load Template"
                        >
                            {loadBusy ? 'Loading…' : 'Load Template'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Toasts */}
            {showToast && (
                <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center">
                    <div className="pointer-events-auto rounded-md border border-border bg-emerald-600/95 px-3 py-2 text-sm font-medium text-white shadow">
                        Export success
                    </div>
                </div>
            )}
            {infoToast && (
                <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center">
                    <div className="pointer-events-auto rounded-md border border-border bg-slate-800/95 px-3 py-2 text-sm font-medium text-white shadow">
                        {infoToast}
                    </div>
                </div>
            )}

            {/* Main content */}
            <main className="mx-auto max-w-7xl p-4">
                {/* Responsive 2-column: canvas area + right panel; stacks on small screens */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_320px]">
                    {/* Canvas area */}
                    <section className="rounded-lg border border-border bg-card p-3">
                        <div className="flex w-full items-center justify-center">
                            {/* Centered canvas container with checkerboard background */}
                            <div className="relative max-w-full overflow-auto rounded-md border border-border shadow-sm">
                                {/* Fixed-size working area per requirements (1200x800) */}
                                <div
                                    ref={canvasContainerRef}
                                    className={`relative bg-checker flex items-center justify-center p-4 ${dragActive ? 'ring-2 ring-emerald-500/80 ring-offset-2 ring-offset-card' : ''}`}
                                    onDragEnter={onDragEnterContainer}
                                    onDragOver={onDragOverContainer}
                                    onDragLeave={onDragLeaveContainer}
                                    onDrop={onDropContainer}
                                >
                                    {/* Visual overlay while dragging files over the canvas */}
                                    {dragActive && (
                                        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-emerald-500/80 bg-emerald-500/10">
                                            <span className="rounded bg-emerald-600/90 px-2 py-1 text-xs font-medium text-white shadow">Drop image to place into selected frame</span>
                                        </div>
                                    )}
                                    {/* Fabric mounts here; React will not manage any children to avoid DOM conflicts */}
                                    <div ref={fabricMountRef} className="block" />
                                 </div>
                            </div>
                        </div>
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                            Canvas area with Fabric 6. Use + / - keys to zoom. The checkerboard indicates transparency. Press Delete to remove a selected frame.
                        </p>

                        {/* Last export preview */}
                        {exportUrl && (
                            <div className="mt-4 rounded-md border border-border bg-background p-2">
                                <div className="mb-1 text-xs font-medium text-muted-foreground">Last export</div>
                                <a href={exportUrl} target="_blank" rel="noreferrer" className="inline-block">
                                    <img src={exportUrl} alt="Last export preview" className="h-28 w-auto rounded-sm border border-border" />
                                </a>
                                <div className="mt-1 text-xs">
                                    <a href={exportUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                                        Open image
                                    </a>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Right properties panel */}
                    <aside className="h-max rounded-lg border border-border bg-card p-3">
                        <h2 className="mb-2 text-sm font-medium">Selected frame</h2>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Name</label>
                                <input
                                    value={nameField}
                                    onChange={onChangeName}
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled={!activeFrame}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">X</label>
                                <input
                                    value={xField}
                                    onChange={onChangeX}
                                    inputMode="numeric"
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled={!activeFrame}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Y</label>
                                <input
                                    value={yField}
                                    onChange={onChangeY}
                                    inputMode="numeric"
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled={!activeFrame}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">W</label>
                                <input
                                    value={wField}
                                    onChange={onChangeW}
                                    inputMode="numeric"
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled={!activeFrame}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">H</label>
                                <input
                                    value={hField}
                                    onChange={onChangeH}
                                    inputMode="numeric"
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled={!activeFrame}
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Fit</label>
                                <select
                                    value={fitField}
                                    onChange={onChangeFit}
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    disabled={!activeFrame}
                                >
                                    <option value="cover">cover</option>
                                    <option value="contain">contain</option>
                                </select>
                            </div>
                            {!activeFrame && <p className="pt-1 text-xs">Properties will appear when a frame is selected.</p>}
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
