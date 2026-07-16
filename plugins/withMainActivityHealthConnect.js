const { withMainActivity } = require('@expo/config-plugins');

const IMPORT_LINE = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

const withMainActivityHealthConnect = (config) => {
  return withMainActivity(config, (config) => {
    let { contents } = config.modResults;

    if (!contents.includes(IMPORT_LINE)) {
      contents = contents.replace(/^(package [^\n]+\n)/m, `$1\n${IMPORT_LINE}\n`);
    }

    if (!contents.includes(DELEGATE_CALL)) {
      contents = contents.replace(
        /(super\.onCreate\([^)]*\)\n)/,
        `$1    ${DELEGATE_CALL}\n`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

module.exports = withMainActivityHealthConnect;
