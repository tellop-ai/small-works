export const PANEL_IDS = Object.freeze(['workshop', 'tasks', 'workbench', 'crew', 'showroom', 'growth', 'community', 'history']);
export const PAGES = Object.freeze(PANEL_IDS.map(panel => Object.freeze({
  href: panel === 'workshop' ? '/' : `/?panel=${panel}`, wordsKey: `smallWorks.nav.${panel}`,
})));
