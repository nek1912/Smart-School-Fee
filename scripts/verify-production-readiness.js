const { execSync } = require('child_process');

const commands = [
  'pnpm --filter smart-school-api db:generate',
  'pnpm --filter smart-school-api test',
  'pnpm --filter web lint',
  'pnpm --filter web build',
  'pnpm test'
];

for (const command of commands) {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit' });
}

console.log('\nProduction readiness checks completed successfully.');