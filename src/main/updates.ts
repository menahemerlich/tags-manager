import semver from 'semver'
import type { App } from 'electron'
import type { UpdateCheckResult } from '../shared/types'

export async function checkGithubRelease(
  app: App,
  owner: string,
  repo: string
): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion()
  const trimmedOwner = owner.trim()
  const trimmedRepo = repo.trim()
  if (!trimmedOwner || !trimmedRepo) {
    return {
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      isNewer: false,
      error: 'יש להגדיר מאגר GitHub (בעלים/שם) בהגדרות'
    }
  }
  try {
    const url = `https://api.github.com/repos/${encodeURIComponent(trimmedOwner)}/${encodeURIComponent(trimmedRepo)}/releases/latest`
    const res = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    })
    if (!res.ok) {
      return {
        currentVersion,
        latestVersion: null,
        releaseUrl: null,
        isNewer: false,
        error: `GitHub החזיר שגיאה (${res.status})`
      }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const rawTag = data.tag_name ?? ''
    const tag = rawTag.replace(/^v/i, '')
    const html = data.html_url ?? null
    if (!semver.valid(tag) || !semver.valid(currentVersion)) {
      return {
        currentVersion,
        latestVersion: tag || null,
        releaseUrl: html,
        isNewer: Boolean(tag && semver.gt(tag, currentVersion)),
        error: semver.valid(tag) ? undefined : 'תגית הגרסה האחרונה אינה בפורמט semver תקין'
      }
    }
    const cmp = semver.compare(tag, currentVersion)
    return {
      currentVersion,
      latestVersion: tag,
      releaseUrl: html,
      isNewer: cmp > 0
    }
  } catch (e) {
    return {
      currentVersion,
      latestVersion: null,
      releaseUrl: null,
      isNewer: false,
      error: e instanceof Error ? e.message : String(e)
    }
  }
}
