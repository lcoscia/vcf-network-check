// Barrel module: re-exports every Core symbol from a single entry point. No logic here.
// Each specifier carries a ?v= cache-busting query so a version bump forces a fresh fetch
// of every engine file, instead of relying on users to hard-refresh after a deploy.

export * from './data.js?v=1.8.0';
export * from './reference.js?v=1.8.0';
export * from './sizing.js?v=1.8.0';
export * from './vlan.js?v=1.8.0';
export * from './appliances.js?v=1.8.0';
export * from './vips.js?v=1.8.0';
export * from './summary.js?v=1.8.0';
export * from './validation.js?v=1.8.0';
export * from './excel.js?v=1.8.0';
export * from './i18n.js?v=1.8.0';
export * from './components.js?v=1.8.0';
