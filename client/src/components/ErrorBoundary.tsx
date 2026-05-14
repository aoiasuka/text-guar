import { Button, Result } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: undefined });
  };

  render() {
    if (this.state.error) {
      return (
        <Result
          status="error"
          title="页面崩溃了"
          subTitle={this.state.error.message}
          extra={[
            <Button key="reset" type="primary" onClick={this.reset}>
              重试
            </Button>,
            <Button key="reload" onClick={() => window.location.reload()}>
              刷新页面
            </Button>,
          ]}
        />
      );
    }
    return this.props.children;
  }
}
