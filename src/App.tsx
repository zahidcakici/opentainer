import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import Layout from './components/Layout';
import ContainerList from './components/ContainerList';
import ImageList from './components/ImageList';
import VolumeList from './components/VolumeList';
import NetworkList from './components/NetworkList';
import Settings from './components/Settings';
import DockerStatus, { DockerState } from './components/DockerStatus';
import { api } from './lib/api';

// Increased timeout for first-run Colima (may download VM image)
const DOCKER_TIMEOUT_SECONDS = 300;

// Maximum number of log lines to keep in state
const MAX_LOG_LINES = 50;

interface ColimaProgressEvent {
  message: string;
  is_download: boolean;
  percent: number | null;
  speed: string | null;
  eta: string | null;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('containers');
  const [dockerState, setDockerState] = useState<DockerState>('checking');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [colimaOutput, setColimaOutput] = useState<string[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const colimaUnlisten = useRef<(() => void) | null>(null);

  const checkAndStartDocker = useCallback(async () => {
    setDockerState('checking');
    setErrorMessage(undefined);
    setColimaOutput([]);
    setDownloadProgress(null);

    try {
      // Check if Docker is RUNNING first (supports any provider: Orbstack, Podman, Docker Desktop, etc.)
      const runningResult = await api.checkDockerRunning();
      if (runningResult.success && runningResult.data) {
        // Docker is already running - use it without managing it
        setDockerState('ready');
        return;
      }

      // Docker is not running - check if Colima is installed (on macOS)
      const colimaResult = await api.checkColimaInstalled();
      if (!colimaResult.success || !colimaResult.data) {
        setDockerState('not-installed');
        return;
      }

      // Set up listener for colima output BEFORE starting
      const unlisten = await listen<ColimaProgressEvent>('colima-output', (event) => {
        const progress = event.payload;

        // Add the message to the log (keep last N lines)
        if (progress.message) {
          setColimaOutput(prev => {
            const next = [...prev, progress.message];
            return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
          });
        }

        // Update download progress if available
        if (progress.percent !== null && progress.percent !== undefined) {
          setDownloadProgress(progress.percent);
        }
      });
      colimaUnlisten.current = unlisten;

      // Colima is installed but Docker not running - start it
      setDockerState('starting');
      const startResult = await api.startDocker();
      if (!startResult.success) {
        setDockerState('error');
        setErrorMessage(startResult.error || 'Failed to start Docker');
        return;
      }

      // Wait for Docker to be ready
      const waitResult = await api.waitForDocker(DOCKER_TIMEOUT_SECONDS);
      if (!waitResult.success) {
        setDockerState('error');
        setErrorMessage(waitResult.error || 'Docker did not start in time');
        return;
      }

      setDockerState('ready');
    } catch (error: any) {
      setDockerState('error');
      setErrorMessage(error.toString());
    }
  }, []);

  useEffect(() => {
    checkAndStartDocker();

    // Listen for docker-stopping event from backend
    const setupStoppingListener = async () => {
      const unlisten = await listen('docker-stopping', () => {
        setDockerState('stopping');
      });
      return unlisten;
    };

    const unlistenPromise = setupStoppingListener();
    return () => {
      unlistenPromise.then(unlisten => unlisten());
      // Clean up colima output listener
      if (colimaUnlisten.current) {
        colimaUnlisten.current();
        colimaUnlisten.current = null;
      }
    };
  }, [checkAndStartDocker]);

  // Show Docker status screen while not ready
  if (dockerState !== 'ready') {
    return (
      <DockerStatus
        state={dockerState}
        errorMessage={errorMessage}
        onRetry={checkAndStartDocker}
        colimaOutput={colimaOutput}
        downloadProgress={downloadProgress}
      />
    );
  }

  return (
    <Layout activeTab={activeTab} setActiveTab={setActiveTab}>
      {activeTab === 'containers' && <ContainerList />}
      {activeTab === 'images' && <ImageList />}
      {activeTab === 'volumes' && <VolumeList />}
      {activeTab === 'networks' && <NetworkList />}
      {activeTab === 'settings' && <Settings />}
    </Layout>
  );
}

export default App;

