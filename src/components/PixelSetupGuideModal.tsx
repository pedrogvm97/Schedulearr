'use client';

import React, { useState } from 'react';
import {
    X, Smartphone, Zap, Check, Terminal, Wifi,
    RefreshCw, AlertCircle, Copy, CheckCircle2, Usb
} from 'lucide-react';
import { toast } from 'sonner';

interface PixelSetupGuideModalProps {
    isOpen: boolean;
    onClose: () => void;
    targetIp?: string;
    onSuccess?: () => void;
}

export function PixelSetupGuideModal({
    isOpen,
    onClose,
    targetIp = '192.168.1.141',
    onSuccess
}: PixelSetupGuideModalProps) {
    const [activeTab, setActiveTab] = useState<'pixel1' | 'modern'>('pixel1');
    const [ipInput, setIpInput] = useState(targetIp);
    const [pairingPort, setPairingPort] = useState('');
    const [pairingCode, setPairingCode] = useState('');
    const [isExecuting, setIsExecuting] = useState(false);
    const [commandOutput, setCommandOutput] = useState<string | null>(null);
    const [copiedCommand, setCopiedCommand] = useState(false);

    if (!isOpen) return null;

    const handleRunTcpip = async () => {
        setIsExecuting(true);
        setCommandOutput(null);
        try {
            const res = await fetch('/api/theater/photos/pixel/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'usb_tcpip',
                    targetIp: ipInput.trim()
                })
            });
            const data = await res.json();
            if (res.ok) {
                const out = [data.devicesOutput, data.tcpipOutput, data.connectOutput]
                    .filter(Boolean)
                    .join('\n');
                setCommandOutput(out || data.message || 'TCP/IP command executed');
                if (data.success) {
                    toast.success(data.message || 'TCP/IP mode activated on port 5555!');
                    if (onSuccess) onSuccess();
                } else {
                    toast.warning(data.message || 'Command executed; check USB connection.');
                }
            } else {
                setCommandOutput(data.error || 'Failed to execute command');
                toast.error(data.error || 'Execution failed');
            }
        } catch (e: any) {
            setCommandOutput(e.message);
            toast.error(e.message);
        } finally {
            setIsExecuting(false);
        }
    };

    const handlePairWirelessCode = async () => {
        if (!ipInput.trim() || !pairingPort.trim() || !pairingCode.trim()) {
            toast.error('Enter IP, pairing port, and 6-digit code');
            return;
        }
        setIsExecuting(true);
        setCommandOutput(null);
        try {
            const res = await fetch('/api/theater/photos/pixel/scan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'pair_code',
                    ip: ipInput.trim(),
                    pairingPort: parseInt(pairingPort.trim(), 10),
                    pairingCode: pairingCode.trim(),
                    connectPort: 5555
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setCommandOutput(`${data.pairOutput}\n${data.connectOutput}`);
                toast.success('Paired wirelessly!');
                if (onSuccess) onSuccess();
            } else {
                setCommandOutput(data.error || 'Pairing failed');
                toast.error(data.error || 'Pairing failed');
            }
        } catch (e: any) {
            setCommandOutput(e.message);
            toast.error(e.message);
        } finally {
            setIsExecuting(false);
        }
    };

    const copyTerminalCmd = (cmd: string) => {
        navigator.clipboard.writeText(cmd);
        setCopiedCommand(true);
        toast.success('Copied to clipboard');
        setTimeout(() => setCopiedCommand(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#0e0e12] border border-indigo-500/30 rounded-3xl w-full max-w-2xl p-6 sm:p-8 space-y-6 shadow-2xl relative animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                            <Smartphone size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white">Setup</h2>
                            <p className="text-xs text-zinc-400 font-mono mt-0.5">ADB Wireless Pairing</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close"
                        className="p-2.5 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Device Selector Tabs */}
                <div className="grid grid-cols-2 gap-3 p-1 bg-zinc-950 rounded-2xl border border-zinc-800">
                    <button
                        type="button"
                        onClick={() => { setActiveTab('pixel1'); setCommandOutput(null); }}
                        className={`py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            activeTab === 'pixel1'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Pixel 1 (Android 10 - USB Initialized TCP/IP Mode)"
                    >
                        <Usb size={18} />
                        <span>Pixel 1</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => { setActiveTab('modern'); setCommandOutput(null); }}
                        className={`py-3 px-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                            activeTab === 'modern'
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                        title="Pixel 6–10 (Android 11+ - Wireless Debugging Pairing Code)"
                    >
                        <Wifi size={18} />
                        <span>Pixel 6–10</span>
                    </button>
                </div>

                {/* Tab 1: Pixel 1 (Android 10) */}
                {activeTab === 'pixel1' && (
                    <div className="space-y-5">
                        <div className="space-y-3.5 text-sm">
                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">1</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Connect via USB cable</span>
                                    <span className="text-zinc-400 text-xs block">Plug your Pixel 1 into the server USB port or host machine.</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">2</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Enable USB Debugging on phone</span>
                                    <span className="text-zinc-400 text-xs block">Open <strong>Settings → System → Developer options → USB debugging</strong> (Turn ON).</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">3</span>
                                <div className="space-y-2 flex-1 min-w-0">
                                    <span className="font-bold text-white block">Trigger Server USB Probe</span>
                                    <span className="text-zinc-400 text-xs block">Click the Zap button to trigger a privileged USB probe from the server. This sends the ADB handshake to wake up the prompt on your phone screen.</span>
                                    <div className="flex items-center gap-2.5 pt-1">
                                        <input
                                            type="text"
                                            value={ipInput}
                                            onChange={e => setIpInput(e.target.value)}
                                            placeholder="192.168.1.141"
                                            className="bg-zinc-950 border border-zinc-700 rounded-xl px-3.5 py-2 text-sm text-white font-mono flex-1 outline-none"
                                            title="Pixel 1 IP"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleRunTcpip}
                                            disabled={isExecuting}
                                            title="Trigger Server USB Probe / Activate TCP/IP"
                                            className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-black border border-amber-500/40 transition-all cursor-pointer shrink-0 disabled:opacity-50"
                                        >
                                            <Zap size={20} className={isExecuting ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">4</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Check phone screen</span>
                                    <span className="text-zinc-400 text-xs block">Check <em>"Always allow from this computer"</em> and tap <strong>Allow</strong>. Then click the Zap button once more to switch to TCP mode!</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">5</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Unplug USB cable</span>
                                    <span className="text-zinc-400 text-xs block">Once activated, unplug the USB cable. Pixel 1 will stay connected wirelessly on port 5555.</span>
                                </div>
                            </div>
                        </div>

                        {/* Unraid Terminal Fallback Note */}
                        <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-400 flex items-center gap-2">
                                    <Terminal size={14} className="text-emerald-400" /> Unraid Host Terminal Command
                                </span>
                                <button
                                    type="button"
                                    onClick={() => copyTerminalCmd('adb tcpip 5555')}
                                    title="Copy command"
                                    className="p-1.5 rounded-lg bg-zinc-900 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                                >
                                    {copiedCommand ? <CheckCircle2 size={16} className="text-emerald-400" /> : <Copy size={16} />}
                                </button>
                            </div>
                            <code className="text-xs text-emerald-400 font-mono block bg-black/60 p-2.5 rounded-xl border border-zinc-800">
                                adb tcpip 5555
                            </code>
                        </div>
                    </div>
                )}

                {/* Tab 2: Modern Pixels (Android 11+) */}
                {activeTab === 'modern' && (
                    <div className="space-y-5">
                        <div className="space-y-3.5 text-sm">
                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">1</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Enable Wireless Debugging</span>
                                    <span className="text-zinc-400 text-xs block">Go to <strong>Settings → System → Developer options → Wireless debugging</strong> (Turn ON).</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">2</span>
                                <div className="space-y-1">
                                    <span className="font-bold text-white block">Tap "Pair device with pairing code"</span>
                                    <span className="text-zinc-400 text-xs block">Android will display a 6-digit code and a dynamic pairing port (e.g. <code>38419</code>).</span>
                                </div>
                            </div>

                            <div className="p-4 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-start gap-3.5">
                                <span className="w-7 h-7 rounded-full bg-indigo-500/20 text-indigo-400 font-black text-xs flex items-center justify-center shrink-0 border border-indigo-500/40">3</span>
                                <div className="space-y-3 flex-1 min-w-0">
                                    <span className="font-bold text-white block">Enter Pairing Details</span>
                                    <div className="grid grid-cols-3 gap-2.5">
                                        <input
                                            type="text"
                                            value={ipInput}
                                            onChange={e => setIpInput(e.target.value)}
                                            placeholder="IP (192.168.1.150)"
                                            className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                                            title="Device IP"
                                        />
                                        <input
                                            type="text"
                                            value={pairingPort}
                                            onChange={e => setPairingPort(e.target.value)}
                                            placeholder="Port (e.g. 38419)"
                                            className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                                            title="Pairing Port"
                                        />
                                        <input
                                            type="text"
                                            value={pairingCode}
                                            onChange={e => setPairingCode(e.target.value)}
                                            placeholder="Code (e.g. 481920)"
                                            className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white font-mono outline-none"
                                            title="6-Digit Pairing Code"
                                        />
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handlePairWirelessCode}
                                            disabled={isExecuting}
                                            title="Pair device with pairing code"
                                            className="p-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer disabled:opacity-50 shadow-md"
                                        >
                                            <Check size={20} className={isExecuting ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Live Command Output Area */}
                {commandOutput && (
                    <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-2">
                        <span className="text-xs font-bold text-zinc-400 block font-mono">Output:</span>
                        <pre className="text-xs text-zinc-300 font-mono whitespace-pre-wrap break-all bg-black/60 p-3 rounded-xl border border-zinc-800/60 max-h-40 overflow-y-auto">
                            {commandOutput}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}
