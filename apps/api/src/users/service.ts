/** Settings → Users (Managers only): list users, change a role, deactivate or reactivate. */
import type { ListResponse, UserDto, UserListQuery, UserUpdateInput } from '@stocksense/shared';
import type { Prisma } from '@prisma/client';
import { prisma, withTx } from '../lib/db';
import { AppError, notFound } from '../lib/errors';
import type { Actor } from '../inventory/posting';
import { audit } from '../masterdata/common';

const userDto = (u: { id: string; name: string; email: string; role: 'MANAGER' | 'STAFF'; isActive: boolean; createdAt: Date }): UserDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  createdAt: u.createdAt.toISOString(),
});

export async function listUsers(q: UserListQuery): Promise<ListResponse<UserDto>> {
  const where: Prisma.UserWhereInput = {};
  if (q.role) where.role = q.role;
  if (q.isActive !== undefined) where.isActive = q.isActive;
  if (q.search) where.OR = [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }];
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    prisma.user.count({ where }),
  ]);
  return { data: rows.map(userDto), page: { page: q.page, pageSize: q.pageSize, total } };
}

/**
 * Changes a user's role or active status. The active Manager rows are locked FOR UPDATE before
 * counting, so two Managers demoting each other at once can't leave the system with none.
 * Deactivating deletes the user's sessions at once; either change tells their open tabs (session.updated).
 */
export async function updateUser(actor: Actor, id: string, input: UserUpdateInput): Promise<UserDto> {
  return withTx(async (tx, ctx) => {
    const managers = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id::text FROM "user" WHERE role = 'MANAGER' AND is_active ORDER BY id FOR UPDATE`;
    const [locked] = await tx.$queryRaw<Array<{ id: string }>>`SELECT id::text FROM "user" WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked) throw notFound('User');
    const before = await tx.user.findUniqueOrThrow({ where: { id } });

    const role = input.role ?? before.role;
    const isActive = input.isActive ?? before.isActive;
    const wasManager = before.role === 'MANAGER' && before.isActive;
    if (wasManager && (role !== 'MANAGER' || !isActive) && managers.length <= 1) {
      throw new AppError('LAST_MANAGER', `${before.name} is the only active Manager. Promote someone else first.`);
    }

    const after = await tx.user.update({ where: { id }, data: { role, isActive } });
    if (!isActive && before.isActive) await tx.session.deleteMany({ where: { userId: id } });
    if (role !== before.role || isActive !== before.isActive) {
      await audit(tx, actor, isActive !== before.isActive ? (isActive ? 'reactivate' : 'deactivate') : 'change_role', 'user', id,
        { role: before.role, isActive: before.isActive }, { role, isActive });
      ctx.publishAfterCommit({ type: 'session.updated', userId: id });
    }
    return userDto(after);
  });
}
