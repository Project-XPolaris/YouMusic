import * as fs from 'fs';
import * as path from 'path';

/** Resolve the active YouMusic YAML config path (same rules as configuration.ts). */
export function resolveYouMusicConfigPath(): string {
  const fromEnv =
    process.env.YOUMUSIC_CONFIG_PATH || process.env.YAML_CONFIG_FILENAME;
  if (fromEnv) {
    return path.isAbsolute(fromEnv)
      ? fromEnv
      : path.join(process.cwd(), fromEnv);
  }
  return path.join(__dirname, '../../data/local_dev_config.yml');
}

/**
 * Persist a single key under a top-level YAML section without full re-serialize
 * (preserves comments / ordering as much as possible; mirrors YouPhoto helper).
 */
export function persistYamlSectionField(
  section: string,
  field: string,
  value: string,
): void {
  const configPath = resolveYouMusicConfigPath();
  if (!fs.existsSync(configPath)) {
    return;
  }
  const data = fs.readFileSync(configPath, 'utf8');
  const lines = data.split('\n');
  let inSection = false;
  let updated = false;
  const sectionHeader = `${section}:`;
  const fieldPrefix = `${field}:`;

  for (let i = 0; i < lines.length; i++) {
    const trim = lines[i].trim();
    if (
      trim.length > 0 &&
      !trim.startsWith('#') &&
      !trim.startsWith('-') &&
      !lines[i].startsWith(' ') &&
      !lines[i].startsWith('\t') &&
      trim.endsWith(':')
    ) {
      inSection = trim === sectionHeader;
    }
    if (inSection && trim.startsWith(fieldPrefix)) {
      lines[i] = `  ${field}: ${value}`;
      updated = true;
      break;
    }
  }

  if (!updated) {
    let inserted = false;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === sectionHeader) {
        lines.splice(i + 1, 0, `  ${field}: ${value}`);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      lines.push('', `${section}:`, `  ${field}: ${value}`, '');
    }
  }

  fs.writeFileSync(configPath, lines.join('\n'), 'utf8');
}

/** Deep-merge and rewrite the entire `llm:` block via js-yaml load/dump of file. */
export function persistYamlObjectSection(
  section: string,
  obj: Record<string, unknown>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const yaml = require('js-yaml') as typeof import('js-yaml');
  const configPath = resolveYouMusicConfigPath();
  if (!fs.existsSync(configPath)) {
    return;
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  const doc = (yaml.load(raw) as Record<string, unknown>) || {};
  doc[section] = obj;
  fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: 120 }), 'utf8');
}
