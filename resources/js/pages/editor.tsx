// filepath: resources/js/pages/editor.tsx
import { Head, Link } from '@inertiajs/react';
import { home } from '@/routes';
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

// Helper: set a background image with CSS-like `cover` behavior and center it.
// Fabric 6: backgroundImage is a FabricObject assigned via property (no setBackgroundImage())
async function setBackgroundCover(canvas: Canvas, url: string) {
    // Load image element via Fabric util, then wrap in FabricImage
    const el = await util.loadImage(url);
    const img = new FabricImage(el);

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

export default function EditorPage() {
    // Fabric canvas refs
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // Panel state reflecting currently selected frame
    const [activeFrame, setActiveFrame] = useState<Rect | null>(null);
    const [nameField, setNameField] = useState<string>('');
    const [fitField, setFitField] = useState<'cover' | 'contain'>('cover');
    const [xField, setXField] = useState<string>('');
    const [yField, setYField] = useState<string>('');
    const [wField, setWField] = useState<string>('');
    const [hField, setHField] = useState<string>('');

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
            if (!res.ok) throw new Error(`Upload failed (${res.status})`);
            const data = (await res.json()) as { url?: string };
            if (!data.url) throw new Error('Invalid upload response');
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
        const frames = getFrames();
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
    }, [getFrames]);

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
        fabricCanvasRef.current?.requestRenderAll();
    }, [activeFrame]);

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
        fabricCanvasRef.current?.requestRenderAll();
    }, [activeFrame]);

    // Selection and transforms wiring
    useEffect(() => {
        const el = canvasElementRef.current;
        if (!el) return;

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
        const onMovingOrScaling = (e: CanvasEvents['object:moving']) => {
            const t = e?.target as Rect;
            if (!t || !getRectData(t)) return;
            // Refresh panel numeric values in real-time
            setXField(String(Math.round(t.left ?? 0)));
            setYField(String(Math.round(t.top ?? 0)));
            setWField(String(Math.round(t.getScaledWidth())));
            setHField(String(Math.round(t.getScaledHeight())));
        };
        canvas.on('object:moving', onMovingOrScaling);
        canvas.on('object:scaling', onMovingOrScaling as unknown as (e: CanvasEvents['object:scaling']) => void);

        // Snap on modify end (Fabric v5+ fires object:modified for move/scale/rotate completion)
        const onModified = (e: CanvasEvents['object:modified']) => {
            const t = e?.target as Rect;
            if (!t || !getRectData(t)) return;
            snapToGrid(t);
            canvas.requestRenderAll();
            // After snap, re-sync
            syncPanelFromRect(t);
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
            canvas.off('object:moving', onMovingOrScaling);
            canvas.off('object:scaling', onMovingOrScaling as unknown as (e: CanvasEvents['object:scaling']) => void);
            canvas.off('object:modified', onModified);
            window.removeEventListener('keydown', onKeyDown);
            // Fabric 6 cleanup: dispose releases events, DOM refs, and internal state
            canvas.dispose();
            fabricCanvasRef.current = null;
        };

    }, [syncPanelFromRect, zoomIn, zoomOut]);

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
    }, [activeFrame]);

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

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Head title="Editor" />

            {/* Top toolbar */}
            <header className="border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
                <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-3 text-sm">
                        <Link href={home()} className="underline underline-offset-2 hover:opacity-80">
                            ← Home
                        </Link>
                        <span className="hidden text-muted-foreground sm:inline">Fabric Canvas Editor</span>
                    </div>
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
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent" disabled>
                            Upload to Frame
                        </button>
                        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent" disabled>
                            Export PNG
                        </button>
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent" disabled>
                            Save Template
                        </button>
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent" disabled>
                            Load Template
                        </button>
                    </div>
                </div>
            </header>

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
                                <div className="bg-checker flex items-center justify-center p-4">
                                    <canvas
                                        ref={canvasElementRef}
                                        // Do not set CSS width/height to avoid stretching. Fabric sets attributes.
                                        className="block"
                                    />
                                </div>
                            </div>
                        </div>
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                            Canvas area with Fabric 6. Use + / - keys to zoom. The checkerboard indicates transparency. Press Delete to remove a selected frame.
                        </p>
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
