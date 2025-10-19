// filepath: resources/js/pages/editor.tsx
import { Head, Link } from '@inertiajs/react';
import { home } from '@/routes';

export default function EditorPage() {
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
                        <span className="hidden text-muted-foreground sm:inline">Fabric Canvas Editor (skeleton)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" className="rounded-md border border-border bg-secondary px-3 py-1.5 text-sm hover:bg-accent">
                            Background
                        </button>
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
                            <div
                                className="bg-checker relative w-full max-w-4xl rounded-md border border-border shadow-sm"
                            >
                                {/* Reserve responsive height without Fabric; tweak as needed */}
                                <div className="h-[320px] sm:h-[420px] md:h-[520px] lg:h-[640px]" />
                            </div>
                        </div>
                        <p className="mt-3 text-center text-xs text-muted-foreground">
                            Canvas area (no Fabric yet). The checkerboard indicates transparency.
                        </p>
                    </section>

                    {/* Right properties panel */}
                    <aside className="h-max rounded-lg border border-border bg-card p-3">
                        <h2 className="mb-2 text-sm font-medium">Selected object</h2>
                        <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="grid grid-cols-3 gap-2">
                                <label className="col-span-1 self-center">Name</label>
                                <input
                                    className="col-span-2 rounded-md border border-input bg-background px-2 py-1"
                                    placeholder="—"
                                    disabled
                                />
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

