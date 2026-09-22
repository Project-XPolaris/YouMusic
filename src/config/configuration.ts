import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { isAbsolute, join, normalize } from 'path';

const resolveConfigPath = (): string => {
  const fromEnv =
    process.env.YOUMUSIC_CONFIG_PATH || process.env.YAML_CONFIG_FILENAME;
  if (fromEnv) {
    return isAbsolute(fromEnv) ? fromEnv : join(process.cwd(), fromEnv);
  }
  // dist/config -> ../../data/local_dev_config.yml
  return join(__dirname, '../../data/local_dev_config.yml');
};

export default () => {
  const configPath = normalize(resolveConfigPath());
  console.log(`[youmusic] load config: ${configPath}`);
  return yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, any>;
};
