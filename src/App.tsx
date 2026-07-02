import React, { useState, useEffect, useCallback, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import Layout from './components/Layout';
import ContainerList from './components/ContainerList';
import ImageList from './components/ImageList';
import VolumeList from './components/VolumeList';
import NetworkList from './components/NetworkList';
import Settings from './components/Settings';
import DockerStatus, { DockerState } from './components/DockerStatus';
import EngineWizard from './components/EngineWizard';
import { api, AppSettings, EngineKind } from './lib/api';

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
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const colimaUnlisten = useRef<(() => void) | null>(null);

  // Start (and wait for) the bundled Colima engine, streaming progress to the UI.
  const startColima = useCallback(async () => {
    setColimaOutput([]);
    setDownloadProgress(null);
    setErrorMessage(undefined);

    // Subscribe to colima progress before starting.
    if (colimaUnlisten.current) {
      colimaUnlisten.current();
      colimaUnlisten.current = null;
    }
    colimaUnlisten.current = await listen<ColimaProgressEvent>('colima-output', (event) => {
      const progress = event.payload;
      if (progress.message) {
        setColimaOutput(prev => {
          const next = [...prev, progress.message];
          return next.length > MAX_LOG_LINES ? next.slice(-MAX_LOG_LINES) : next;
        });
      }
      if (progress.percent !== null && progress.percent !== undefined) {
        setDownloadProgress(progress.percent);
      }
    });

    setDockerState('starting');
    const startResult = await api.startDocker();
    if (!startResult.success) {
      setDockerState('error');
      setErrorMessage(startResult.error || 'Failed to start Docker');
      return;
    }

    const waitResult = await api.waitForDocker(DOCKER_TIMEOUT_SECONDS);
    if (!waitResult.success) {
      setDockerState('error');
      setErrorMessage(waitResult.error || 'Docker did not start in time');
      return;
    }

    setDockerState('ready');
  }, []);

  const checkAndStartDocker = useCallback(async () => {
    setDockerState('checking');
    setErrorMessage(undefined);

    try {
      // Check if Docker is RUNNING first (any provider: Orbstack, Podman, Docker Desktop, Colima…)
      const runningResult = await api.checkDockerRunning();
      if (runningResult.success && runningResult.data) {
        setDockerState('ready');
        return;
      }

      // Not running — decide what to do based on the user's persisted choice.
      const settingsResult = await api.getSettings();
      const s = settingsResult.data ?? null;
      setSettings(s);

      if (!s || !s.setup_completed) {
        // First run (or never finished onboarding): show the engine wizard.
        setDockerState('setup');
        return;
      }

      if (s.engine === 'external') {
        // User manages their own engine; wait for them to start it.
        setDockerState('waiting-external');
        return;
      }

      // Colima is our managed engine — start it.
      await startColima();
    } catch (error: any) {
      setDockerState('error');
      setErrorMessage(error.toString());
    }
  }, [startColima]);

  // Called by the wizard after it persists the user's choice.
  const handleWizardComplete = useCallback(async (engine: EngineKind) => {
    const s = await api.getSettings();
    setSettings(s.data ?? null);
    if (engine === 'colima') {
      await startColima();
    } else {
      setDockerState('waiting-external');
    }
  }, [startColima]);

  // Re-open the wizard from Settings (prefilled with current values).
  const handleReconfigureEngine = useCallback(async () => {
    const s = await api.getSettings();
    setSettings(s.data ?? null);
    setDockerState('setup');
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

  // Engine onboarding / reconfiguration screen
  if (dockerState === 'setup') {
    return <EngineWizard onComplete={handleWizardComplete} initial={settings} />;
  }

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
      {activeTab === 'settings' && <Settings onReconfigureEngine={handleReconfigureEngine} />}
    </Layout>
  );
}

export default App;
