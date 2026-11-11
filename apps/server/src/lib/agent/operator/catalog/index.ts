import type { CatalogSurface } from './types.js'
import { SURFACES as core } from './core.js'
import { SURFACES as magazine } from './magazine.js'
import { SURFACES as stories } from './stories.js'
import { SURFACES as team } from './team.js'
import { SURFACES as registers } from './registers.js'
import { SURFACES as blog } from './blog.js'
import { SURFACES as profile } from './profile.js'
import { SURFACES as settings } from './settings.js'
import { SURFACES as community } from './community.js'
import { SURFACES as content } from './content.js'
import { SURFACES as site } from './site.js'

export type { CatalogSurface, CatalogAction } from './types.js'

/** Every surface, in a FIXED order (prompt-cache stability). */
export const CATALOG: CatalogSurface[] = [...core, ...magazine, ...stories, ...team, ...registers, ...blog, ...profile, ...settings, ...community, ...content, ...site]
