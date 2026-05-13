import { Tag } from 'antd';
import type { ContentStatus } from '@text-guard/shared';

const map = {
  draft: { color: 'default', text: '草稿' },
  pending: { color: 'processing', text: '待审核' },
  published: { color: 'success', text: '已发布' },
  rejected: { color: 'error', text: '已驳回' },
};

export function StatusTag({ status }: { status: ContentStatus }) {
  return <Tag color={map[status].color}>{map[status].text}</Tag>;
}
