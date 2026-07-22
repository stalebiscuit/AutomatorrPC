import { Router } from 'express';
import type { z } from 'zod';
import { ApiError } from '../../lib/ApiError.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { validate, getValidated } from '../../middleware/validate.js';
import { requireAuth, requireSuperadmin, requireCsrf, type AuthedRequest } from '../../middleware/auth.js';
import { AllowedDomainModel } from '../../models/index.js';
import { allowedDomainBody, objectIdParams } from '../schemas.js';
import { audit } from '../../services/auth/auditService.js';

export const allowedDomainsRouter = Router();

interface DomainLike {
  _id: unknown;
  domain: string;
  note?: string;
  createdBy?: string;
  createdAt?: Date;
}
const serialize = (d: DomainLike) => ({
  id: String(d._id),
  domain: d.domain,
  note: d.note ?? '',
  createdBy: d.createdBy ?? '',
  createdAt: d.createdAt ?? null,
});

allowedDomainsRouter.get(
  '/admin/allowed-domains',
  requireAuth,
  requireSuperadmin,
  asyncHandler(async (_req, res) => {
    const domains = await AllowedDomainModel.find().sort({ domain: 1 }).lean();
    res.json({ domains: (domains as unknown as DomainLike[]).map(serialize) });
  }),
);

allowedDomainsRouter.post(
  '/admin/allowed-domains',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ body: allowedDomainBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { body } = getValidated<unknown, z.infer<typeof allowedDomainBody>>(res);
    const domain = body.domain.trim().toLowerCase();
    if (await AllowedDomainModel.findOne({ domain })) {
      throw ApiError.conflict('Domain already allow-listed', 'DOMAIN_EXISTS');
    }
    const created = await AllowedDomainModel.create({
      domain,
      note: body.note ?? '',
      createdBy: req.admin!.email,
    });
    await audit('domain.create', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'domain',
      targetId: domain,
      ip: req.ip ?? '',
    });
    res.status(201).json({ domain: serialize(created as unknown as DomainLike) });
  }),
);

allowedDomainsRouter.patch(
  '/admin/allowed-domains/:id',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ params: objectIdParams, body: allowedDomainBody }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { params, body } = getValidated<
      unknown,
      z.infer<typeof allowedDomainBody>,
      z.infer<typeof objectIdParams>
    >(res);
    const domain = body.domain.trim().toLowerCase();
    const doc = await AllowedDomainModel.findById(params.id);
    if (!doc) throw ApiError.notFound('Domain not found');
    if (await AllowedDomainModel.findOne({ domain, _id: { $ne: doc._id } })) {
      throw ApiError.conflict('Domain already allow-listed', 'DOMAIN_EXISTS');
    }
    doc.domain = domain;
    if (body.note !== undefined) doc.note = body.note;
    await doc.save();
    await audit('domain.update', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'domain',
      targetId: domain,
      ip: req.ip ?? '',
    });
    res.json({ domain: serialize(doc as unknown as DomainLike) });
  }),
);

allowedDomainsRouter.delete(
  '/admin/allowed-domains/:id',
  requireAuth,
  requireSuperadmin,
  requireCsrf,
  validate({ params: objectIdParams }),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { params } = getValidated<unknown, unknown, z.infer<typeof objectIdParams>>(res);
    const doc = await AllowedDomainModel.findByIdAndDelete(params.id);
    if (!doc) throw ApiError.notFound('Domain not found');
    await audit('domain.delete', {
      actorEmail: req.admin!.email,
      actorUserId: req.admin!.sub,
      targetType: 'domain',
      targetId: doc.domain,
      ip: req.ip ?? '',
    });
    res.json({ ok: true });
  }),
);
