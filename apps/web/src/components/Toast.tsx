/**
 * Toast helpers — thin wrappers around sonner to enforce
 * the editorial-minimal voice across all transient feedback.
 *
 * Import and call these instead of raw `toast.*` when you
 * want consistent tone without re-typing copy each time.
 *
 * Voice: calm, authoritative, literary — the measured confidence
 * of a broadsheet turf correspondent.
 */
import { toast } from 'sonner';

export const tipToast = {
  success: (horseName: string, wager: number) =>
    toast.success(
      `Backed ${horseName} with ${wager.toLocaleString()} coins. May fortune favour the bold.`
    ),
  error: (message?: string) =>
    toast.error(
      message ?? 'The tip could not be placed. Please try again.'
    ),
  alreadyPlaced: () =>
    toast.error('You have already placed your selection on this race.'),
  notSignedIn: () =>
    toast.error(
      'Sign in to join the tipping ring and receive your starting coins.'
    ),
  insufficientCoins: () =>
    toast.error('Your coin balance is insufficient for this wager.'),
};

export const articleToast = {
  advanced: (label: string) =>
    toast.success(`Story advanced to ${label}. The press moves forward.`),
  published: () =>
    toast.success(
      'Story set in print. Readers across the paddock will see it shortly.'
    ),
  saved: () =>
    toast.success('Story filed and saved to the newsroom.'),
  deleted: () =>
    toast.success('Story removed from the newsroom.'),
  error: (message?: string) =>
    toast.error(
      message ?? 'Something went wrong. Please try again.'
    ),
  statusChanged: (from: string, to: string) =>
    toast.success(`Story moved from ${from} to ${to}.`),
};

export const authToast = {
  loggedOut: () =>
    toast.success('You have signed out. Until next time.'),
  loginError: (message?: string) =>
    toast.error(
      message ?? 'Unable to sign in. Please check your credentials.'
    ),
  signupError: (message?: string) =>
    toast.error(
      message ?? 'Unable to create your account. Please try again.'
    ),
  signupSuccess: () =>
    toast.success('Account created. Welcome to Stable Press.'),
};

export const horseToast = {
  added: (name: string) =>
    toast.success(`${name} has been entered into the stables.`),
  updated: (name: string) =>
    toast.success(`${name}'s profile has been updated.`),
  removed: (name: string) =>
    toast.success(`${name} has been removed from the stables.`),
  error: (message?: string) =>
    toast.error(
      message ?? 'Unable to update the horse profile. Please try again.'
    ),
};
