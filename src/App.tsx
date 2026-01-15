import React, { useState } from 'react';
import Layout from './components/Layout';
import ContainerList from './components/ContainerList';
import ImageList from './components/ImageList';
import VolumeList from './components/VolumeList';
import NetworkList from './components/NetworkList';
import Settings from './components/Settings';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('containers');

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
