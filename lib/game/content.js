/** Versioned game content. Stored jobs pin this entire specification. */
export const CONTENT_VERSION = 3;
export const INT_MAX = 2147483647;
const starter = [
  ['wooden-spoon', 0, 5, 5, 10], ['stool', 12, 20, 15, 20],
  ['birdhouse', 18, 30, 10, 20], ['wall-shelf', 24, 40, 15, 25],
  ['keepsake-box', 20, 35, 15, 30], ['toy-boat', 15, 25, 10, 20],
];
export const starterRecipeIds = starter.map(([id]) => id);
const advanced = [['dining-chair', 36, 60, 20, 40], ['writing-desk', 60, 90, 30, 60], ['cabinet', 84, 120, 40, 80]];
export const recipes = [...starter, ...advanced].map(([id, material, base, d1, d2]) => ({
  id, version: 1, kind: 'object', workmanshipMinorPerSecond: 5, nameKey: `sw.recipe.${id}`, materialMinor: material * 100,
  ...(starterRecipeIds.includes(id) ? {} : { requiredUnlock: 'joinery-bench' }),
  baseSeconds: base * 60, detailSeconds: [d1 * 60, d2 * 60],
  stages: [
    { id: 'shape', nameKey: 'sw.stage.shape', seconds: base * 24, finish: 0, role: starterRecipeIds.includes(id) ? 'carpentry' : 'joinery' },
    { id: 'assemble', nameKey: 'sw.stage.assemble', seconds: base * 24, finish: 0, role: starterRecipeIds.includes(id) ? 'carpentry' : 'joinery' },
    { id: 'finish', nameKey: 'sw.stage.finish', seconds: base * 12, finish: 0, role: starterRecipeIds.includes(id) ? 'carpentry' : 'joinery' },
    { id: 'd1', nameKey: 'sw.stage.d1', seconds: d1 * 60, finish: 1, role: starterRecipeIds.includes(id) ? 'carpentry' : 'joinery' },
    { id: 'd2', nameKey: 'sw.stage.d2', seconds: d2 * 60, finish: 2, role: starterRecipeIds.includes(id) ? 'carpentry' : 'joinery' },
  ],
}));
const metal = [['hinge-set', 18, 20, 10, 15], ['tool-head', 24, 30, 10, 20], ['lantern', 30, 45, 15, 30], ['iron-stand', 42, 60, 20, 40]];
for (const [id, material, base, d1, d2] of metal) recipes.push({
  id, version: 2, kind: 'object', nameKey: `sw.recipe.${id}`, materialMinor: material * 100,
  workmanshipMinorPerSecond: 5, requiredUnlock: 'forge', requiredStaff: 'blacksmith',
  baseSeconds: base * 60, detailSeconds: [d1 * 60, d2 * 60],
  stages: [
    { id: 'metal', nameKey: 'sw.stage.metal', seconds: base * 60, finish: 0, role: 'metal' },
    { id: 'd1', nameKey: 'sw.stage.metal-finish', seconds: d1 * 60, finish: 1, role: 'metal-finishing' },
    { id: 'd2', nameKey: 'sw.stage.metal-finish', seconds: d2 * 60, finish: 2, role: 'metal-finishing' },
  ],
});
export const metalRecipeIds = metal.map(([id]) => id);
export const mixedRecipeIds = ['reinforced-chest', 'garden-bench', 'standing-lamp'];
for (const [id, material, wood, metal, assembly, d1, d2] of [
  ['reinforced-chest', 60, 60, 20, 20, 30, 50], ['garden-bench', 96, 70, 60, 30, 40, 60], ['standing-lamp', 51, 25, 45, 20, 30, 40],
]) recipes.push({
  id, version: 2, kind: 'object', mixed: true, nameKey: `sw.recipe.${id}`, materialMinor: material * 100,
  workmanshipMinorPerSecond: 5, requiredUnlock: 'forge', requiredStaff: 'blacksmith',
  baseSeconds: (wood + metal + assembly) * 60, detailSeconds: [d1 * 60, d2 * 60],
  stages: [
    { id: 'wood', nameKey: 'sw.stage.wood', seconds: wood * 60, finish: 0, role: 'joinery', requires: [] },
    { id: 'metal', nameKey: 'sw.stage.metal', seconds: metal * 60, finish: 0, role: 'metal', requires: id === 'reinforced-chest' ? ['wood'] : [] },
    { id: 'assemble', nameKey: 'sw.stage.assemble', seconds: assembly * 60, finish: 0, role: 'assembly', requires: ['wood', 'metal'] },
    { id: 'd1', nameKey: 'sw.stage.d1', seconds: d1 * 60, finish: 1, role: 'joinery', requires: ['assemble'] },
    { id: 'd2', nameKey: 'sw.stage.metal-finish', seconds: d2 * 60, finish: 2, role: 'metal-finishing', requires: ['d1'] },
  ],
});
export const expansions = [{ id: 'carpenter-room', version: 1, kind: 'improvement',
  nameKey: 'sw.expansion.carpenter-room', workmanshipMinorPerSecond: 0, materialMinor: 12000, baseSeconds: 1200,
  detailSeconds: [], requiredFocusSeconds: 3600, requiredDistinctRecipes: 3,
  stages: [{ id: 'build', nameKey: 'sw.stage.build', seconds: 1200, finish: 0, role: 'construction' }],
}, { id: 'joinery-bench', version: 1, kind: 'improvement',
  nameKey: 'sw.expansion.joinery-bench', workmanshipMinorPerSecond: 0, materialMinor: 18000, baseSeconds: 1800,
  detailSeconds: [], requiredFocusSeconds: 14400, requiredDistinctRecipes: 5, requiredUnlock: 'carpenter-room',
  stages: [{ id: 'build', nameKey: 'sw.stage.build', seconds: 1800, finish: 0, role: 'construction' }],
}];
expansions.push({ id: 'forge', version: 2, kind: 'improvement', nameKey: 'sw.expansion.forge',
  workmanshipMinorPerSecond: 0, materialMinor: 36000, baseSeconds: 3600, detailSeconds: [],
  requiredFocusSeconds: 28800, requiredDistinctRecipes: 0, requiredAdvancedRecipes: 1, requiredUnlock: 'joinery-bench',
  stages: [{ id: 'build', nameKey: 'sw.stage.build', seconds: 3600, finish: 0, role: 'construction' }],
});
expansions.push({ id: 'craft-yard', version: 2, kind: 'improvement', nameKey: 'sw.expansion.craft-yard',
  workmanshipMinorPerSecond: 0, materialMinor: 60000, baseSeconds: 7200, detailSeconds: [],
  requiredFocusSeconds: 60000, requiredDistinctRecipes: 0, requiredUnlock: 'forge', requiredStaff: 'blacksmith', requiredMetalRecipes: 1, requiredMixedRecipes: 1,
  stages: [{ id: 'build', nameKey: 'sw.stage.build', seconds: 7200, finish: 0, role: 'construction' }],
});
export const advancedRecipeIds = advanced.map(([id]) => id);
export const staff = [{ id: 'apprentice', version: 1, kind: 'onboarding', nameKey: 'sw.staff.apprentice',
  materialMinor: 9000, baseSeconds: 900, detailSeconds: [], workmanshipMinorPerSecond: 0,
  requiredFocusSeconds: 7200, requiredDistinctRecipes: 0, requiredUnlock: 'carpenter-room',
  stages: [{ id: 'onboard', nameKey: 'sw.stage.onboard', seconds: 900, finish: 0, role: 'onboarding' }],
}];
staff.push({ id: 'blacksmith', version: 2, kind: 'onboarding', nameKey: 'sw.staff.blacksmith',
  materialMinor: 16000, baseSeconds: 1200, detailSeconds: [], workmanshipMinorPerSecond: 0,
  requiredFocusSeconds: 0, requiredDistinctRecipes: 0, requiredUnlock: 'forge',
  stages: [{ id: 'onboard', nameKey: 'sw.stage.onboard', seconds: 1200, finish: 0, role: 'onboarding' }],
});
for (const id of ['carver', 'finisher']) staff.push({ id, version: 2, kind: 'onboarding', nameKey: `sw.staff.${id}`,
  materialMinor: 18000, baseSeconds: 1200, detailSeconds: [], workmanshipMinorPerSecond: 0,
  requiredFocusSeconds: 0, requiredDistinctRecipes: 0, requiredUnlock: 'craft-yard',
  stages: [{ id: 'onboard', nameKey: 'sw.stage.onboard', seconds: 1200, finish: 0, role: 'onboarding' }],
});
export const communityProjects = [{ id: 'neighborhood-greenhouse', version: 2, kind: 'community', mixed: true,
  nameKey: 'sw.community.neighborhood-greenhouse', materialMinor: 18000, baseSeconds: 21600, detailSeconds: [],
  workmanshipMinorPerSecond: 0, requiredUnlock: 'craft-yard', stages: [
    { id: 'panel-a', nameKey: 'sw.stage.panel-a', seconds: 4800, finish: 0, role: 'carpentry', requires: [] },
    { id: 'panel-b', nameKey: 'sw.stage.panel-b', seconds: 4800, finish: 0, role: 'carpentry', requires: [] },
    { id: 'frame', nameKey: 'sw.stage.frame', seconds: 6000, finish: 0, role: 'metal', requires: [] },
    { id: 'assemble', nameKey: 'sw.stage.assemble', seconds: 6000, finish: 0, role: 'assembly', requires: ['panel-a', 'panel-b', 'frame'] },
  ],
}];
export const patterns = [
  { id: 'plain', nameKey: 'sw.pattern.plain' },
  { id: 'carved-ripples', nameKey: 'sw.pattern.carved-ripples', requiredStaff: 'carver' },
  { id: 'carved-leaves', nameKey: 'sw.pattern.carved-leaves', requiredStaff: 'carver' },
];
export const finishStyles = [
  { id: 'natural', nameKey: 'sw.finishStyle.natural' },
  { id: 'warm-honey', nameKey: 'sw.finishStyle.warm-honey', requiredStaff: 'finisher' },
  { id: 'dusk-blue', nameKey: 'sw.finishStyle.dusk-blue', requiredStaff: 'finisher' },
];
export const commissions = [{ id: 'first-stool', recipeId: 'stool', requiredFinish: 0,
  requiredWorkSeconds: 1200, bonusMinor: 600, nameKey: 'sw.commission.first-stool' }];
export const content = { version: CONTENT_VERSION, recipes, expansions, commissions, staff, communityProjects, patterns, finishStyles };
