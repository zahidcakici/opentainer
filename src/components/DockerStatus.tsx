import { motion, AnimatePresence } from 'framer-motion';
import { Box, Download, AlertTriangle, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export type DockerState = 'checking' | 'not-installed' | 'starting' | 'stopping' | 'ready' | 'error';

interface DockerStatusProps {
    state: DockerState;
    errorMessage?: string;
    onRetry?: () => void;
}

const DockerStatus: React.FC<DockerStatusProps> = ({ state, errorMessage, onRetry }) => {
    if (state === 'ready') {
        return null;
    }

    const containerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        zIndex: 1000,
        padding: '40px',
    };

    const cardStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '24px',
        padding: '48px',
        background: 'var(--bg-panel)',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center',
    };

    const iconContainerStyle: React.CSSProperties = {
        width: '80px',
        height: '80px',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-hover)',
        border: '1px solid var(--border-subtle)',
    };

    const titleStyle: React.CSSProperties = {
        fontSize: '20px',
        fontWeight: 600,
        color: 'var(--text-primary)',
        margin: 0,
    };

    const descStyle: React.CSSProperties = {
        fontSize: '14px',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
        margin: 0,
    };

    const buttonStyle: React.CSSProperties = {
        padding: '12px 24px',
        fontSize: '14px',
        fontWeight: 500,
        borderRadius: '8px',
        border: 'none',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
    };

    const primaryButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        background: 'var(--text-primary)',
        color: 'var(--bg-app)',
    };

    const secondaryButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        background: 'transparent',
        color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)',
    };

    return (
        <AnimatePresence>
            <motion.div
                style={containerStyle}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    style={cardStyle}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                >
                    {state === 'checking' && (
                        <>
                            <div style={iconContainerStyle}>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                                >
                                    <Loader2 size={32} color="var(--text-secondary)" />
                                </motion.div>
                            </div>
                            <h2 style={titleStyle}>Checking Docker Status</h2>
                            <p style={descStyle}>
                                Verifying Docker is installed and running...
                            </p>
                        </>
                    )}

                    {state === 'not-installed' && (
                        <>
                            <div style={{ ...iconContainerStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                <Box size={32} color="var(--status-error)" />
                            </div>
                            <h2 style={titleStyle}>Docker Runtime Not Found</h2>
                            <p style={descStyle}>
                                No Docker runtime was detected. Install Colima to enable container management:
                            </p>
                            <div style={{
                                padding: '12px 16px',
                                background: 'var(--bg-hover)',
                                borderRadius: '8px',
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                color: 'var(--text-primary)',
                                width: '100%',
                            }}>
                                brew install colima docker
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button style={primaryButtonStyle} onClick={() => api.openExternal('https://github.com/abiosoft/colima')}>
                                    <Download size={16} />
                                    Learn More
                                </button>
                                {onRetry && (
                                    <button style={secondaryButtonStyle} onClick={onRetry}>
                                        Retry
                                    </button>
                                )}
                            </div>
                        </>
                    )}

                    {state === 'starting' && (
                        <>
                            <div style={iconContainerStyle}>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                >
                                    <Loader2 size={32} color="var(--status-running)" />
                                </motion.div>
                            </div>
                            <h2 style={titleStyle}>Starting Docker</h2>
                            <p style={descStyle}>
                                Docker is being started. This may take a few moments...
                            </p>
                            <div style={{
                                width: '100%',
                                height: '4px',
                                background: 'var(--bg-hover)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                            }}>
                                <motion.div
                                    style={{
                                        height: '100%',
                                        background: 'var(--status-running)',
                                        borderRadius: '2px',
                                    }}
                                    initial={{ width: '0%' }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 15, ease: 'linear' }}
                                />
                            </div>
                        </>
                    )}

                    {state === 'stopping' && (
                        <>
                            <div style={iconContainerStyle}>
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                >
                                    <Loader2 size={32} color="var(--text-secondary)" />
                                </motion.div>
                            </div>
                            <h2 style={titleStyle}>Stopping Docker</h2>
                            <p style={descStyle}>
                                Cleaning up... This will only take a moment.
                            </p>
                        </>
                    )}

                    {state === 'error' && (
                        <>
                            <div style={{ ...iconContainerStyle, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                <AlertTriangle size={32} color="var(--status-error)" />
                            </div>
                            <h2 style={titleStyle}>Failed to Start Docker</h2>
                            <p style={descStyle}>
                                {errorMessage || 'Docker could not be started. Please try starting it manually.'}
                            </p>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {onRetry && (
                                    <button style={primaryButtonStyle} onClick={onRetry}>
                                        Try Again
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </motion.div>

                {/* App branding at bottom */}
                <div style={{
                    position: 'absolute',
                    bottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                }}>
                    <img src="/icon-256.png" alt="Opentainer" style={{ width: '16px', height: '16px', opacity: 0.5 }} />
                    Opentainer
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default DockerStatus;
