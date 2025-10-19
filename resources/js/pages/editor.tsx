// filepath: resources/js/pages/editor.tsx
import { Head, Link } from '@inertiajs/react';
import { home } from '@/routes';
import React, { useCallback, useEffect, useRef } from 'react';
import { Canvas, Pattern, Point, FabricImage } from 'fabric'; // Fabric 6 ESM: use named exports

// Helper: set a background image with CSS-like `cover` behavior and center it.
// Fabric 6: backgroundImage is a FabricObject assigned via property (no setBackgroundImage())
async function setBackgroundCover(canvas: Canvas, url: string) {
    // Load image (Fabric 6): static fromURL returns a Promise<FabricImage>
    const img = await FabricImage.fromURL(url);

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
    canvas.backgroundVpt = true;
    // Clear any previous background image reference
    canvas.backgroundImage = undefined;
    canvas.backgroundImage = img;
    canvas.requestRenderAll();
}

export default function EditorPage() {
    // Fabric canvas refs
    const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
    const fabricCanvasRef = useRef<Canvas | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

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
        const grid = 20;
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
            // Fabric 6: backgroundColor is a property; assign Pattern and then render
            canvas.backgroundColor = pattern as unknown as string; // TFiller supported in v6 typings
            canvas.requestRenderAll();
        }

        // Keyboard zoom shortcuts: + to zoom in, - to zoom out
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
            }
        };
        window.addEventListener('keydown', onKeyDown);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            // Fabric 6 cleanup: dispose releases events, DOM refs, and internal state
            canvas.dispose();
            fabricCanvasRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [zoomIn, zoomOut]);

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
                    {/* Toolbar buttons intentionally left non-functional; functions exist (zoomIn/zoomOut/resetView) */}
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
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Add Frame
                        </button>
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Upload to Frame
                        </button>
                        <div className="mx-1 hidden h-5 w-px bg-border sm:block" />
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Export PNG
                        </button>
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Save Template
                        </button>
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
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
                            Canvas area with Fabric 6. Use + / - keys to zoom. The checkerboard indicates transparency.
                        </p>
                    </section>

                    {/* Right properties panel */}
                    <aside className="h-max rounded-lg border border-border bg-card p-3">
                        <h2 className="mb-2 text-sm font-medium">Selected object</h2>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Name</label>
                                <input className="col-span-2 rounded-md border border-input bg-background px-2 py-1" placeholder="—" disabled />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">X</label>
                                <input className="col-span-2 rounded-md border border-input bg-background px-2 py-1" placeholder="—" disabled />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Y</label>
                                <input className="col-span-2 rounded-md border border-input bg-background px-2 py-1" placeholder="—" disabled />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">W</label>
                                <input className="col-span-2 rounded-md border border-input bg-background px-2 py-1" placeholder="—" disabled />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">H</label>
                                <input className="col-span-2 rounded-md border border-input bg-background px-2 py-1" placeholder="—" disabled />
                            </div>
                            <p className="pt-1 text-xs">Properties will appear when an object is selected.</p>
                        </div>
                    </aside>
                </div>
            </main>
        </div>
    );
}
