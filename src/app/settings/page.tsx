"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { CustomSelect } from "@/components/CustomSelect";
import { AnalyticsPanel } from "@/components/AnalyticsPanel";
import { ProfilesPanel } from "@/components/ProfilesPanel";
import { Server, HardDrive, Cpu, Sliders, Database, RefreshCw, Sparkles, Radio, Layers, Wrench, Download, Upload, AlertCircle, CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";

export default function Settings() {
    const [activeSettingsTab, setActiveSettingsTab] = useState<'instances' | 'automation' | 'system'>('instances');
    const [instances, setInstances] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [tmdbApiKey, setTmdbApiKey] = useState("");
    const [tmdbInput, setTmdbInput] = useState("");
    const [tmdbState, setTmdbState] = useState<'view' | 'edit' | 'confirm'>('view');

    // Housekeeping stats
    const [dbStats, setDbStats] = useState<{ totalSizeBytes: number, tableStats: any[] } | null>(null);
    const [isHousekeepingOpen, setIsHousekeepingOpen] = useState(false);
    const [isQbitCleanOpen, setIsQbitCleanOpen] = useState(false);
    const [editTargetId, setEditTargetId] = useState<string | null>(null);
    const [schedulerConfig, setSchedulerConfig] = useState({ enabled: true, interval: 30, batchSize: 10, batchBehavior: 'repeat', maxAttempts: 3 });
    const [isRunningBatch, setIsRunningBatch] = useState(false);
    const [type, setType] = useState("radarr");
    const [name, setName] = useState("");
    const [url, setUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [color, setColor] = useState('bg-zinc-500'); // default fallback

    const [isAuthorModalOpen, setIsAuthorModalOpen] = useState(false);
    const [activeTroubleshootModal, setActiveTroubleshootModal] = useState<'socket' | 'perms' | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        title: string;
        message: string;
        confirmLabel?: string;
        danger?: boolean;
        onConfirm: () => void;
    } | null>(null);

    const predefinedColors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-yellow-500', 'bg-lime-500',
        'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500', 'bg-sky-500',
        'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
        'bg-pink-500', 'bg-rose-500', 'bg-zinc-500', 'bg-slate-500', 'bg-stone-500'
    ];

    const [allSettings, setAllSettings] = useState<Record<string, string>>({});
    const getSettingValue = (key: string) => allSettings[key] || "";

    // Version management
    const [versionInfo, setVersionInfo] = useState<{
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
        changelog: string;
        dockerSocketAvailable: boolean;
    } | null>(null);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [updating, setUpdating] = useState(false);

    // Smart update logging and Self container info
    const [selfInfo, setSelfInfo] = useState<{
        containerId?: string;
        containerName?: string;
        image?: string;
        available: boolean;
    } | null>(null);
    const [updateLogs, setUpdateLogs] = useState<{ type: 'info' | 'warn' | 'error' | 'success', message: string }[]>([]);

    // 1-Click Plex PIN Auth state
    const [plexPairing, setPlexPairing] = useState(false);
    const [plexPairingStatus, setPlexPairingStatus] = useState<string | null>(null);



    const handlePairPlex = async () => {
        setPlexPairing(true);
        setPlexPairingStatus("Connecting to Plex Auth...");
        try {
            const res = await fetch('/api/plex/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create_pin' })
            });

            if (!res.ok) throw new Error('Failed to create Plex auth pin');

            const { id, code, authUrl } = await res.json();

            // Open official Plex login page
            window.open(authUrl, '_blank');
            setPlexPairingStatus(`Waiting for Plex Approval (PIN: ${code})...`);

            // Poll for approval
            let attempts = 0;
            const poll = setInterval(async () => {
                attempts++;
                if (attempts > 60) {
                    clearInterval(poll);
                    setPlexPairing(false);
                    setPlexPairingStatus(null);
                    toast.error("Plex login timed out. Please try again.");
                    return;
                }

                try {
                    const checkRes = await fetch('/api/plex/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'check_pin', pinId: id })
                    });
                    const checkData = await checkRes.json();

                    if (checkData.approved && checkData.authToken) {
                        clearInterval(poll);
                        setApiKey(checkData.authToken);

                        if (checkData.servers && checkData.servers.length > 0) {
                            const server = checkData.servers[0];
                            setUrl(server.localUri || server.uri);
                            setName(server.name || 'Plex Server');
                        } else {
                            if (!url) setUrl('http://localhost:32400');
                            if (!name) setName('Plex Server');
                        }

                        setPlexPairing(false);
                        setPlexPairingStatus(null);
                        toast.success("Plex Account Paired Successfully!");
                    }
                } catch (e) {}
            }, 2000);
        } catch (e: any) {
            setPlexPairing(false);
            setPlexPairingStatus(null);
            toast.error(e.message || "Plex Auth Error");
        }
    };
    const [activeTab, setActiveTab] = useState<'status' | 'doctor'>('status');

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard!");
    };

    const getFixSocketCommand = () => {
        const port = selfInfo?.ports?.[0]?.host || 3010;
        const dataPath = selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data';
        const xml = `<?xml version="1.0"?>
<Container version="2">
  <Name>Schedulearr</Name>
  <Repository>ghcr.io/pedrogvm97/schedulearr:latest</Repository>
  <Registry>https://ghcr.io/</Registry>
  <Network>bridge</Network>
  <Shell>sh</Shell>
  <Privileged>false</Privileged>
  <Support>https://github.com/pedrogvm97/Schedulearr/issues</Support>
  <Project>https://github.com/pedrogvm97/Schedulearr</Project>
  <Overview>Schedulearr - intelligent scheduler for Radarr, Sonarr and Prowlarr.</Overview>
  <Category>MediaApp:Video Other:</Category>
  <WebUI>http://[IP]:[PORT:3010]</WebUI>
  <TemplateURL>https://raw.githubusercontent.com/pedrogvm97/schedulearr/main/unraid-template.xml</TemplateURL>
  <Icon>https://raw.githubusercontent.com/pedrogvm97/Schedulearr/main/public/icon.png</Icon>
  <ExtraParams>--restart unless-stopped</ExtraParams>
  <PostArgs/>
  <CPUset/>
  <DateInstalled></DateInstalled>
  <DonateText/>
  <DonateLink/>
  <Description>Schedulearr - intelligent scheduler for Radarr, Sonarr and Prowlarr.</Description>
  <Networking>
    <Mode>bridge</Mode>
    <Publish>
      <Port>
        <HostPort>${port}</HostPort>
        <ContainerPort>3010</ContainerPort>
        <Protocol>tcp</Protocol>
      </Port>
    </Publish>
  </Networking>
  <Data>
    <Volume>
      <HostDir>${dataPath}</HostDir>
      <ContainerDir>/app/data</ContainerDir>
      <Mode>rw</Mode>
    </Volume>
    <Volume>
      <HostDir>/var/run/docker.sock</HostDir>
      <ContainerDir>/var/run/docker.sock</ContainerDir>
      <Mode>rw</Mode>
    </Volume>
  </Data>
  <Environment/>
  <Labels/>
  <Config Name="WebUI Port" Target="3010" Default="3010" Mode="tcp" Description="Web interface port" Type="Port" Display="always" Required="true" Mask="false">${port}</Config>
  <Config Name="AppData" Target="/app/data" Default="/mnt/user/appdata/Schedulearr/data" Mode="rw" Description="Path to store SQLite database" Type="Path" Display="always" Required="true" Mask="false">${dataPath}</Config>
  <Config Name="Docker Socket" Target="/var/run/docker.sock" Default="/var/run/docker.sock" Mode="rw" Description="Docker socket for container management" Type="Path" Display="always" Required="true" Mask="false">/var/run/docker.sock</Config>
</Container>`;
        const b64 = btoa(xml);
        return `docker stop Schedulearr; docker rm Schedulearr; echo "${b64}" | base64 -d > /boot/config/plugins/dockerMan/templates-user/my-Schedulearr.xml; docker run -d --name=Schedulearr -p ${port}:3010 -v /var/run/docker.sock:/var/run/docker.sock -v ${dataPath}:/app/data --restart unless-stopped ghcr.io/pedrogvm97/schedulearr:latest`;
    };

    // Disk Usage
    const [diskInfo, setDiskInfo] = useState<{ totalBytes: number; freeBytes: number; usedBytes: number; usedPercent: number; byInstance: any[] } | null>(null);
    const [isDiskOpen, setIsDiskOpen] = useState(false);
    const [diskPauseEnabled, setDiskPauseEnabled] = useState(false);
    const [diskPauseThreshold, setDiskPauseThreshold] = useState(90);
    const [diskAutocleanEnabled, setDiskAutocleanEnabled] = useState(false);
    const [diskAutocleanThreshold, setDiskAutocleanThreshold] = useState(85);
    const [diskSmartCleanMode, setDiskSmartCleanMode] = useState('largest');
    const [diskSmartCleanImmunityEnabled, setDiskSmartCleanImmunityEnabled] = useState(false);
    const [diskSmartCleanImmunityDays, setDiskSmartCleanImmunityDays] = useState(7);
    const [diskSmartCleanSeriesLevel, setDiskSmartCleanSeriesLevel] = useState<'series' | 'season' | 'episode'>('series');
    const [diskSmartCleanIgnoredInstances, setDiskSmartCleanIgnoredInstances] = useState<string[]>([]);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState(false);
    const [candidates, setCandidates] = useState<any[]>([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);

    const fetchCandidates = async () => {
        setLoadingCandidates(true);
        try {
            const res = await fetch('/api/media/smart-clean-candidates');
            if (res.ok) {
                const json = await res.json();
                if (Array.isArray(json.candidates)) {
                    setCandidates(json.candidates);
                } else if (Array.isArray(json)) {
                    setCandidates(json);
                } else {
                    setCandidates([]);
                }
            } else {
                setCandidates([]);
            }
        } catch (e) {
            console.error('Failed to fetch candidates', e);
            setCandidates([]);
        }
        setLoadingCandidates(false);
    };

    const fetchInstances = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/instances');
            const data = await res.json();
            if (Array.isArray(data)) setInstances(data);

            const cRes = await fetch('/api/scheduler/status');
            if (cRes.ok) {
                const cData = await cRes.json();
                setSchedulerConfig({ enabled: cData.enabled, interval: cData.interval, batchSize: cData.batchSize, batchBehavior: cData.batchBehavior || 'repeat', maxAttempts: cData.maxAttempts || 3 });
            }

            // Fetch All Settings
            const sRes = await fetch('/api/settings');
            if (sRes.ok) {
                const sData = await sRes.json();
                setAllSettings(sData);
                setTmdbApiKey(sData.tmdb_api_key || "");
                setTmdbInput(sData.tmdb_api_key || "");
                setTmdbState(sData.tmdb_api_key ? 'view' : 'edit');
            }
        } catch (e) {
            console.error(e);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchInstances();
        fetchVersionInfo();
        fetchSelfInfo();
        fetchCandidates();
        // Fetch disk info on mount
        fetch('/api/system/disk').then(r => r.ok ? r.json() : null).then(d => { if (d) setDiskInfo(d); }).catch(() => {});
    }, []);

    // Sync disk settings from allSettings when loaded
    useEffect(() => {
        if (allSettings.disk_pause_enabled) setDiskPauseEnabled(allSettings.disk_pause_enabled === 'true');
        if (allSettings.disk_pause_threshold) setDiskPauseThreshold(parseInt(allSettings.disk_pause_threshold) || 90);
        if (allSettings.disk_autoclean_enabled) setDiskAutocleanEnabled(allSettings.disk_autoclean_enabled === 'true');
        if (allSettings.disk_autoclean_threshold) setDiskAutocleanThreshold(parseInt(allSettings.disk_autoclean_threshold) || 85);
        if (allSettings.qbit_smart_clean_mode) setDiskSmartCleanMode(allSettings.qbit_smart_clean_mode);
        if (allSettings.qbit_smart_clean_immunity_enabled) setDiskSmartCleanImmunityEnabled(allSettings.qbit_smart_clean_immunity_enabled === 'true');
        if (allSettings.qbit_smart_clean_immunity_days) setDiskSmartCleanImmunityDays(parseInt(allSettings.qbit_smart_clean_immunity_days) || 7);
        if (allSettings.media_smart_clean_series_level) setDiskSmartCleanSeriesLevel(allSettings.media_smart_clean_series_level as any);
        if (allSettings.media_smart_clean_ignored_instances) {
            try { setDiskSmartCleanIgnoredInstances(JSON.parse(allSettings.media_smart_clean_ignored_instances)); } catch (e) { }
        }
        if (allSettings.auto_update_enabled !== undefined) setAutoUpdateEnabled(allSettings.auto_update_enabled === 'true');
    }, [allSettings]);

    const fetchSelfInfo = async () => {
        try {
            const res = await fetch('/api/system/self');
            if (res.ok) {
                const data = await res.json();
                setSelfInfo(data);
            }
        } catch (e) {
            console.error('Failed to fetch self info', e);
        }
    };

    const [availableReleases, setAvailableReleases] = useState<{ tag: string; name: string; publishedAt: string }[]>([]);
    const [selectedReleaseTag, setSelectedReleaseTag] = useState<string>('');

    const fetchVersionInfo = async () => {
        try {
            const res = await fetch('/api/system/version');
            if (res.ok) {
                const data = await res.json();
                setVersionInfo(data);
            }
            const relRes = await fetch('/api/system/releases');
            if (relRes.ok) {
                const relData = await relRes.json();
                if (Array.isArray(relData.versions)) {
                    setAvailableReleases(relData.versions);
                    if (relData.versions.length > 0 && !selectedReleaseTag) {
                        setSelectedReleaseTag(relData.versions[0].tag);
                    }
                }
            }
        } catch (e) {
            console.error('Failed to fetch version info', e);
        }
    };

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);
        await fetchVersionInfo();
        await fetchSelfInfo();
        setCheckingUpdate(false);
        toast.info("Update check complete");
    };

    const handleUpdate = (customTag?: string) => {
        const tagToUse = customTag || selectedReleaseTag || versionInfo?.latestVersion || 'latest';
        const isDowngrade = versionInfo?.currentVersion && tagToUse.replace(/^v/, '') < versionInfo.currentVersion;
        
        setConfirmModal({
            title: isDowngrade ? `Downgrade to ${tagToUse}` : `Install ${tagToUse}`,
            message: `This will pull the Docker image for ${tagToUse} and automatically restart the container. The app will be briefly offline while restarting.`,
            confirmLabel: isDowngrade ? 'Yes, Downgrade Now' : 'Yes, Install Now',
            onConfirm: () => {
                setUpdating(true);
                setUpdateLogs([{ type: 'info', message: `[INFO] Connecting to update stream for version ${tagToUse}...` }]);
                startUpdateStream(tagToUse);
            }
        });
    };

    const startUpdateStream = (tagParam?: string) => {
        const targetTag = tagParam || selectedReleaseTag || versionInfo?.latestVersion || 'latest';
        const eventSource = new EventSource(`/api/system/update/stream?tag=${encodeURIComponent(targetTag)}`);

        eventSource.addEventListener('log', (event: any) => {
            try {
                const data = JSON.parse(event.data);
                setUpdateLogs(prev => [...prev, data]);
            } catch (e) {
                console.error("Failed to parse event data", e);
            }
        });

        eventSource.addEventListener('complete', (event: any) => {
            try {
                const data = JSON.parse(event.data);
                if (data.success) {
                    toast.success("Update finished successfully! Application is restarting.");
                    setUpdateLogs(prev => [...prev, { type: 'success', message: '[SUCCESS] Update complete! The application is restarting.' }]);
                } else {
                    toast.error("Update finished with issues.");
                    setUpdateLogs(prev => [...prev, { type: 'error', message: '[ERROR] Update completed with errors.' }]);
                }
            } catch (e) {
                console.error("Failed to parse complete event", e);
            }
            eventSource.close();
            const pollServer = async () => {
                try {
                    const r = await fetch('/api/system/version', { cache: 'no-store' });
                    if (r.ok) {
                        toast.success("Reconnected to updated application!");
                        window.location.reload();
                        return;
                    }
                } catch (e) {}
                setTimeout(pollServer, 2000);
            };
            setTimeout(pollServer, 4000);
        });

        eventSource.onerror = (err) => {
            console.error("SSE Connection lost:", err);
            setUpdateLogs(prev => {
                const alreadyDone = prev.some(l => l.message.includes('Restart command acknowledged') || l.message.includes('restarting'));
                if (alreadyDone) {
                    toast.success("Update triggered! Page will reconnect when container restarts.");
                    return [...prev, { type: 'success', message: '[SUCCESS] Connection closed because the container is restarting!' }];
                } else {
                    toast.error("Lost connection to update server.");
                    return [...prev, { type: 'error', message: '[ERROR] Connection to the update server was lost prematurely.' }];
                }
            });
            eventSource.close();
            setUpdating(false);
        };
    };


    const updateSetting = async (key: string, value: any) => {
        try {
            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key, value: String(value) })
            });
            if (res.ok) {
                if (key === 'tmdb_api_key') toast.success("TMDB API Key updated");
            } else {
                throw new Error("Failed to save");
            }
        } catch (e) {
            console.error('Failed to update setting', key, e);
            toast.error("Failed to update setting");
        }
    };

    const handleAddOrEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !url || !apiKey) return;

        const updatedInstance = {
            id: editTargetId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            name,
            url: url.replace(/\/$/, ""), // strip trailing slash
            api_key: apiKey,
            enabled: true,
            color
        };

        try {
            const method = editTargetId ? 'PUT' : 'POST';
            const res = await fetch('/api/instances', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedInstance)
            });

            if (!res.ok) throw new Error('Failed to save instance');

            toast.success(editTargetId ? 'Instance updated successfully!' : 'Instance added successfully!');
            fetchInstances();

            // reset form
            setEditTargetId(null);
            setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || 'Failed to save instance');
        }
    };

    const handleEditClick = (inst: any) => {
        setEditTargetId(inst.id);
        setType(inst.type);
        setName(inst.name);
        setUrl(inst.url);
        setApiKey(inst.api_key);
        setColor(inst.color || 'bg-zinc-500');
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDelete = async (id: string) => {
        setConfirmModal({
            title: 'Delete Instance',
            message: 'Are you sure you want to delete this instance? This cannot be undone.',
            confirmLabel: 'Delete',
            danger: true,
            onConfirm: async () => {
                try {
                    const res = await fetch(`/api/instances?id=${id}`, { method: 'DELETE' });
                    if (!res.ok) throw new Error('Failed to delete instance');
                    toast.success('Instance deleted successfully');

                    if (editTargetId === id) {
                        setEditTargetId(null);
                        setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
                    }

                    fetchInstances();
                } catch (e: any) {
                    console.error(e);
                    toast.error(e.message || 'Failed to delete instance');
                }
            }
        });
    };

    // Health Badge internal component to fetch its status
    const HealthBadge = ({ id }: { id: string }) => {
        const [status, setStatus] = useState<'loading' | 'online' | 'offline'>('loading');

        useEffect(() => {
            const checkHealth = async () => {
                try {
                    const res = await fetch(`/api/instances/health?id=${id}`);
                    const data = await res.json();
                    setStatus(data.status || 'offline');
                } catch {
                    setStatus('offline');
                }
            };
            checkHealth();
            // Optional: Re-check every minute
            const interval = setInterval(checkHealth, 60000);
            return () => clearInterval(interval);
        }, [id]);

        if (status === 'loading') return <div className="w-2 h-2 rounded-full bg-zinc-600 animate-pulse" title="Checking health..." />;
        if (status === 'online') return <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]" title="Online" />;
        return <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" title="Offline" />;
    };

    const handleExport = async () => {
        const password = window.prompt("Enter a password to encrypt your backup:");
        if (!password) return;

        try {
            const res = await fetch('/api/instances/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (!res.ok) throw new Error('Failed to export');
            const data = await res.json();

            // Trigger download
            const blob = new Blob([data.encryptedData], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.filename || 'instances_backup.json';
            a.click();
            window.URL.revokeObjectURL(url);
            toast.success("Backup exported successfully!");
        } catch (e: any) {
            toast.error(e.message || "Failed to export backup");
        }
    };

    const handleImport = async () => {
        const password = window.prompt("Enter the password to decrypt your backup:");
        if (!password) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event: any) => {
                const encryptedData = event.target.result;
                try {
                    const res = await fetch('/api/instances/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ password, encryptedData })
                    });

                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Failed to import');
                    }

                    toast.success("Backup restored successfully!");
                    fetchInstances();
                } catch (err: any) {
                    toast.error(err.message || "Failed to restore backup");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    return (
        <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-8 pb-24">
            {/* Header & Subtopic Navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#09090b]/80 border border-zinc-800/80 backdrop-blur-2xl p-5 sm:p-6 rounded-[2.5rem] shadow-2xl">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <Sliders size={26} className="text-emerald-400" /> Settings
                    </h1>
                    <p className="text-sm text-zinc-500 mt-1 font-medium">
                        Configure connected instances, storage automation rules, and system maintenance.
                    </p>
                </div>

                {/* Subtopic Segmented Switcher */}
                <div className="flex flex-wrap bg-zinc-950 p-1.5 rounded-2xl border border-zinc-800/80 shadow-inner self-start sm:self-auto gap-1">
                    <button
                        onClick={() => setActiveSettingsTab('instances')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeSettingsTab === 'instances'
                                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Server size={16} /> Instances &amp; Connections
                    </button>
                    <button
                        onClick={() => setActiveSettingsTab('automation')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeSettingsTab === 'automation'
                                ? 'bg-sky-600/20 text-sky-400 border border-sky-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <HardDrive size={16} /> Automation &amp; Storage
                    </button>
                    <button
                        onClick={() => setActiveSettingsTab('system')}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                            activeSettingsTab === 'system'
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30 shadow-md'
                                : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        <Cpu size={16} /> System &amp; Maintenance
                    </button>
                </div>
            </div>

            {/* ── SUBTOPIC 1: INSTANCES & CONNECTIONS ── */}
            {activeSettingsTab === 'instances' && (
                <div className="space-y-8 animate-in fade-in duration-200">
                    {/* Configured Instances */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Server size={20} className="text-emerald-400" /> Configured Instances
                            </h2>
                            <span className="text-xs text-zinc-500 font-bold">{instances.length} Active Connections</span>
                        </div>

                        {loading ? (
                            <div className="p-8 text-center bg-zinc-950/40 rounded-2xl border border-zinc-800/80">
                                <div className="w-6 h-6 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2" />
                                <span className="text-zinc-500 text-xs font-bold">Loading instances...</span>
                            </div>
                        ) : instances.length === 0 ? (
                            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500">
                                No instances configured yet. Add your first instance below.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {instances.map(inst => {
                                    let borderColorHex = '#27272a';
                                    const twClass = inst.color || '';
                                    if (twClass.includes('slate')) borderColorHex = '#64748b';
                                    else if (twClass.includes('gray')) borderColorHex = '#6b7280';
                                    else if (twClass.includes('zinc')) borderColorHex = '#71717a';
                                    else if (twClass.includes('neutral')) borderColorHex = '#737373';
                                    else if (twClass.includes('stone')) borderColorHex = '#78716c';
                                    else if (twClass.includes('red')) borderColorHex = '#ef4444';
                                    else if (twClass.includes('orange')) borderColorHex = '#f97316';
                                    else if (twClass.includes('amber')) borderColorHex = '#f59e0b';
                                    else if (twClass.includes('yellow')) borderColorHex = '#eab308';
                                    else if (twClass.includes('lime')) borderColorHex = '#84cc16';
                                    else if (twClass.includes('green')) borderColorHex = '#22c55e';
                                    else if (twClass.includes('emerald')) borderColorHex = '#10b981';
                                    else if (twClass.includes('teal')) borderColorHex = '#14b8a6';
                                    else if (twClass.includes('cyan')) borderColorHex = '#06b6d4';
                                    else if (twClass.includes('sky')) borderColorHex = '#0ea5e9';
                                    else if (twClass.includes('blue')) borderColorHex = '#3b82f6';
                                    else if (twClass.includes('indigo')) borderColorHex = '#6366f1';
                                    else if (twClass.includes('violet')) borderColorHex = '#8b5cf6';
                                    else if (twClass.includes('purple')) borderColorHex = '#a855f7';
                                    else if (twClass.includes('fuchsia')) borderColorHex = '#d946ef';
                                    else if (twClass.includes('pink')) borderColorHex = '#ec4899';
                                    else if (twClass.includes('rose')) borderColorHex = '#f43f5e';

                                    return (
                                        <div key={inst.id} className="bg-zinc-900 rounded-2xl p-5 flex flex-col justify-between shadow-xl" style={{ border: `1px solid ${borderColorHex}80` }}>
                                            <div>
                                                <div className="flex justify-between items-start mb-3">
                                                    <div className="flex items-center gap-2">
                                                        {inst.color && <div className={`w-3.5 h-3.5 rounded-full ${inst.color}`} title="Instance Color" />}
                                                        <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-md flex items-center gap-1.5" style={{ color: borderColorHex, backgroundColor: `${borderColorHex}33` }}>
                                                            {inst.type}
                                                        </span>
                                                        <HealthBadge id={inst.id} />
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button
                                                            onClick={() => handleEditClick(inst)}
                                                            className="text-zinc-500 hover:text-blue-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                                                            title="Edit instance"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                                                        </button>
                                                        <button
                                                            onClick={() => handleDelete(inst.id)}
                                                            className="text-zinc-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                                                            title="Delete instance"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                                <h3 className="text-base font-bold text-white truncate" title={inst.name}>{inst.name}</h3>
                                                <p className="text-xs text-zinc-400 mt-1 truncate font-mono" title={inst.url}>{inst.url}</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Add / Update Instance Form */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Sparkles size={20} className="text-emerald-400" />
                                {editTargetId ? 'Update Instance Connection' : 'Add New Instance Connection'}
                            </h2>
                            {editTargetId && (
                                <button
                                    onClick={() => {
                                        setEditTargetId(null);
                                        setName(""); setUrl(""); setApiKey(""); setColor('bg-zinc-500');
                                    }}
                                    className="text-xs font-bold text-zinc-400 hover:text-white px-3 py-1.5 bg-zinc-800 rounded-xl"
                                >
                                    Cancel Edit
                                </button>
                            )}
                        </div>
                        <form onSubmit={handleAddOrEdit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium text-zinc-300">Service Type</label>
                                <CustomSelect
                                    value={type}
                                    onChange={(val) => setType(val)}
                                    options={[
                                        { id: 'radarr', name: 'Radarr (Movies)' },
                                        { id: 'sonarr', name: 'Sonarr (TV Series)' },
                                        { id: 'lidarr', name: 'Lidarr (Music)' },
                                        { id: 'prowlarr', name: 'Prowlarr (Indexers)' },
                                        { id: 'qbittorrent', name: 'qBittorrent (Downloads)' },
                                        { id: 'plex', name: 'Plex Media Server' }
                                    ]}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-zinc-300">Instance Name</label>
                                <input
                                    type="text"
                                    placeholder={type === 'lidarr' ? "e.g. Lidarr Music FLAC" : type === 'radarr' ? "e.g. Radarr Movies 4K" : "e.g. Sonarr TV Series"}
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-zinc-300">Connection URL</label>
                                <input
                                    type="url"
                                    placeholder={type === 'plex' ? "http://192.168.1.125:32400" : type === 'lidarr' ? "http://192.168.1.125:8686" : type === 'sonarr' ? "http://192.168.1.125:8989" : "http://192.168.1.125:7878"}
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-xs"
                                />
                            </div>

                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-sm font-medium text-zinc-300">
                                        {type === 'qbittorrent' ? 'Credentials (username:password)' : type === 'plex' ? 'X-Plex-Token' : 'API Key'}
                                    </label>
                                    {type === 'plex' && (
                                        <a
                                            href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline"
                                        >
                                            Plex Token Guide ↗
                                        </a>
                                    )}
                                </div>
                                <input
                                    type="password"
                                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2.5 text-white focus:ring-2 focus:ring-emerald-500 outline-none font-mono text-xs"
                                />
                            </div>

                            {type === 'plex' && (
                                <div className="md:col-span-2 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div>
                                        <span className="text-xs font-black uppercase text-amber-400 tracking-wider block">
                                            ⚡ Automated 1-Click Plex Pairing
                                        </span>
                                        <p className="text-xs text-zinc-300">
                                            Click pair, log into your Plex account, and Schedulearr will automatically fill your URL &amp; Token.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handlePairPlex}
                                        disabled={plexPairing}
                                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg flex-shrink-0 flex items-center gap-2 cursor-pointer"
                                    >
                                        {plexPairing ? (
                                            <>
                                                <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                                                <span>{plexPairingStatus || 'Pairing...'}</span>
                                            </>
                                        ) : (
                                            <span>Pair with Plex Account</span>
                                        )}
                                    </button>
                                </div>
                            )}

                            <div className="md:col-span-2 space-y-2 mt-2">
                                <label className="text-sm font-medium text-zinc-300">Instance Indicator Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {predefinedColors.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setColor(c)}
                                            className={`w-6 h-6 rounded-full ${c} ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-zinc-900 border-2 border-transparent' : 'opacity-70 hover:opacity-100 border border-zinc-800'}`}
                                            aria-label={`Select ${c}`}
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="md:col-span-2 mt-2">
                                <button
                                    type="submit"
                                    disabled={!name || !url || !apiKey}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-6 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {editTargetId ? 'Update Connection' : 'Add Connection'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ── SUBTOPIC 2: AUTOMATION & STORAGE ── */}
            {activeSettingsTab === 'automation' && (
                <div className="space-y-8 animate-in fade-in duration-200">
                    {/* Storage Guard Control Panel */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xl">
                        {/* Top Banner Header with Master Switch & Nuke Threshold Number */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800">
                            <div>
                                <h2 className="text-xl font-black text-white flex items-center gap-2.5">
                                    <ShieldCheck className="text-emerald-400" size={22} />
                                    Storage Guard
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                        diskAutocleanEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-zinc-800 text-zinc-500 border border-zinc-700'
                                    }`}>
                                        {diskAutocleanEnabled ? 'ACTIVE' : 'OFF'}
                                    </span>
                                </h2>
                                <p className="text-xs text-zinc-400 font-medium mt-1">Core Rule: IF Total Occupied Space &gt; Nuke Threshold %, automatically nuke media to free space.</p>
                            </div>

                            {/* Master ON / OFF Toggle + Threshold % */}
                            <div className="flex items-center gap-4 bg-zinc-950 p-3 rounded-2xl border border-zinc-800 flex-shrink-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">Nuke Threshold:</span>
                                    <input
                                        type="number"
                                        min="50"
                                        max="99"
                                        value={diskPauseThreshold}
                                        onChange={e => {
                                            const val = Math.min(99, Math.max(50, parseInt(e.target.value) || 90));
                                            setDiskPauseThreshold(val);
                                            updateSetting('storage_guard_threshold', String(val));
                                            updateSetting('disk_pause_threshold', String(val));
                                            updateSetting('disk_autoclean_threshold', String(val));
                                        }}
                                        className="w-16 bg-zinc-900 border border-zinc-700 rounded-xl text-center py-1 text-emerald-400 font-black text-sm outline-none focus:border-emerald-500"
                                    />
                                    <span className="text-xs font-black text-emerald-400">%</span>
                                </div>

                                <div className="w-px h-6 bg-zinc-800" />

                                <button
                                    onClick={async () => {
                                        const next = !diskAutocleanEnabled;
                                        setDiskAutocleanEnabled(next);
                                        await updateSetting('storage_guard_enabled', String(next));
                                        await updateSetting('disk_autoclean_enabled', String(next));
                                        toast.success(next ? 'Storage Guard Activated' : 'Storage Guard Deactivated');
                                    }}
                                    className={`w-12 h-6.5 rounded-full transition-all relative flex-shrink-0 p-0.5 cursor-pointer ${diskAutocleanEnabled ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]' : 'bg-zinc-800'}`}
                                    title={diskAutocleanEnabled ? 'Deactivate Storage Guard' : 'Activate Storage Guard'}
                                >
                                    <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${diskAutocleanEnabled ? 'translate-x-5.5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Visual Disk Meter */}
                        {diskInfo ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                                    <span>Total Storage Meter</span>
                                    <span className={diskInfo.usedPercent >= diskPauseThreshold ? 'text-red-400 font-black' : 'text-emerald-400'}>
                                        {diskInfo.totalBytes >= 1e12
                                            ? `${(diskInfo.usedBytes / 1e12).toFixed(2)} TB used / ${(diskInfo.totalBytes / 1e12).toFixed(2)} TB total (${diskInfo.usedPercent}%)`
                                            : `${(diskInfo.usedBytes / 1e9).toFixed(1)} GB used / ${(diskInfo.totalBytes / 1e9).toFixed(1)} GB total (${diskInfo.usedPercent}%)`
                                        }
                                    </span>
                                </div>
                                <div className="relative h-4 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                                    <div
                                        className={`h-full rounded-full transition-all duration-1000 ${
                                            diskInfo.usedPercent >= diskPauseThreshold ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                                            : diskInfo.usedPercent >= 75 ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                                            : 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                                        }`}
                                        style={{ width: `${diskInfo.usedPercent}%` }}
                                    />
                                    <div
                                        className="absolute top-0 bottom-0 w-0.5 bg-white/70 border-r border-dashed border-white/50"
                                        style={{ left: `${diskPauseThreshold}%` }}
                                        title={`Nuke threshold: ${diskPauseThreshold}%`}
                                    />
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Scheduler Configuration & TMDB API Key */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-6">
                        <div>
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Sparkles size={20} className="text-indigo-400" /> Batch Search Scheduler
                            </h2>
                            <p className="text-xs text-zinc-400 mt-1 font-medium">Configure automated missing item sweeps and search rotations.</p>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Interval (Min)</label>
                                <input
                                    type="number" min={1} max={10080} value={schedulerConfig.interval}
                                    onChange={e => { const v = Math.max(1, Math.min(10080, Number(e.target.value))); const nc = { ...schedulerConfig, interval: v }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }}
                                    className="bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-white outline-none"
                                />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Batch Size</label>
                                <CustomSelect options={[...Array(50)].map((_, i) => ({ id: i + 1, name: (i + 1).toString() }))} value={schedulerConfig.batchSize}
                                    onChange={val => { const n = Number(String(val).match(/\d+/)?.[0] || 10); const nc = { ...schedulerConfig, batchSize: n }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Rotation Mode</label>
                                <CustomSelect options={[{ id: 'repeat', name: 'Repeat' }, { id: 'rotate', name: 'Rotate' }]} value={schedulerConfig.batchBehavior}
                                    onChange={val => { const nc = { ...schedulerConfig, batchBehavior: val as string }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }} />
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">State</label>
                                <button
                                    onClick={() => { const nc = { ...schedulerConfig, enabled: !schedulerConfig.enabled }; setSchedulerConfig(nc); fetch('/api/scheduler/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(nc) }); }}
                                    className={`h-10 px-4 text-xs font-bold uppercase rounded-xl transition-all border cursor-pointer ${
                                        schedulerConfig.enabled
                                            ? 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                            : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-white'
                                    }`}
                                >
                                    {schedulerConfig.enabled ? 'Enabled' : 'Paused'}
                                </button>
                            </div>
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={async () => { setIsRunningBatch(true); try { await fetch('/api/scheduler/run', { method: 'POST' }); toast.success('Batch search triggered!'); } catch { toast.error('Failed to trigger search.'); } setIsRunningBatch(false); }}
                                disabled={isRunningBatch || !schedulerConfig.enabled}
                                className={`w-full h-11 text-xs font-bold uppercase tracking-wider rounded-xl transition-all border cursor-pointer ${
                                    isRunningBatch
                                        ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                        : !schedulerConfig.enabled
                                            ? 'bg-zinc-900 text-zinc-600 border-zinc-800 cursor-not-allowed'
                                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500'
                                }`}
                            >
                                {isRunningBatch ? 'Running...' : 'Run Batch Search Now'}
                            </button>
                        </div>

                        {/* TMDB API Key */}
                        <div className="pt-6 border-t border-zinc-800 space-y-2">
                            <label className="text-sm font-medium text-zinc-300">TMDB API Key (Metadata &amp; Discover)</label>

                            {tmdbState === 'view' ? (
                                <div className="flex items-center justify-between bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Status: Configured</span>
                                        <span className="text-white font-mono text-sm">{tmdbApiKey ? `${tmdbApiKey.slice(0, 4)}••••••••` : 'Not Configured'}</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setTmdbInput(tmdbApiKey);
                                            setTmdbState('edit');
                                        }}
                                        className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                                    >
                                        Change
                                    </button>
                                </div>
                            ) : tmdbState === 'edit' ? (
                                <div className="flex gap-2">
                                    <input
                                        type="password"
                                        placeholder="Paste your TMDB API Key"
                                        value={tmdbInput}
                                        onChange={e => setTmdbInput(e.target.value)}
                                        className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-emerald-500 outline-none placeholder:text-zinc-600"
                                    />
                                    <button
                                        onClick={() => setTmdbState('confirm')}
                                        disabled={!tmdbInput}
                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs transition-colors cursor-pointer"
                                    >
                                        Save Key
                                    </button>
                                    {tmdbApiKey && (
                                        <button
                                            onClick={() => setTmdbState('view')}
                                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl font-bold text-xs transition-colors cursor-pointer"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-3 animate-in fade-in slide-in-from-top-1 duration-200">
                                    <div className="flex items-center gap-3">
                                        <div className="p-1.5 bg-emerald-500/20 rounded-full">
                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                        </div>
                                        <span className="text-sm text-emerald-500 font-bold">Confirm saving this key?</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={async () => {
                                                await updateSetting('tmdb_api_key', tmdbInput);
                                                setTmdbApiKey(tmdbInput);
                                                setTmdbState('view');
                                            }}
                                            className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black transition-all cursor-pointer"
                                        >
                                            Confirm
                                        </button>
                                        <button
                                            onClick={() => setTmdbState('edit')}
                                            className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all cursor-pointer"
                                        >
                                            Back
                                        </button>
                                    </div>
                                </div>
                            )}
                            <p className="text-[10px] text-zinc-500 mt-1">Enables richer artwork, trailers, and discovery recommendations.</p>
                        </div>
                    </div>

                    {/* Smart Library Auto-Cleaner */}
                    <div className={`bg-zinc-900 border ${isQbitCleanOpen ? 'border-violet-500/30' : 'border-zinc-800'} rounded-2xl transition-all overflow-hidden shadow-lg`}>
                        <button
                            onClick={() => {
                                setIsQbitCleanOpen(!isQbitCleanOpen);
                                if (!isQbitCleanOpen) {
                                    fetchCandidates();
                                }
                            }}
                            className="w-full flex items-center justify-between p-5 hover:bg-zinc-800/50 transition-colors cursor-pointer"
                        >
                            <div className="flex items-center gap-4">
                                <div className={`p-2.5 rounded-xl ${isQbitCleanOpen ? 'bg-violet-500/10 text-violet-400' : 'bg-zinc-800 text-zinc-500'}`}>
                                    <Trash2 size={20} />
                                </div>
                                <div className="text-left">
                                    <h2 className="text-base font-bold text-white tracking-tight">Smart Library Auto-Cleaner</h2>
                                    <p className="text-xs text-zinc-500 font-medium">Automatically purge older or watched library media from Radarr/Sonarr when disk is full.</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <ChevronDown size={16} className={`text-zinc-500 transition-transform duration-300 ${isQbitCleanOpen ? 'rotate-180' : ''}`} />
                            </div>
                        </button>

                        {isQbitCleanOpen && (
                            <div className="p-6 pt-0 border-t border-zinc-800/50 animate-in fade-in slide-in-from-top-4 duration-300 space-y-6 mt-0 pt-6">
                                <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="text-sm font-bold text-zinc-200">Enable Smart Auto-Clean</div>
                                            <p className="text-[10px] text-zinc-500 font-medium mt-0.5">
                                                Automatically delete library media files from Radarr/Sonarr to free up space when the threshold is reached.
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const next = !diskAutocleanEnabled;
                                                setDiskAutocleanEnabled(next);
                                                updateSetting('disk_autoclean_enabled', next);
                                            }}
                                            className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 cursor-pointer ${ diskAutocleanEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                                        >
                                            <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${diskAutocleanEnabled ? 'left-6' : 'left-1'}`} />
                                        </button>
                                    </div>

                                    <div className={`space-y-4 transition-all duration-300 ${diskAutocleanEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                                        <div className="border-t border-zinc-900 pt-3 space-y-3">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Delete Selection Criteria</label>
                                            <div className="flex flex-wrap gap-2">
                                                {(['largest', 'oldest', 'unplayed'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => {
                                                            setDiskSmartCleanMode(mode);
                                                            updateSetting('qbit_smart_clean_mode', mode);
                                                        }}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all border cursor-pointer ${
                                                            diskSmartCleanMode === mode
                                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                    >
                                                        {mode === 'largest' ? 'Largest Files' : mode === 'oldest' ? 'Oldest Added' : 'Unplayed in Plex'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="border-t border-zinc-900 pt-3 flex items-center justify-between">
                                            <div>
                                                <div className="text-xs font-bold text-zinc-300">Protect Recently Added (Immunity)</div>
                                                <p className="text-[10px] text-zinc-500 mt-0.5">Skip media files added to Radarr/Sonarr within the last few days.</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    const next = !diskSmartCleanImmunityEnabled;
                                                    setDiskSmartCleanImmunityEnabled(next);
                                                    updateSetting('qbit_smart_clean_immunity_enabled', next);
                                                }}
                                                className={`w-10 h-5 rounded-full transition-all relative flex-shrink-0 cursor-pointer ${ diskSmartCleanImmunityEnabled ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]' : 'bg-zinc-700'}`}
                                            >
                                                <div className={`w-3 h-3 rounded-full bg-white absolute top-1 transition-all ${diskSmartCleanImmunityEnabled ? 'left-6' : 'left-1'}`} />
                                            </button>
                                        </div>

                                        {diskSmartCleanImmunityEnabled && (
                                            <div className="pl-4 border-l-2 border-emerald-500/30 space-y-2 animate-in slide-in-from-left-2 duration-200">
                                                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">Immunity Threshold (Days)</label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="90"
                                                        value={diskSmartCleanImmunityDays}
                                                        onChange={e => {
                                                            const val = parseInt(e.target.value) || 7;
                                                            setDiskSmartCleanImmunityDays(val);
                                                            updateSetting('qbit_smart_clean_immunity_days', val);
                                                        }}
                                                        className="w-20 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-emerald-500"
                                                    />
                                                    <span className="text-xs text-zinc-500">Days</span>
                                                </div>
                                            </div>
                                        )}

                                        {/* TV Series Cleanup Level */}
                                        <div className="border-t border-zinc-900 pt-3 space-y-2">
                                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">TV Series Cleanup Level</label>
                                            <p className="text-[10px] text-zinc-500">Control whether entire shows, individual seasons, or single episodes are listed and cleaned.</p>
                                            <div className="flex flex-wrap gap-2">
                                                {(['series', 'season', 'episode'] as const).map(level => (
                                                    <button
                                                        key={level}
                                                        type="button"
                                                        onClick={() => {
                                                            setDiskSmartCleanSeriesLevel(level);
                                                            updateSetting('media_smart_clean_series_level', level);
                                                            setTimeout(fetchCandidates, 300);
                                                        }}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase transition-all border cursor-pointer ${
                                                            diskSmartCleanSeriesLevel === level
                                                                ? 'bg-violet-500/10 border-violet-500/30 text-violet-400'
                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                        }`}
                                                    >
                                                        {level === 'series' ? 'Entire Show' : level === 'season' ? 'By Season' : 'By Episode'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Candidates List Section */}
                                        <div className="border-t border-zinc-900 pt-4 space-y-3">
                                            <div className="flex items-center justify-between flex-wrap gap-2">
                                                <div>
                                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Cleanup Candidate Queue</label>
                                                    <p className="text-[10px] text-zinc-500 mt-0.5">Items queued for auto-deletion based on rules.</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            try {
                                                                toast.info('Trimming disk usage to target threshold...');
                                                                const res = await fetch('/api/media/smart-clean', { method: 'POST' });
                                                                const json = await res.json();
                                                                if (json.cleanedCount > 0) {
                                                                    toast.success(json.message || `Cleaned ${json.cleanedCount} items.`);
                                                                } else {
                                                                    toast.info(json.message || 'Disk space is within target threshold.');
                                                                }
                                                                setTimeout(() => { fetchCandidates(); fetch('/api/system/disk').then(r => r.ok ? r.json() : null).then(d => { if (d) setDiskInfo(d); }); }, 1500);
                                                            } catch (e: any) {
                                                                toast.error('Clean to threshold failed');
                                                            }
                                                        }}
                                                        className="px-3 py-1.5 min-h-[36px] bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-95 rounded-xl text-xs font-black uppercase transition-all flex items-center gap-1.5 cursor-pointer"
                                                        title="Trim items until disk space falls below target threshold"
                                                    >
                                                        Clean to Threshold Now
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={fetchCandidates}
                                                        className="px-2.5 py-1.5 min-h-[36px] bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-xl text-xs font-bold uppercase transition-all cursor-pointer"
                                                    >
                                                        Refresh
                                                    </button>
                                                </div>
                                            </div>

                                            {loadingCandidates ? (
                                                <div className="flex items-center gap-2 text-zinc-600 text-xs py-4 justify-center">
                                                    <div className="w-3.5 h-3.5 border border-zinc-700 border-t-zinc-400 rounded-full animate-spin" /> Fetching candidates...
                                                </div>
                                            ) : (!Array.isArray(candidates) || candidates.length === 0) ? (
                                                <p className="text-xs text-zinc-600 italic text-center py-4">No eligible items found.</p>
                                            ) : (
                                                <div className="max-h-[280px] overflow-y-auto pr-1 space-y-1.5 border border-zinc-900/50 rounded-2xl p-2 bg-zinc-950/20 custom-scrollbar">
                                                    {candidates.map((c, index) => (
                                                        <div
                                                            key={c.key}
                                                            className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                                                                c.ignored
                                                                    ? 'bg-zinc-950/40 border-zinc-900/80 opacity-60'
                                                                    : 'bg-zinc-900/80 border-zinc-800/60 hover:border-zinc-700'
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                                                <div className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center flex-shrink-0 ${
                                                                    c.ignored ? 'bg-zinc-800 text-zinc-600' : 'bg-amber-500/10 border border-amber-500/20 text-amber-500'
                                                                }`}>
                                                                    {c.ignored ? '–' : index + 1}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                                        <span className={`text-xs font-bold truncate max-w-[180px] ${c.ignored ? 'line-through text-zinc-600' : 'text-zinc-200'}`}>{c.title}</span>
                                                                        <span className={`text-[9px] px-1 py-0.5 rounded font-black uppercase flex-shrink-0 ${
                                                                            c.type === 'movie' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                                                            : c.type === 'season' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                                                            : c.type === 'episode' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                                                            : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                                                        }`}>{c.type}</span>
                                                                        {c.isWatched && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1 py-0.5 rounded font-bold uppercase flex-shrink-0">Watched</span>}
                                                                    </div>
                                                                    <p className="text-[9px] text-zinc-600 mt-0.5 truncate font-medium">
                                                                        {new Date(c.added).toLocaleDateString()} · {c.instanceName}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                                                                <span className="text-[10px] font-black text-zinc-400 font-mono">{(c.size / (1024 ** 3)).toFixed(1)}GB</span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleIgnoreCandidate(c.key)}
                                                                    className={`px-2.5 py-1.5 min-h-[32px] rounded-lg text-[10px] font-black uppercase border transition-all cursor-pointer ${
                                                                        c.ignored
                                                                            ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                                                                            : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
                                                                    }`}
                                                                >
                                                                    {c.ignored ? 'Unignore' : 'Ignore'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── SUBTOPIC 3: SYSTEM & MAINTENANCE ── */}
            {activeSettingsTab === 'system' && (
                <div className="space-y-8 animate-in fade-in duration-200">
                    {/* System Updates & Version Manager */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-2xl relative">
                        {/* Visual Accent */}
                        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500" />
                        
                        {/* Header with Tabs */}
                        <div className="bg-zinc-800/40 p-6 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Cpu size={22} className="text-emerald-400" />
                                    System &amp; Updates
                                </h2>
                                <p className="text-xs text-zinc-400 mt-1">Manage system configurations, check updates, and troubleshoot container environment.</p>
                            </div>
                            
                            {/* Tab Navigation */}
                            <div className="flex bg-zinc-950 p-1 rounded-xl border border-zinc-800/80 self-start sm:self-center">
                                <button
                                    onClick={() => setActiveTab('status')}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'status' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    Status &amp; Logs
                                </button>
                                <button
                                    onClick={() => setActiveTab('doctor')}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${activeTab === 'doctor' ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-500 hover:text-zinc-300'}`}
                                >
                                    <Wrench size={12} />
                                    Setup Doctor
                                    {selfInfo && (!selfInfo.available || !selfInfo.isDataWritable) && (
                                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {activeTab === 'status' ? (
                            <div className="animate-in fade-in duration-300">
                                {/* Version status cards */}
                                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 space-y-1">
                                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block">Current Version</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl font-black text-white font-mono">v{versionInfo?.currentVersion || '0.0.0'}</span>
                                            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded border border-emerald-500/20 uppercase tracking-wider">Active</span>
                                        </div>
                                    </div>

                                    <div className="bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 space-y-1">
                                        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block">Latest Release</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl font-black text-zinc-200 font-mono">v{versionInfo?.latestVersion || 'Unknown'}</span>
                                            {versionInfo?.updateAvailable ? (
                                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-black rounded border border-amber-500/20 uppercase tracking-wider animate-pulse">Update Available</span>
                                            ) : (
                                                <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[9px] font-black rounded border border-zinc-700 uppercase tracking-wider">Up to Date</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-end sm:justify-start md:justify-end gap-3">
                                        <button
                                            onClick={handleCheckUpdate}
                                            disabled={checkingUpdate || updating}
                                            className="bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs transition-all flex items-center gap-2 border border-zinc-700/50 cursor-pointer"
                                        >
                                            {checkingUpdate ? (
                                                <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <RefreshCw size={14} />
                                            )}
                                            Check Info
                                        </button>

                                        {versionInfo?.updateAvailable ? (
                                            <button
                                                onClick={() => handleUpdate()}
                                                disabled={updating || checkingUpdate}
                                                className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-5 rounded-xl text-xs transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                                            >
                                                {updating ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <Download size={14} />
                                                )}
                                                {updating ? 'Updating...' : 'Update Now'}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Database Housekeeping section */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Database size={20} className="text-emerald-400" /> Database Housekeeping
                                </h2>
                                <p className="text-sm text-zinc-400 mt-1">Manage database storage retention, log pruning, and SQLite performance.</p>
                            </div>
                            {dbStats && (
                                <div className="text-xs font-bold text-zinc-400 bg-zinc-800 px-3 py-1.5 rounded-xl">
                                    {Math.round(dbStats.totalSizeBytes / (1024 * 1024))} MB Database Size
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                            <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Retention (Days)</label>
                                    <span className="text-[10px] text-zinc-600 font-bold uppercase">Manual Cleanup</span>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="number"
                                        min="7"
                                        placeholder="30"
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 text-sm text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50 outline-none transition-all"
                                        defaultValue={getSettingValue('db_retention_days') || '30'}
                                        onBlur={(e) => updateSetting('db_retention_days', e.target.value)}
                                    />
                                    <button 
                                        onClick={async () => {
                                            const res = await fetch('/api/system/housekeeping/', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ daysToKeep: parseInt(getSettingValue('db_retention_days') || '30') })
                                            });
                                            if (res.ok) {
                                                toast.success("Cleanup complete!");
                                                fetch('/api/stats/db-info').then(r => r.json()).then(setDbStats);
                                            }
                                        }}
                                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-600/10 active:scale-95 cursor-pointer"
                                    >
                                        Cleanup
                                    </button>
                                </div>
                                <p className="text-[10px] text-zinc-500 leading-relaxed italic">Deletes old telemetry logs and search activity. Reclaims database pages.</p>
                            </div>

                            <div className="space-y-2 max-h-[160px] overflow-y-auto pr-2 custom-scrollbar">
                                <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest block px-1">Table Metrics</span>
                                {dbStats?.tableStats.map((table: any) => (
                                    <div key={table.name} className="flex items-center justify-between p-2.5 bg-zinc-950/30 rounded-xl border border-zinc-800/50">
                                        <span className="text-xs font-medium text-zinc-400 capitalize">{table.name.replace(/_/g, ' ')}</span>
                                        <span className="text-xs font-bold text-zinc-200">{table.count.toLocaleString()} rows</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Backup & Restore Section */}
                    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                    <Database size={20} className="text-amber-400" /> Backup &amp; Restore
                                </h2>
                                <p className="text-sm text-zinc-400 mt-1">Export your instances and configuration into an encrypted backup file or restore anytime.</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={handleExport}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center gap-2 text-xs cursor-pointer border border-zinc-700/60"
                                >
                                    <Download size={15} />
                                    Export Backup
                                </button>
                                <button
                                    onClick={handleImport}
                                    className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-2.5 px-4 rounded-xl transition-colors flex items-center gap-2 text-xs cursor-pointer border border-zinc-700/60"
                                >
                                    <Upload size={15} />
                                    Restore Backup
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 flex flex-col md:flex-row items-center justify-between text-sm">
                <div className="flex flex-col md:flex-row items-center gap-4 mb-4 md:mb-0 text-center md:text-left">
                    <img
                        src="/author.png"
                        alt="Author"
                        className="w-14 h-14 rounded-full object-cover transition-all border-2 border-zinc-800 shadow-xl hover:scale-105 hover:border-emerald-500/50 cursor-pointer"
                        onClick={() => setIsAuthorModalOpen(true)}
                    />
                    <div>
                        <p className="font-medium text-zinc-300 text-base">Schedulearr is free and unlocked forever.</p>
                        <p className="text-zinc-500 mt-1">If this app saved you time, <a href="https://ko-fi.com/flash4k" target="_blank" rel="noopener noreferrer" className="text-emerald-500 hover:text-emerald-400 font-semibold underline underline-offset-2 transition-colors">you can buy me a coffee here!</a></p>
                    </div>
                </div>
                <div className="text-zinc-600 text-xs text-center md:text-right">
                    &copy; {new Date().getFullYear()} Schedulearr<br />
                    <span className="opacity-50 mt-1 inline-block">v0.2.2</span>
                </div>
            </div>

            {/* Author Appreciation Modal */}
            {isAuthorModalOpen && (
                <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setIsAuthorModalOpen(false)}>
                    <div
                        className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center relative overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <button
                            className="absolute top-4 right-4 text-zinc-500 hover:text-white transition-colors p-1"
                            onClick={() => setIsAuthorModalOpen(false)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        </button>

                        <div className="relative mb-6 group">
                            <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-xl scale-110 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                            <img
                                src="/author.png"
                                alt="Author"
                                className="w-32 h-32 rounded-full object-cover border-4 border-zinc-800 shadow-2xl relative z-10"
                            />
                        </div>

                        <h3 className="text-2xl font-bold text-white mb-2 tracking-tight">Thank You!</h3>
                        <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                            I built Schedulearr to scratch my own itch, and it's amazing to see others finding it useful. Your support helps me keep improving it and motivates me to build more cool features!
                        </p>

                        <a
                            href="https://ko-fi.com/flash4k"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 px-4 bg-[#FF5E5B] hover:bg-[#ff4642] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-[#FF5E5B]/20 hover:shadow-[#FF5E5B]/40 hover:-translate-y-0.5"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.143V14.12s5.404.14 7.279-1.928c1.642-1.815 1.543-2.618 1.543-2.618h-.001C25.043 8.358 23.88 8.949 23.88 8.949zm-13.84 5.253a.294.294 0 01-.002.415c-1.354 1.341-3.619 1.332-4.966-.008L3.195 12.72s-1.464-1.428-1.439-3.235c.039-2.028 1.704-3.558 3.659-3.511 1.054.025 2.103.542 2.809 1.488 1.15-.992 2.37-1.488 3.511-1.488 2.339 0 3.738 1.847 3.69 3.824-.044 1.802-1.385 3.398-1.385 3.398l-4.001 3.998zm6.444-4.513h-2.115V6.756h2.15v3.425c.01.218.006.452.006.452s1.428.17 1.423 1.334c-.004 1.002-1.464 1.053-1.464 1.053z" />
                            </svg>
                            Buy me a Coffee on Ko-fi
                        </a>

                        <button
                            className="mt-4 text-sm font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
                            onClick={() => setIsAuthorModalOpen(false)}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}

            {/* Docker Socket Troubleshoot Helper Modal */}
            {activeTroubleshootModal === 'socket' && (
                <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={() => setActiveTroubleshootModal(null)}>
                    <div
                        className="bg-zinc-900 border border-amber-500/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col gap-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 border border-amber-500/20">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">Docker Connection Helper</h3>
                                    <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Super Easy 1-Click Fix</span>
                                </div>
                            </div>
                            <button
                                className="text-zinc-500 hover:text-white transition-colors p-1"
                                onClick={() => setActiveTroubleshootModal(null)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-amber-950/20 border border-amber-500/10 p-4 rounded-xl text-xs text-zinc-300 leading-relaxed space-y-2">
                                <p className="font-bold text-white">What's the problem?</p>
                                <p>Schedulearr cannot talk to Unraid's Docker service. This means Schedulearr cannot update itself automatically when a new version is released!</p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-black text-white uppercase tracking-wider">👉 How to fix in 3 seconds:</p>
                                <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-2 pl-1 leading-relaxed">
                                    <li>Click the big <span className="text-amber-400 font-bold">Copy Command</span> button below.</li>
                                    <li>Open your <span className="text-white font-bold">Unraid Terminal</span> (click the little <strong>&gt;_</strong> icon at the top right of your Unraid web page).</li>
                                    <li>Right-click in the terminal, select <span className="text-white font-bold">Paste</span>, and press <span className="text-emerald-400 font-black">ENTER</span>!</li>
                                </ol>
                            </div>

                            {selfInfo?.reason && (
                                <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-[10px] text-zinc-500 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                                    <span className="font-bold text-zinc-400 block mb-1">Raw Error Reason:</span>
                                    {selfInfo.reason}
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Copy this exact command:</span>
                                </div>
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-[11px] text-amber-400 relative group overflow-hidden break-all pr-14 leading-relaxed">
                                    <span className="text-zinc-500">docker stop Schedulearr; docker rm Schedulearr;</span> <span className="text-amber-300">echo &quot;[XML]&quot; | base64 -d &gt; /boot/config/plugins/dockerMan/templates-user/my-Schedulearr.xml;</span> docker run -d --name=Schedulearr -p {selfInfo?.ports?.[0]?.host || 3010}:3010 ...
                                    <button
                                        onClick={() => {
                                            copyToClipboard(getFixSocketCommand());
                                            toast.success('Command copied to clipboard!');
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-800 hover:border-zinc-700 shadow-lg"
                                        title="Copy to Clipboard"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                            <button
                                className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-black font-bold rounded-xl transition-all shadow-lg shadow-amber-500/10 hover:shadow-amber-500/20 text-xs uppercase tracking-wider"
                                onClick={() => {
                                    copyToClipboard(getFixSocketCommand());
                                    toast.success('Command copied!');
                                }}
                            >
                                Copy Command
                            </button>
                            <button
                                className="py-3 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-all text-xs uppercase tracking-wider border border-zinc-700/50"
                                onClick={() => setActiveTroubleshootModal(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Folder Permissions Troubleshoot Helper Modal */}
            {activeTroubleshootModal === 'perms' && (
                <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4" onClick={() => setActiveTroubleshootModal(null)}>
                    <div
                        className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative overflow-hidden flex flex-col gap-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none"></div>

                        <div className="flex items-start justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-red-500/10 rounded-xl text-red-400 border border-red-500/20">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white tracking-tight">Folder Permissions Helper</h3>
                                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Super Easy 1-Click Fix</span>
                                </div>
                            </div>
                            <button
                                className="text-zinc-500 hover:text-white transition-colors p-1"
                                onClick={() => setActiveTroubleshootModal(null)}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-red-950/20 border border-red-500/10 p-4 rounded-xl text-xs text-zinc-300 leading-relaxed space-y-2">
                                <p className="font-bold text-white">What's the problem?</p>
                                <p>Schedulearr is locked out of its database folder! Unraid's permissions are preventing the app from saving settings and syncing media.</p>
                            </div>

                            <div className="space-y-3">
                                <p className="text-xs font-black text-white uppercase tracking-wider">How to fix in 3 seconds:</p>
                                <ol className="list-decimal list-inside text-xs text-zinc-400 space-y-2 pl-1 leading-relaxed">
                                    <li>Click the big <span className="text-red-400 font-bold">Copy Command</span> button below.</li>
                                    <li>Open your <span className="text-white font-bold">Unraid Terminal</span> (click the little <strong>&gt;_</strong> icon at the top right of your Unraid web page).</li>
                                    <li>Right-click in the terminal, select <span className="text-white font-bold">Paste</span>, and press <span className="text-emerald-400 font-black">ENTER</span>!</li>
                                </ol>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Copy this exact command:</span>
                                </div>
                                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 font-mono text-[11px] text-red-400 relative group overflow-hidden break-all pr-14 leading-relaxed">
                                    chown -R nobody:users {selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'} && chmod -R 775 {selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'}
                                    <button
                                        onClick={() => {
                                            copyToClipboard(`chown -R nobody:users ${selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'} && chmod -R 775 ${selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'}`);
                                            toast.success('Command copied to clipboard!');
                                        }}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-800 hover:border-zinc-700 shadow-lg"
                                        title="Copy to Clipboard"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 mt-2">
                            <button
                                className="flex-1 py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-500/10 hover:shadow-red-500/20 text-xs uppercase tracking-wider"
                                onClick={() => {
                                    copyToClipboard(`chown -R nobody:users ${selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'} && chmod -R 775 ${selfInfo?.dataHostPath || '/mnt/user/appdata/Schedulearr/data'}`);
                                    toast.success('Command copied!');
                                }}
                            >
                                Copy Command
                            </button>
                            <button
                                className="py-3 px-5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-all text-xs uppercase tracking-wider border border-zinc-700/50"
                                onClick={() => setActiveTroubleshootModal(null)}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Confirmation Modal */}
            {confirmModal && (
                <div
                    className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-150"
                    onClick={() => setConfirmModal(null)}
                >
                    <div
                        className={`bg-zinc-900 border rounded-2xl p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-150 ${
                            confirmModal.danger ? 'border-red-500/30' : 'border-zinc-700/50'
                        }`}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Ambient glow */}
                        <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl pointer-events-none opacity-40 ${
                            confirmModal.danger ? 'bg-red-500/20' : 'bg-emerald-500/15'
                        }`} />

                        <h3 className="text-lg font-black text-white tracking-tight mb-2">
                            {confirmModal.title}
                        </h3>
                        <p className="text-sm text-zinc-400 leading-relaxed mb-6">
                            {confirmModal.message}
                        </p>
                        <div className="flex items-center gap-3">
                            <button
                                className="py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold rounded-xl transition-all text-xs uppercase tracking-wider border border-zinc-700/50 flex-1"
                                onClick={() => setConfirmModal(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className={`py-2.5 px-4 font-black rounded-xl transition-all text-xs uppercase tracking-wider flex-1 shadow-lg active:scale-95 ${
                                    confirmModal.danger
                                        ? 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20'
                                        : 'bg-emerald-500 hover:bg-emerald-400 text-white shadow-emerald-500/20'
                                }`}
                                onClick={() => {
                                    confirmModal.onConfirm();
                                    setConfirmModal(null);
                                }}
                            >
                                {confirmModal.confirmLabel || 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
