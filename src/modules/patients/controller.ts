import type { Request, Response } from "express";
import { created, ok, paginated } from "../../common/utils/envelope";
import { patientService } from "./service";
import type {
  CreateHistoryEntryDto,
  CreatePatientDto,
  ListHistoryQuery,
  ListPatientsQuery,
  UpdateHistoryEntryDto,
  UpdatePatientDto,
} from "./dto";
import type { AuthUser } from "../../common/types/common";

/**
 * Thin HTTP-only controllers (docs/execution-plan/00 §1): call service,
 * set status code, return envelope. No business logic here.
 */

const actor = (req: Request): AuthUser => req.user as AuthUser;

export const patientController = {
  /** GET /patients — paginated list. */
  async list(req: Request, res: Response): Promise<void> {
    const { data, meta } = await patientService.list(
      req.query as unknown as ListPatientsQuery,
      actor(req),
    );
    res.status(200).json(paginated(data, meta));
  },

  /** POST /patients — 201. */
  async create(req: Request, res: Response): Promise<void> {
    const patient = await patientService.create(req.body as CreatePatientDto, actor(req));
    res.status(201).json(created(patient));
  },

  /** GET /patients/:id — with counts. */
  async getById(req: Request, res: Response): Promise<void> {
    const patient = await patientService.getById(req.params.id as string, actor(req));
    res.status(200).json(ok(patient));
  },

  /** PATCH /patients/:id — 200. */
  async update(req: Request, res: Response): Promise<void> {
    const patient = await patientService.update(
      req.params.id as string,
      req.body as UpdatePatientDto,
      actor(req),
    );
    res.status(200).json(ok(patient));
  },

  /** DELETE /patients/:id — soft delete, 204 no body. */
  async softDelete(req: Request, res: Response): Promise<void> {
    await patientService.softDelete(req.params.id as string, actor(req));
    res.status(204).send();
  },

  /** GET /patients/:id/history — paginated, optional ?category=. */
  async listHistory(req: Request, res: Response): Promise<void> {
    const { data, meta } = await patientService.listHistory(
      req.params.id as string,
      req.query as unknown as ListHistoryQuery,
    );
    res.status(200).json(paginated(data, meta));
  },

  /** POST /patients/:id/history — 201. */
  async addHistoryEntry(req: Request, res: Response): Promise<void> {
    const entry = await patientService.addHistoryEntry(
      req.params.id as string,
      req.body as CreateHistoryEntryDto,
      actor(req),
    );
    res.status(201).json(created(entry));
  },

  /** PATCH /patients/:id/history/:entryId — 200. */
  async updateHistoryEntry(req: Request, res: Response): Promise<void> {
    const entry = await patientService.updateHistoryEntry(
      req.params.id as string,
      req.params.entryId as string,
      req.body as UpdateHistoryEntryDto,
    );
    res.status(200).json(ok(entry));
  },

  /** DELETE /patients/:id/history/:entryId — 204 no body. */
  async deleteHistoryEntry(req: Request, res: Response): Promise<void> {
    await patientService.deleteHistoryEntry(req.params.id as string, req.params.entryId as string);
    res.status(204).send();
  },
};
