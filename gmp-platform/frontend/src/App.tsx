import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { createTheme } from '@mui/material/styles';
import { SnackbarProvider } from './components/SnackbarProvider';
import AppRouter from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const theme = createTheme({
  palette: {
    primary: {
      main: '#1890ff',
      light: '#40a9ff',
      dark: '#096dd9',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#41b584',
      light: '#67c23a',
      dark: '#2f8f68',
      contrastText: '#ffffff',
    },
    success: {
      main: '#13ce66',
      light: '#67c23a',
      dark: '#0c9f4d',
      contrastText: '#ffffff',
    },
    warning: {
      main: '#ffba00',
      light: '#ffd666',
      dark: '#d48806',
      contrastText: '#ffffff',
    },
    error: {
      main: '#ff4d4f',
      light: '#ff7875',
      dark: '#cf1322',
      contrastText: '#ffffff',
    },
    info: {
      main: '#909399',
      light: '#c0c4cc',
      dark: '#606266',
      contrastText: '#ffffff',
    },
    background: {
      default: '#f6f8f9',
      paper: '#ffffff',
    },
    text: {
      primary: '#303133',
      secondary: '#606266',
      disabled: '#909399',
    },
    divider: '#e4e7ed',
  },
  typography: {
    fontFamily: "'PingFang SC', Arial, 'Microsoft YaHei', sans-serif",
    fontSize: 14,
    h4: { fontSize: 20, fontWeight: 700, lineHeight: 1.3 },
    h5: { fontSize: 18, fontWeight: 600, lineHeight: 1.35 },
    h6: { fontSize: 16, fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: 14, lineHeight: 1.5 },
    body2: { fontSize: 14, lineHeight: 1.5 },
    caption: { fontSize: 12, lineHeight: 1.4 },
  },
  shape: {
    borderRadius: 5,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: '#f6f8f9',
          color: '#515a6e',
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          minHeight: 32,
          padding: '6px 15px',
          borderRadius: 5,
          textTransform: 'none',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.2,
          transition: 'all 0.1s ease',
        },
        sizeSmall: {
          height: 32,
          padding: '7px 12px',
          lineHeight: 1.2,
        },
        sizeMedium: {
          minHeight: 32,
          padding: '7px 15px',
        },
        sizeLarge: {
          minHeight: 40,
          padding: '9px 22px',
          lineHeight: 1.3,
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 5,
          boxShadow: 'none',
          border: '1px solid #e4e7ed',
          backgroundImage: 'none',
          overflow: 'hidden',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          padding: 20,
          '&:last-child': { paddingBottom: 20 },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#ffffff',
          color: '#303133',
          boxShadow: '0 1px 4px rgba(0, 21, 41, 0.08)',
          borderBottom: 'none',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          containerType: 'inline-size',
          backgroundColor: '#ffffff',
          border: '1px solid #e4e7ed',
          borderRadius: 5,
          boxShadow: 'none',
          overflow: 'hidden',
          overflowX: 'auto',
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-head': {
            height: 63,
            padding: '8px 16px',
            fontWeight: 600,
            fontSize: 14,
            color: '#909399',
            backgroundColor: '#f5f7fa',
            borderBottom: '1px solid #ebeef5',
            whiteSpace: 'nowrap',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          padding: '8px 16px',
          color: '#606266',
          borderBottom: '1px solid #ebeef5',
          fontSize: 14,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#f6f8f9' },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          height: 24,
          borderRadius: 5,
          fontSize: 12,
          fontWeight: 500,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 5,
          boxShadow: '0 1px 4px rgba(0, 21, 41, 0.08)',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        size: 'small',
      },
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 5,
            backgroundColor: '#ffffff',
          },
          '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline)': {
            minHeight: 32,
          },
          '& .MuiOutlinedInput-root:not(.MuiInputBase-multiline) .MuiOutlinedInput-input': {
            padding: '7px 11px',
            fontSize: 14,
            lineHeight: '18px',
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#dcdfe6',
          },
        },
      },
    },
    MuiPagination: {
      styleOverrides: {
        ul: {
          '& .MuiPaginationItem-root': {
            width: 32,
            height: 32,
            margin: '0 4px',
            borderRadius: 2,
            color: '#303133',
            backgroundColor: '#f0f2f5',
            '&.Mui-selected': {
              backgroundColor: '#1890ff',
              color: '#ffffff',
              fontWeight: 700,
            },
          },
        },
      },
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <SnackbarProvider>
          <BrowserRouter>
            <AppRouter />
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
