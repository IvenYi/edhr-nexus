import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getPublicSystemSettings, type SystemSettings } from '@/api/system';
import { DEFAULT_IDLE_LOGOUT_MINUTES, DEFAULT_TOKEN_VALIDITY_MINUTES } from '@/utils/sessionPolicy';

export const DEFAULT_SYSTEM_BRANDING: SystemSettings = {
  systemName: 'eDHR 系统',
  browserTitle: 'eDHR - 医疗器械电子设备历史记录系统',
  logoUrl: '',
  logoWidth: 32,
  logoHeight: 32,
  loginSubtitle: '电子设备历史记录平台',
  loginDescription: '面向医疗器械生产的 GMP 合规数字化解决方案，确保每一批次全程可追溯、可审计。',
  loginComplianceItems: '21 CFR Part 11|合规标准\nISO 13485|质量体系\nGAMP 5|验证框架',
  faviconUrl: '',
  forcePasswordChangeOnFirstLogin: true,
  passwordChangeCycleEnabled: false,
  passwordChangeCycleDays: 90,
  passwordComplexity: 'MEDIUM',
  passwordFailureLockThreshold: 5,
  passwordFailureLockMinutes: 30,
  idleLogoutMinutes: DEFAULT_IDLE_LOGOUT_MINUTES,
  tokenValidityMinutes: DEFAULT_TOKEN_VALIDITY_MINUTES,
  forceSignatureOnFirstLogin: false,
  signatureChangeCycleEnabled: false,
  signatureChangeCycleDays: 365,
};

export const SYSTEM_BRANDING_QUERY_KEY = ['system-branding', 'public'] as const;

export function normalizeSystemBranding(settings?: Partial<SystemSettings>): SystemSettings {
  return {
    ...DEFAULT_SYSTEM_BRANDING,
    ...(settings ?? {}),
    systemName: settings?.systemName?.trim() || DEFAULT_SYSTEM_BRANDING.systemName,
    browserTitle: settings?.browserTitle?.trim() || DEFAULT_SYSTEM_BRANDING.browserTitle,
    logoWidth: settings?.logoWidth ?? DEFAULT_SYSTEM_BRANDING.logoWidth,
    logoHeight: settings?.logoHeight ?? DEFAULT_SYSTEM_BRANDING.logoHeight,
    loginSubtitle: settings?.loginSubtitle?.trim() || DEFAULT_SYSTEM_BRANDING.loginSubtitle,
    loginDescription: settings?.loginDescription?.trim() || DEFAULT_SYSTEM_BRANDING.loginDescription,
    loginComplianceItems: settings?.loginComplianceItems?.trim() || DEFAULT_SYSTEM_BRANDING.loginComplianceItems,
    idleLogoutMinutes: settings?.idleLogoutMinutes ?? DEFAULT_SYSTEM_BRANDING.idleLogoutMinutes,
    tokenValidityMinutes: settings?.tokenValidityMinutes ?? DEFAULT_SYSTEM_BRANDING.tokenValidityMinutes,
  };
}

export function applySystemBranding(settings: Partial<SystemSettings> = DEFAULT_SYSTEM_BRANDING) {
  const title = settings.browserTitle?.trim() || DEFAULT_SYSTEM_BRANDING.browserTitle;
  document.title = title;

  const faviconUrl = settings.faviconUrl?.trim();
  let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!favicon) {
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  if (faviconUrl) {
    favicon.href = faviconUrl;
  } else {
    favicon.removeAttribute('href');
  }
}

export function useSystemBranding({ verifyOnMount = false } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: SYSTEM_BRANDING_QUERY_KEY,
    queryFn: getPublicSystemSettings,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnMount: verifyOnMount ? 'always' : true,
  });

  const isLoading = query.isLoading || (verifyOnMount && !query.isFetchedAfterMount && query.isFetching);

  const branding = useMemo<SystemSettings>(() => normalizeSystemBranding(query.data), [query.data]);

  useEffect(() => {
    if (isLoading) {
      document.title = '正在连接系统服务';
      document.querySelector('link[rel="icon"]')?.removeAttribute('href');
      return;
    }
    if (query.isError) {
      document.title = '系统服务暂不可用';
      document.querySelector('link[rel="icon"]')?.removeAttribute('href');
      return;
    }
    applySystemBranding(branding);
  }, [branding, query.isError, isLoading]);

  const refreshBranding = useCallback(async (settings?: SystemSettings) => {
    if (settings) {
      const nextBranding = normalizeSystemBranding(settings);
      queryClient.setQueryData<SystemSettings>(SYSTEM_BRANDING_QUERY_KEY, nextBranding);
      applySystemBranding(nextBranding);
    }
    await queryClient.invalidateQueries({ queryKey: SYSTEM_BRANDING_QUERY_KEY });
  }, [queryClient]);

  return {
    branding,
    isLoading,
    isError: query.isError,
    isBrandingUnavailable: query.isError,
    isFetching: query.isFetching,
    retryBranding: query.refetch,
    refreshBranding,
  };
}
