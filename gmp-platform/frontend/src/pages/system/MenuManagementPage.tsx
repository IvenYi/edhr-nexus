import {
  type ReactNode,
  useEffect,
  useMemo,
  useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AppDialog from '@/components/AppDialog';
import { Add, Close, Delete, ImageOutlined, InfoOutlined, RestartAlt, Save, Search, SubdirectoryArrowRight } from '@mui/icons-material';
import { getIconGroups, getIconPage, type IconAsset, type IconGroup } from '@/api/system';
import type { SidebarMenu, SidebarModule, SidebarSubMenu } from '@/utils/constants';
import { renderBuiltinIcon } from '@/utils/builtinIcons';
import {
  getIconAssetPreviewUrl,
  getManagedIconLabel,
  renderManagedIcon,
  toIconAssetValue,
} from '@/utils/iconAssets';
import {
  MAX_MENU_CHILDREN_DEPTH,
  loadManagedSidebarModules,
  refreshManagedSidebarModules,
  resetManagedSidebarModules,
  saveManagedSidebarModules,
} from '@/utils/menuManagement';

const fieldSx = {
  '& .MuiInputBase-root': {
    height: 40,
  },
};

const ICON_PICKER_PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

function isBuiltinIcon(icon: IconAsset) {
  return icon.source === 'BUILTIN';
}

function getIconPickerValue(icon: IconAsset) {
  return isBuiltinIcon(icon) ? icon.builtinKey || '' : toIconAssetValue(icon.fileId);
}

function MenuIconPreview({ icon, fallback }: { icon: IconAsset; fallback?: ReactNode }) {
  if (isBuiltinIcon(icon)) {
    return renderBuiltinIcon(icon.builtinKey, { sx: { fontSize: 26, color: '#606266' } }) || fallback || <ImageOutlined sx={{ fontSize: 26, color: '#909399' }} />;
  }

  const previewUrl = getIconAssetPreviewUrl(icon);
  if (!previewUrl) return fallback || <ImageOutlined sx={{ fontSize: 26, color: '#909399' }} />;
  return <Box component="img" src={previewUrl} alt={icon.name} sx={{ width: 28, height: 28, objectFit: 'contain' }} />;
}

interface IconSelectorFieldProps {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  icons: IconAsset[];
  loading: boolean;
  error: boolean;
  groups: IconGroup[];
  groupId: string | 'ALL';
  keyword: string;
  page: number;
  pageCount: number;
  totalElements: number;
  pageSize: number;
  onGroupChange: (value: string | 'ALL') => void;
  onKeywordChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

function IconSelectorField({
  label,
  value,
  onChange,
  icons,
  loading,
  error,
  groups,
  groupId,
  keyword,
  page,
  pageCount,
  totalElements,
  pageSize,
  onGroupChange,
  onKeywordChange,
  onPageChange,
  onPageSizeChange,
}: IconSelectorFieldProps) {
  const [open, setOpen] = useState(false);
  const selectedLabel = getManagedIconLabel(value, icons);

  return (
    <>
      <Button
        variant="outlined"
        onClick={() => setOpen(true)}
        sx={{
          height: 40,
          flex: 1,
          justifyContent: 'flex-start',
          borderColor: '#dcdfe6',
          color: '#303133',
          px: 1.5,
          minWidth: 0,
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0, width: '100%' }}>
          <Box sx={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#606266', '& .MuiSvgIcon-root': { fontSize: 22 } }}>
            {renderManagedIcon(value, { fontSize: 22 }) || <ImageOutlined sx={{ fontSize: 22, color: '#909399' }} />}
          </Box>
          <Box sx={{ minWidth: 0, textAlign: 'left' }}>
            <Typography sx={{ fontSize: 12, lineHeight: 1.1, color: '#909399' }}>{label}</Typography>
            <Typography sx={{ fontSize: 14, lineHeight: 1.2, color: '#303133', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {selectedLabel || '请选择图标'}
            </Typography>
          </Box>
        </Stack>
      </Button>

      <AppDialog hideCloseButton open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ p: 0 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ minHeight: 52, px: 2 }}>
            <Typography sx={{ fontWeight: 600, color: '#303133' }}>图标选择</Typography>
            <IconButton size="small" onClick={() => setOpen(false)} aria-label="关闭图标选择">
              <Close fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ p: 2, borderBottom: '1px solid #e4e7ed' }}>
            <TextField
              select
              size="small"
              label="分类"
              value={groupId}
              onChange={(event) => onGroupChange(event.target.value)}
              sx={{ ...fieldSx, width: { xs: '100%', sm: 180 }, flexShrink: 0 }}
            >
              <MenuItem value="ALL">全部</MenuItem>
              {groups.map((group) => (
                <MenuItem key={group.id} value={String(group.id)}>{group.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              placeholder="按图标名称模糊查询"
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              sx={{ ...fieldSx, flex: 1 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
              }}
            />
          </Stack>

          <Box sx={{ height: 420, overflow: 'auto', p: 2, bgcolor: '#f6f8f9' }}>
            {loading ? (
              <Stack alignItems="center" justifyContent="center" sx={{ height: '100%' }} spacing={1}>
                <CircularProgress size={28} />
                <Typography sx={{ color: '#909399', fontSize: 14 }}>图标加载中</Typography>
              </Stack>
            ) : error ? (
              <Alert severity="error">图标加载失败，请稍后重试</Alert>
            ) : icons.length === 0 ? (
              <Stack alignItems="center" justifyContent="center" sx={{ height: '100%', color: '#909399' }} spacing={1}>
                <ImageOutlined sx={{ fontSize: 42 }} />
                <Typography sx={{ fontSize: 14 }}>暂无匹配图标</Typography>
              </Stack>
            ) : (
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
                  gap: 1.25,
                }}
              >
                {icons.map((icon) => {
                  const optionValue = getIconPickerValue(icon);
                  const selected = optionValue === value;
                  return (
                    <Box
                      component="button"
                      type="button"
                      key={`${icon.id}-${optionValue}`}
                      onClick={() => {
                        if (!optionValue) return;
                        onChange(optionValue);
                        setOpen(false);
                      }}
                      data-menu-icon-picker-option
                      sx={{
                        border: `1px solid ${selected ? '#1890ff' : '#e4e7ed'}`,
                        bgcolor: '#fff',
                        borderRadius: 1,
                        height: 112,
                        p: 1,
                        cursor: optionValue ? 'pointer' : 'not-allowed',
                        color: '#303133',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1,
                        boxShadow: selected ? '0 0 0 2px rgba(24,144,255,0.14)' : 'none',
                        transition: 'box-shadow 160ms ease, border-color 160ms ease',
                        '&:hover': {
                          borderColor: '#1890ff',
                          boxShadow: '0 8px 18px rgba(15, 35, 55, 0.12)',
                        },
                      }}
                    >
                      <Box sx={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <MenuIconPreview icon={icon} />
                      </Box>
                      <Typography title={icon.name} sx={{ width: '100%', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {icon.name}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ xs: 'stretch', sm: 'center' }}
            justifyContent="space-between"
            spacing={1}
            sx={{ minHeight: 48, px: 2, borderTop: '1px solid #e4e7ed' }}
          >
            <Typography sx={{ color: '#606266', fontSize: 13 }}>共 {totalElements} 条数据</Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="flex-end">
              <Pagination
                count={Math.max(pageCount, 1)}
                page={Math.min(page, Math.max(pageCount, 1))}
                onChange={(_, nextPage) => onPageChange(nextPage)}
                size="small"
                color="primary"
              />
              <TextField
                select
                size="small"
                value={pageSize}
                onChange={(event) => onPageSizeChange(Number(event.target.value))}
                sx={{ ...fieldSx, width: 110 }}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ mr: 0 }}>每页</InputAdornment>,
                }}
              >
                {ICON_PICKER_PAGE_SIZE_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </TextField>
            </Stack>
          </Stack>
        </DialogContent>
      </AppDialog>
    </>
  );
}

function createModuleId(modules: SidebarModule[]): string {
  const usedIds = new Set(modules.map((module) => module.id));
  let index = modules.length + 1;
  let id = `custom-module-${index}`;
  while (usedIds.has(id)) {
    index += 1;
    id = `custom-module-${index}`;
  }
  return id;
}

function validateModules(modules: SidebarModule[]): string {
  if (modules.length === 0) return '至少保留一个系统模块';

  const moduleIds = new Set<string>();
  for (const module of modules) {
    if (!module.id.trim()) return '模块编码不能为空';
    if (!module.label.trim()) return '模块名称不能为空';
    if (moduleIds.has(module.id)) return `模块编码 ${module.id} 重复`;
    moduleIds.add(module.id);

    if (module.menus.length === 0) return `${module.label} 至少保留一个菜单`;
    for (const menu of module.menus) {
      if (!menu.label.trim()) return `${module.label} 下存在未填写名称的一级菜单`;
      const children = menu.children ?? [];
      if (children.length === 0 && !menu.path?.trim()) return `${menu.label} 需要填写路由地址`;
      for (const child of children) {
        if (!child.label.trim()) return `${menu.label} 下存在未填写名称的二级菜单`;
        if (!child.path.trim()) return `${child.label || '二级菜单'} 需要填写路由地址`;
      }
    }
  }

  return '';
}

export default function MenuManagementPage() {
  const [modules, setModules] = useState<SidebarModule[]>(() => loadManagedSidebarModules());
  const [configurationLoading, setConfigurationLoading] = useState(true);
  const [configurationError, setConfigurationError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedModuleId, setSelectedModuleId] = useState('system');
  const [selectedIconGroupId, setSelectedIconGroupId] = useState<string | 'ALL'>('ALL');
  const [iconKeyword, setIconKeyword] = useState('');
  const [iconPickerPage, setIconPickerPage] = useState(1);
  const [iconPickerPageSize, setIconPickerPageSize] = useState(20);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const iconGroupsQuery = useQuery({
    queryKey: ['system', 'menu-icon-picker-groups'],
    queryFn: getIconGroups,
  });

  useEffect(() => {
    let active = true;
    setConfigurationLoading(true);
    setConfigurationError('');
    refreshManagedSidebarModules()
      .then((loadedModules) => { if (active) setModules(loadedModules); })
      .catch((error: unknown) => {
        if (active) setConfigurationError(error instanceof Error ? error.message : '菜单配置加载失败');
      })
      .finally(() => { if (active) setConfigurationLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const iconsQuery = useQuery({
    queryKey: ['system', 'menu-icon-picker', selectedIconGroupId, iconKeyword, iconPickerPage, iconPickerPageSize],
    queryFn: () => getIconPage({ groupId: selectedIconGroupId, keyword: iconKeyword.trim(), page: iconPickerPage, size: iconPickerPageSize }),
  });

  const selectedModule = useMemo(
    () => modules.find((module) => module.id === selectedModuleId) ?? modules[0],
    [modules, selectedModuleId],
  );
  const iconOptions = useMemo(() => {
    const options = iconsQuery.data?.content ?? [];
    const normalizedKeyword = iconKeyword.trim().toLowerCase();
    if (!normalizedKeyword) return options;
    return options.filter((icon) => icon.name.toLowerCase().includes(normalizedKeyword));
  }, [iconKeyword, iconsQuery.data?.content]);

  useEffect(() => {
    setIconPickerPage(1);
  }, [selectedIconGroupId, iconKeyword, iconPickerPageSize]);

  const handleIconGroupChange = (value: string | 'ALL') => {
    setSelectedIconGroupId(value);
    setIconPickerPage(1);
  };

  const handleIconKeywordChange = (value: string) => {
    setIconKeyword(value);
    setIconPickerPage(1);
  };

  const handleIconPickerPageSizeChange = (nextPageSize: number) => {
    setIconPickerPageSize(nextPageSize);
    setIconPickerPage(1);
  };

  useEffect(() => {
    if (!selectedModule && modules[0]) {
      setSelectedModuleId(modules[0].id);
    }
  }, [modules, selectedModule]);

  const showSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const updateSelectedModule = (updater: (module: SidebarModule) => SidebarModule) => {
    if (!selectedModule) return;
    setModules((current) => current.map((module) => (module.id === selectedModule.id ? updater(module) : module)));
  };

  const addModule = () => {
    setModules((current) => {
      const id = createModuleId(current);
      const nextModule: SidebarModule = {
        id,
        label: '新模块',
        icon: 'Settings',
        menus: [{ label: '新菜单', icon: 'Settings', path: '/system/menu-management' }],
      };
      setSelectedModuleId(id);
      return [...current, nextModule];
    });
  };

  const updateModule = (fields: Partial<Pick<SidebarModule, 'label' | 'icon'>>) => {
    updateSelectedModule((module) => ({ ...module, ...fields }));
  };

  const deleteModule = () => {
    if (!selectedModule) return;
    if (modules.length <= 1) {
      showSnackbar('至少保留一个系统模块', 'error');
      return;
    }
    const nextModules = modules.filter((module) => module.id !== selectedModule.id);
    setModules(nextModules);
    setSelectedModuleId(nextModules[0]?.id ?? '');
  };

  const addRootMenu = () => {
    updateSelectedModule((module) => ({
      ...module,
      menus: [
        ...module.menus,
        { label: '新菜单', icon: 'Settings', path: '/system/menu-management' },
      ],
    }));
  };

  const updateRootMenu = (rootIndex: number, fields: Partial<SidebarMenu>) => {
    updateSelectedModule((module) => ({
      ...module,
      menus: module.menus.map((menu, index) => (index === rootIndex ? { ...menu, ...fields } : menu)),
    }));
  };

  const deleteRootMenu = (rootIndex: number) => {
    updateSelectedModule((module) => ({
      ...module,
      menus: module.menus.filter((_, index) => index !== rootIndex),
    }));
  };

  const addChildMenu = (rootIndex: number) => {
    updateSelectedModule((module) => ({
      ...module,
      menus: module.menus.map((menu, index) => {
        if (index !== rootIndex) return menu;
        const children = menu.children ?? [];
        return {
          label: menu.label,
          icon: menu.icon,
          children: [
            ...children,
            { label: '二级菜单', path: '/system/menu-management' },
          ],
        };
      }),
    }));
  };

  const updateChildMenu = (rootIndex: number, childIndex: number, fields: Partial<SidebarSubMenu>) => {
    updateSelectedModule((module) => ({
      ...module,
      menus: module.menus.map((menu, index) => {
        if (index !== rootIndex) return menu;
        const children = menu.children ?? [];
        return {
          ...menu,
          children: children.map((child, currentChildIndex) => (
            currentChildIndex === childIndex ? { ...child, ...fields } : child
          )),
        };
      }),
    }));
  };

  const deleteChildMenu = (rootIndex: number, childIndex: number) => {
    updateSelectedModule((module) => ({
      ...module,
      menus: module.menus.map((menu, index) => {
        if (index !== rootIndex) return menu;
        const children = (menu.children ?? []).filter((_, currentChildIndex) => currentChildIndex !== childIndex);
        return children.length > 0
          ? { ...menu, children }
          : { label: menu.label, icon: menu.icon, path: menu.path || '/system/menu-management' };
      }),
    }));
  };

  const handleSave = async () => {
    if (saving) return;
    const validationError = validateModules(modules);
    if (validationError) {
      showSnackbar(validationError, 'error');
      return;
    }

    setSaving(true);
    try {
      const savedModules = await saveManagedSidebarModules(modules);
      setModules(savedModules);
      showSnackbar('菜单配置已保存', 'success');
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : '菜单配置保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const defaultModules = await resetManagedSidebarModules();
      setModules(defaultModules);
      setSelectedModuleId(defaultModules.find((module) => module.id === 'system')?.id ?? defaultModules[0]?.id ?? '');
      showSnackbar('菜单配置已恢复默认并保存', 'success');
    } catch (error: unknown) {
      showSnackbar(error instanceof Error ? error.message : '恢复默认失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (configurationLoading) {
    return <Box sx={{ p: 4, textAlign: 'center' }} role="status">正在读取菜单配置...</Box>;
  }
  if (configurationError) {
    return <Alert severity="error" action={<Button onClick={() => setReloadKey((key) => key + 1)}>重新读取</Button>}>菜单配置加载失败：{configurationError}</Alert>;
  }

  return (
    <Box
      component="fieldset"
      disabled={saving}
      aria-busy={saving}
      data-menu-management-page
      sx={{
        border: 0,
        p: 0,
        m: 0,
        minWidth: 0,
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' },
        gridTemplateRows: { xs: '220px minmax(0, 1fr)', lg: 'minmax(0, 1fr)' },
        gap: 2,
        height: 'calc(100vh - 142px)',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
          <Typography sx={{ fontWeight: 600, color: '#303133' }}>系统模块</Typography>
          <Tooltip title="新增模块" arrow>
            <IconButton size="small" color="primary" onClick={addModule} aria-label="新增模块">
              <Add fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>

        <Stack spacing={0.5} sx={{ p: 1, flex: 1, minHeight: 0, overflow: 'auto' }}>
          {modules.map((module) => {
            const selected = module.id === selectedModule?.id;
            return (
              <Button
                key={module.id}
                fullWidth
                variant={selected ? 'contained' : 'text'}
                onClick={() => setSelectedModuleId(module.id)}
                sx={{
                  justifyContent: 'flex-start',
                  minHeight: 38,
                  color: selected ? '#fff' : '#303133',
                }}
              >
                {module.label}
              </Button>
            );
          })}
        </Stack>
      </Box>

      <Box sx={{ bgcolor: '#fff', border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 48, px: 2, borderBottom: '1px solid #e4e7ed' }}>
          <Stack direction="row" alignItems="center" spacing={0.75} sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 600, color: '#303133' }}>菜单管理</Typography>
            <Tooltip title={`模块下菜单支持 ${MAX_MENU_CHILDREN_DEPTH} 级，不能超过 2 级。`} arrow>
              <Box
                component="span"
                aria-label="菜单层级提示"
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  color: '#909399',
                  cursor: 'help',
                  '&:hover': { color: '#409eff' },
                }}
              >
                <InfoOutlined sx={{ fontSize: 17 }} />
              </Box>
            </Tooltip>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" startIcon={<RestartAlt />} onClick={handleReset}>重置</Button>
            <Button variant="contained" startIcon={<Save />} onClick={handleSave}>{saving ? '保存中...' : '保存'}</Button>
          </Stack>
        </Stack>

        <Stack spacing={2} sx={{ p: 2, flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {selectedModule ? (
            <>
              <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, p: 2 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                  <TextField label="模块名称" value={selectedModule.label} onChange={(event) => updateModule({ label: event.target.value })} sx={{ ...fieldSx, flex: 1 }} />
                  <IconSelectorField
                    label="模块图标"
                    value={selectedModule.icon}
                    onChange={(icon) => updateModule({ icon })}
                    icons={iconOptions}
                    loading={iconsQuery.isLoading}
                    error={iconsQuery.isError}
                    groups={iconGroupsQuery.data ?? []}
                    groupId={selectedIconGroupId}
                    keyword={iconKeyword}
                    page={iconPickerPage}
                    pageCount={iconsQuery.data?.totalPages ?? 1}
                    totalElements={iconsQuery.data?.totalElements ?? 0}
                    pageSize={iconPickerPageSize}
                    onGroupChange={handleIconGroupChange}
                    onKeywordChange={handleIconKeywordChange}
                    onPageChange={setIconPickerPage}
                    onPageSizeChange={handleIconPickerPageSizeChange}
                  />
                  <Button color="error" variant="outlined" startIcon={<Delete />} onClick={deleteModule}>删除模块</Button>
                </Stack>
              </Box>

              <Box sx={{ border: '1px solid #e4e7ed', borderRadius: 1, overflow: 'hidden', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ minHeight: 46, px: 2, bgcolor: '#f5f7fa', borderBottom: '1px solid #e4e7ed' }}>
                  <Typography sx={{ fontWeight: 600, color: '#303133' }}>模块菜单</Typography>
                  <Button size="small" variant="contained" startIcon={<Add />} onClick={addRootMenu}>新增一级菜单</Button>
                </Stack>

                <Stack data-menu-management-menu-scroll divider={<Divider />} sx={{ p: 2, flex: 1, minHeight: 0, overflow: 'auto' }}>
                  {selectedModule.menus.length === 0 ? (
                    <Box sx={{ py: 6, color: '#909399', textAlign: 'center' }}>暂无菜单</Box>
                  ) : selectedModule.menus.map((menu, rootIndex) => {
                    const children = menu.children ?? [];
                    return (
                      <Box key={`root-menu-${rootIndex}`} sx={{ py: 1.5 }}>
                        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'center' }}>
                          <TextField label="一级菜单名称" value={menu.label} onChange={(event) => updateRootMenu(rootIndex, { label: event.target.value })} sx={{ ...fieldSx, flex: 1 }} />
                          <IconSelectorField
                            label="图标"
                            value={menu.icon ?? ''}
                            onChange={(icon) => updateRootMenu(rootIndex, { icon })}
                            icons={iconOptions}
                            loading={iconsQuery.isLoading}
                            error={iconsQuery.isError}
                            groups={iconGroupsQuery.data ?? []}
                            groupId={selectedIconGroupId}
                            keyword={iconKeyword}
                            page={iconPickerPage}
                            pageCount={iconsQuery.data?.totalPages ?? 1}
                            totalElements={iconsQuery.data?.totalElements ?? 0}
                            pageSize={iconPickerPageSize}
                            onGroupChange={handleIconGroupChange}
                            onKeywordChange={handleIconKeywordChange}
                            onPageChange={setIconPickerPage}
                            onPageSizeChange={handleIconPickerPageSizeChange}
                          />
                          <TextField
                            label="路由地址"
                            value={children.length > 0 ? '' : menu.path ?? ''}
                            disabled={children.length > 0}
                            placeholder={children.length > 0 ? '存在二级菜单时无需填写' : '/system/example'}
                            onChange={(event) => updateRootMenu(rootIndex, { path: event.target.value })}
                            sx={{ ...fieldSx, flex: 1.4 }}
                          />
                          <Button variant="outlined" startIcon={<SubdirectoryArrowRight />} onClick={() => addChildMenu(rootIndex)}>
                            添加二级菜单
                          </Button>
                          <IconButton color="error" onClick={() => deleteRootMenu(rootIndex)} aria-label="删除一级菜单">
                            <Delete />
                          </IconButton>
                        </Stack>

                        {children.length > 0 ? (
                          <Stack spacing={1} sx={{ mt: 1.5, ml: { xs: 0, md: 3 }, pl: { xs: 0, md: 2 }, borderLeft: { xs: 'none', md: '2px solid #e4e7ed' } }}>
                            {children.map((child, childIndex) => (
                              <Stack
                                key={`child-menu-${rootIndex}-${childIndex}`}
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={1.5}
                                alignItems={{ xs: 'stretch', md: 'center' }}
                              >
                                <TextField
                                  label="二级菜单"
                                  value={child.label}
                                  onChange={(event) => updateChildMenu(rootIndex, childIndex, { label: event.target.value })}
                                  sx={{ ...fieldSx, flex: 1 }}
                                />
                                <TextField
                                  label="路由地址"
                                  value={child.path}
                                  onChange={(event) => updateChildMenu(rootIndex, childIndex, { path: event.target.value })}
                                  sx={{ ...fieldSx, flex: 1.4 }}
                                />
                                <IconButton color="error" onClick={() => deleteChildMenu(rootIndex, childIndex)} aria-label="删除二级菜单">
                                  <Delete />
                                </IconButton>
                              </Stack>
                            ))}
                          </Stack>
                        ) : null}
                      </Box>
                    );
                  })}
                </Stack>
              </Box>
            </>
          ) : (
            <Box sx={{ py: 8, textAlign: 'center', color: '#909399' }}>暂无模块</Box>
          )}
        </Stack>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={() => setSnackbar((current) => ({ ...current, open: false }))}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((current) => ({ ...current, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
