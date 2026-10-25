import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Liste exhaustive des modèles Prisma appartenant à un cabinet ("modèles cabinet", PRD V2 §2.2).
 * Toute lecture ou écriture sur ces modèles DOIT être bornée par agencyId (Règle R1).
 */
export const TENANT_SCOPED_MODELS = new Set([
  "User",
  "Company",
  "CompanyContact",
  "JobOffer",
  "Candidate",
  "Application",
  "ApplicationHistory",
  "Note",
  "Document",
  "Message",
  "Invitation",
  "AuditLog",
  "Assessment",
  "JobQuestion",
  "AssessmentAttempt",
  "AttemptAnswer",
]);

/**
 * Erreur levée lorsqu'une requête sur un modèle « cabinet » est tentée sans agencyId valide.
 */
export class UnscopedTenantAccessError extends Error {
  public readonly statusCode = 400;
  constructor(message = "Requête refusée : agencyId obligatoire pour accéder aux données d'un cabinet (R1).") {
    super(message);
    this.name = "UnscopedTenantAccessError";
  }
}

/**
 * Erreur levée lorsqu'une ressource est introuvable OU appartient à un autre cabinet.
 * PRD V2 §2.4 & R1 : Une ressource d'un autre cabinet répond TOUJOURS 404 (jamais 403)
 * afin de ne pas révéler son existence.
 */
export class TenantResourceNotFoundError extends Error {
  public readonly statusCode = 404;
  constructor(modelName = "Ressource") {
    super(`${modelName} introuvable.`);
    this.name = "TenantResourceNotFoundError";
  }
}

export interface AgencyScopeInput {
  agencyId?: string | null;
}

function assertValidAgencyId(scope: AgencyScopeInput | string | null | undefined): string {
  const agencyId = typeof scope === "string" ? scope : scope?.agencyId;
  if (!agencyId || typeof agencyId !== "string" || agencyId.trim().length === 0) {
    throw new UnscopedTenantAccessError();
  }
  return agencyId.trim();
}

function getModelDelegate(modelName: string): Record<string, (...args: unknown[]) => Promise<unknown>> {
  const camelCaseModel = modelName.charAt(0).toLowerCase() + modelName.slice(1);
  return (prisma as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>)[
    camelCaseModel
  ];
}

/**
 * Couche d'accès unique aux données d'un cabinet (PRD V2 §2.4 & Règle R1).
 *
 * Usage :
 * ```ts
 * const db = forAgency(session); // ou forAgency({ agencyId: session.agencyId })
 * const offers = await db.jobOffer.findMany(); // injecte automatiquement where: { agencyId }
 * const company = await db.company.findUniqueOrThrow({ where: { id } }); // lève TenantResourceNotFoundError (404) si autre cabinet
 * ```
 *
 * Garanties :
 * 1. Refuse immédiatement toute invocation sans `agencyId` non vide (`UnscopedTenantAccessError`).
 * 2. Injecte `agencyId` dans toutes les lectures (`findMany`, `findFirst`, `count`, `aggregate`, `groupBy`)
 *    et toutes les écritures (`create`, `createMany`, `updateMany`, `deleteMany`).
 * 3. Pour `findUnique`, `findUniqueOrThrow`, `update`, `delete` : vérifie d'abord que l'enregistrement
 *    ciblé appartient bien à `agencyId`. S'il appartient à un autre cabinet ou n'existe pas :
 *    - `findUnique` retourne `null` (ou lève `TenantResourceNotFoundError` via `findByIdOr404`)
 *    - `findUniqueOrThrow`, `update`, `delete` lèvent `TenantResourceNotFoundError` (HTTP 404).
 */
export function forAgency(scope: AgencyScopeInput | string | null | undefined) {
  const agencyId = assertValidAgencyId(scope);

  const extendedClient = prisma.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async findMany({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async findFirst({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async findFirstOrThrow({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          try {
            return await query(args);
          } catch {
            throw new TenantResourceNotFoundError(model);
          }
        },
        async count({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async aggregate({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async groupBy({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async create({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            const dataObj = (args.data ?? {}) as Record<string, unknown>;
            if (dataObj.agencyId && dataObj.agencyId !== agencyId) {
              throw new TenantResourceNotFoundError(model);
            }
            args.data = { ...dataObj, agencyId } as typeof args.data;
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((item) => ({
                ...(item as Record<string, unknown>),
                agencyId,
              })) as typeof args.data;
            } else if (args.data) {
              args.data = {
                ...(args.data as Record<string, unknown>),
                agencyId,
              } as typeof args.data;
            }
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async deleteMany({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            args.where = { ...(args.where ?? {}), agencyId };
          }
          return query(args);
        },
        async findUnique({ model, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          // agencyId est injecté dans le where (extendedWhereUnique, Prisma 5+) :
          // le filtrage se fait en base et reste correct même avec un `select`
          // qui n'inclut pas agencyId.
          args.where = { ...(args.where ?? {}), agencyId };
          return query(args);
        },
        async findUniqueOrThrow({ model, args, query }) {
          if (!TENANT_SCOPED_MODELS.has(model)) {
            return query(args);
          }
          args.where = { ...(args.where ?? {}), agencyId };
          try {
            return await query(args);
          } catch {
            // Introuvable OU appartenant à un autre cabinet : 404 dans les deux cas (R1).
            throw new TenantResourceNotFoundError(model);
          }
        },
        async update({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            const delegate = getModelDelegate(model);
            const existing = (await delegate.findFirst({
              where: { ...(args.where as Record<string, unknown>), agencyId },
              select: { id: true, agencyId: true },
            })) as { id: string; agencyId: string } | null;

            if (!existing || existing.agencyId !== agencyId) {
              throw new TenantResourceNotFoundError(model);
            }

            const dataObj = (args.data ?? {}) as Record<string, unknown>;
            if ("agencyId" in dataObj && dataObj.agencyId !== agencyId) {
              throw new TenantResourceNotFoundError(model);
            }
          }
          return query(args);
        },
        async delete({ model, args, query }) {
          if (TENANT_SCOPED_MODELS.has(model)) {
            const delegate = getModelDelegate(model);
            const existing = (await delegate.findFirst({
              where: { ...(args.where as Record<string, unknown>), agencyId },
              select: { id: true, agencyId: true },
            })) as { id: string; agencyId: string } | null;

            if (!existing || existing.agencyId !== agencyId) {
              throw new TenantResourceNotFoundError(model);
            }
          }
          return query(args);
        },
      },
    },
  });

  return Object.assign(extendedClient, {
    agencyId,
  });
}

/**
 * Convertit une erreur d'isolation tenant (404 ou 400) en NextResponse standardisée.
 */
export function toTenantErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof TenantResourceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof UnscopedTenantAccessError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return null;
}
