import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

import ContainerItem from '../ContainerItem';
import { ThemeProvider } from '../../context/ThemeContext';
import { Container } from '../../types';

const mockContainer: Container = {
    Id: '123456789012',
    Names: ['/test-container'],
    Image: 'test-image',
    State: 'running',
    Status: 'Up 2 minutes',
    Created: Date.now(),
    Ports: [{ PrivatePort: 80, Type: 'tcp' }],
    Labels: {},
    ImageID: 'img-123',
    Command: 'start',
    HostConfig: { NetworkMode: 'default' },
    NetworkSettings: { Networks: {} },
    Mounts: []
};

const mockStats = { cpu: '10.5%', mem: '128 MB' };

describe('ContainerItem', () => {
    it('renders container name and image', () => {
        render(
            <ThemeProvider>
                <ContainerItem container={mockContainer} stats={mockStats} onAction={async () => { }} />
            </ThemeProvider>
        );

        expect(screen.getByText('test-container')).toBeDefined();
        expect(screen.getByText('test-image')).toBeDefined();
    });

    it('shows short ID', () => {
        render(
            <ThemeProvider>
                <ContainerItem container={mockContainer} stats={mockStats} onAction={async () => { }} />
            </ThemeProvider>
        );

        expect(screen.getByText('123456789012')).toBeDefined();
    });

    it('shows stats when running', () => {
        render(
            <ThemeProvider>
                <ContainerItem container={mockContainer} stats={mockStats} onAction={async () => { }} />
            </ThemeProvider>
        );

        expect(screen.getByText('10.5% / 128 MB')).toBeDefined();
    });
});
