import React from 'react';
import { motion } from 'framer-motion';
import { Download, X } from 'lucide-react';

interface UpdateBannerProps {
    version: string;
    onView: () => void;
    onDismiss: () => void;
}

// Non-blocking notice shown after a background update check finds a new version.
const UpdateBanner: React.FC<UpdateBannerProps> = ({ version, onView, onDismiss }) => (
    <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        role="status"
        style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 14px', marginBottom: '16px',
            background: 'var(--bg-panel)', borderRadius: '8px',
            border: '1px solid var(--border-subtle)', fontSize: '13px',
        }}
    >
        <Download size={16} color="var(--status-running)" />
        <span style={{ flex: 1, color: 'var(--text-primary)' }}>
            Opentainer {version} is available.
        </span>
        <button
            onClick={onView}
            style={{
                padding: '6px 12px', fontSize: '12px', fontWeight: 500, borderRadius: '6px',
                border: 'none', background: 'var(--text-primary)', color: 'var(--bg-app)', cursor: 'pointer',
            }}
        >
            View update
        </button>
        <button
            onClick={onDismiss}
            aria-label="Dismiss"
            style={{
                display: 'flex', padding: '4px', border: 'none', borderRadius: '4px',
                background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
            }}
        >
            <X size={14} />
        </button>
    </motion.div>
);

export default UpdateBanner;
