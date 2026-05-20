import { Button, Form, Input, Typography, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '@/services/api.js';
import { useAuthStore } from '@/stores/useAuthStore.js';

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);

  return (
    <main className="login-page">
      <section className="login-panel">
        <div className="login-copy">
          <Typography.Text className="kicker">TEXT GUARD</Typography.Text>
          <Typography.Title>内容审核，不靠人工硬扛</Typography.Title>
          <Typography.Paragraph>
            内容发布、敏感信息识别、审核流转和报表导出集中在一个工作台内完成。
          </Typography.Paragraph>
        </div>
        <div className="login-card">
          <Typography.Title level={3}>系统登录</Typography.Title>
          <Form
            layout="vertical"
            initialValues={{ username: 'admin', password: 'admin123' }}
            onFinish={async (values) => {
              const result = await authApi.login(values);
              setSession({
                token: result.token,
                user: result.user,
                permissions: result.permissions,
                menus: result.menus,
              });
              message.success('登录成功');
              const redirect = searchParams.get('redirect');
              navigate(redirect && redirect.startsWith('/') ? redirect : '/dashboard', { replace: true });
            }}
          >
            <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
              <Input prefix={<UserOutlined />} size="large" />
            </Form.Item>
            <Form.Item name="password" label="密码" rules={[{ required: true }]}>
              <Input.Password prefix={<LockOutlined />} size="large" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block>
              进入审核台
            </Button>
          </Form>
        </div>
      </section>
    </main>
  );
}
