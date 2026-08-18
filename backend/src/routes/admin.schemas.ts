import { z } from 'zod'

export const adminUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  filter: z.enum(['all', 'verified', 'google', 'password', 'active']).default('all'),
  sort: z.enum(['newest', 'oldest', 'most_active', 'most_cards']).default('newest'),
})

export type AdminUsersQueryInput = z.infer<typeof adminUsersQuerySchema>
