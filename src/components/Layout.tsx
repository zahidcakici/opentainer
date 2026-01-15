import React from 'react';
import { Box, Layers, HardDrive, Network, Settings } from 'lucide-react';
import { api } from '../lib/api';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface SidebarItemProps {
    icon: React.ElementType;
    label: string;
    active: boolean;
    onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        style={{
            display: 'flex',
            alignItems: 'center',
            width: '100%',
            padding: '8px 12px',
            margin: '4px 0',
            borderRadius: '6px',
            background: active ? 'var(--bg-hover)' : 'transparent',
            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
            transition: 'all 0.2s ease',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
        }}
    >
        <Icon size={16} style={{ marginRight: '10px' }} />
        {label}
    </button>
);

interface LayoutProps {
    children: React.ReactNode;
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeTab, setActiveTab }) => {
    const [version, setVersion] = React.useState<string>('');

    React.useEffect(() => {
        api.getAppVersion().then(setVersion);
    }, []);

    const handleDragStart = async (e: React.MouseEvent) => {
        e.preventDefault();
        try {
            await getCurrentWindow().startDragging();
        } catch (err) {
            console.error('Failed to start dragging:', err);
        }
    };

    return (
        <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)', position: 'relative' }}>
            {/* Drag Region - covers entire top 40px */}
            <div
                onMouseDown={handleDragStart}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '40px',
                    zIndex: 100,
                    cursor: 'default',
                }}
            />

            {/* Sidebar */}
            <div style={{
                width: '220px',
                padding: '16px 16px 8px 16px',
                paddingTop: '60px',
                borderRight: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--bg-panel)'
            }}>

                <nav style={{ flex: 1 }}>
                    <SidebarItem
                        icon={Box}
                        label="Containers"
                        active={activeTab === 'containers'}
                        onClick={() => setActiveTab('containers')}
                    />
                    <SidebarItem
                        icon={Layers}
                        label="Images"
                        active={activeTab === 'images'}
                        onClick={() => setActiveTab('images')}
                    />
                    <SidebarItem
                        icon={HardDrive}
                        label="Volumes"
                        active={activeTab === 'volumes'}
                        onClick={() => setActiveTab('volumes')}
                    />
                    <SidebarItem
                        icon={Network}
                        label="Networks"
                        active={activeTab === 'networks'}
                        onClick={() => setActiveTab('networks')}
                    />
                </nav>

                <div>
                    <SidebarItem
                        icon={Settings}
                        label="Settings"
                        active={activeTab === 'settings'}
                        onClick={() => setActiveTab('settings')}
                    />
                </div>

                <div style={{ marginTop: 'auto', padding: '8px 12px', opacity: 0.5, fontSize: '10px', color: 'var(--text-secondary)' }}>
                    v{version || '...'}
                </div>
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {/* Spacer for title bar area */}
                <div style={{ height: '40px', flexShrink: 0 }} />

                {/* Content */}
                <main style={{ flex: 1, overflow: 'auto', padding: '0 24px 24px' }}>
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
