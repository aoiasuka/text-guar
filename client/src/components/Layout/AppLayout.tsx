import { Layout, Menu, Space, Typography, Button, Avatar } from 'antd';
import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore.js';

const { Sider, Header, Content } = Layout;

const items = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' },
  { key: '/contents', icon: <FileTextOutlined />, label: '内容管理' },
  { key: '/sensitive-words', icon: <SafetyCertificateOutlined />, label: '敏感词库' },
  { key: '/review', icon: <AuditOutlined />, label: '审核工作台' },
  { key: '/reports', icon: <BarChartOutlined />, label: '审核报表' },
  { key: '/logs', icon: <HistoryOutlined />, label: '操作日志' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <Layout className="shell">
      <Sider width={236} className="sider">
        <div className="brand">
          <div className="brand-mark">TG</div>
          <div>
            <Typography.Title level={4}>Text Guard</Typography.Title>
            <Typography.Text>内容安全审核台</Typography.Text>
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[`/${location.pathname.split('/')[1] || 'dashboard'}`]}
          items={items}
          onClick={(item) => navigate(item.key)}
        />
      </Sider>
      <Layout>
        <Header className="header">
          <Typography.Text className="header-title">文本内容管理与敏感信息审核系统</Typography.Text>
          <Space>
            <Avatar>{user?.username.slice(0, 1).toUpperCase()}</Avatar>
            <Typography.Text>{user?.username} · {user?.role === 'admin' ? '管理员' : '编辑'}</Typography.Text>
            <Button
              icon={<LogoutOutlined />}
              onClick={() => {
                logout();
                navigate('/login');
              }}
            />
          </Space>
        </Header>
        <Content className="content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
