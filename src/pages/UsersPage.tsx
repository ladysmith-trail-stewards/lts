import { useEffect, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { Check, X } from 'lucide-react';

import { supabase } from '@/lib/supa-client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface AdminUser {
  profile_id: number;
  auth_user_id: string;
  email: string;
  name: string;
  user_type: string;
  phone: string | null;
  bio: string | null;
  is_admin: boolean;
  can_read: boolean;
  can_write: boolean;
  can_delete: boolean;
  created_at: string;
}

function BoolIcon({ value }: { value: boolean }) {
  return value ? (
    <Check size={16} className="text-green-600" />
  ) : (
    <X size={16} className="text-muted-foreground/40" />
  );
}

const columns: ColumnDef<AdminUser>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'user_type',
    header: 'Type',
  },
  {
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ row }) => row.original.phone ?? '—',
  },
  {
    accessorKey: 'bio',
    header: 'Bio',
    cell: ({ row }) => (
      <span className="max-w-[200px] truncate block">
        {row.original.bio ?? '—'}
      </span>
    ),
  },
  {
    accessorKey: 'is_admin',
    header: 'Admin',
    cell: ({ row }) => <BoolIcon value={row.original.is_admin} />,
  },
  {
    accessorKey: 'can_read',
    header: 'Read',
    cell: ({ row }) => <BoolIcon value={row.original.can_read} />,
  },
  {
    accessorKey: 'can_write',
    header: 'Write',
    cell: ({ row }) => <BoolIcon value={row.original.can_write} />,
  },
  {
    accessorKey: 'can_delete',
    header: 'Delete',
    cell: ({ row }) => <BoolIcon value={row.original.can_delete} />,
  },
];

export default function UsersPage() {
  const [data, setData] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .rpc('get_admin_users')
      .then(({ data, error }) => {
        if (error) {
          setError(error.message);
        } else {
          setData(data ?? []);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'An unexpected error occurred'
        );
        setLoading(false);
      });
  }, []);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="container mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-6">Users</h1>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users...</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No users found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
