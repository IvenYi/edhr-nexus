import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Card, TextField, Button, Typography, Alert, Divider,
} from '@mui/material';
import {
  Visibility, LockOutlined, PersonOutline,
} from '@mui/icons-material';
import client from '@/api/client';
import { DEFAULT_SYSTEM_BRANDING, useSystemBranding } from '@/hooks/useSystemBranding';
import {
  DEFAULT_IDLE_LOGOUT_MINUTES,
  DEFAULT_TOKEN_VALIDITY_MINUTES,
  SESSION_STORAGE_KEYS,
} from '@/utils/sessionPolicy';

const DEFAULT_SYSTEM_NAME = 'eDHR 系统';
const DEFAULT_LOGIN_TITLE = '登录 eDHR';

function parseLoginComplianceItems(value?: string) {
  const source = value?.trim() || DEFAULT_SYSTEM_BRANDING.loginComplianceItems || '';
  return source
    .split('\n')
    .map((line) => {
      const [num, label] = line.split('|').map((item) => item.trim());
      return num && label ? { num, label } : null;
    })
    .filter((item): item is { num: string; label: string } => Boolean(item))
    .slice(0, 3);
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 1 ? numeric : fallback;
}

function storeSessionPolicy(payload: Record<string, unknown>) {
  const now = Date.now();
  localStorage.setItem(SESSION_STORAGE_KEYS.sessionStartedAt, String(now));
  localStorage.setItem(SESSION_STORAGE_KEYS.lastActivityAt, String(now));
  localStorage.setItem(
    SESSION_STORAGE_KEYS.idleLogoutMinutes,
    String(normalizePositiveNumber(payload.idleLogoutMinutes, DEFAULT_IDLE_LOGOUT_MINUTES)),
  );
  localStorage.setItem(
    SESSION_STORAGE_KEYS.tokenValidityMinutes,
    String(normalizePositiveNumber(payload.tokenValidityMinutes, DEFAULT_TOKEN_VALIDITY_MINUTES)),
  );

  if (payload.forcePasswordChange) {
    localStorage.setItem(SESSION_STORAGE_KEYS.forcePasswordChange, 'true');
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEYS.forcePasswordChange);
  }

  if (payload.forceSignatureVerification) {
    localStorage.setItem(SESSION_STORAGE_KEYS.forceSignatureVerification, 'true');
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEYS.forceSignatureVerification);
  }
}

export default function LoginPage() {
  const { branding, isLoading: isBrandingLoading, isBrandingUnavailable, isFetching, retryBranding } = useSystemBranding({ verifyOnMount: true });
  const systemName = branding.systemName || DEFAULT_SYSTEM_NAME;
  const loginTitle = systemName === DEFAULT_SYSTEM_NAME ? DEFAULT_LOGIN_TITLE : `登录 ${systemName}`;
  const loginSubtitle = branding.loginSubtitle || DEFAULT_SYSTEM_BRANDING.loginSubtitle;
  const loginDescription = branding.loginDescription || DEFAULT_SYSTEM_BRANDING.loginDescription;
  const loginComplianceItems = parseLoginComplianceItems(branding.loginComplianceItems);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await client.post('/auth/login', { username, password });
      const loginData = res.data.data as Record<string, unknown>;
      const { token, user } = loginData as { token: string; user: unknown };
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      storeSessionPolicy(loginData);
      const requiresSecurityAction = Boolean(loginData.forcePasswordChange || loginData.forceSignatureVerification);
      navigate(requiresSecurityAction ? '/account/settings' : '/', { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '登录失败';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  if (isBrandingLoading || isBrandingUnavailable) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#F0F2F5', p: 2 }}>
        <Card sx={{ width: 400, maxWidth: '100%', p: { xs: 3, sm: 4 }, textAlign: 'center' }}>
          <Typography variant="h5" fontWeight={600} gutterBottom role="status">
            {isBrandingLoading ? '正在连接系统服务' : '系统服务暂不可用'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: isBrandingUnavailable ? 3 : 0 }}>
            {isBrandingLoading ? '正在获取系统配置，请稍候。' : '暂时无法获取系统配置，请稍后重新连接。'}
          </Typography>
          {isBrandingUnavailable && (
            <Button variant="contained" fullWidth disabled={isFetching} onClick={() => void retryBranding()}>
              {isFetching ? '正在重新连接...' : '重新连接'}
            </Button>
          )}
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: '#F0F2F5',
      }}
    >
      {/* Left: Branding Panel */}
      <Box
        sx={{
          flex: '0 0 480px',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          bgcolor: '#0D233A',
          color: '#FFFFFF',
          p: 8,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background geometric decoration */}
        <Box
          sx={{
            position: 'absolute',
            top: -120,
            right: -120,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(21,101,192,0.3) 0%, transparent 70%)',
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            bottom: -80,
            left: -80,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(0,137,123,0.2) 0%, transparent 70%)',
          }}
        />

        {/* Brand content */}
        <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center', maxWidth: 360 }}>
          <Box
            sx={{
              width: 72,
              height: 72,
              borderRadius: 3,
              bgcolor: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(12px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 4,
              mx: 'auto',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            {branding.logoUrl ? (
              <Box
                component="img"
                src={branding.logoUrl}
                alt={systemName}
                sx={{
                  width: branding.logoWidth,
                  height: branding.logoHeight,
                  maxWidth: 60,
                  maxHeight: 60,
                  objectFit: 'contain',
                }}
              />
            ) : (
              <Visibility sx={{ fontSize: 36, color: '#64B5F6' }} />
            )}
          </Box>

          <Typography variant="h4" fontWeight={700} sx={{ mb: 1.5, color: '#FFFFFF' }}>
            {systemName}
          </Typography>
          <Typography variant="body1" sx={{ mb: 1, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7 }}>
            {loginSubtitle}
          </Typography>
          <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
            {loginDescription}
          </Typography>

          <Divider sx={{ my: 5, borderColor: 'rgba(255,255,255,0.1)' }} />

          <Box sx={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
            {loginComplianceItems.map((item) => (
              <Box key={item.label} sx={{ textAlign: 'center' }}>
                <Typography variant="body2" fontWeight={600} sx={{ color: 'rgba(255,255,255,0.8)' }}>
                  {item.num}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                  {item.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Right: Login Form */}
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 2, sm: 4 },
        }}
      >
        <Card
          sx={{
            width: 400,
            maxWidth: '100%',
            boxSizing: 'border-box',
            p: { xs: 3, sm: 4 },
            boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          }}
        >
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <LockOutlined sx={{ fontSize: 40, color: 'primary.main', mb: 1.5 }} />
            <Typography variant="h5" fontWeight={600} gutterBottom>
              {loginTitle}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              请输入您的账号和密码
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              label="用户名"
              fullWidth
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              InputProps={{
                startAdornment: <PersonOutline sx={{ mr: 1, color: 'text.disabled' }} />,
              }}
            />
            <TextField
              label="密码"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              InputProps={{
                startAdornment: <LockOutlined sx={{ mr: 1, color: 'text.disabled' }} />,
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.5, fontWeight: 600, fontSize: 15 }}
            >
              {loading ? '登录中...' : '登 录'}
            </Button>
          </form>

          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: 'block', textAlign: 'center', mt: 3 }}
          >
            v2.1.0 · Zencas {systemName}
          </Typography>
        </Card>
      </Box>
    </Box>
  );
}
