import { Layout, Menu, Space, Typography, Button, Avatar } from 'antd';
import type { MenuProps } from 'antd';
import {
  AuditOutlined,
  DashboardOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  HistoryOutlined,
  AppstoreOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
import { useAuthStore } from '@/stores/useAuthStore.js';
import type { MenuNode } from '@/types/index.js';

const { Sider, Header, Content } = Layout;

const iconMap: Record<string, JSX.Element> = {
  DashboardOutlined: <DashboardOutlined />,
  FileTextOutlined: <FileTextOutlined />,
  SafetyCertificateOutlined: <SafetyCertificateOutlined />,
  AuditOutlined: <AuditOutlined />,
  BarChartOutlined: <BarChartOutlined />,
  HistoryOutlined: <HistoryOutlined />,
};

function toMenuItems(nodes: MenuNode[]): MenuProps['items'] {
  return nodes.map((node) => ({
    key: node.path,
    icon: (node.icon && iconMap[node.icon]) || <AppstoreOutlined />,
    label: node.name,
    children: node.children.length > 0 ? toMenuItems(node.children) : undefined,
  }));
}

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, menus, logout } = useAuthStore();
  const items = useMemo(() => toMenuItems(menus), [menus]);
  const selectedKey = `/${location.pathname.split('/')[1] || 'dashboard'}`;

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
          selectedKeys={[selectedKey]}
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
