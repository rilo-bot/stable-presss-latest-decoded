/**
 * Curated Lucide icon registry — the single source of truth for which glyphs an
 * editable "icon" region can render and the inspector can offer in its picker.
 *
 * We import a CURATED subset (named imports) so the bundle stays tree-shaken —
 * importing lucide's full `icons` map would pull in thousands of components.
 *
 * The names are also the vocabulary the Studio Assistant uses when it detects an
 * icon in an uploaded PDF/image and places a best-guess glyph (see the agent
 * tools + document ingest). Unknown/empty names fall back to FALLBACK_ICON so a
 * region can never crash the render.
 */

import { createLucideIcon, type IconNode, type LucideIcon } from 'lucide-react';
import {
  // currently used by the premium template
  Gavel, Trophy, Star, Globe, PlayCircle, BarChart3, Users, Sprout, Award, Mail,
  // social / brand
  Facebook, Instagram, Youtube, PenTool, Feather,
  // people / contact
  User, Phone, MapPin, MessageCircle, AtSign, Link, ExternalLink, Send,
  // achievement / engagement
  Crown, Medal, Flag, Target, Sparkles, Zap, Heart, ThumbsUp, Gift, Bell, Check, CheckCircle,
  // media
  Camera, Image, Video, Music, Newspaper, BookOpen, GraduationCap, QrCode, Share2,
  // data / business
  TrendingUp, PieChart, DollarSign, ShoppingBag, Briefcase, Building2, Handshake, Scale, Calendar, Clock, Database, RefreshCw,
  // nature / racing-adjacent
  Leaf, TreePine, Sun, Droplet, Shield,
  // racing / sport / betting
  Binoculars, Ticket, Timer, Coins, Banknote, Carrot, Wheat, FlagTriangleRight,
  // fallback
  Shapes,
} from 'lucide-react';

// ── Custom brand glyphs (not in Lucide) — built with createLucideIcon so they
//    behave exactly like a Lucide icon (same size / color / strokeWidth props).
//    Paths from the MIT-licensed Tabler icon set. ──
const Horse = createLucideIcon('Horse', [
  ['path', { d: 'M7 10l-.85 8.507a1.357 1.357 0 0 0 1.35 1.493h.146a2 2 0 0 0 1.857 -1.257l.994 -2.486a2 2 0 0 1 1.857 -1.257h1.292a2 2 0 0 1 1.857 1.257l.994 2.486a2 2 0 0 0 1.857 1.257h.146a1.37 1.37 0 0 0 1.364 -1.494l-.864 -9.506h-8c0 -3 -3 -5 -6 -5l-3 6l2 2l3 -2', key: 'horse-a' }],
  ['path', { d: 'M22 14v-2a3 3 0 0 0 -3 -3', key: 'horse-b' }],
] as IconNode);

const UsersGroup = createLucideIcon('UsersGroup', [
  ['path', { d: 'M10 13a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', key: 'ug-a' }],
  ['path', { d: 'M8 21v-1a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v1', key: 'ug-b' }],
  ['path', { d: 'M15 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', key: 'ug-c' }],
  ['path', { d: 'M17 10h2a2 2 0 0 1 2 2v1', key: 'ug-d' }],
  ['path', { d: 'M5 5a2 2 0 1 0 4 0a2 2 0 0 0 -4 0', key: 'ug-e' }],
  ['path', { d: 'M3 13v-1a2 2 0 0 1 2 -2h2', key: 'ug-f' }],
] as IconNode);

// Horse-racing glyphs Lucide lacks (Tabler paths).
const Horseshoe = createLucideIcon('Horseshoe', [
  ['path', { d: 'M19 17c.5 -1.242 2 -2 2 -5s-1 -9 -9 -9s-9 6 -9 9s1.495 3.749 2 5l-2 1l2 3l2.406 -1.147c1.25 -.714 1.778 -2.08 1.203 -3.363c-1.078 -2.407 -1.609 -8.49 3.391 -8.49s4.469 6.083 3.39 8.49c-.574 1.284 -.045 2.649 1.204 3.363l2.406 1.147l2 -3l-2 -1', key: 'hs-a' }],
] as IconNode);

const Helmet = createLucideIcon('Helmet', [
  ['path', { d: 'M12 4a9 9 0 0 1 5.656 16h-11.312a9 9 0 0 1 5.656 -16', key: 'hm-a' }],
  ['path', { d: 'M20 9h-8.8a1 1 0 0 0 -.968 1.246c.507 2 1.596 3.418 3.268 4.254c2 1 4.333 1.5 7 1.5', key: 'hm-b' }],
] as IconNode);

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  Gavel, Trophy, Star, Globe, PlayCircle, BarChart3, Users, Sprout, Award, Mail,
  Facebook, Instagram, Youtube, PenTool, Feather,
  User, Phone, MapPin, MessageCircle, AtSign, Link, ExternalLink, Send,
  Crown, Medal, Flag, Target, Sparkles, Zap, Heart, ThumbsUp, Gift, Bell, Check, CheckCircle,
  Camera, Image, Video, Music, Newspaper, BookOpen, GraduationCap, QrCode, Share2,
  TrendingUp, PieChart, DollarSign, ShoppingBag, Briefcase, Building2, Handshake, Scale, Calendar, Clock, Database, RefreshCw,
  Leaf, TreePine, Sun, Droplet, Shield,
  // racing / sport / betting
  Binoculars, Ticket, Timer, Coins, Banknote, Carrot, Wheat, FlagTriangleRight,
  // custom horse-racing glyphs
  Horse, UsersGroup, Horseshoe, Helmet,
};

/** Sorted list of pickable icon names (inspector grid + AI vocabulary). */
export const ICON_NAMES: string[] = Object.keys(ICON_REGISTRY);

/** Shown when a region has no/unknown name, so render never crashes. */
export const FALLBACK_ICON: LucideIcon = Shapes;

/** Resolve a stored icon name to a component, falling back gracefully. */
export function resolveIcon(name?: string): LucideIcon {
  return (name && ICON_REGISTRY[name]) || FALLBACK_ICON;
}

/** True when `name` is a known registry icon (used to validate AI/agent input). */
export function isKnownIcon(name?: string): boolean {
  return !!name && Object.prototype.hasOwnProperty.call(ICON_REGISTRY, name);
}
