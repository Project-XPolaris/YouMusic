import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { join, normalize } from 'path';

const YAML_CONFIG_FILENAME =
  process.env.YAML_CONFIG_FILENAME || '../../data/config.yml';

export default () => {
  console.log(normalize(__dirname + YAML_CONFIG_FILENAME));
  return yaml.load(
    fs.readFileSync(join(__dirname, YAML_CONFIG_FILENAME), 'utf8'),
  ) as Record<string, any>;
};
