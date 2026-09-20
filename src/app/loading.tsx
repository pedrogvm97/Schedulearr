export default function Loading() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] py-20 px-4 text-center select-none animate-in fade-in duration-300">
            {/* Branded Icon with Pulse Glow */}
            <div className="relative mb-8">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-3xl bg-gradient-to-tr from-emerald-500/20 via-teal-500/10 to-zinc-900 p-3 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.35)] animate-pulse">
                    <img src="/icon.png" alt="Schedulearr" className="w-full h-full object-contain" />
                </div>
                <div className="absolute -inset-2 rounded-3xl bg-emerald-500/10 blur-xl -z-10 animate-pulse" />
            </div>

            {/* Scaled Typography (125% scale for comfort) */}
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight mb-2.5">
                Starting Schedulearr...
            </h2>
            <p className="text-base sm:text-lg text-zinc-400 font-medium max-w-md mb-8">
                Connecting to database and synchronizing media instances
            </p>

            {/* Animated Smooth Progress Bar */}
            <div className="w-56 sm:w-72 h-2 bg-zinc-900 rounded-full overflow-hidden relative border border-zinc-800 shadow-inner">
                <div className="w-1/2 h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 rounded-full animate-progress-bar shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs sm:text-sm font-mono text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Initializing System Components...</span>
            </div>
        </div>
    );
}
