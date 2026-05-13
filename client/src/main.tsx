import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App.js';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1f6f68',
          colorInfo: '#2f6fed',
          borderRadius: 6,
          fontFamily:
            '"IBM Plex Sans", "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif',
        },
        components: {
          Layout: { bodyBg: '#eef2ee', siderBg: '#16211f', headerBg: '#fbfcfa' },
          Card: { borderRadiusLG: 6 },
          Table: { headerBg: '#f4f6f2' },
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
