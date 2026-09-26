/** Team (Managers: roles and access) and the signed-in user's own profile. */
import { passwordChangeInput, profileUpdateInput, type MeDto, type Role, type UserDto } from '@stocksense/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { meQueryKey, useAuth } from '@/auth/AuthProvider';
import { TitleBlock } from '@/components/drawing';
import { Button, DetailPanel, Empty, Field, FieldGrid, Input, Pager, SearchCell, Skeleton, Tabs } from '@/components/ui';
import { api } from '@/lib/api';
import { apiErrors, check, type Errors } from '@/lib/forms';
import { useWrite } from '@/lib/queries';
import { cn, fmtDate } from '@/lib/utils';

export function TeamPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const role = params.get('role') ?? 'ALL';
  const page = Number(params.get('page') ?? 1);
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };
  const users = useQuery({
    queryKey: ['users', search, role, page],
    queryFn: () => api.list<UserDto>('/users', { search: search || undefined, role: role === 'ALL' ? undefined : role, page, pageSize: 25 }),
    placeholderData: (prev) => prev,
  });
  const update = useWrite((v: { id: string; role?: Role; isActive?: boolean }) => api.patch<UserDto>(`/users/${v.id}`, { role: v.role, isActive: v.isActive }), [['users']]);
  const total = users.data?.page.total ?? 0;

  const change = (u: UserDto, body: { role?: Role; isActive?: boolean }, done: string) =>
    update.mutate({ id: u.id, ...body }, { onSuccess: () => toast.success(done), onError: (e) => apiErrors(e) });

  return (
    <div className="flex flex-col gap-6">
      <TitleBlock
        sheet={10}
        title="Team"
        sub="Who can sign in, and what they can do. Staff receive, pick, pack, move and count; Managers also plan, validate adjustments and edit master data."
        cells={[{ caption: 'People', value: users.data ? total : '·' }, { caption: 'New accounts', value: 'Start as Staff' }]}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <SearchCell value={search} onChange={(v) => set('q', v || null)} placeholder="Name or email" label="Search people" />
        <Tabs
          label="Role"
          value={role}
          onChange={(v) => set('role', v === 'ALL' ? null : v)}
          options={[
            { key: 'ALL', label: 'Everyone' },
            { key: 'MANAGER', label: 'Managers' },
            { key: 'STAFF', label: 'Staff' },
          ]}
        />
      </div>
      {users.isPending ? (
        <Skeleton className="h-72" />
      ) : total === 0 ? (
        <Empty title="Nobody matches">Clear the search.</Empty>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="schedule min-w-[760px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {users.data?.data.map((u) => {
                  const me = u.id === user?.id;
                  return (
                    <tr key={u.id} className={cn(!u.isActive && 'hatch text-ink-3')}>
                      <td className="font-semibold">{u.name}{me && <span className="letter ml-2 text-2xs text-ink-3">You</span>}</td>
                      <td className="text-sm text-ink-2">{u.email}</td>
                      <td>
                        <div className="flex" role="radiogroup" aria-label={`Role for ${u.name}`}>
                          {(['STAFF', 'MANAGER'] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              role="radio"
                              aria-checked={u.role === r}
                              disabled={me || update.isPending}
                              onClick={() => u.role !== r && change(u, { role: r }, `${u.name} is now ${r === 'MANAGER' ? 'a Manager' : 'Staff'}`)}
                              className={cn(
                                'letter -ml-px h-7 border border-ink px-2.5 text-xs font-semibold first:ml-0 disabled:cursor-not-allowed',
                                u.role === r ? 'bg-ink text-sheet' : 'bg-sheet text-ink-2 hover:bg-sheet-2 disabled:hover:bg-sheet',
                              )}
                            >
                              {r === 'MANAGER' ? 'Manager' : 'Staff'}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap text-sm text-ink-2">{fmtDate(u.createdAt)}</td>
                      <td>
                        {me ? (
                          <span className="text-sm text-ink-3">Signed in</span>
                        ) : (
                          <Button
                            size="sm"
                            variant={u.isActive ? 'danger' : 'secondary'}
                            onClick={() => change(u, { isActive: !u.isActive }, u.isActive ? `${u.name} can no longer sign in` : `${u.name} can sign in again`)}
                          >
                            {u.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pager page={page} pages={Math.max(1, Math.ceil(total / 25))} onPage={(p) => set('page', String(p))} />
        </>
      )}
    </div>
  );
}

export function ProfilePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (open) {
      setName(user?.name ?? '');
      setPw({ currentPassword: '', newPassword: '' });
      setErrors({});
    }
  }, [open, user]);
  const saveName = useWrite((n: string) => api.patch<MeDto>('/auth/me', { name: n }), [meQueryKey, ['users']]);
  const savePw = useWrite((body: unknown) => api.post('/auth/me/password', body), []);

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(profileUpdateInput, { name });
    if (parsed.errors) return setErrors(parsed.errors);
    saveName.mutate(parsed.data.name, {
      onSuccess: (me) => {
        qc.setQueryData(meQueryKey, me);
        toast.success('Name saved');
      },
      onError: (err) => setErrors(apiErrors(err)),
    });
  };
  const submitPw = (e: FormEvent) => {
    e.preventDefault();
    const parsed = check(passwordChangeInput, pw);
    if (parsed.errors) return setErrors(parsed.errors);
    savePw.mutate(parsed.data, {
      onSuccess: () => {
        setPw({ currentPassword: '', newPassword: '' });
        setErrors({});
        toast.success('Password changed', { description: 'Your other sessions were signed out.' });
      },
      onError: (err) => setErrors(apiErrors(err)),
    });
  };

  return (
    <DetailPanel open={open} onOpenChange={onOpenChange} detail="You" title={user?.name ?? 'Profile'}>
      <div className="flex flex-col gap-8">
        <form onSubmit={submitName} noValidate className="flex flex-col gap-3">
          <FieldGrid className="grid-cols-2">
            <Field label="Name" htmlFor="me-name" error={errors.name} className="col-span-2">
              <Input id="me-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Email" htmlFor="me-email" hint="Your sign-in; it doesn't change here.">
              <Input id="me-email" value={user?.email ?? ''} disabled />
            </Field>
            <Field label="Role" htmlFor="me-role" hint="A Manager can change it.">
              <Input id="me-role" value={user?.role === 'MANAGER' ? 'Manager' : 'Staff'} disabled />
            </Field>
          </FieldGrid>
          <Button type="submit" variant="primary" className="w-fit" loading={saveName.isPending}>Save name</Button>
        </form>
        <form onSubmit={submitPw} noValidate className="flex flex-col gap-3">
          <h3 className="letter text-sm font-bold">Change password</h3>
          <FieldGrid className="grid-cols-2">
            <Field label="Current password" htmlFor="pw-cur" error={errors.currentPassword}>
              <Input id="pw-cur" type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </Field>
            <Field label="New password" htmlFor="pw-new" error={errors.newPassword} hint="At least 10 characters.">
              <Input id="pw-new" type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </Field>
          </FieldGrid>
          <Button type="submit" className="w-fit" loading={savePw.isPending}>Change password</Button>
        </form>
      </div>
    </DetailPanel>
  );
}
