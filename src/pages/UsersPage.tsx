import { useEffect, useMemo, useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from '@tanstack/react-table';
import { supabase } from '@/lib/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type AppRole = 'pending' | 'user' | 'super_user' | 'admin' | 'super_admin';

const ALL_ROLES: AppRole[] = [
  'pending',
  'user',
  'super_user',
  'admin',
  'super_admin',
];

interface AdminUser {
  profile_id: number;
  auth_user_id: string;
  email: string;
  name: string;
  role: string;
  region_name: string;
  phone: string | null;
  bio: string | null;
  created_at: string;
}

interface PendingChange {
  profileId: number;
  userName: string;
  currentRole: string;
  newRole: string;
}

export default function UsersPage() {
  const [data, setData] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(
    null
  );
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);

  type RpcResult = {
    data: AdminUser[] | null;
    error: { message: string } | null;
  };

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = (await supabase.rpc(
          'get_admin_users'
        )) as unknown as RpcResult;
        if (!mounted) return;
        if (res.error) {
          setError(res.error.message);
        } else {
          setData(res.data ?? []);
        }
      } catch (err) {
        if (!mounted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleConfirmChange = async () => {
    if (!pendingChange) return;
    setSubmitting(true);
    const { profileId, newRole } = pendingChange;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: rpcError } = await (supabase.rpc as any)(
      'change_user_role',
      {
        target_profile_id: profileId,
        new_role: newRole,
      }
    );

    setSubmitting(false);

    if (rpcError) {
      setRowErrors((prev) => ({ ...prev, [profileId]: rpcError.message }));
    } else {
      setRowErrors((prev) => {
        const next = { ...prev };
        delete next[profileId];
        return next;
      });
      setData((prev) =>
        prev.map((u) =>
          u.profile_id === profileId ? { ...u, role: newRole } : u
        )
      );
    }
    setPendingChange(null);
  };

  const columns = useMemo<ColumnDef<AdminUser>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Name',
      },
      {
        accessorKey: 'email',
        header: 'Email',
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <div>
            <Select
              value={row.original.role}
              onValueChange={(newRole) => {
                if (!newRole) return;
                setPendingChange({
                  profileId: row.original.profile_id,
                  userName: row.original.name,
                  currentRole: row.original.role,
                  newRole,
                });
              }}
            >
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {rowErrors[row.original.profile_id] && (
              <p className="text-xs text-red-500 mt-1">
                {rowErrors[row.original.profile_id]}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'region_name',
        header: 'Region',
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
    ],
    [rowErrors]
  );

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

      <Dialog
        open={pendingChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Confirm role change</DialogTitle>
            <DialogDescription>
              Change <strong>{pendingChange?.userName}</strong> from{' '}
              <strong>{pendingChange?.currentRole}</strong> to{' '}
              <strong>{pendingChange?.newRole}</strong>? This will sign the user
              out immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingChange(null)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmChange} disabled={submitting}>
              {submitting ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
