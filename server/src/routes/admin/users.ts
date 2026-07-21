import { Router } from 'express';
import type { z } from 'zod';
import { ApiError } from '../../lib/ApiError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate, getValidated } from '../../middleware/validate.js';
import { requireAuth, requireSuperadmin, requireCsrf, type AuthedRequest } from '../../middleware/auth.js';
import { AdminUserModel } from '../../models/index.js';
import { createAdminUserBody, updateAdminUserBody, objectIdParams } from '../schemas.js';
import { audit } from '../../services/auth/auditService.js';
import { revokeAllForUser } from '../../services/auth/tokenService.js';
import { normalizeEmail } from '../../services/auth/util.js';

export const adminUsersRouter = Router();

interface UserLike {
  _id: unknown;
  email: string;
  role: string;
  status: string;
  source: string;
  displayName?: string;
  createdBy?: string;
  lastLoginAt?: Date | null;
  createdAt?: Date;
}
const serialize = (u: UserLike) => ({
  id: String(u._id),
  email: u.email,
  role: u.role,
  status: u.status,
  source: u.source,
  displayName: u.displayName ?? '',
  createdBy: u.createdBy ?? '',
  lastLoginAt: u.lastLoginAt ?? null,
  createdAt: u.createdAt ?? null,
});

adminUsersRouter.get(
  '/admin/users',
  requireAuth,
  requireSuperadmin,
  asyncHandler(async (_req, res) => {
    const users = await AdminUserModel.find().sort({ createdAt: -1 }).lean();
    res.json({ users: (users as unknown as UserLike[]).map(serialize) });
  }),
);

adminUsersRouter.post(
  '/admin/users',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ body: createAdminUserBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { body } = getValidated<unknown, z.infer<typeof createAdminUserBody>>(res);
    const email = normalizeEmail(body.email);
    if (await AdminUserModel.findOne({ email })) {
      throw ApiError.conflict('User already exists', 'USER_EXISTS');
    }
    // Invited users are always `admin` — super-admin is locked to the founders.
    const created = await AdminUserModel.create({
      email,
      role: 'admin',
      status: 'active',
      source: 'invited',
      displayName: body.displayName ?? '',
      createdBy: req.admin!.email,
    });
    await audit('user.create', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'user',
      targetId: email,
      ip: req.ip ?? '',
    });
    res.status(201).json({ user: serialize(created as unknown as UserLike) });
  }),
);

adminUsersRouter.patch(
  '/admin/users/:id',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ params: objectIdParams, body: updateAdminUserBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof updateAdminUserBody>,
      z.infer<typeof objectIdParams>
    >(res);
    const doc = await AdminUserModel.findById(params.id);
    if (!doc) throw ApiError.notFound('User not found');
    if (doc.role === 'superadmin') throw ApiError.forbidden('Super-admins are protected', 'PROTECTED');

    let disabled = false;
    if (body.status !== undefined) {
      doc.status = body.status;
      disabled = body.status === 'disabled';
    }
    if (body.displayName !== undefined) doc.displayName = body.displayName;
    await doc.save();
    if (disabled) await revokeAllForUser(String(doc._id), 'user_disabled');

    await audit(disabled ? 'user.disable' : 'user.update', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'user',
      targetId: doc.email,
      ip: req.ip ?? '',
    });
    res.json({ user: serialize(doc as unknown as UserLike) });
  }),
);

adminUsersRouter.delete(
  '/admin/users/:id',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ params: objectIdParams }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { params } = getValidated<unknown, unknown, z.infer<typeof objectIdParams>>(res);
    const doc = await AdminUserModel.findById(params.id);
    if (!doc) throw ApiError.notFound('User not found');
    if (doc.role === 'superadmin') throw ApiError.forbidden('Super-admins are protected', 'PROTECTED');
    await AdminUserModel.deleteOne({ _id: doc._id });
    await revokeAllForUser(String(doc._id), 'user_deleted');
    await audit('user.delete', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'user',
      targetId: doc.email,
      ip: req.ip ?? '',
    });
    res.json({ ok: true });
  }),
);
