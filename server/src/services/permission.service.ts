import type { Role } from '@text-guard/shared';
import { prisma } from '../utils/prisma.js';

export interface MenuNode {
  id: number;
  name: string;
  path: string;
  icon: string | null;
  sort: number;
  permissionCode: string | null;
  children: MenuNode[];
}

interface CacheEntry<T> {
  value: T;
  expireAt: number;
}

const CACHE_TTL_MS = 60_000;

const permissionCache = new Map<Role, CacheEntry<Set<string>>>();
const menuCache = new Map<Role, CacheEntry<MenuNode[]>>();

function getCached<T>(map: Map<Role, CacheEntry<T>>, role: Role): T | undefined {
  const entry = map.get(role);
  if (!entry) return undefined;
  if (entry.expireAt <= Date.now()) {
    map.delete(role);
    return undefined;
  }
  return entry.value;
}

function setCached<T>(map: Map<Role, CacheEntry<T>>, role: Role, value: T) {
  map.set(role, { value, expireAt: Date.now() + CACHE_TTL_MS });
}

export function invalidatePermissionCache() {
  permissionCache.clear();
  menuCache.clear();
}

async function loadPermissionCodes(role: Role): Promise<Set<string>> {
  const rows = await prisma.rolePermission.findMany({
    where: { role },
    select: { permission: { select: { code: true } } },
  });
  return new Set(rows.map((r) => r.permission.code));
}

export async function getPermissionCodes(role: Role): Promise<Set<string>> {
  const cached = getCached(permissionCache, role);
  if (cached) return cached;
  const codes = await loadPermissionCodes(role);
  setCached(permissionCache, role, codes);
  return codes;
}

export async function getPermissionsByRole(role: Role): Promise<string[]> {
  const codes = await getPermissionCodes(role);
  return [...codes].sort();
}

export async function hasPermission(role: Role, code: string): Promise<boolean> {
  const codes = await getPermissionCodes(role);
  return codes.has(code);
}

export async function hasAllPermissions(role: Role, codes: string[]): Promise<boolean> {
  const set = await getPermissionCodes(role);
  return codes.every((c) => set.has(c));
}

export type DataScopeLevel = 'any' | 'own';

export async function getDataScope(
  role: Role,
  module: 'content' | 'log',
): Promise<DataScopeLevel | null> {
  const codes = await getPermissionCodes(role);
  if (codes.has(`${module}:data:any`)) return 'any';
  if (codes.has(`${module}:data:own`)) return 'own';
  return null;
}

export async function getMenusByRole(role: Role): Promise<MenuNode[]> {
  const cached = getCached(menuCache, role);
  if (cached) return cached;

  const codes = await getPermissionCodes(role);
  const all = await prisma.menu.findMany({
    where: { visible: true },
    include: { permission: { select: { code: true } } },
    orderBy: [{ parentId: 'asc' }, { sort: 'asc' }],
  });

  const byId = new Map<number, MenuNode>();
  for (const row of all) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      path: row.path,
      icon: row.icon,
      sort: row.sort,
      permissionCode: row.permission?.code ?? null,
      children: [],
    });
  }

  const roots: MenuNode[] = [];
  for (const row of all) {
    const node = byId.get(row.id)!;
    if (row.parentId && byId.has(row.parentId)) {
      byId.get(row.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const filter = (nodes: MenuNode[]): MenuNode[] => {
    const result: MenuNode[] = [];
    for (const node of nodes) {
      const children = filter(node.children);
      const allowed = !node.permissionCode || codes.has(node.permissionCode);
      if (allowed || children.length > 0) {
        result.push({ ...node, children });
      }
    }
    return result;
  };

  const visible = filter(roots);
  setCached(menuCache, role, visible);
  return visible;
}
