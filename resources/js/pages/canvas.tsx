import { Head, Link } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { home } from '@/routes';

// Type-only imports won't execute at runtime (safe for SSR). In v6, named exports exist.
import type {
    Canvas as FabricCanvas,
    Rect as FabricRect,
    Textbox as FabricTextbox,
    FabricObject,
} from 'fabric';

export default function CanvasPage() {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasEl = useRef<HTMLCanvasElement | null>(null);
    const [canvas, setCanvas] = useState<FabricCanvas | null>(null);

    // Stable options object (no re-creates on render)
    const options = useMemo(() => ({
        selection: true as const,
    }), []);

    useEffect(() => {
        // Only run client-side; Inertia SSR will render markup without effects.
        if (!canvasEl.current) return;

        let disposed = false;
        let c: FabricCanvas | null = null;
        let ro: ResizeObserver | null = null;
        const fit = () => {
            if (!c) return;
            const parent = containerRef.current;
            if (!parent) return;
            const w = parent.clientWidth || 640;
            const h = Math.max(320, Math.min(720, Math.round(w * 0.6)));
            c.setDimensions({ width: w, height: h });
            c.requestRenderAll();
        };

        // Dynamically import Fabric in the browser only (v6 ESM build)
        import('fabric').then((mod) => {
            if (disposed) return;
            const Canvas = mod.Canvas as unknown as new (
                el: HTMLCanvasElement,
                opts?: Record<string, unknown>,
            ) => FabricCanvas;
            const Textbox = mod.Textbox as unknown as new (
                text: string,
                opts?: Record<string, unknown>,
            ) => FabricTextbox;

            c = new Canvas(canvasEl.current!, options as Record<string, unknown>);
            setCanvas(c);

            // Basic starter content
            const label = new Textbox('Fabric.js 6 + React 19', {
                left: 12,
                top: 12,
                fontSize: 18,
                fill: '#111',
                editable: false,
                selectable: false,
            });
            c.add(label);

            fit();
            ro = new ResizeObserver(fit);
            if (containerRef.current) ro.observe(containerRef.current);
            window.addEventListener('resize', fit);
        });

        // Clean up when the page unmounts to avoid dangling listeners and RAF.
        return () => {
            disposed = true;
            ro?.disconnect();
            window.removeEventListener('resize', fit);
            c?.dispose();
            setCanvas(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addRect = () => {
        if (!canvas) return;
        // Load Rect on-demand to keep SSR safe
        import('fabric').then((mod) => {
            const Rect = mod.Rect as unknown as new (
                opts?: Record<string, unknown>,
            ) => FabricRect;
            const rect = new Rect({
                left: 80 + Math.random() * 120,
                top: 80 + Math.random() * 60,
                width: 120,
                height: 80,
                rx: 12,
                ry: 12,
                fill: 'oklch(0.74 0.16 58)', // Matches Tailwind OKLCH design tokens
                stroke: 'oklch(0.42 0 0)',
                strokeWidth: 1,
                // v6 note: set `strokeUniform: true` if you don't want stroke scale on zoom.
                strokeUniform: true,
            });
            canvas.add(rect);
            canvas.setActiveObject(rect);
            canvas.requestRenderAll();
        });
    };

    const clearAll = () => {
        if (!canvas) return;
        const prev = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false; // Perf tip from docs
        canvas.getObjects().forEach((o: FabricObject) => canvas.remove(o));
        canvas.renderOnAddRemove = prev;
        canvas.requestRenderAll();
    };

    const exportPng = () => {
        if (!canvas) return;
        const data = canvas.toDataURL({ format: 'png', quality: 1, multiplier: 1 });
        const link = document.createElement('a');
        link.href = data;
        link.download = 'canvas.png';
        link.click();
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            <Head title="Canvas" />
            <header className="mx-auto flex max-w-5xl items-center justify-between p-4">
                <Link href={home()} className="text-sm underline">
                    ← Home
                </Link>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={addRect}
                        className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent"
                    >
                        Add rectangle
                    </button>
                    <button
                        type="button"
                        onClick={clearAll}
                        className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent"
                    >
                        Clear
                    </button>
                    <button
                        type="button"
                        onClick={exportPng}
                        className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent"
                    >
                        Export PNG
                    </button>
                </div>
            </header>
            <main className="mx-auto max-w-5xl p-4">
                <div ref={containerRef} className="w-full overflow-hidden rounded-lg border border-border bg-card">
                    <canvas ref={canvasEl} className="block h-[360px] w-full" />
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                    Tip: Drag shapes, use corner handles to resize/rotate. Export saves the current viewport.
                </p>
            </main>
        </div>
    );
}
