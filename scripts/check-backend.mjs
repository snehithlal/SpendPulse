import { spawnSync } from 'node:child_process';

// Keep Deno's npm resolver aligned with this public project's .npmrc rather than
// inheriting an unrelated enterprise registry from the parent shell.
const registry = process.env.SPENDPULSE_NPM_REGISTRY || 'https://registry.npmjs.org/';
const result = spawnSync(
  'deno',
  [
    'check',
    '--config',
    'supabase/functions/integrations/deno.json',
    'supabase/functions/integrations/index.ts',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, NPM_CONFIG_REGISTRY: registry, npm_config_registry: registry },
  },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
