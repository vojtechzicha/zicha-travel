import * as migration_20261101_114140_baseline from './20261101_114140_baseline';
import * as migration_20261101_114141_production_alignment from './20261101_114141_production_alignment';

export const migrations = [
  {
    up: migration_20261101_114140_baseline.up,
    down: migration_20261101_114140_baseline.down,
    name: '20261101_114140_baseline'
  },
  {
    up: migration_20261101_114141_production_alignment.up,
    down: migration_20261101_114141_production_alignment.down,
    name: '20261101_114141_production_alignment'
  },
];
