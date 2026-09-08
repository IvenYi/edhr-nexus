import { Box, TableCell, type TableCellProps } from '@mui/material';

/** Keeps table status content centered in the scroll viewport, even in wide tables. */
export default function TableStateCell({ children, sx, ...props }: TableCellProps) {
  return (
    <TableCell
      align="center"
      {...props}
      sx={[...(Array.isArray(sx) ? sx : [sx]), { px: 0 }]}
    >
      <Box
        data-table-state-content
        sx={{
          position: 'sticky',
          left: 0,
          width: 'min(100%, 100cqi)',
          boxSizing: 'border-box',
          px: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere',
        }}
      >
        {children}
      </Box>
    </TableCell>
  );
}
