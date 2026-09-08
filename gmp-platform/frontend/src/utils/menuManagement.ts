import { useEffect, useState } from 'react';
import { getManagedSidebarModules, updateManagedSidebarModules } from '@/api/system';
import { SIDEBAR_MODULES, type SidebarMenu, type SidebarModule, type SidebarSubMenu } from '@/utils/constants';

export const MENU_MANAGEMENT_STORAGE_KEY = 'edhr:managed-sidebar-modules';
export const MENU_MANAGEMENT_EVENT = 'edhr:managed-sidebar-modules-change';
export const MAX_MENU_CHILDREN_DEPTH = 2;

function cloneSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  return JSON.parse(JSON.stringify(modules)) as SidebarModule[];
}

const REQUIRED_SYSTEM_MANAGEMENT_CHILDREN: SidebarSubMenu[] = [
  { label: '业务字典', path: '/system/dictionaries' },
  { label: '图标管理', path: '/system/icons' },
  { label: '系统设置', path: '/system/settings' },
];

const REQUIRED_SECURITY_MANAGEMENT_CHILDREN: SidebarSubMenu[] = [
  { label: '登录日志', path: '/system/login-logs' },
  { label: '审计日志', path: '/system/audit-logs' },
  { label: '签名记录', path: '/system/signatures' },
];

const REQUIRED_PROCESS_MODELING_MENU: SidebarMenu = {
  label: '工艺建模',
  icon: 'AccountTree',
  children: [
    { label: '物料管理', path: '/master-data/materials' },
    { label: '工序管理', path: '/master-data/operations' },
    { label: '工艺路线', path: '/master-data/routes' },
    { label: '产品管理', path: '/master-data/products' },
    { label: '产品簇', path: '/master-data/product-families' },
    { label: '文档管理', path: '/master-data/documents' },
  ],
};

const REQUIRED_TEMPLATE_MODELING_MENU: SidebarMenu = {
  label: '模板建模',
  icon: 'Article',
  children: [
    { label: '表单模板', path: '/master-data/form-templates' },
    { label: '批记录模板', path: '/master-data/batch-record-templates' },
  ],
};

const REQUIRED_FACTORY_MODELING_MENU: SidebarMenu = {
  label: '工厂建模',
  icon: 'Factory',
  children: [
    { label: '车间管理', path: '/master-data/workshops' },
  ],
};

const REQUIRED_PRODUCTION_WORKFLOW_CENTER_MENU: SidebarMenu = {
  label: '流程中心',
  icon: 'AccountTree',
  children: [
    { label: '审核流程模板', path: '/workflow/review-templates' },
    { label: '表单流程', path: '/workflow/form-processes' },
    { label: '流程实例', path: '/workflow/instances' },
  ],
};

const REQUIRED_PRODUCTION_CONFIGURATION_MENU: SidebarMenu = {
  label: '生产配置',
  icon: 'Tune',
  children: [
    { label: '作业模板', path: '/production/work-templates' },
  ],
};

const REQUIRED_PRODUCTION_PREPARATION_MENU: SidebarMenu = {
  label: '生产准备',
  icon: 'Assignment',
  children: [
    { label: '工单管理', path: '/production/work-orders' },
    { label: '批次管理', path: '/production/batches' },
  ],
};

const PROCESS_MODELING_PATHS = new Set(REQUIRED_PROCESS_MODELING_MENU.children?.map((child) => child.path) ?? []);
const TEMPLATE_MODELING_PATHS = new Set(REQUIRED_TEMPLATE_MODELING_MENU.children?.map((child) => child.path) ?? []);
const FACTORY_MODELING_PATHS = new Set(REQUIRED_FACTORY_MODELING_MENU.children?.map((child) => child.path) ?? []);
const PRODUCTION_MANAGED_PATHS = new Set([
  '/workflow/review-templates',
  '/workflow/form-processes',
  '/workflow/instances',
  '/workflow/txn-templates',
  '/workflow/work-templates',
  '/workflow/binding-rules',
  '/production/work-templates',
  '/production/work-orders',
  '/production/batches',
]);
const REMOVED_MASTER_DATA_MENU_PATHS = new Set([
  '/master-data/material-types',
  '/master-data/units',
  '/master-data/equipment',
  '/master-data/sop-documents',
  '/master-data/sites',
]);
const SECURITY_MANAGEMENT_PATHS = new Set(REQUIRED_SECURITY_MANAGEMENT_CHILDREN.map((child) => child.path));

const REMOVED_SYSTEM_MENU_PATHS = new Set([
  '/system/tenant',
  '/system/permissions',
  '/system/form-templates',
  '/system/numbering-rules',
]);

const REMOVED_GCT_MODULE_IDS = new Set(['gct', 'gct-edhr']);
const REMOVED_GCT_MODULE_LABELS = new Set(['gct']);
const REMOVED_GCT_PATH_PREFIXES = ['/gct-edhr'];

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRemovedGctPath(path: string): boolean {
  return REMOVED_GCT_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function isRetiredSidebarPath(path: string): boolean {
  return isRemovedGctPath(normalizeText(path));
}

function isRemovedGctModule(module: Partial<SidebarModule>): boolean {
  const id = normalizeText(module.id).toLowerCase();
  const label = normalizeText(module.label).toLowerCase();
  return REMOVED_GCT_MODULE_IDS.has(id) || REMOVED_GCT_MODULE_LABELS.has(label);
}

function removeRetiredSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  return modules
    .filter((module) => !isRemovedGctModule(module))
    .map((module) => ({
      ...module,
      menus: module.menus
        .map((menu) => {
          if (menu.children) {
            const children = menu.children.filter((child) => !isRemovedGctPath(child.path));
            return children.length > 0 ? { ...menu, children } : null;
          }
          return menu.path && isRemovedGctPath(menu.path) ? null : menu;
        })
        .filter((menu): menu is SidebarMenu => menu !== null),
    }))
    .filter((module) => module.menus.length > 0);
}

export function normalizeSidebarSubMenu(item: Partial<SidebarSubMenu>): SidebarSubMenu | null {
  const label = normalizeText(item.label);
  const path = normalizeText(item.path);
  if (!label || !path) return null;
  if (isRemovedGctPath(path)) return null;
  if (REMOVED_SYSTEM_MENU_PATHS.has(path)) return null;
  if (REMOVED_MASTER_DATA_MENU_PATHS.has(path)) return null;
  return { label, path };
}

function normalizeSidebarMenu(menu: Partial<SidebarMenu>): SidebarMenu | null {
  const label = normalizeText(menu.label);
  const icon = normalizeText(menu.icon) || undefined;
  const children = (Array.isArray(menu.children) ? menu.children : [])
    .map((child) => normalizeSidebarSubMenu(child))
    .filter((child): child is SidebarSubMenu => child !== null)
    .filter((child) => !REMOVED_SYSTEM_MENU_PATHS.has(child.path));
  const path = normalizeText(menu.path);

  if (!label) return null;
  if (children.length > 0) return { label, icon, children };
  if (!path) return null;
  if (isRemovedGctPath(path)) return null;
  if (!REMOVED_SYSTEM_MENU_PATHS.has(path)) return { label, icon, path };
  return null;
}

export function normalizeManagedSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  const normalized = modules
    .map((module) => {
      if (isRemovedGctModule(module)) return null;
      const id = normalizeText(module.id);
      const label = normalizeText(module.label);
      const icon = normalizeText(module.icon) || 'Settings';
      const menus = (Array.isArray(module.menus) ? module.menus : [])
        .map((menu) => normalizeSidebarMenu(menu))
        .filter((menu): menu is SidebarMenu => menu !== null);

      return id && label && menus.length > 0 ? { id, label, icon, menus } : null;
    })
    .filter((module): module is SidebarModule => module !== null);

  return ensureRequiredMenus(normalized.length > 0 ? normalized : cloneSidebarModules(SIDEBAR_MODULES));
}

export function ensureRequiredMenus(modules: SidebarModule[]): SidebarModule[] {
  const nextModules = cloneSidebarModules(removeRetiredSidebarModules(modules));
  const menuIcons = new Map(nextModules.flatMap((module) => module.menus
    .filter((menu) => menu.icon)
    .map((menu) => [`${module.id}:${menu.path || menu.label}`, menu.icon] as const)));
  ensureRequiredProcessModeling(nextModules);
  ensureRequiredProductionMenus(nextModules);
  ensureRequiredSystemMenus(nextModules);
  for (const module of nextModules) {
    for (const menu of module.menus) {
      const icon = menuIcons.get(`${module.id}:${menu.path || menu.label}`);
      if (icon) menu.icon = icon;
    }
  }
  return nextModules;
}

export function ensureRequiredSystemMenus(modules: SidebarModule[]): SidebarModule[] {
  const nextModules = modules;
  let systemModule = nextModules.find((module) => module.id === 'system');

  if (!systemModule) {
    systemModule = {
      id: 'system',
      label: '系统',
      icon: 'Settings',
      menus: [],
    };
    nextModules.push(systemModule);
  }

  let systemManagement = systemModule.menus.find((menu) => menu.label === '系统管理');
  if (!systemManagement) {
    systemManagement = {
      label: '系统管理',
      icon: 'Settings',
      children: [],
    };
    systemModule.menus.push(systemManagement);
  }

  const children = systemManagement.children ?? [];
  const existingPaths = new Set(children.map((child) => child.path));
  const requiredChildren = REQUIRED_SYSTEM_MANAGEMENT_CHILDREN.filter((child) => !existingPaths.has(child.path));

  if (requiredChildren.length > 0) {
    systemManagement.children = [...children, ...requiredChildren];
  }
  delete systemManagement.path;
  ensureRequiredSecurityManagement(systemModule);
  return nextModules;
}

function ensureRequiredProcessModeling(modules: SidebarModule[]) {
  let dataModule = modules.find((module) => module.id === 'data');

  if (!dataModule) {
    dataModule = {
      id: 'data',
      label: '数据',
      icon: 'Storage',
      menus: [],
    };
    modules.push(dataModule);
  }

  dataModule.label = '数据';
  dataModule.icon = dataModule.icon || 'Storage';
  dataModule.menus = dataModule.menus
    .map((menu) => {
      if (menu.children) {
        menu.children = menu.children.filter((child) => !PROCESS_MODELING_PATHS.has(child.path) && !TEMPLATE_MODELING_PATHS.has(child.path) && !FACTORY_MODELING_PATHS.has(child.path) && !REMOVED_MASTER_DATA_MENU_PATHS.has(child.path));
      }
      if (menu.path && (PROCESS_MODELING_PATHS.has(menu.path) || TEMPLATE_MODELING_PATHS.has(menu.path) || FACTORY_MODELING_PATHS.has(menu.path) || REMOVED_MASTER_DATA_MENU_PATHS.has(menu.path))) return null;
      if (menu.label === '基础主数据' || menu.label === '工艺建模' || menu.label === '模板建模' || menu.label === '工厂建模') return null;
      return menu;
    })
    .filter((menu): menu is SidebarMenu => menu !== null);
  dataModule.menus.unshift(...cloneSidebarModules([{ id: 'data', label: '数据', icon: 'Storage', menus: [REQUIRED_PROCESS_MODELING_MENU, REQUIRED_TEMPLATE_MODELING_MENU, REQUIRED_FACTORY_MODELING_MENU] }])[0].menus);
}

function ensureRequiredProductionMenus(modules: SidebarModule[]) {
  let productionModule = modules.find((module) => module.id === 'production');

  if (!productionModule) {
    productionModule = {
      id: 'production',
      label: '生产',
      icon: 'PrecisionManufacturing',
      menus: [],
    };
    modules.push(productionModule);
  }

  productionModule.label = '生产';
  productionModule.icon = productionModule.icon || 'PrecisionManufacturing';

  for (const module of modules) {
    module.menus = module.menus
      .map((menu) => {
        if (menu.children) {
          const children = menu.children.filter((child) => !PRODUCTION_MANAGED_PATHS.has(child.path));
          return children.length > 0 ? { ...menu, children } : null;
        }
        return menu.path && PRODUCTION_MANAGED_PATHS.has(menu.path) ? null : menu;
      })
      .filter((menu): menu is SidebarMenu => menu !== null);
  }

  productionModule.menus = productionModule.menus.filter(
    (menu) => menu.label !== '流程中心' && menu.label !== '生产配置' && menu.label !== '生产准备',
  );
  productionModule.menus.unshift(
    ...cloneSidebarModules([{
      id: 'production',
      label: '生产',
      icon: 'PrecisionManufacturing',
      menus: [REQUIRED_PRODUCTION_PREPARATION_MENU, REQUIRED_PRODUCTION_WORKFLOW_CENTER_MENU, REQUIRED_PRODUCTION_CONFIGURATION_MENU],
    }])[0].menus,
  );
}

function ensureRequiredSecurityManagement(systemModule: SidebarModule) {
  for (const menu of systemModule.menus) {
    if (menu.label === '安全管理') continue;
    if (menu.children) {
      menu.children = menu.children.filter((child) => !SECURITY_MANAGEMENT_PATHS.has(child.path));
    }
  }
  systemModule.menus = systemModule.menus.filter((menu) => menu.path ? !SECURITY_MANAGEMENT_PATHS.has(menu.path) : true);

  let securityManagement = systemModule.menus.find((menu) => menu.label === '安全管理');
  if (!securityManagement) {
    securityManagement = {
      label: '安全管理',
      icon: 'LockOutlined',
      children: [],
    };
    systemModule.menus.push(securityManagement);
  }

  const children = securityManagement.children ?? [];
  const existingPaths = new Set(children.map((child) => child.path));
  const requiredChildren = REQUIRED_SECURITY_MANAGEMENT_CHILDREN.filter((child) => !existingPaths.has(child.path));
  securityManagement.children = [...children, ...requiredChildren];
  delete securityManagement.path;
}

let cachedModules: SidebarModule[] | undefined;
let cacheRevision = 0;

export function loadManagedSidebarModules(): SidebarModule[] {
  if (cachedModules) return cloneSidebarModules(cachedModules);
  if (typeof window === 'undefined') return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));

  try {
    const raw = window.localStorage.getItem(MENU_MANAGEMENT_STORAGE_KEY);
    if (!raw) return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));
    const parsed = JSON.parse(raw) as SidebarModule[];
    return ensureRequiredSystemMenus(normalizeManagedSidebarModules(parsed));
  } catch {
    return ensureRequiredSystemMenus(ensureRequiredMenus(SIDEBAR_MODULES));
  }
}

function cacheManagedSidebarModules(modules: SidebarModule[]): SidebarModule[] {
  cachedModules = cloneSidebarModules(modules);
  cacheRevision += 1;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(MENU_MANAGEMENT_STORAGE_KEY, JSON.stringify(modules));
    } catch {
      // A disabled browser cache must not turn a successful server save into a failure.
    }
    window.dispatchEvent(new CustomEvent(MENU_MANAGEMENT_EVENT));
  }
  return cloneSidebarModules(modules);
}

export async function refreshManagedSidebarModules(): Promise<SidebarModule[]> {
  const revision = cacheRevision;
  const response = await getManagedSidebarModules();
  // A read started before a completed save must not restore the older configuration.
  if (revision !== cacheRevision) return loadManagedSidebarModules();
  const modules = response.configured
    ? normalizeManagedSidebarModules(response.modules)
    : loadManagedSidebarModules();
  return cacheManagedSidebarModules(modules);
}

export async function saveManagedSidebarModules(modules: SidebarModule[]): Promise<SidebarModule[]> {
  const response = await updateManagedSidebarModules(normalizeManagedSidebarModules(modules));
  return cacheManagedSidebarModules(normalizeManagedSidebarModules(response.modules));
}

export async function resetManagedSidebarModules(): Promise<SidebarModule[]> {
  return saveManagedSidebarModules(ensureRequiredMenus(SIDEBAR_MODULES));
}

export function useManagedSidebarModules(): SidebarModule[] {
  const [modules, setModules] = useState<SidebarModule[]>(() => loadManagedSidebarModules());

  useEffect(() => {
    const refreshModules = () => setModules(loadManagedSidebarModules());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === MENU_MANAGEMENT_STORAGE_KEY || event.key === null) {
        cachedModules = undefined;
        cacheRevision += 1;
        refreshModules();
      }
    };
    const refreshFromServer = () => { void refreshManagedSidebarModules().catch(() => undefined); };

    refreshFromServer();
    window.addEventListener(MENU_MANAGEMENT_EVENT, refreshModules);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', refreshFromServer);
    return () => {
      window.removeEventListener(MENU_MANAGEMENT_EVENT, refreshModules);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', refreshFromServer);
    };
  }, []);

  return modules;
}

export function inferPermissionCode(path: string): string | undefined {
  if (path === '/') return 'dashboard';
  if (path === '/production/work-templates') return 'workflow.work-templates';
  if (path === '/workflow/form-processes') return 'workflow.form-processes';
  if (path === '/production/work-orders') return 'production.work-orders';
  if (path === '/production/batches') return 'production.batches';
  if (path === '/system/menu-management') return 'system.edit';
  if (path === '/system/dictionaries') return 'system.dictionaries';
  if (path === '/system/icons') return 'system.icons';
  if (path === '/system/settings') return 'system.settings';
  if (path === '/system/login-logs') return 'system.login-logs';
  return path.replace(/^\//, '').replace(/\//g, '.');
}
