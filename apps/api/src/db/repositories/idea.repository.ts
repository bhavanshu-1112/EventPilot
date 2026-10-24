import type { DbClient } from '../client.js';
import type { IdeaRow } from '../schema.js';

export interface CreateIdeaInput {
  id?: string;
  title: string;
  description: string;
  category: string;
  estimatedCostMinor: number;
  whyFits: string;
  status?: 'suggested' | 'accepted' | 'rejected';
}

export class IdeaRepository {
  constructor(private readonly db: DbClient) {}

  async getIdeas(eventId: string): Promise<IdeaRow[]> {
    return this.db
      .selectFrom('ideas')
      .selectAll()
      .where('event_id', '=', eventId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  async createIdeas(eventId: string, ideas: CreateIdeaInput[]): Promise<IdeaRow[]> {
    if (ideas.length === 0) return [];

    const rows = ideas.map((i) => ({
      id: i.id ?? crypto.randomUUID(),
      event_id: eventId,
      title: i.title,
      description: i.description,
      category: i.category,
      estimated_cost_minor: i.estimatedCostMinor,
      why_fits: i.whyFits,
      status: i.status ?? 'suggested',
    }));

    return this.db.insertInto('ideas').values(rows).returningAll().execute();
  }

  async updateStatus(
    eventId: string,
    ideaId: string,
    status: 'suggested' | 'accepted' | 'rejected',
  ): Promise<IdeaRow | undefined> {
    return this.db
      .updateTable('ideas')
      .set({ status })
      .where('event_id', '=', eventId)
      .where('id', '=', ideaId)
      .returningAll()
      .executeTakeFirst();
  }
}
