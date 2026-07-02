import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Box, Container, ExternalLink, ArrowLeft, ArrowRight, Cpu, MemoryStick, HardDrive, Loader2, CheckCircle2 } from 'lucide-react';
import { api, AppSettings, ColimaResources, EngineKind } from '../lib/api';

interface EngineWizardProps {
    /** Called after the choice is persisted. The parent kicks off the engine. */
    onComplete: (engine: EngineKind) => void;
    /** Existing settings, when re-running the wizard from Settings. */
    initial?: AppSettings | null;
}

type Step = 'choose' | 'configure' | 'external';

const EXTERNAL_ENGINES = [
    { name: 'OrbStack', url: 'https://orbstack.dev', desc: 'Fast, light Docker & Linux for macOS' },
    { name: 'Docker Desktop', url: 'https://www.docker.com/products/docker-desktop/', desc: 'The official Docker app' },
    { name: 'Podman', url: 'https://podman.io', desc: 'Daemonless container engine' },
];

const EngineWizard: React.FC<EngineWizardProps> = ({ onComplete, initial }) => {
    const [step, setStep] = useState<Step>('choose');
    const [resources, setResources] = useState<ColimaResources>(initial?.colima ?? { cpu: 4, memory: 4, disk: 60 });
    const [loadedRecommended, setLoadedRecommended] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | undefined>();

    // Pre-fill recommended resources (auto-scaled to this machine) unless we
    // were given existing settings to edit.
    useEffect(() => {
        if (initial?.colima) {
            setLoadedRecommended(true);
            return;
        }
        api.getRecommendedResources()
            .then((res) => {
                if (res.success && res.data) setResources(res.data);
            })
            .finally(() => setLoadedRecommended(true));
    }, [initial]);

    const persist = async (engine: EngineKind): Promise<boolean> => {
        setSaving(true);
        setError(undefined);
        const res = await api.updateSettings({
            setup_completed: true,
            engine,
            colima: resources,
        });
        setSaving(false);
        if (!res.success) {
            setError(res.error || 'Failed to save settings');
            return false;
        }
        return true;
    };

    const handleStartColima = async () => {
        if (await persist('colima')) onComplete('colima');
    };

    const handleUseExternal = async () => {
        if (await persist('external')) onComplete('external');
    };

    // ── Styles (match DockerStatus design tokens) ──
    const containerStyle: React.CSSProperties = {
        position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', background: 'var(--bg-app)',
        zIndex: 1000, padding: '40px',
    };
    const cardStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', gap: '24px', padding: '40px',
        background: 'var(--bg-panel)', borderRadius: '16px', border: '1px solid var(--border-subtle)',
        maxWidth: '520px', width: '100%',
    };
    const titleStyle: React.CSSProperties = { fontSize: '20px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 };
    const descStyle: React.CSSProperties = { fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 };
    const buttonStyle: React.CSSProperties = {
        padding: '12px 20px', fontSize: '14px', fontWeight: 500, borderRadius: '8px',
        border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
    };
    const primaryButton: React.CSSProperties = { ...buttonStyle, background: 'var(--text-primary)', color: 'var(--bg-app)' };
    const secondaryButton: React.CSSProperties = {
        ...buttonStyle, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
    };

    const optionCard = (selected: boolean): React.CSSProperties => ({
        display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '16px', textAlign: 'left',
        borderRadius: '10px', cursor: 'pointer', width: '100%', transition: 'all 0.2s ease',
        background: selected ? 'var(--bg-hover)' : 'transparent',
        border: `1px solid ${selected ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
    });

    return (
        <div style={containerStyle}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    style={cardStyle}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                >
                    {step === 'choose' && (
                        <>
                            <div>
                                <h2 style={titleStyle}>Set up a container engine</h2>
                                <p style={{ ...descStyle, marginTop: '8px' }}>
                                    Opentainer needs a Docker engine to manage containers. Pick one to get started.
                                </p>
                            </div>

                            <button style={optionCard(true)} onClick={() => setStep('configure')}>
                                <Container size={22} color="var(--status-running)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Colima</span>
                                        <span style={{
                                            fontSize: '11px', fontWeight: 600, color: 'var(--status-running)',
                                            background: 'rgba(16, 185, 129, 0.12)', padding: '2px 8px', borderRadius: '999px',
                                        }}>Recommended</span>
                                    </div>
                                    <p style={{ ...descStyle, fontSize: '13px', marginTop: '4px' }}>
                                        Bundled and fully managed by Opentainer. No extra installs — just click and go.
                                    </p>
                                </div>
                            </button>

                            <button style={optionCard(false)} onClick={() => setStep('external')}>
                                <Box size={22} color="var(--text-secondary)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                <div>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>I use another engine</span>
                                    <p style={{ ...descStyle, fontSize: '13px', marginTop: '4px' }}>
                                        OrbStack, Docker Desktop, or Podman. Opentainer will connect to it automatically.
                                    </p>
                                </div>
                            </button>
                        </>
                    )}

                    {step === 'configure' && (
                        <>
                            <div>
                                <h2 style={titleStyle}>Configure Colima</h2>
                                <p style={{ ...descStyle, marginTop: '8px' }}>
                                    Recommended values based on your machine. You can change them anytime in Settings.
                                </p>
                            </div>

                            {!loadedRecommended ? (
                                <div style={{ display: 'flex', justifyContent: 'center', padding: '24px' }}>
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                                        <Loader2 size={24} color="var(--text-secondary)" />
                                    </motion.div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    <ResourceField icon={Cpu} label="CPUs" value={resources.cpu} min={1} max={16} step={1}
                                        onChange={(v) => setResources({ ...resources, cpu: v })} />
                                    <ResourceField icon={MemoryStick} label="Memory" unit="GB" value={resources.memory} min={2} max={64} step={1}
                                        onChange={(v) => setResources({ ...resources, memory: v })} />
                                    <ResourceField icon={HardDrive} label="Disk" unit="GB" value={resources.disk} min={20} max={500} step={10}
                                        onChange={(v) => setResources({ ...resources, disk: v })} />
                                </div>
                            )}

                            <p style={{ ...descStyle, fontSize: '12px', color: 'var(--text-muted)' }}>
                                First start downloads a VM image — a one-time setup that may take a few minutes.
                            </p>

                            {error && <p style={{ ...descStyle, color: 'var(--status-error)', fontSize: '13px' }}>{error}</p>}

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                                <button style={secondaryButton} onClick={() => setStep('choose')} disabled={saving}>
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button style={primaryButton} onClick={handleStartColima} disabled={saving || !loadedRecommended}>
                                    {saving ? <Loader2 size={16} /> : <><CheckCircle2 size={16} /> Start Colima</>}
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'external' && (
                        <>
                            <div>
                                <h2 style={titleStyle}>Use another engine</h2>
                                <p style={{ ...descStyle, marginTop: '8px' }}>
                                    Install one of these, then start it. Opentainer connects automatically.
                                </p>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {EXTERNAL_ENGINES.map((e) => (
                                    <button key={e.name} style={optionCard(false)} onClick={() => api.openExternal(e.url)}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{e.name}</span>
                                            <p style={{ ...descStyle, fontSize: '13px', marginTop: '2px' }}>{e.desc}</p>
                                        </div>
                                        <ExternalLink size={16} color="var(--text-muted)" style={{ flexShrink: 0, marginTop: '2px' }} />
                                    </button>
                                ))}
                            </div>

                            {error && <p style={{ ...descStyle, color: 'var(--status-error)', fontSize: '13px' }}>{error}</p>}

                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
                                <button style={secondaryButton} onClick={() => setStep('choose')} disabled={saving}>
                                    <ArrowLeft size={16} /> Back
                                </button>
                                <button style={primaryButton} onClick={handleUseExternal} disabled={saving}>
                                    {saving ? <Loader2 size={16} /> : <>Continue <ArrowRight size={16} /></>}
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

interface ResourceFieldProps {
    icon: React.ComponentType<{ size?: number; color?: string }>;
    label: string;
    unit?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
}

const ResourceField: React.FC<ResourceFieldProps> = ({ icon: Icon, label, unit, value, min, max, step, onChange }) => {
    const clamp = (v: number) => Math.min(max, Math.max(min, v));
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px',
            background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border-subtle)',
        }}>
            <Icon size={18} color="var(--text-secondary)" />
            <span style={{ flex: 1, fontSize: '14px', color: 'var(--text-primary)' }}>{label}</span>
            <input
                type="number"
                value={value}
                min={min}
                max={max}
                step={step}
                onChange={(e) => onChange(clamp(parseInt(e.target.value, 10) || min))}
                style={{
                    width: '72px', textAlign: 'right', padding: '6px 8px', fontSize: '14px',
                    background: 'var(--bg-app)', color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)', borderRadius: '6px',
                    fontFamily: 'var(--font-mono)',
                }}
            />
            {unit && <span style={{ fontSize: '13px', color: 'var(--text-muted)', width: '24px' }}>{unit}</span>}
        </div>
    );
};

export default EngineWizard;
